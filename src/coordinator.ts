/** Approval-only routing and rejection-loop control for Auto-review. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type CallId } from '@deepseek-ai/dsh-llm'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { deterministicDecision } from './policy.ts'
import type { ApprovalReviewer, ReviewDecision, ReviewSubject } from './reviewer.ts'

type ReviewerPort = Pick<ApprovalReviewer, 'subject' | 'review' | 'log'>

interface PendingReview {
  readonly exec: ToolExecution
}

interface DenialCircuitObservation {
  readonly tripped: boolean
  readonly consecutiveDenials: number
  readonly recentDenials: number
}

const CODEX_DENIAL_POLICY = {
  consecutiveLimit: 3,
  recentLimit: 10,
  windowSize: 50,
} as const

class DenialCircuitBreaker {
  private authorizationEpoch = Number.MIN_SAFE_INTEGER
  private consecutiveDenials = 0
  private readonly recentDenials: boolean[] = []
  private interrupted = false

  observe(authorizationEpoch: number, denied: boolean): DenialCircuitObservation {
    if (this.authorizationEpoch !== authorizationEpoch) {
      this.authorizationEpoch = authorizationEpoch
      this.consecutiveDenials = 0
      this.recentDenials.length = 0
      this.interrupted = false
    }

    this.consecutiveDenials = denied ? this.consecutiveDenials + 1 : 0
    this.recentDenials.push(denied)
    if (this.recentDenials.length > CODEX_DENIAL_POLICY.windowSize) this.recentDenials.shift()
    const recentDenials = this.recentDenials.filter(Boolean).length
    const tripped = !this.interrupted
      && denied
      && (this.consecutiveDenials >= CODEX_DENIAL_POLICY.consecutiveLimit
        || recentDenials >= CODEX_DENIAL_POLICY.recentLimit)
    if (tripped) this.interrupted = true
    return { tripped, consecutiveDenials: this.consecutiveDenials, recentDenials }
  }
}

function signalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

function latestDirectUserRequestEpoch(agent: Agent): number {
  for (let index = agent.session.events.length - 1; index >= 0; index -= 1) {
    const event = agent.session.events[index]!
    if (event.type === 'user/message' && event.data.source.kind === 'user') return index
  }
  return -1
}

function preDecision(decision: ReviewDecision): PreToolDecision {
  return decision.decision === 'allow'
    ? { kind: 'allow' }
    : { kind: 'deny', reason: decision.reason }
}

function approvalOutcome(decision: ReviewDecision): ApprovalOutcome {
  return decision.decision === 'allow' ? 'allowed-once' : 'rejected'
}

function missingContextDecision(): ReviewDecision {
  return {
    source: 'failure',
    decision: 'deny',
    failureKind: 'missing-context',
    reason: '自动审批缺少可验证的原始工具参数，已按失败关闭处理。',
  }
}

function feedbackText(toolName: string, decision: ReviewDecision): string {
  if (decision.source === 'failure') {
    return [
      `Auto-review could not safely decide the approval for ${toolName}: ${decision.reason}`,
      'The action was blocked. This failure alone does not prove the action is unsafe. Retry once, use a materially safer action, or ask the user for explicit guidance.',
    ].join('\n')
  }
  return [
    `Auto-review rejected the approval for ${toolName}: ${decision.reason}`,
    'Do not attempt the same outcome through a workaround or policy bypass. Use a materially safer alternative, or call ask_user_question with a narrowly scoped question that states the exact tool and arguments; the answer authorizes only that literal question.',
  ].join('\n')
}

/**
 * Deep module at DSH's two approval seams. It records exact tool context during
 * pre-execute, invokes the reviewer only for real approval requests, and never
 * falls through to the human answerer while Approve for me is active.
 */
export class AutoReviewCoordinator {
  private readonly pending = new Map<CallId, PendingReview>()
  private readonly rejectionCircuits = new WeakMap<Agent, DenialCircuitBreaker>()

  constructor(
    private readonly reviewer: ReviewerPort,
    private readonly active: (agent: Agent) => boolean,
  ) {}

