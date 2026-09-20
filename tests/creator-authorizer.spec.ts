/** Actual Approval/Session/permission services, real ledger files and real Registry.
 * C/executor inspectors are private identity fixtures, not proof of the deployed C adapter or a physical human.
 */
import * as fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setImmediate as immediate } from 'node:timers'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import ApprovalService, { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import type { ApprovalRequest, ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import PermissionPresetService from '@deepseek-ai/dsh-permission-presets'
import SandboxPolicyService, { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { CreatorGrantStore, CREATOR_GRANT_FILENAME } from '../src/creator-grants.ts'
import type { CreatorGrantBinding, CreatorGrantOperation } from '../src/creator-grant-types.ts'
import { CreatorConsentRegistry } from '../src/creator-consent.ts'
import type { CreatorApprovalResult } from '../src/creator-approval-contract.ts'
import { CreatorAuthorizer, CreatorAuthorizerError } from '../src/creator-authorizer.ts'
import type { CreatorAuthorizerOptions, CreatorOwnerInspection, CreatorPreparedInspection, CreatorExecutionAudit } from '../src/creator-authorizer.ts'

vi.mock('node:fs', async () => ({ ...await vi.importActual<typeof import('node:fs')>('node:fs') }))
vi.mock('node:timers', async () => ({ ...await vi.importActual<typeof import('node:timers')>('node:timers'),
  setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms), clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer) }))
const ONCE: CreatorApprovalResult = { decision: 'allow', lifetime: 'once', operations: ['hot-reload'] }
const TASK: CreatorApprovalResult = { decision: 'allow', lifetime: 'task', operations: ['hot-reload'] }
const remember = (days: 1 | 7 | 30): CreatorApprovalResult => ({ decision: 'allow', lifetime: 'remember', operations: ['hot-reload'], rememberDays: days })
const disposers: Array<() => void | Promise<void>> = []
let root: string
let now: number
async function flush() { for (let index = 0; index < 20; index += 1) await Promise.resolve() }
function code(action: () => unknown, expected?: string) {
  try { action(); throw new Error('Expected authorization denial') } catch (error) {
    expect(error).toBeInstanceOf(CreatorAuthorizerError)
    if (expected !== undefined) expect((error as CreatorAuthorizerError).code).toBe(expected)
  }
}
beforeEach(() => { vi.useFakeTimers(); now = Date.UTC(2026, 8, 14); vi.setSystemTime(now); root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'creator-authorizer-'))) })
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  await flush(); expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers(); vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true })
})
async function fixture(override: Partial<CreatorAuthorizerOptions> = {}) {
  const ctx = new Context()
  const fibers = [await ctx.plugin(SessionStore), await ctx.plugin(SessionProjectionRegistry), await ctx.plugin(ApprovalService)]
  // No shell execution: this public service's configured default is only an input to the REAL preset fold.
  ctx.provide('shell', { sandboxMode: 'danger-full-access', run() { throw new Error('No dispatch in these tests') } })
  fibers.push(await ctx.plugin(PermissionPresetService, { presets: { 'approve-for-me': { sandbox: 'danger-full-access', approval: 'ask' }, outside: { sandbox: 'read-only', approval: 'ask' } }, defaultPreset: 'approve-for-me' }))
  const workspace = join(root, 'workspace'), source = join(root, 'example-plugin'), harness = join(root, 'harness')
  for (const directory of [workspace, source, harness]) fs.mkdirSync(directory)
  fibers.push(await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: workspace }))
  const session = ctx.sessions.create(SessionId('authorizer-session'))
  session.append('turn/start', { turn: 1 })
  const agent = { session } as unknown as Agent
  const stat = fs.statSync(source, { bigint: true })
  const baseBinding: CreatorGrantBinding = { engine: 'creator-plus-v1', harnessRoot: harness, sourceRoot: source, pluginId: 'example-plugin',
    sourceDirectoryIdentity: { dev: String(stat.dev), ino: String(stat.ino) }, workspaceRoot: workspace }
  let epoch: object = Object.freeze({}), generation: object = Object.freeze({}), lease = true
  let bypassInspectorMode = false
  const owners = new WeakMap<object, { facts: CreatorOwnerInspection; generation: object }>()
  const prepared = new WeakMap<object, { facts: CreatorPreparedInspection; generation: object }>()
  const audit: CreatorExecutionAudit[] = []
  const task = Object.freeze({}), taskAbort = new AbortController()
  ctx.on('session/event', (_session, event) => { if (['permission/preset', 'sandbox/mode', 'approval/policy'].includes(event.type)) epoch = Object.freeze({}) })
  const ownerReader = (owner: object): CreatorOwnerInspection | undefined => {
    const record = owners.get(owner)
    if (record === undefined || record.generation !== generation || record.facts.signal?.aborted || record.facts.taskSignal?.aborted) return undefined
    const current = record.facts.exactNativeRequest.agent.session
    if (!bypassInspectorMode && (ctx.permissionPresets.current(current) !== 'approve-for-me' || ctx.sandboxPolicy.resolve({ session: current }).mode !== 'danger-full-access'
      || (ctx.approval.overrideOf(current) ?? ctx.approval.config.policy ?? 'ask') !== 'ask')) return undefined
    return { ...record.facts, policyEpoch: epoch }
  }
  const preparedReader = (value: object): CreatorPreparedInspection | undefined => {
    const record = prepared.get(value)
    return record?.generation === generation ? record.facts : undefined
  }
  let store = new CreatorGrantStore({ directory: join(root, 'ledger'), now: () => now, isCurrentOwner: () => lease })
  let registry = new CreatorConsentRegistry({ isCurrentOwner: () => lease, validateOwner: owner => ownerReader(owner) !== undefined,
    sessionOfOwner: owner => ownerReader(owner)?.exactNativeRequest.agent.session.id, now: () => now })
  const options = (): CreatorAuthorizerOptions => ({ approval: ctx.approval, store, consent: registry, isCurrentOwner: () => lease,
    inspectOwner: ownerReader, inspectPrepared: preparedReader, supportedOperations: ['hot-reload'], audit: event => { audit.push(event); return true }, now: () => now, ...override })
  let authorizer = new CreatorAuthorizer(options())
  const handler = (request: ApprovalRequest, next: () => Promise<ApprovalOutcome>) => authorizer.handleNativeRequest(request, next)
  ctx.on('approval/request', handler)
  let count = 0
  function mint(patch: Partial<CreatorOwnerInspection> = {}) {
    const owner = Object.freeze({}), preparation = Object.freeze({}), abort = new AbortController(), prepAbort = new AbortController()
    const native: ApprovalRequest = Object.freeze({ agent, toolName: 'a-presentation-name-not-an-authority', signal: abort.signal })
    const facts: CreatorOwnerInspection = { exactNativeRequest: native, binding: structuredClone(baseBinding), operation: 'hot-reload', policyEpoch: epoch,
      signal: abort.signal, taskHandle: task, taskSignal: taskAbort.signal, ...patch }
    owners.set(owner, { facts, generation })
    const support: CreatorPreparedInspection = { owner, binding: structuredClone(facts.binding), operation: facts.operation, seal: Object.freeze({}), signal: prepAbort.signal }
    prepared.set(preparation, { facts: support, generation })
    return { owner, preparation, native: facts.exactNativeRequest, abort, prepAbort, facts, support, seq: ++count }
  }
  function facts(owner: object) { return owners.get(owner)!.facts }
  function support(preparation: object) { return prepared.get(preparation)!.facts }
  async function pending(pair = mint()) {
    const promise = authorizer.authorize(pair.owner, pair.preparation)
    void promise.catch(() => {})
    await flush()
    const listing = registry.list(pair.native.agent.session.id)
    if (listing.length !== 1) { await promise; throw new Error(`Expected one private confirmation; got ${listing.length}`) }
    const id = listing[0]!.prompt.id
    return { ...pair, promise, id, view: registry.present(id, pair.native.agent.session.id) }
  }
  async function allowed(answer: CreatorApprovalResult = ONCE, pair = mint()) {
    const active = await pending(pair)
    registry.confirm(active.id, active.view.viewNonce, answer)
    return { ...active, cap: await active.promise }
  }
  async function restart() {
    authorizer.dispose(); registry.dispose(); store.dispose(); generation = Object.freeze({})
    store = new CreatorGrantStore({ directory: join(root, 'ledger'), now: () => now, isCurrentOwner: () => lease })
    registry = new CreatorConsentRegistry({ isCurrentOwner: () => lease, validateOwner: owner => ownerReader(owner) !== undefined,
      sessionOfOwner: owner => ownerReader(owner)?.exactNativeRequest.agent.session.id, now: () => now })
    authorizer = new CreatorAuthorizer(options())
  }
  disposers.push(async () => { authorizer.dispose(); registry.dispose(); store.dispose(); for (const fiber of fibers.reverse()) await fiber.dispose() })
  return { ctx, session, agent, mint, facts, support, pending, allowed, restart, audit, task, taskAbort, baseBinding,
    get authorizer() { return authorizer }, get registry() { return registry }, get store() { return store }, options,
    invalidateOwner: (owner: object) => owners.delete(owner), invalidatePrepared: (value: object) => prepared.delete(value),
    lease: (value: boolean) => { lease = value }, ignoreInspectorMode: () => { bypassInspectorMode = true },
    asked: () => session.snapshotEvents().filter(event => event.type === 'approval/asked').length,
  }
}

