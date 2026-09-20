/** Real public session/event subscription shared with the existing entry; no model phase/identity flags. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import SessionStore, { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-permission-presets'
import ApprovalService, { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { AutoReviewCoordinator, registerCoordinatorPolicyEvents } from '../src/coordinator.ts'
import type { CoordinatorOptions } from '../src/coordinator.ts'
import type { ReviewDecision, ReviewSubject } from '../src/reviewer.ts'

const ALLOW: ReviewDecision = { source: 'model', decision: 'allow', riskLevel: 'medium', userAuthorization: 'high', reason: 'fixture model decision' }
const FAILURE: ReviewDecision = { source: 'failure', decision: 'deny', failureKind: 'transport', reason: 'fixture unavailable' }
const cleanups: Array<() => Promise<void>> = []
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { resolve, promise } }
async function flush() { for (let index = 0; index < 20; index += 1) await Promise.resolve() }
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.restoreAllMocks() })
async function fixture(hook = true, options: CoordinatorOptions = {}) {
  const ctx = new Context(), bases = [await ctx.plugin(SessionStore), await ctx.plugin(ApprovalService)]
  const session = ctx.sessions.create(SessionId('epoch-session'))
  session.append('turn/start', { turn: 1 })
  const agent = { session, inject: vi.fn(), cancel: vi.fn() } as unknown as Agent
  const abort = new AbortController()
  const exec: ToolExecution = { agent, callId: ToolCallId('epoch-call'), rootCallId: ToolCallId('epoch-call'), name: 'write',
    arguments: { file_path: '/outside/epoch.txt', content: 'value' }, signal: abort.signal, token: Symbol('owned fixture') } as ToolExecution
  const reply = deferred<ReviewDecision>()
  let reviewSignal: AbortSignal | undefined
  const review = vi.fn((_subject: ReviewSubject, signal: AbortSignal) => { reviewSignal = signal; return reply.promise })
  const reviewer = { subject: (execution: ToolExecution, downstream: ReviewSubject['downstream']): ReviewSubject => ({
    stage: 'pre-execute', toolName: execution.name, arguments: execution.arguments, agent, downstream,
    recentUserRequests: [], trustedDeveloperInstructions: [], trustedUserResponses: [], recentAssistantMessages: [], recentExecutionEvidence: [],
  }), review, log: vi.fn() }
  const coordinator = new AutoReviewCoordinator(reviewer, () => true, { canAsk: current => (ctx.approval.overrideOf(current.session) ?? ctx.approval.config.policy ?? 'ask') === 'ask', ...options })
  const fiber = await ctx.plugin((scope: Context) => {
    scope.effect(() => () => coordinator.dispose())
    if (hook) registerCoordinatorPolicyEvents(scope, coordinator)
    scope.on('approval/request', (request, next) => coordinator.approvalRequest(request, next), { prepend: true })
  })
  const request: ApprovalRequest = Object.freeze({ agent, toolName: exec.name, callId: exec.callId, signal: abort.signal })
  const aba = (kind: 'permission/preset' | 'sandbox/mode' | 'approval/policy'): void => {
    if (kind === 'permission/preset') { session.append(kind, { preset: 'outside' }); session.append(kind, { preset: 'approve-for-me' }) }
    else if (kind === 'sandbox/mode') { setSandboxMode(session, 'read-only'); setSandboxMode(session, 'danger-full-access') }
    else { setApprovalPolicy(session, 'never'); setApprovalPolicy(session, 'ask') }
  }
  cleanups.push(async () => { await fiber.dispose(); for (const base of bases.reverse()) await base.dispose() })
  return { ctx, session, agent, exec, abort, request, reply, review, coordinator, fiber, aba, get reviewSignal() { return reviewSignal } }
}

describe('Committed permission epochs cannot revive an old AI/native question', () => {
  it.each(['permission/preset', 'sandbox/mode', 'approval/policy'] as const)('%s ABA immediately cancels pre-execute AI without aborting the shared Agent signal', async kind => {
    const h = await fixture(), promise = h.coordinator.preExecute(h.exec, { kind: 'ask', reason: 'outside' })
    await flush(); expect(h.review).toHaveBeenCalledOnce()
    h.aba(kind)
    // This settles BEFORE the test model ever resolves, not merely a check after its late answer.
    await expect(promise).resolves.toMatchObject({ kind: 'deny' })
    expect(h.reviewSignal?.aborted).toBe(true); expect(h.abort.signal.aborted).toBe(false)
    h.reply.resolve(ALLOW); await flush()
    await expect(h.coordinator.preExecute(h.exec, { kind: 'allow' })).resolves.toMatchObject({ kind: 'deny' })
  })
  it.each(['permission/preset', 'sandbox/mode', 'approval/policy'] as const)('without notifications, final log scanning still rejects %s ABA', async kind => {
    const h = await fixture(false), promise = h.coordinator.preExecute(h.exec, { kind: 'ask' })
    await flush(); h.aba(kind)
    expect(h.reviewSignal?.aborted).toBe(false)
    h.reply.resolve(ALLOW)
    await expect(promise).resolves.toMatchObject({ kind: 'deny' })
  })
  it('same-value reaffirmation is a new committed epoch, not permission to keep the old answer', async () => {
    const h = await fixture(), promise = h.coordinator.preExecute(h.exec, { kind: 'ask' })
    await flush(); setApprovalPolicy(h.session, 'ask')
    await expect(promise).resolves.toMatchObject({ kind: 'deny' })
    expect(h.abort.signal.aborted).toBe(false)
  })
  it('actual Approval.request gets cancelled when its AI answer is pending, without an implicit human retry', async () => {
    const h = await fixture(), next = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    h.ctx.on('approval/request', next)
    await h.coordinator.preExecute(h.exec, { kind: 'allow' })
    const promise = h.ctx.approval.request(h.request)
    await flush(); expect(h.review).toHaveBeenCalledOnce()
    h.aba('approval/policy')
    await expect(promise).resolves.toBe('cancelled')
    expect(next).not.toHaveBeenCalled(); expect(h.abort.signal.aborted).toBe(false)
    h.reply.resolve(ALLOW); await flush()
    expect(h.session.snapshotEvents().filter(event => event.type === 'approval/decided').at(-1)?.data).toMatchObject({ outcome: 'cancelled' })
  })
  it('actual Native human handoff is cancelled while waiting; late human allow does not revive it', async () => {
    const h = await fixture(), human = deferred<ApprovalOutcome>(), next = vi.fn(() => human.promise)
    h.ctx.on('approval/request', next)
    // Unknown context takes the existing official human fallback, not our fixture model.
    const promise = h.ctx.approval.request({ ...h.request, callId: undefined })
    await flush(); expect(next).toHaveBeenCalledOnce(); expect(h.review).not.toHaveBeenCalled()
    h.aba('permission/preset')
    await expect(promise).resolves.toBe('cancelled')
    human.resolve('allowed-once'); await flush()
    expect(h.abort.signal.aborted).toBe(false)
    expect(h.session.snapshotEvents().filter(event => event.type === 'approval/decided').at(-1)?.data).toMatchObject({ outcome: 'cancelled' })
  })
  it('a policy change between a failure handoff and its Native question cannot open another confirmation', async () => {
    const h = await fixture(), promise = h.coordinator.preExecute(h.exec, { kind: 'ask', reason: 'outside' })
    await flush(); h.reply.resolve(FAILURE)
    const result = await promise
    expect(result.kind).toBe('ask')
    h.aba('sandbox/mode')
    const next = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once'); h.ctx.on('approval/request', next)
    expect(await h.ctx.approval.request({ ...h.request, reason: result.kind === 'ask' ? result.reason : '' })).toBe('cancelled')
    expect(next).not.toHaveBeenCalled()
  })
  it('shared entry hook ignores forged, uncommitted and foreign Session event objects', async () => {
    const h = await fixture(), promise = h.coordinator.preExecute(h.exec, { kind: 'ask' })
    await flush()
    const other = h.ctx.sessions.create(SessionId('foreign-epoch'))
    other.append('turn/start', { turn: 1 })
    const event = other.append('approval/policy', { policy: 'never' })
    h.ctx.emit('session/event', h.session, event)
    const forged = { type: 'approval/policy', seq: SessionSeq(h.session.seq), time: Date.now(), data: { policy: 'never' } } as SessionEvent
    h.ctx.emit('session/event', h.session, forged)
    h.ctx.emit('session/event', h.session, Object.freeze({ ...forged }))
    expect(h.reviewSignal?.aborted).toBe(false)
    h.reply.resolve(ALLOW)
    await expect(promise).resolves.toEqual({ kind: 'allow' })
  })
  it('a genuine but older notification cannot cancel a fresh question under the already-current epoch', async () => {
    const h = await fixture(), event = h.session.append('approval/policy', { policy: 'ask' })
    const promise = h.coordinator.preExecute(h.exec, { kind: 'ask' })
    await flush(); h.ctx.emit('session/event', h.session, event)
    expect(h.reviewSignal?.aborted).toBe(false)
    h.reply.resolve(ALLOW); await expect(promise).resolves.toEqual({ kind: 'allow' })
  })
  it('unrelated actual events are not a mode transition', async () => {
    const h = await fixture(), promise = h.coordinator.preExecute(h.exec, { kind: 'ask' })
    await flush(); h.session.append('approval/asked', { id: 'unrelated' as never, toolName: 'other' })
    expect(h.reviewSignal?.aborted).toBe(false)
    h.reply.resolve(ALLOW); await expect(promise).resolves.toEqual({ kind: 'allow' })
  })
  it('owning public plugin scope disposal cancels AI and permanently closes the old coordinator', async () => {
    const h = await fixture(), promise = h.coordinator.preExecute(h.exec, { kind: 'ask' })
    await flush(); await h.fiber.dispose()
    await expect(promise).resolves.toMatchObject({ kind: 'deny' })
    expect(h.reviewSignal?.aborted).toBe(true); expect(h.abort.signal.aborted).toBe(false)
    h.reply.resolve(ALLOW); await flush()
    await expect(h.coordinator.preExecute(h.exec, { kind: 'allow' })).resolves.toMatchObject({ kind: 'deny' })
    const next = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    expect(await h.coordinator.approvalRequest(h.request, next)).toBe('cancelled'); expect(next).not.toHaveBeenCalled()
  })
  it('owning scope disposal also cancels a pending Native human fallback', async () => {
    const h = await fixture(), human = deferred<ApprovalOutcome>(), next = vi.fn(() => human.promise)
    h.ctx.on('approval/request', next)
    const promise = h.ctx.approval.request({ ...h.request, callId: undefined })
    await flush(); expect(next).toHaveBeenCalledOnce()
    await h.fiber.dispose(); await expect(promise).resolves.toBe('cancelled')
    human.resolve('allowed-once'); await flush(); expect(h.abort.signal.aborted).toBe(false)
  })
})