  async preExecute(exec: ToolExecution, downstream: PreToolDecision): Promise<PreToolDecision> {
    const agent = exec.agent
    if (agent === undefined || !this.active(agent) || downstream.kind === 'deny') return downstream

    this.pending.set(exec.callId, { exec })

    // Codex Auto-review replaces an approval dialog. It does not review calls
    // that DSH already admitted without asking.
    if (downstream.kind !== 'ask') return downstream

    const subject = this.reviewer.subject(exec, downstream)
    const decision = deterministicDecision(exec) ?? await this.reviewer.review(subject, exec.signal)
    this.finishReview(agent, subject, decision)
    if (decision.decision === 'deny') this.pending.delete(exec.callId)
    return preDecision(decision)
  }

  async approvalRequest(
    request: ApprovalRequest,
    next: () => Promise<ApprovalOutcome>,
  ): Promise<ApprovalOutcome> {
    if (!this.active(request.agent)) return next()
    if (signalAborted(request.signal)) return 'cancelled'

    const record = request.callId === undefined
      ? undefined
      : this.pending.get(request.callId)
    if (record === undefined) {
      const decision = missingContextDecision()
      this.finishReview(request.agent, {
        stage: 'approval-request',
        toolName: request.toolName,
        arguments: null,
        agent: request.agent,
        recentUserRequests: [],
        trustedDeveloperInstructions: [],
        trustedUserResponses: [],
        recentAssistantMessages: [],
        recentExecutionEvidence: [],
        downstream: {
          kind: 'ask',
          ...request.reason === undefined ? {} : { reason: request.reason },
        },
        ...request.reason === undefined ? {} : { approvalReason: request.reason },
      }, decision)
      this.injectFeedback(request.agent, request.toolName, decision)
      return 'rejected'
    }

    const subject: ReviewSubject = {
      ...this.reviewer.subject(record.exec, {
        kind: 'ask',
        ...request.reason === undefined ? {} : { reason: request.reason },
      }),
      stage: 'approval-request',
      ...request.reason === undefined ? {} : { approvalReason: request.reason },
    }
    // Retries and escalations always receive a fresh model assessment because
    // their requested permission is the fact under review.
    let decision: ReviewDecision
    try {
      decision = await this.reviewer.review(subject, request.signal)
    } catch (error: unknown) {
      if (signalAborted(request.signal)) return 'cancelled'
      throw error
    }
    this.finishReview(request.agent, subject, decision)
    if (decision.decision === 'deny') {
      this.pending.delete(record.exec.callId)
      this.injectFeedback(request.agent, request.toolName, decision)
    }
    return approvalOutcome(decision)
  }

  toolResult(exec: Readonly<ToolExecution>): void {
    this.pending.delete(exec.callId)
  }

  private finishReview(agent: Agent, subject: ReviewSubject, decision: ReviewDecision): void {
    this.reviewer.log(subject.stage, subject.toolName, decision)
    this.recordRejectionState(agent, decision)
  }

  private injectFeedback(agent: Agent, toolName: string, decision: ReviewDecision): void {
    agent.inject(createUserMessage({
      content: [{ type: 'text', text: feedbackText(toolName, decision) }],
      source: { kind: 'plugin', plugin: 'dsh-approve-for-me' },
    }))
  }

  private recordRejectionState(agent: Agent, decision: ReviewDecision): void {
    let circuit = this.rejectionCircuits.get(agent)
    if (circuit === undefined) {
      circuit = new DenialCircuitBreaker()
      this.rejectionCircuits.set(agent, circuit)
    }

    // Codex counts explicit Guardian denials, not timeouts or reviewer failures.
    const observation = circuit.observe(
      latestDirectUserRequestEpoch(agent),
      decision.decision === 'deny' && decision.source !== 'failure',
    )
    if (!observation.tripped) return

    const reason = `Auto-review rejected too many approval requests under the same direct user request (${String(observation.consecutiveDenials)} consecutive, ${String(observation.recentDenials)} in the last ${String(CODEX_DENIAL_POLICY.windowSize)} reviews).`
    agent.inject(createUserMessage({
      content: [{ type: 'text', text: `${reason}\nThe turn is stopping to prevent repeated policy workarounds. Ask the user before retrying the same risky outcome.` }],
      source: { kind: 'plugin', plugin: 'dsh-approve-for-me' },
    }))
    agent.cancel({ kind: 'hook', reason }, { keepInbox: true })
  }
}
