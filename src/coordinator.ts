/** Approval-only routing: exact-call correlation, recoverable failures and one-shot human handoff. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { catastrophicReason, deterministicDecision } from './policy.ts'
import type { ApprovalReviewer, ReviewDecision, ReviewSubject } from './reviewer.ts'
import type { ReviewAuditPort } from './audit.ts'
import type { DecisionSource, ReviewRecord, ReviewStage, RuleMatch } from './contracts.ts'
import { abortable } from './abort.ts'

type ReviewerPort = Pick<ApprovalReviewer, 'subject' | 'review' | 'log'>
export interface CoordinatorOptions {
  failureMode?: () => 'human' | 'reject'
  canAsk?: (agent: Agent) => boolean
  audit?: ReviewAuditPort
  rule?: (exec: ToolExecution, stage: ReviewStage) => RuleMatch
}
interface Handoff { reason: string; decision: ReviewDecision; source: DecisionSource; auditId?: string }
interface PolicyMark { session: Agent['session']; seq: number; event: SessionEvent | undefined; revoked: boolean }
interface PolicyWait { mark: PolicyMark; controller: AbortController }
interface PendingReview { exec: ToolExecution; policy: PolicyMark; handoff?: Handoff }
const POLICY_EVENTS = new Set<string>(['permission/preset', 'sandbox/mode', 'approval/policy'])
const POLICY_CANCELLED = '本次审核已取消，旧决定不会恢复。'
interface PendingCall { records: Map<ToolExecution, PendingReview>; ambiguous: boolean }
interface DenialObservation { tripped: boolean; consecutiveDenials: number; recentDenials: number }
const DENIAL_POLICY = { consecutiveLimit: 3, recentLimit: 10, windowSize: 50 } as const

class DenialCircuitBreaker {
  private epoch = Number.MIN_SAFE_INTEGER
  private consecutiveDenials = 0
  private readonly recent: boolean[] = []
  private interrupted = false
  observe(epoch: number, denied: boolean): DenialObservation {
    if (this.epoch !== epoch) {
      this.epoch = epoch; this.consecutiveDenials = 0; this.recent.length = 0; this.interrupted = false
    }
    this.consecutiveDenials = denied ? this.consecutiveDenials + 1 : 0
    this.recent.push(denied)
    if (this.recent.length > DENIAL_POLICY.windowSize) this.recent.shift()
    const recentDenials = this.recent.filter(Boolean).length
    const tripped = !this.interrupted && denied
      && (this.consecutiveDenials >= DENIAL_POLICY.consecutiveLimit || recentDenials >= DENIAL_POLICY.recentLimit)
    if (tripped) this.interrupted = true
    return { tripped, consecutiveDenials: this.consecutiveDenials, recentDenials }
  }
}

function authorizationEpoch(agent: Agent): number {
  const events = agent.session.snapshotEvents()
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    if (event.type === 'user/message' && event.data.source.kind === 'user') return index
  }
  return -1
}
function failure(reason: string, kind: 'missing-context' | 'unknown' = 'unknown'): ReviewDecision {
  return { source: 'failure', decision: 'deny', failureKind: kind, reason }
}
function noContext(): ReviewDecision {
  return failure('自动审批缺少可验证的原始工具关联；不能自动授权，需由官方人工审批处理本次请求。', 'missing-context')
}
function ruleDecision(action: 'allow' | 'deny', reason: string): ReviewDecision {
  return { source: 'deterministic', decision: action, riskLevel: action === 'allow' ? 'low' : 'high', userAuthorization: 'high', reason }
}
function preDecision(decision: ReviewDecision): PreToolDecision {
  return decision.decision === 'allow' ? { kind: 'allow' } : { kind: 'deny', reason: decision.reason }
}
function auditPatch(decision: ReviewDecision, source?: DecisionSource): Partial<ReviewRecord> {
  return {
    status: decision.source === 'failure' ? 'failed' : decision.decision === 'allow' ? 'allowed' : 'denied',
    source: source ?? decision.source,
    reason: decision.reason,
    execution: decision.decision === 'allow' ? 'not-started' : 'blocked',
    ...decision.source === 'failure' ? { failureKind: decision.failureKind } : { riskLevel: decision.riskLevel },
    ...decision.model === undefined ? {} : { model: decision.model },
  }
}

/** One coordinator per plugin scope. No cached decision can authorize a different approval request. */
export class AutoReviewCoordinator {
  private readonly pending = new WeakMap<Agent, Map<ToolCallId, PendingCall>>()
  private readonly circuits = new WeakMap<Agent, DenialCircuitBreaker>()
  private readonly lifetime = new AbortController()
  private readonly policyWaits = new WeakMap<Agent['session'], Set<PolicyWait>>()

