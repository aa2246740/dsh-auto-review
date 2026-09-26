import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { AutoReviewCoordinator, type CoordinatorOptions } from '../src/coordinator.ts'
import type { ReviewDecision, ReviewSubject } from '../src/reviewer.ts'

const offline: ReviewDecision = { source: 'failure', decision: 'deny', failureKind: 'transport', reason: 'minimax-cn / MiniMax-M2.7: Connection error' }
const allowed: ReviewDecision = { source: 'model', decision: 'allow', riskLevel: 'medium', userAuthorization: 'high', reason: 'authorized' }
const denied: ReviewDecision = { source: 'model', decision: 'deny', riskLevel: 'high', userAuthorization: 'low', reason: 'not authorized' }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { resolve, promise } }
function agent(id = 'session-test') {
  const events: { type: string; data: Record<string, unknown> }[] = [{ type: 'turn/start', data: { turn: 1 } }]
  const appended: typeof events = []
  const value = {
    id, inject: vi.fn(), cancel: vi.fn(),
    session: {
      header: { id, cwd: '/workspace' },
      get seq() { return events.length },
      eventAt: (seq: number) => events[seq], snapshotEvents: () => [...events],
      append: (type: string, data: Record<string, unknown>) => { const event = { type, data }; events.push(event); appended.push(event); return event },
    },
  } as unknown as Agent
  return { value, appended }
}
function execution(owner: Agent, signal = new AbortController().signal): ToolExecution {
  return { agent: owner, callId: ToolCallId('call-one'), rootCallId: ToolCallId('call-one'), name: 'write', arguments: { file_path: '/outside/plan.md', content: 'plan' }, signal, token: Symbol('test') } as ToolExecution
}
function harness(owner = agent().value, options: CoordinatorOptions = {}, decisions: ReviewDecision[] = [offline]) {
  const review = vi.fn(async (): Promise<ReviewDecision> => { const value = decisions.shift(); if (value === undefined) throw new Error('unexpected review'); return value })
  const reviewer = {
    subject: (exec: ToolExecution, downstream: ReviewSubject['downstream']): ReviewSubject => ({
      stage: 'pre-execute', toolName: exec.name, arguments: exec.arguments, agent: exec.agent!, downstream,
      recentUserRequests: [], trustedDeveloperInstructions: [], trustedUserResponses: [], recentAssistantMessages: [], recentExecutionEvidence: [],
    }), review, log: vi.fn(),
  }
  return { exec: execution(owner), review, reviewer, coordinator: new AutoReviewCoordinator(reviewer, () => true, options) }
}