describe('Actual native question correlation and one-shot capabilities', () => {
  it('uses the actual exact request once, waits for its Registry fact, and returns an empty frozen capability', async () => {
    const h = await fixture(), p = await h.pending()
    expect(h.asked()).toBe(1); expect(h.audit).toEqual([])
    expect(h.registry.list(h.session.id)[0]!.prompt.availableOperations).toEqual(['hot-reload'])
    h.registry.confirm(p.id, p.view.viewNonce, ONCE)
    const cap = await p.promise
    expect(Object.isFrozen(cap)).toBe(true); expect(Reflect.ownKeys(cap)).toEqual([])
    expect(Object.getPrototypeOf(cap)).toBe(null)
    expect(h.audit).toEqual([])
    h.authorizer.consume(cap, p.owner, p.preparation)
    expect(h.audit).toHaveLength(1)
    expect(h.audit[0]).toMatchObject({ source: 'consent-once', phase: 'dispatch-precheck', observed: 'prechecks-passed' })
    code(() => h.authorizer.consume(cap, p.owner, p.preparation), 'capability-used')
    await expect(h.authorizer.authorize(p.owner, p.preparation)).rejects.toMatchObject({ code: 'duplicate-owner' })
    expect(h.asked()).toBe(1)
  })
  it('unknown same-name/callId request clones delegate but cannot open our Registry or mint a capability', async () => {
    const h = await fixture(), p = h.mint(), next = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    expect(await h.authorizer.handleNativeRequest({ ...p.native }, next)).toBe('allowed-once')
    expect(next).toHaveBeenCalledOnce(); expect(h.registry.list(h.session.id)).toEqual([])
    const fake = { sourceVerified: true, name: p.native.toolName, callId: p.native.callId, binding: h.baseBinding }
    await expect(h.authorizer.authorize(fake, p.preparation)).rejects.toMatchObject({ code: 'invalid-owner' })
    expect(h.asked()).toBe(0)
  })
  it('outer listener early allow without our private confirmation is not one of our capabilities', async () => {
    const h = await fixture(), p = h.mint()
    h.ctx.on('approval/request', async () => 'allowed-once', { prepend: true })
    await expect(h.authorizer.authorize(p.owner, p.preparation)).rejects.toMatchObject({ code: 'native-bypass' })
    expect(h.asked()).toBe(1); expect(h.registry.list(h.session.id)).toEqual([]); expect(h.store.list()).toEqual([])
  })
  it('a listener overriding an explicit rejection cannot promote it into an authorization', async () => {
    const h = await fixture()
    h.ctx.on('approval/request', async (_request, next) => { await next(); return 'allowed-once' }, { prepend: true })
    const p = await h.pending(); h.registry.confirm(p.id, p.view.viewNonce, { decision: 'reject' })
    await expect(p.promise).rejects.toMatchObject({ code: 'consent-denied' })
    expect(h.store.list()).toEqual([]); expect(h.audit).toEqual([])
  })
  it('explicit UI delegation alone may use native next, and is forever native-delegation/once', async () => {
    const h = await fixture(), next = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    h.ctx.on('approval/request', next)
    const p = await h.pending(); expect(next).not.toHaveBeenCalled()
    h.registry.delegate(p.id) // Host-internal test call, NOT a proposed unprotected HTTP route.
    const cap = await p.promise; expect(next).toHaveBeenCalledOnce()
    h.authorizer.consume(cap, p.owner, p.preparation)
    expect(h.audit[0]!.source).toBe('native-delegation'); expect(h.store.list()).toEqual([])
    const again = await h.pending(); expect(h.asked()).toBe(2)
    h.registry.confirm(again.id, again.view.viewNonce, { decision: 'reject' }); await expect(again.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
  })
  it.each(['rejected', 'cancelled', 'unavailable'] as const)('keeps delegated native %s non-executable', async outcome => {
    const h = await fixture(); h.ctx.on('approval/request', async () => outcome)
    const p = await h.pending(); h.registry.delegate(p.id)
    await expect(p.promise).rejects.toMatchObject({ code: 'native-denied' }); expect(h.audit).toEqual([])
  })
  it('a repeated actual Native request is rejected without reopening consent; first attempt is not refunded', async () => {
    const h = await fixture(), p = await h.pending()
    expect(await h.ctx.approval.request(p.native)).toBe('rejected')
    await expect(p.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
    expect(h.registry.list(h.session.id)).toEqual([])
    // Actual Approval itself logs each invocation; our handler did not make a second UI question.
    expect(h.asked()).toBe(2)
  })
  it('another owner cannot reuse the exact Native request object to obtain another prompt/capability', async () => {
    const h = await fixture(), p = await h.allowed(), other = h.mint({ exactNativeRequest: p.native, signal: p.native.signal })
    await expect(h.authorizer.authorize(other.owner, other.preparation)).rejects.toMatchObject({ code: 'duplicate-request' })
    expect(h.asked()).toBe(1)
  })
  it('wrong owner or ticket burns the original capability; no later correct retry', async () => {
    const h = await fixture(), p = await h.allowed()
    code(() => h.authorizer.consume(p.cap, Object.freeze({}), p.preparation), 'capability-binding')
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'capability-used')
    const q = await h.allowed()
    code(() => h.authorizer.consume(q.cap, q.owner, Object.freeze({})), 'capability-binding')
    code(() => h.authorizer.consume(q.cap, q.owner, q.preparation), 'capability-used')
    code(() => h.authorizer.consume(Object.freeze({}), q.owner, q.preparation), 'unknown-capability')
    expect(h.audit).toEqual([])
  })
  it('post-await checks never consume twice and a failed continuation can never restart', async () => {
    const h = await fixture(), p = await h.allowed()
    h.authorizer.consume(p.cap, p.owner, p.preparation)
    await Promise.resolve(); h.authorizer.revalidateStarted(p.cap, p.owner, p.preparation)
    expect(h.audit.map(row => row.phase)).toEqual(['dispatch-precheck', 'continuation-precheck'])
    h.invalidatePrepared(p.preparation)
    code(() => h.authorizer.revalidateStarted(p.cap, p.owner, p.preparation), 'invalid-preparation')
    code(() => h.authorizer.revalidateStarted(p.cap, p.owner, p.preparation), 'not-started')
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'capability-used')
  })
})