  constructor(private readonly reviewer: ReviewerPort, private readonly active: (agent: Agent) => boolean, private readonly options: CoordinatorOptions = {}) {}

  /** Only committed public events can cancel waits; cloned/uncommitted/foreign receipts are ignored. */
  observePolicyEvent(session: Agent['session'], event: SessionEvent): void {
    if (this.lifetime.signal.aborted) return
    try {
      const seq = Object.getOwnPropertyDescriptor(event, 'seq'), type = Object.getOwnPropertyDescriptor(event, 'type')
      if (seq === undefined || type === undefined || !('value' in seq) || !('value' in type) || !POLICY_EVENTS.has(type.value)
        || !Number.isSafeInteger(seq.value) || seq.value < 0 || seq.value >= session.seq || session.eventAt(event.seq) !== event) return
      for (const wait of this.policyWaits.get(session) ?? []) {
        if (event.seq <= wait.mark.seq) continue // A delayed historical notification cannot cancel a fresh question.
        wait.mark.revoked = true
        wait.controller.abort(new Error(POLICY_CANCELLED))
      }
    } catch { /* An unverifiable notification cannot impersonate a committed transition. Final exits still scan the log. */ }
  }

  private capturePolicy(agent: Agent): PolicyMark | undefined {
    try {
      const session = agent.session, events = session.snapshotEvents()
      if (!Array.isArray(events)) return undefined
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index]!
        if (POLICY_EVENTS.has(event.type)) return { session, seq: index, event, revoked: false }
      }
      return { session, seq: -1, event: undefined, revoked: false }
    } catch { return undefined }
  }
  private policyLive(mark: PolicyMark, agent: Agent): boolean {
    if (mark.revoked) return false
    const current = this.capturePolicy(agent)
    if (current === undefined || current.session !== mark.session || current.seq !== mark.seq || current.event !== mark.event) mark.revoked = true
    return !mark.revoked
  }
  private watchPolicy(mark: PolicyMark): PolicyWait {
    const wait = { mark, controller: new AbortController() }
    let waits = this.policyWaits.get(mark.session)
    if (waits === undefined) { waits = new Set(); this.policyWaits.set(mark.session, waits) }
    waits.add(wait)
    if (mark.revoked) wait.controller.abort(new Error(POLICY_CANCELLED))
    return wait
  }
  private unwatchPolicy(wait: PolicyWait): void {
    const waits = this.policyWaits.get(wait.mark.session)
    waits?.delete(wait)
    if (waits?.size === 0) this.policyWaits.delete(wait.mark.session)
  }
  private cancelledPolicy(mark: PolicyMark, agent: Agent, auditId?: string): boolean {
    if (this.policyLive(mark, agent)) return false
    if (auditId !== undefined) this.options.audit?.update(auditId, { status: 'cancelled', execution: 'cancelled', reason: POLICY_CANCELLED })
    return true
  }

  async preExecute(exec: ToolExecution, downstream: PreToolDecision): Promise<PreToolDecision> {
    const agent = exec.agent
    if (this.lifetime.signal.aborted) return { kind: 'deny', reason: '审核已取消。' }
    if (agent === undefined) return downstream
    const existing = this.pending.get(agent)?.get(exec.callId)?.records.get(exec)
    if (existing !== undefined && !this.policyLive(existing.policy, agent)) return { kind: 'deny', reason: POLICY_CANCELLED }
    if (!this.active(agent)) return downstream
    let calls = this.pending.get(agent)
    if (calls === undefined) { calls = new Map(); this.pending.set(agent, calls) }
    let call = calls.get(exec.callId)
    if (call === undefined) { call = { records: new Map(), ambiguous: false }; calls.set(exec.callId, call) }
    let pending = call.records.get(exec)
    if (pending === undefined) {
      const policy = this.capturePolicy(agent)
      if (policy === undefined) return { kind: 'deny', reason: POLICY_CANCELLED }
      if (call.records.size > 0) call.ambiguous = true
      pending = { exec, policy }
      call.records.set(exec, pending)
    }
    if (downstream.kind !== 'ask') return downstream
    if (this.options.canAsk?.(agent) === false) return downstream // The authoritative service enforces never.
    const wait = this.watchPolicy(pending.policy)
    const signal = AbortSignal.any([exec.signal, this.lifetime.signal, wait.controller.signal])
    try {
      if (signal.aborted || this.cancelledPolicy(pending.policy, agent)) return { kind: 'deny', reason: POLICY_CANCELLED }
      const subject = this.reviewer.subject(exec, downstream)
      const rule = this.options.rule?.(exec, 'pre-execute')
      const hardDeny = catastrophicReason(exec)
      if (hardDeny === undefined && rule?.action === 'ask') {
        const decision = ruleDecision('deny', rule.reason)
        const row = this.options.audit?.begin(subject, exec)
        if (row !== undefined) this.options.audit?.update(row.id, { source: 'rule', ...rule.ruleId === undefined ? {} : { ruleId: rule.ruleId }, reason: rule.reason })
        const handoff = this.prepareHandoff(pending, downstream, decision, 'rule', row?.id)
        return signal.aborted || this.cancelledPolicy(pending.policy, agent, row?.id) ? { kind: 'deny', reason: POLICY_CANCELLED } : handoff
      }
      const result = await this.assess(subject, exec, signal, hardDeny !== undefined ? ruleDecision('deny', hardDeny)
        : rule?.action === 'deny' || rule?.action === 'allow' ? ruleDecision(rule.action, rule.reason) : deterministicDecision(exec),
      rule?.matched === true ? rule : undefined)
      if (signal.aborted || this.cancelledPolicy(pending.policy, agent, result.auditId)) return { kind: 'deny', reason: POLICY_CANCELLED }
      if (!this.active(agent) || this.options.canAsk?.(agent) === false) {
        if (result.auditId !== undefined) this.options.audit?.update(result.auditId, { status: 'cancelled', execution: 'cancelled', reason: POLICY_CANCELLED })
        pending.policy.revoked = true
        return { kind: 'deny', reason: POLICY_CANCELLED }
      }
      if (result.decision.source === 'failure' && this.humanFallback()) {
        const handoff = this.prepareHandoff(pending, downstream, result.decision, 'failure', result.auditId)
        return signal.aborted || this.cancelledPolicy(pending.policy, agent, result.auditId) ? { kind: 'deny', reason: POLICY_CANCELLED } : handoff
      }
      this.recordDecision(agent, subject.toolName, result.decision)
      return signal.aborted || this.cancelledPolicy(pending.policy, agent, result.auditId) ? { kind: 'deny', reason: POLICY_CANCELLED } : preDecision(result.decision)
    } finally { this.unwatchPolicy(wait) }
  }

  /** A borrowed request object is not an invocation ID. Every native ask needs its own decision. */
  approvalRequest(request: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome> {
    return this.handleRequest(request, next)
  }

  private async handleRequest(request: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome> {
    if (this.lifetime.signal.aborted) return 'cancelled'
    const call = request.callId === undefined ? undefined : this.pending.get(request.agent)?.get(request.callId)
    const pending = call !== undefined && !call.ambiguous && call.records.size === 1 ? call.records.values().next().value : undefined
    const correlated = pending?.exec.agent === request.agent && pending.exec.name === request.toolName ? pending : undefined
    if (correlated !== undefined && !this.policyLive(correlated.policy, request.agent)) return 'cancelled'
    if (!this.active(request.agent)) return next()
    if (this.options.canAsk?.(request.agent) === false) return 'rejected'
    const policy = correlated?.policy ?? this.capturePolicy(request.agent)
    if (policy === undefined) return 'cancelled'
    const wait = this.watchPolicy(policy)
    const signals = [this.lifetime.signal, wait.controller.signal]
    if (request.signal !== undefined) signals.push(request.signal)
    if (correlated !== undefined) signals.push(correlated.exec.signal)
    const signal = AbortSignal.any(signals)
    try {
      if (signal.aborted || this.cancelledPolicy(policy, request.agent)) return 'cancelled'
      // Consume this exact pre-execute ask once. A subsequent sandbox escalation is a fresh assessment.
      const handoff = correlated?.handoff
      if (handoff !== undefined && request.reason === handoff.reason) {
        delete correlated!.handoff
        return await this.delegate(request, next, signal, policy, handoff.decision, handoff.auditId)
      }
      const exec = correlated?.exec
      const subject: ReviewSubject = exec === undefined ? {
        stage: 'approval-request', toolName: request.toolName, arguments: null, agent: request.agent,
        recentUserRequests: [], trustedDeveloperInstructions: [], trustedUserResponses: [], recentAssistantMessages: [], recentExecutionEvidence: [],
        downstream: { kind: 'ask', ...request.reason === undefined ? {} : { reason: request.reason } },
      } : { ...this.reviewer.subject(exec, { kind: 'ask', ...request.reason === undefined ? {} : { reason: request.reason } }), stage: 'approval-request' }
      if (request.reason !== undefined) subject.approvalReason = request.reason
      const rule = exec === undefined ? undefined : this.options.rule?.(exec, 'approval-request')
      const hardDeny = exec === undefined ? undefined : catastrophicReason(exec)
      if (hardDeny === undefined && rule?.action === 'ask') {
        const row = this.options.audit?.begin(subject, exec)
        if (row !== undefined) this.options.audit?.update(row.id, { source: 'rule', ...rule.ruleId === undefined ? {} : { ruleId: rule.ruleId }, reason: rule.reason })
        return await this.delegate(request, next, signal, policy, ruleDecision('deny', rule.reason), row?.id)
      }
      // Do not reuse the deterministic observation allowance at an escalation boundary.
      const result = await this.assess(subject, exec, signal, exec === undefined ? noContext()
        : hardDeny !== undefined ? ruleDecision('deny', hardDeny)
          : rule?.action === 'allow' || rule?.action === 'deny' ? ruleDecision(rule.action, rule.reason) : undefined,
      rule?.matched === true ? rule : undefined)
      if (signal.aborted || this.cancelledPolicy(policy, request.agent, result.auditId)) return 'cancelled'
      if (this.options.canAsk?.(request.agent) === false || !this.active(request.agent)) {
        policy.revoked = true
        if (result.auditId !== undefined) this.options.audit?.update(result.auditId, { status: 'cancelled', execution: 'cancelled', reason: POLICY_CANCELLED })
        return 'rejected'
      }
      if (result.decision.source === 'failure' && this.humanFallback()) {
        return await this.delegate(request, next, signal, policy, result.decision, result.auditId)
      }
      this.recordDecision(request.agent, subject.toolName, result.decision)
      if (signal.aborted || this.cancelledPolicy(policy, request.agent, result.auditId)) return 'cancelled'
      return result.decision.decision === 'allow' ? 'allowed-once' : 'rejected'
    } finally { this.unwatchPolicy(wait) }
  }

  private humanFallback(): boolean { return (this.options.failureMode?.() ?? 'human') === 'human' }

  private prepareHandoff(pending: PendingReview, downstream: Extract<PreToolDecision, { kind: 'ask' }>, decision: ReviewDecision, source: DecisionSource, auditId?: string): PreToolDecision {
    const reason = `${downstream.reason ?? '此动作需要审批。'}\n${source === 'rule' ? '规则要求人工确认' : '自动审核故障，已转人工确认'}：${decision.reason}\n本次确认只作用于当前请求，不创建长期许可。`
    pending.handoff = { reason, decision, source, ...auditId === undefined ? {} : { auditId } }
    if (auditId !== undefined) this.options.audit?.update(auditId, { status: 'pending-human', execution: 'not-started', source, reason: decision.reason })
    return { kind: 'ask', reason }
  }

  private async assess(subject: ReviewSubject, exec: ToolExecution | undefined, signal: AbortSignal, immediate?: ReviewDecision, rule?: RuleMatch): Promise<{ decision: ReviewDecision; auditId?: string }> {
    const startedAt = Date.now()
    const row = this.options.audit?.begin(subject, exec)
    let decision: ReviewDecision
    try {
      decision = immediate?.decision === 'deny' ? immediate
        : this.options.audit !== undefined && row === undefined
          ? failure('审核记录暂不可写，已停止自动授权并请求人工处理。')
          : immediate ?? await abortable(signal, () => this.reviewer.review(subject, signal))
    } catch {
      if (signal.aborted) {
        if (row !== undefined) this.options.audit?.update(row.id, { status: 'cancelled', reason: '审核已取消；晚到的结果不会执行。', execution: 'cancelled' })
        return { decision: failure('审核已取消。'), ...row === undefined ? {} : { auditId: row.id } }
      }
      decision = failure('审核服务发生异常，未得到可用决定。')
    }
    if (signal.aborted) {
      if (row !== undefined) this.options.audit?.update(row.id, { status: 'cancelled', execution: 'cancelled', reason: '审核已取消。' })
      return { decision: failure('审核已取消。'), ...row === undefined ? {} : { auditId: row.id } }
    }
    const recorded = row === undefined || this.options.audit?.update(row.id, {
      ...auditPatch(decision, rule === undefined ? undefined : 'rule'), elapsedMs: Date.now() - startedAt,
      ...rule?.ruleId === undefined ? {} : { ruleId: rule.ruleId },
    }) === true
    if (!recorded && decision.decision === 'allow') decision = failure('审核记录未能持久保存，未授予自动许可。')
    this.reviewer.log(subject.stage, subject.toolName, decision)
    if (signal.aborted) {
      if (row !== undefined) this.options.audit?.update(row.id, { status: 'cancelled', execution: 'cancelled', reason: POLICY_CANCELLED })
      return { decision: failure('审核已取消。'), ...row === undefined ? {} : { auditId: row.id } }
    }
    return { decision, ...row === undefined ? {} : { auditId: row.id } }
  }

  private async delegate(request: ApprovalRequest, next: () => Promise<ApprovalOutcome>, signal: AbortSignal, policy: PolicyMark, decision: ReviewDecision, auditId?: string): Promise<ApprovalOutcome> {
    if (this.cancelledPolicy(policy, request.agent, auditId) || signal.aborted) return 'cancelled'
    if (this.options.canAsk?.(request.agent) === false) return 'rejected'
    if (auditId !== undefined) this.options.audit?.update(auditId, { status: 'pending-human', execution: 'not-started', reason: decision.reason })
    if (this.cancelledPolicy(policy, request.agent, auditId) || signal.aborted) return 'cancelled'
    let outcome: ApprovalOutcome
    try {
      const answer = await abortable(signal, next)
      outcome = ['allowed-once', 'rejected', 'cancelled', 'unavailable'].includes(answer) ? answer : 'unavailable'
    } catch { outcome = signal.aborted ? 'cancelled' : 'unavailable' }
    if (this.cancelledPolicy(policy, request.agent, auditId) || signal.aborted) outcome = 'cancelled'
    else if (this.options.canAsk?.(request.agent) === false || !this.active(request.agent)) {
      if (auditId !== undefined) this.options.audit?.update(auditId, { status: 'cancelled', execution: 'blocked', reason: '等待期间审批策略变为 never；晚到的人工决定不再生效。' })
      return 'rejected'
    }
    if (auditId !== undefined) this.options.audit?.update(auditId, {
      status: outcome === 'allowed-once' ? 'allowed' : outcome === 'rejected' ? 'denied' : outcome,
      source: 'human', execution: outcome === 'allowed-once' ? 'not-started' : outcome === 'cancelled' ? 'cancelled' : 'blocked',
      reason: outcome === 'allowed-once' ? `人工仅批准了当前请求。前置审核说明：${decision.reason}`
        : outcome === 'rejected' ? `人工拒绝了当前请求。前置审核说明：${decision.reason}`
          : outcome === 'cancelled' ? '人工审批已取消；动作未执行。' : `人工审批不可用；动作未执行。前置审核说明：${decision.reason}`,
    })
    if (outcome === 'unavailable') this.injectFeedback(request.agent,
      `Auto-review could not complete ${request.toolName}, and no human approval answerer was available. The action was not authorized. Do not repeat the same request or change permissions as a workaround; wait for the user to restore approval access.`,
    )
    return this.cancelledPolicy(policy, request.agent, auditId) || signal.aborted ? 'cancelled' : outcome
  }

  toolResult(exec: Readonly<ToolExecution>, result?: Readonly<ToolExecutionResult>): void {
    this.options.audit?.toolResult(exec, result)
    if (exec.agent !== undefined) {
      const calls = this.pending.get(exec.agent)
      const call = calls?.get(exec.callId)
      call?.records.delete(exec)
      if (call?.records.size === 0) calls?.delete(exec.callId)
    }
  }

  private injectFeedback(agent: Agent, text: string): void {
    agent.inject(createUserMessage({
      content: [{ type: 'text', text }],
      source: {
        kind: 'dsh-approve-for-me',
        form: 'notice',
        summary: boundContextSummary(text),
      },
    }))
  }

  private recordDecision(agent: Agent, toolName: string, decision: ReviewDecision): void {
    if (decision.decision === 'deny') this.injectFeedback(agent, decision.source === 'failure'
      ? `Auto-review could not safely decide the approval for ${toolName}: ${decision.reason}\nThe action was not authorized. This is a reviewer failure, not proof of intrinsic danger. Strict automatic mode does not delegate to a human; do not retry the same outcome in a loop.`
      : `Auto-review rejected the approval for ${toolName}: ${decision.reason}\nDo not attempt the same outcome through a workaround or policy bypass. Use a materially safer alternative or ask the user for explicit guidance.`)
    let circuit = this.circuits.get(agent)
    if (circuit === undefined) { circuit = new DenialCircuitBreaker(); this.circuits.set(agent, circuit) }
    const observation = circuit.observe(authorizationEpoch(agent), decision.decision === 'deny' && decision.source !== 'failure')
    if (!observation.tripped) return
    const reason = `Auto-review rejected too many approval requests under the same direct user request (${String(observation.consecutiveDenials)} consecutive, ${String(observation.recentDenials)} in the last ${String(DENIAL_POLICY.windowSize)} reviews).`
    this.injectFeedback(agent, `${reason}\nThe turn is stopping to prevent repeated policy workarounds. Ask the user before retrying the same risky outcome.`)
    agent.cancel({ kind: 'hook', reason }, { keepInbox: true })
  }

  /** Called before audit disposal during HMR; pending answers lose authority. */
  dispose(): void { this.lifetime.abort(new Error('approval coordinator disposed')) }
}

/** The real entry and tests share this public, owning-scope cancellation subscription. No routes/services are installed. */
export function registerCoordinatorPolicyEvents(ctx: Context, coordinator: AutoReviewCoordinator): void {
  ctx.effect(() => {
    const remove = ctx.on('session/event', (session, event) => coordinator.observePolicyEvent(session, event))
    return () => { coordinator.dispose(); remove() }
  }, 'approve-for-me: cancel old policy-generation questions')
}