describe('recoverable approval failures', () => {
  it('hands off a failed pre-execute ask without reviewing it twice or executing early', async () => {
    const { exec, coordinator, review } = harness()
    const gate = await coordinator.preExecute(exec, { kind: 'ask', reason: 'outside workspace' })
    expect(gate.kind).toBe('ask')
    if (gate.kind !== 'ask') throw new Error('expected ask')
    expect(gate.reason).toContain('Connection error')
    expect(gate.displayReason?.zh).toBe(gate.reason)
    expect(gate.displayReason?.en).toContain('Automatic review failed')
    expect(gate.displayReason?.en).toContain('Connection error')
    const human = deferred<ApprovalOutcome>()
    const next = vi.fn(() => human.promise)
    let executed = false
    const request: ApprovalRequest = { agent: exec.agent!, toolName: exec.name, callId: exec.callId, reason: gate.reason }
    const decision = coordinator.approvalRequest(request, next).then(outcome => { executed = outcome === 'allowed-once'; return outcome })
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce())
    expect(executed).toBe(false)
    human.resolve('allowed-once')
    await expect(decision).resolves.toBe('allowed-once')
    expect(executed).toBe(true)
    expect(review).toHaveBeenCalledOnce()
  })

  it('reviews a subsequent escalation independently after consuming the handoff', async () => {
    const { exec, coordinator, review } = harness(undefined, {}, [offline, denied])
    const gate = await coordinator.preExecute(exec, { kind: 'ask', reason: 'first approval' })
    if (gate.kind !== 'ask') throw new Error('expected ask')
    await expect(coordinator.approvalRequest({ agent: exec.agent!, toolName: exec.name, callId: exec.callId, reason: gate.reason }, async () => 'allowed-once')).resolves.toBe('allowed-once')
    const next = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    await expect(coordinator.approvalRequest({ agent: exec.agent!, toolName: exec.name, callId: exec.callId, reason: 'sandbox escalation' }, next)).resolves.toBe('rejected')
    expect(review).toHaveBeenCalledTimes(2)
    expect(next).not.toHaveBeenCalled()
  })

  it('does not reuse a handoff for a different reason or request stage', async () => {
    const { exec, coordinator, review } = harness(undefined, {}, [offline, denied])
    await coordinator.preExecute(exec, { kind: 'ask', reason: 'first' })
    await expect(coordinator.approvalRequest({ agent: exec.agent!, toolName: exec.name, callId: exec.callId, reason: 'different' }, async () => 'allowed-once')).resolves.toBe('rejected')
    expect(review).toHaveBeenCalledTimes(2)
  })

  it.each(['rejected', 'cancelled', 'unavailable'] as const)('keeps a human %s non-executable', async outcome => {
    const { exec, coordinator, review } = harness()
    await coordinator.preExecute(exec, { kind: 'allow' })
    await expect(coordinator.approvalRequest({ agent: exec.agent!, toolName: exec.name, callId: exec.callId }, async () => outcome)).resolves.toBe(outcome)
    expect(review).toHaveBeenCalledOnce()
    expect(exec.agent!.cancel).not.toHaveBeenCalled()
  })

  it('retains strict automatic mode without human fallback', async () => {
    const { exec, coordinator } = harness(undefined, { failureMode: () => 'reject' })
    await expect(coordinator.preExecute(exec, { kind: 'ask' })).resolves.toMatchObject({ kind: 'deny' })
  })

  it('never turns a security denial into a human allowance', async () => {
    const { exec, coordinator } = harness(undefined, {}, [denied])
    await coordinator.preExecute(exec, { kind: 'allow' })
    const next = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    await expect(coordinator.approvalRequest({ agent: exec.agent!, toolName: exec.name, callId: exec.callId }, next)).resolves.toBe('rejected')
    expect(next).not.toHaveBeenCalled()
  })

  it('cannot correlate a callId across Agent identities', async () => {
    const { exec, coordinator, review } = harness(undefined, {}, [allowed])
    await coordinator.preExecute(exec, { kind: 'allow' })
    const other = agent('other-session').value
    const next = vi.fn(async (): Promise<ApprovalOutcome> => 'rejected')
    await expect(coordinator.approvalRequest({ agent: other, toolName: exec.name, callId: exec.callId }, next)).resolves.toBe('rejected')
    expect(next).toHaveBeenCalledOnce()
    expect(review).not.toHaveBeenCalled()
  })

  it('treats two native invocations independently even when they borrow one request object', async () => {
    const { exec, coordinator, review } = harness(undefined, {}, [offline, offline])
    await coordinator.preExecute(exec, { kind: 'allow' })
    const human = deferred<ApprovalOutcome>()
    const next = vi.fn(() => human.promise)
    const request = { agent: exec.agent!, toolName: exec.name, callId: exec.callId }
    const one = coordinator.approvalRequest(request, next)
    const two = coordinator.approvalRequest(request, next)
    expect(one).not.toBe(two)
    human.resolve('allowed-once')
    expect(await one).toBe('allowed-once')
    expect(await two).toBe('allowed-once')
    expect(review).toHaveBeenCalledTimes(2)
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('cancels a non-cooperative human answerer and discards its late allowance', async () => {
    const controller = new AbortController()
    const { exec, coordinator } = harness()
    await coordinator.preExecute(exec, { kind: 'allow' })
    const human = deferred<ApprovalOutcome>()
    const next = vi.fn(() => human.promise)
    const answer = coordinator.approvalRequest({ agent: exec.agent!, toolName: exec.name, callId: exec.callId, signal: controller.signal }, next)
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce())
    controller.abort()
    await expect(answer).resolves.toBe('cancelled')
    human.resolve('allowed-once')
    await expect(answer).resolves.toBe('cancelled')
  })

  it('HMR disposal cancels pending work without granting it', async () => {
    const { exec, coordinator } = harness()
    await coordinator.preExecute(exec, { kind: 'allow' })
    const next = vi.fn(() => new Promise<ApprovalOutcome>(() => {}))
    const answer = coordinator.approvalRequest({ agent: exec.agent!, toolName: exec.name, callId: exec.callId }, next)
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce())
    coordinator.dispose()
    await expect(answer).resolves.toBe('cancelled')
  })

  it('does not review or ask a human when the authoritative policy forbids asking', async () => {
    const { exec, coordinator, review } = harness(undefined, { canAsk: () => false })
    await expect(coordinator.preExecute(exec, { kind: 'ask', reason: 'gate' })).resolves.toEqual({ kind: 'ask', reason: 'gate' })
    const next = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    await expect(coordinator.approvalRequest({ agent: exec.agent!, toolName: exec.name, callId: exec.callId }, next)).resolves.toBe('rejected')
    expect(review).not.toHaveBeenCalled(); expect(next).not.toHaveBeenCalled()
  })

  it('an explicit human rule delegates without spending a model call', async () => {
    const { exec, coordinator, review } = harness(undefined, { rule: () => ({ matched: true, action: 'ask', reason: 'rule requires human', ruleId: 'rule' }) }, [])
    const gate = await coordinator.preExecute(exec, { kind: 'ask' })
    if (gate.kind !== 'ask') throw new Error('expected ask')
    await expect(coordinator.approvalRequest({ agent: exec.agent!, toolName: exec.name, callId: exec.callId, reason: gate.reason }, async () => 'allowed-once')).resolves.toBe('allowed-once')
    expect(review).not.toHaveBeenCalled()
  })
})