describe('Pending lifetime, admission and invalid callback fences', () => {
  it.each(['owner', 'task', 'prepared'] as const)('%s cancellation immediately withdraws the exact pending consent', async kind => {
    const h = await fixture(), p = await h.pending()
    if (kind === 'owner') p.abort.abort()
    else if (kind === 'task') h.taskAbort.abort()
    else p.prepAbort.abort()
    await expect(p.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
    await flush()
    expect(h.registry.list(h.session.id)).toEqual([])
    expect(h.authorizer.health().pending).toBe(0); expect(h.audit).toEqual([])
  })
  it('target cancellation while native next waits closes our Native handler; its late allow is discarded', async () => {
    const h = await fixture()
    let resolve!: (outcome: ApprovalOutcome) => void
    h.ctx.on('approval/request', () => new Promise<ApprovalOutcome>(done => { resolve = done }))
    const p = await h.pending(); h.registry.delegate(p.id); await flush()
    p.prepAbort.abort(); await expect(p.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
    await flush()
    expect(h.session.snapshotEvents().filter(event => event.type === 'approval/decided').at(-1)?.data).toMatchObject({ outcome: 'cancelled' })
    resolve('allowed-once'); await flush()
    expect(h.store.list()).toEqual([]); expect(h.audit).toEqual([])
  })
  it('root disposal closes pending requests and refuses a later nonce confirmation without next', async () => {
    const h = await fixture(), p = await h.pending(), next = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    h.ctx.on('approval/request', next); h.authorizer.dispose()
    await expect(p.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
    expect(() => h.registry.confirm(p.id, p.view.viewNonce, remember(7))).toThrow()
    expect(next).not.toHaveBeenCalled(); expect(h.store.list()).toEqual([])
  })
  it('a changed prepared signal invalidates an issued capability even when the replacement is not aborted', async () => {
    const h = await fixture(), p = await h.allowed()
    h.support(p.preparation).signal = new AbortController().signal
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'preparation-changed')
    expect(h.audit).toEqual([])
  })
  it('requires a true native prepared signal before asking and does not retry a burned preparation', async () => {
    const h = await fixture(), p = h.mint()
    h.support(p.preparation).signal = undefined as never
    await expect(h.authorizer.authorize(p.owner, p.preparation)).rejects.toMatchObject({ code: 'invalid-preparation' })
    const q = h.mint()
    await expect(h.authorizer.authorize(q.owner, p.preparation)).rejects.toMatchObject({ code: 'duplicate-preparation' })
    expect(h.asked()).toBe(0)
  })
  it('uses a hard steady deadline even when an injected wall clock is frozen', async () => {
    const h = await fixture(), p = await h.allowed()
    await vi.advanceTimersByTimeAsync(300_001)
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'expired')
    expect(h.audit).toEqual([])
  })
  it('bounds an external Native listener that never reached the private handler, and ignores its late allow', async () => {
    const h = await fixture({ ttlMs: 10 })
    let resolve!: (value: ApprovalOutcome) => void
    h.ctx.on('approval/request', () => new Promise<ApprovalOutcome>(done => { resolve = done }), { prepend: true })
    const p = h.mint(), promise = h.authorizer.authorize(p.owner, p.preparation)
    void promise.catch(() => {})
    await flush(); await vi.advanceTimersByTimeAsync(10)
    await expect(promise).rejects.toMatchObject({ code: 'expired' })
    resolve('allowed-once'); await flush()
    expect(h.authorizer.health().pending).toBe(0); expect(h.audit).toEqual([])
    await expect(h.authorizer.authorize(p.owner, p.preparation)).rejects.toMatchObject({ code: 'duplicate-owner' })
  })
  it('bounds in-flight admission and cannot use revalidateStarted to bypass initial consume', async () => {
    const h = await fixture({ maxPending: 1 }), p = await h.pending(), q = h.mint()
    await expect(h.authorizer.authorize(q.owner, q.preparation)).rejects.toMatchObject({ code: 'capacity' })
    h.registry.confirm(p.id, p.view.viewNonce, ONCE)
    const cap = await p.promise
    code(() => h.authorizer.revalidateStarted(cap, p.owner, p.preparation), 'not-started')
    code(() => h.authorizer.consume(cap, p.owner, p.preparation), 'capability-used')
    expect(h.authorizer.health().pending).toBe(0)
  })
  it.each(['inspectPrepared', 'isCurrentOwner', 'now'] as const)('async %s closes and drains rather than granting', async key => {
    const broken = (() => Promise.reject(new Error('private async failure'))) as never
    const h = await fixture({ [key]: broken }), p = h.mint()
    await expect(h.authorizer.authorize(p.owner, p.preparation)).rejects.toBeInstanceOf(CreatorAuthorizerError)
    await new Promise<void>(done => immediate(done)); expect(h.authorizer.health().ok).toBe(false)
  })
  it('also drains a genuine rejected Promise with a forged plain-object prototype', async () => {
    const reader = (() => { const value = Promise.reject(new Error('masked async reader')); Object.setPrototypeOf(value, Object.prototype); return value }) as never
    const h = await fixture({ inspectOwner: reader }), p = h.mint()
    await expect(h.authorizer.authorize(p.owner, p.preparation)).rejects.toMatchObject({ code: 'callback-invalid' })
    await new Promise<void>(done => immediate(done)); expect(h.authorizer.health().ok).toBe(false)
  })
  it('reentrant audit closes the root even when the trusted sink catches the inner denial', async () => {
    let reenter: (() => void) | undefined
    const h = await fixture({ audit: () => { try { reenter?.() } catch { /* Caller cannot swallow a revoked lease. */ } return true } }), p = await h.allowed()
    reenter = () => h.authorizer.consume(p.cap, p.owner, p.preparation)
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'reentrant')
    expect(h.authorizer.health().ok).toBe(false)
  })
})