describe('real shipped ApprovalService integration', () => {
  it('preserves the native asked/decided pair through an offline-reviewer human handoff', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(ApprovalService, { policy: 'ask' })
    const { value: owner, appended } = agent()
    const { exec, coordinator, review } = harness(owner)
    const human = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    ctx.on('approval/request', human)
    ctx.on('approval/request', (request, next) => coordinator.approvalRequest(request, next), { prepend: true })
    const gate = await coordinator.preExecute(exec, { kind: 'ask', reason: 'outside workspace' })
    if (gate.kind !== 'ask') throw new Error('expected ask')
    const result = await ctx.approval.request({ agent: owner, toolName: exec.name, callId: exec.callId, reason: gate.reason })
    expect(result).toBe('allowed-once')
    expect(review).toHaveBeenCalledOnce(); expect(human).toHaveBeenCalledOnce()
    expect(appended.map(event => event.type)).toEqual(['approval/asked', 'approval/decided'])
    expect(appended[1]?.data).toMatchObject({ id: appended[0]?.data['id'], outcome: 'allowed-once' })
    await fiber.dispose()
  })

  it('never is enforced before this reviewer or any human answerer', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(ApprovalService, { policy: 'never' })
    const { value: owner, appended } = agent()
    const { exec, coordinator, review } = harness(owner)
    const human = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    ctx.on('approval/request', human)
    ctx.on('approval/request', (request, next) => coordinator.approvalRequest(request, next), { prepend: true })
    const result = await ctx.approval.request({ agent: owner, toolName: exec.name, callId: exec.callId })
    expect(result).toBe('rejected'); expect(review).not.toHaveBeenCalled(); expect(human).not.toHaveBeenCalled()
    expect(appended[1]?.data['outcome']).toBe('rejected')
    await fiber.dispose()
  })
})