describe('This task and explicit remembered scope', () => {
  it('task grants match only the same live handle, scope and operation and stay off disk', async () => {
    const h = await fixture(), first = await h.allowed(TASK)
    h.authorizer.consume(first.cap, first.owner, first.preparation)
    const next = h.mint(), cap = await h.authorizer.authorize(next.owner, next.preparation)
    h.authorizer.consume(cap, next.owner, next.preparation)
    expect(h.asked()).toBe(1); expect(h.audit.map(row => row.source)).toEqual(['task', 'task'])
    expect(h.store.list()).toEqual([]); expect(fs.existsSync(join(root, 'ledger', CREATOR_GRANT_FILENAME))).toBe(false)
    const otherTask = await h.pending(h.mint({ taskHandle: Object.freeze({}), taskSignal: new AbortController().signal }))
    expect(h.asked()).toBe(2); h.registry.confirm(otherTask.id, otherTask.view.viewNonce, { decision: 'reject' })
    await expect(otherTask.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
  })
  it('a different scope/op does not inherit a task grant; extra operations require their own declared support', async () => {
    const h = await fixture({ supportedOperations: ['hot-reload', 'check'] }); await h.allowed(TASK)
    const otherScope = h.mint({ binding: { ...h.baseBinding, workspaceRoot: join(root, 'other-workspace') } })
    const p = await h.pending(otherScope); h.registry.confirm(p.id, p.view.viewNonce, { decision: 'reject' }); await expect(p.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
    const otherOp = await h.pending(h.mint({ operation: 'check' }))
    h.registry.confirm(otherOp.id, otherOp.view.viewNonce, { decision: 'reject' }); await expect(otherOp.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
    expect(h.asked()).toBe(3)
  })
  it('task revocation invalidates issued and started capabilities, without reviving cached rule objects', async () => {
    const h = await fixture(), p = await h.allowed(TASK), q = h.mint(), cap = await h.authorizer.authorize(q.owner, q.preparation)
    h.authorizer.consume(p.cap, p.owner, p.preparation); h.authorizer.revokeTask(h.task)
    code(() => h.authorizer.consume(cap, q.owner, q.preparation), 'task-invalid')
    code(() => h.authorizer.revalidateStarted(p.cap, p.owner, p.preparation), 'task-invalid')
    const next = await h.pending(); h.registry.confirm(next.id, next.view.viewNonce, { decision: 'reject' }); await expect(next.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
  })
  it('task end aborts a reusable task capability even if the original request signal still lives', async () => {
    const h = await fixture(), p = await h.allowed(TASK)
    h.taskAbort.abort()
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'invalid-owner')
    expect(h.audit).toEqual([])
  })
  it.each([1, 7, 30] as const)('explicitly persists %i days, matches across tasks, and audit-create is not dispatch', async days => {
    const h = await fixture(), p = await h.allowed(remember(days))
    expect(h.store.list()).toHaveLength(1)
    expect(h.store.list()[0]!.expiresAt).toBe(now + days * 86_400_000)
    expect(h.audit).toEqual([])
    const next = h.mint({ taskHandle: Object.freeze({}), taskSignal: new AbortController().signal })
    const cap = await h.authorizer.authorize(next.owner, next.preparation)
    expect(h.asked()).toBe(1)
    h.authorizer.consume(cap, next.owner, next.preparation)
    expect(h.audit[0]).toMatchObject({ source: 'remembered', grant: { id: h.store.list()[0]!.id, version: 1 } })
    expect(Reflect.ownKeys(p.cap)).toEqual([])
  })
  it('restart matches remembered policy only through fresh private owner/prepared readers, never an old cap or task rule', async () => {
    const h = await fixture(), p = await h.allowed(remember(7)); await h.restart()
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'unknown-capability')
    await expect(h.authorizer.authorize(p.owner, p.preparation)).rejects.toMatchObject({ code: 'invalid-owner' })
    const fresh = h.mint(), cap = await h.authorizer.authorize(fresh.owner, fresh.preparation)
    h.authorizer.consume(cap, fresh.owner, fresh.preparation)
    expect(h.asked()).toBe(1)
    expect(h.audit[0]!.source).toBe('remembered')
  })
  it('task policy does not survive a broker restart', async () => {
    const h = await fixture(); await h.allowed(TASK); await h.restart()
    const next = await h.pending(); h.registry.confirm(next.id, next.view.viewNonce, { decision: 'reject' }); await expect(next.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
    expect(h.asked()).toBe(2); expect(h.store.list()).toEqual([])
  })
  it.each(['revoke', 'disable', 'delete'] as const)('remembered %s invalidates already issued capabilities at consume', async method => {
    const h = await fixture(), p = await h.allowed(remember(1))
    h.store[method](h.store.list()[0]!.id)
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'grant-invalid')
    expect(h.audit).toEqual([])
  })
  it('remember-save failure rejects rather than silently issuing once or delegating', async () => {
    const h = await fixture(), p = await h.pending()
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('injected fs write failure') })
    h.registry.confirm(p.id, p.view.viewNonce, remember(7))
    await expect(p.promise).rejects.toMatchObject({ code: 'remember-save-failed' })
    write.mockRestore(); expect(h.audit).toEqual([])
  })
  it('expired remembered policy is never reusable even for fresh owner/ticket', async () => {
    const h = await fixture(); await h.allowed(remember(1)); now += 86_400_000
    const next = await h.pending(); h.registry.confirm(next.id, next.view.viewNonce, { decision: 'reject' }); await expect(next.promise).rejects.toBeInstanceOf(CreatorAuthorizerError)
    expect(h.asked()).toBe(2)
  })
})

describe('Live C/preparation/epoch and synchronous audit fences', () => {
  it.each(['permission/preset', 'sandbox/mode', 'approval/policy'] as const)('real %s away/back produces a new epoch and invalidates an old capability', async kind => {
    const h = await fixture(), p = await h.allowed()
    if (kind === 'permission/preset') { h.session.append(kind, { preset: 'outside' }); h.session.append(kind, { preset: 'approve-for-me' }) }
    else if (kind === 'sandbox/mode') { setSandboxMode(h.session, 'read-only'); setSandboxMode(h.session, 'danger-full-access') }
    else { setApprovalPolicy(h.session, 'never'); setApprovalPolicy(h.session, 'ask') }
    expect(h.ctx.permissionPresets.current(h.session)).toBe('approve-for-me')
    expect(h.ctx.sandboxPolicy.resolve({ session: h.session }).mode).toBe('danger-full-access')
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'owner-changed')
    expect(h.audit).toEqual([])
  })
  it('independently checks actual native never even if a defective C reader ignores it', async () => {
    const h = await fixture(), p = await h.allowed(remember(1)); h.ignoreInspectorMode()
    setApprovalPolicy(h.session, 'never')
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'native-never')
    const next = h.mint(); await expect(h.authorizer.authorize(next.owner, next.preparation)).rejects.toMatchObject({ code: 'native-never' })
    expect(h.audit).toEqual([])
  })
  it('does not infer source/support from correct names, cloned preparation, wrong target or unsupported operation', async () => {
    const h = await fixture(), p = h.mint()
    await expect(h.authorizer.authorize(p.owner, { ...p.preparation })).rejects.toMatchObject({ code: 'invalid-preparation' })
    const q = h.mint(); h.support(q.preparation).owner = p.owner
    await expect(h.authorizer.authorize(q.owner, q.preparation)).rejects.toMatchObject({ code: 'invalid-preparation' })
    const r = h.mint(); h.support(r.preparation).binding.workspaceRoot = join(root, 'wrong-target')
    await expect(h.authorizer.authorize(r.owner, r.preparation)).rejects.toMatchObject({ code: 'invalid-preparation' })
    const unsupported = h.mint({ operation: 'check' })
    await expect(h.authorizer.authorize(unsupported.owner, unsupported.preparation)).rejects.toMatchObject({ code: 'unsupported-operation' })
    expect(h.asked()).toBe(0)
  })
  it('changed live binding, owner reference or sealed preparation denies at consume', async () => {
    const h = await fixture(), p = await h.allowed(); h.facts(p.owner).binding.sourceDirectoryIdentity.ino = '9999'
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'owner-changed')
    const q = await h.allowed(); h.support(q.preparation).seal = Object.freeze({})
    code(() => h.authorizer.consume(q.cap, q.owner, q.preparation), 'preparation-changed')
    const r = await h.allowed(); h.invalidateOwner(r.owner)
    code(() => h.authorizer.consume(r.cap, r.owner, r.preparation), 'invalid-owner')
    expect(h.audit).toEqual([])
  })
  it('root lease is permanently closed after false, and old scopes cannot resume when it becomes true', async () => {
    const h = await fixture(), p = await h.allowed(); h.lease(false)
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'not-current-owner')
    h.lease(true); code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'not-current-owner')
    expect(h.authorizer.health().ok).toBe(false)
  })
  it('clock rollback, cancellation and expiry cannot refund a capability', async () => {
    const h = await fixture(), p = await h.allowed(); p.abort.abort()
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'invalid-owner')
    const q = await h.allowed(); now += 300_000
    code(() => h.authorizer.consume(q.cap, q.owner, q.preparation), 'expired')
    now -= 1
    expect(h.authorizer.health()).toMatchObject({ ok: false, reason: 'clock-invalid' })
  })
  it('store corruption invalidates even an issued once capability, not just remembered matches', async () => {
    const h = await fixture(), p = await h.allowed()
    fs.writeFileSync(join(root, 'ledger', CREATOR_GRANT_FILENAME), 'corrupt', { mode: 0o600 })
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'store-unhealthy')
  })
  it.each(['throw', 'promise', 'false'] as const)('audit sink %s denies/consumes permanently, and rejects asynchronously without an unhandled rejection', async kind => {
    const sink = (() => { if (kind === 'throw') throw new Error('private sink detail'); if (kind === 'promise') return Promise.reject(new Error('no async audit')); return false }) as CreatorAuthorizerOptions['audit']
    const h = await fixture({ audit: sink }), p = await h.allowed()
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'audit-failed')
    await new Promise<void>(done => immediate(done))
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'audit-failed')
  })
  it('audit precheck DTO is frozen and bounded, with no raw identities, paths, nonce or business-accepted claim', async () => {
    const h = await fixture(), p = await h.allowed(remember(7))
    h.authorizer.consume(p.cap, p.owner, p.preparation)
    const dto = h.audit[0]!
    expect(Object.isFrozen(dto)).toBe(true); expect(Object.isFrozen(dto.grant)).toBe(true)
    expect(dto.bindingHash).toMatch(/^[a-f0-9]{64}$/)
    const json = JSON.stringify(dto)
    expect(json.length).toBeLessThan(650)
    for (const forbidden of [root, 'viewNonce', 'owner', 'preparation', 'nativeRequest', 'accepted', 'toolName']) expect(json).not.toContain(forbidden)
  })
  it('audit callback mutation of live epoch fails the final fence; the precheck row never means dispatch occurred', async () => {
    let mutate: (() => void) | undefined
    const rows: CreatorExecutionAudit[] = []
    const h = await fixture({ audit: event => { rows.push(event); mutate?.(); return true } }), p = await h.allowed()
    mutate = () => { setApprovalPolicy(h.session, 'never'); setApprovalPolicy(h.session, 'ask') }
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'owner-changed')
    expect(rows).toHaveLength(1); expect(rows[0]!.observed).toBe('prechecks-passed')
    code(() => h.authorizer.consume(p.cap, p.owner, p.preparation), 'capability-used')
  })
  it('mandatory inspectors cannot be replaced by async callbacks, sourceVerified or a default operation set', async () => {
    const h = await fixture()
    expect(() => new CreatorAuthorizer({ ...h.options(), supportedOperations: undefined } as unknown as CreatorAuthorizerOptions)).toThrow(CreatorAuthorizerError)
    expect(() => new CreatorAuthorizer({ ...h.options(), sourceVerified: true } as CreatorAuthorizerOptions)).toThrow(CreatorAuthorizerError)
    const a = new CreatorAuthorizer({ ...h.options(), inspectOwner: (() => Promise.reject(new Error('async owner'))) as never })
    disposers.push(() => a.dispose())
    const p = h.mint(); await expect(a.authorize(p.owner, p.preparation)).rejects.toMatchObject({ code: 'callback-invalid' })
    await new Promise<void>(done => immediate(done)); expect(a.health().ok).toBe(false)
  })
})
