/** Host-private correlation only: no HTTP caller/human/source-authentication or grant-execution claim. */
import { readFileSync } from 'node:fs'
import { setImmediate as realImmediate } from 'node:timers'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  CreatorConsentRegistry, CreatorConsentError, CREATOR_CONSENT_MAX_PENDING, CREATOR_CONSENT_TTL_MS,
} from '../src/creator-consent.ts'
import type {
  CreatorConsentRegistryOptions, CreatorConsentPromptInput, CreatorConsentOwner, CreatorConsentHandle,
} from '../src/creator-consent.ts'
import type { CreatorApprovalResult } from '../src/creator-approval-contract.ts'

// The façade keeps the real module's timer behavior but lets Vitest control elapsed
// time; no real Host, network, disk writes, broker or execution source is involved.
vi.mock('node:timers', async importOriginal => {
  const actual = await importOriginal<typeof import('node:timers')>()
  return { ...actual, setTimeout: (...args: Parameters<typeof setTimeout>) => globalThis.setTimeout(...args),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer) }
})
const registries: CreatorConsentRegistry[] = []
const ONCE: CreatorApprovalResult = { decision: 'allow', lifetime: 'once', operations: ['hot-reload'] }
const REJECT: CreatorApprovalResult = { decision: 'reject' }
const REMEMBER: CreatorApprovalResult = { decision: 'allow', lifetime: 'remember', operations: ['hot-reload'], rememberDays: 7 }
const SID = 'session-a'
function prompt(patch: Partial<CreatorConsentPromptInput> = {}): CreatorConsentPromptInput {
  return { protocol: 1, pluginId: 'sample-plugin', sourceLabel: '/safe/plugin', workspaceLabel: '/safe/workspace', currentOperation: 'hot-reload',
    availableOperations: ['check', 'activation-plan', 'hot-reload', 'activate-new-client'], allowTask: true, allowRemember: true, taskLabel: 'Current Host task', ...patch }
}
function harness(patch: Partial<CreatorConsentRegistryOptions> = {}) {
  const owner = Object.freeze({ [Symbol('private owner')]: true })
  const owners = new WeakSet<CreatorConsentOwner>([owner])
  const state = { now: 1_000, current: true, session: SID as string | undefined }
  const callbacks = {
    isCurrentOwner: vi.fn(() => state.current), validateOwner: vi.fn((value: CreatorConsentOwner) => owners.has(value)),
    sessionOfOwner: vi.fn((_value: CreatorConsentOwner) => state.session), now: vi.fn(() => state.now),
  }
  const registry = new CreatorConsentRegistry({ ...callbacks, ...patch })
  registries.push(registry)
  return { registry, owner, owners, state, callbacks,
    open: (source = prompt(), signal?: AbortSignal) => registry.open(owner, source, signal) }
}
function prepared(h = harness()) {
  const handle = h.open(), view = h.registry.present(handle.id, SID)
  return { ...h, handle, view }
}
function code(action: () => unknown, expected: string): void {
  try { action(); throw new Error('Expected failure') } catch (error) {
    expect(error).toBeInstanceOf(CreatorConsentError)
    expect((error as CreatorConsentError).code).toBe(expected)
  }
}
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No transport in this module')) })
afterEach(() => {
  registries.splice(0).forEach(registry => registry.dispose())
  expect(vi.getTimerCount()).toBe(0)
  expect(globalThis.fetch).not.toHaveBeenCalled()
  vi.useRealTimers(); vi.restoreAllMocks()
})

describe('Mandatory closed Host callbacks and bounded options', () => {
  it.each([undefined, null, {}, { sourceVerified: true }, { isCurrentOwner: () => true },
    { isCurrentOwner: true, validateOwner: true, sessionOfOwner: SID },
  ])('has no permissive fallback for options %j', options => {
    expect(() => new CreatorConsentRegistry(options as unknown as CreatorConsentRegistryOptions)).toThrow(CreatorConsentError)
  })
  it.each([
    { maxPending: 0 }, { maxPending: 65 }, { maxPending: 1.5 }, { maxPending: NaN }, { maxPending: null }, { maxPending: undefined },
    { ttlMs: 0 }, { ttlMs: 300_001 }, { ttlMs: Infinity }, { ttlMs: '1000' }, { ttlMs: null }, { ttlMs: undefined },
    { now: undefined }, { now: 1 }, { sourceVerified: true }, { generation: 'model' },
  ])('rejects widened/malformed configuration %j', patch => {
    expect(() => harness(patch as unknown as Partial<CreatorConsentRegistryOptions>)).toThrow(CreatorConsentError)
  })
  it('does not execute option accessors', () => {
    const getter = vi.fn(), options = { isCurrentOwner: () => true, validateOwner: () => true, sessionOfOwner: () => SID }
    Object.defineProperty(options, 'isCurrentOwner', { get: getter })
    expect(() => new CreatorConsentRegistry(options)).toThrow(CreatorConsentError)
    expect(getter).not.toHaveBeenCalled()
  })
  it('is closed by default when the generation callback is false, and never revives', () => {
    const h = harness(); h.state.current = false
    code(() => h.open(), 'not-current-owner')
    h.state.current = true
    code(() => h.open(), 'not-current-owner')
    expect(h.registry.health()).toEqual({ ok: false, pending: 0, receipts: 0, reason: 'not-current-owner' })
  })
  it.each([null, 'owner-id', true, 1, Symbol('owner'), () => {}])('rejects non-reference owner %s', owner => {
    const h = harness()
    code(() => h.registry.open(owner as unknown as CreatorConsentOwner, prompt()), 'owner-invalid')
    expect(h.registry.health().pending).toBe(0)
  })
  it('does not accept JSON clones, matching labels or sourceVerified as owner identity', () => {
    const h = harness()
    for (const fake of [{}, JSON.parse(JSON.stringify(h.owner)), { sourceVerified: true, sessionId: SID, taskId: 'forged' }]) {
      code(() => h.registry.open(fake, prompt()), 'owner-invalid')
    }
    expect(h.open().id).toMatch(/^cc:/)
  })
  it('fails a missing Host Session without constructing a client-supplied one', () => {
    const h = harness(); h.state.session = undefined
    code(() => h.open(), 'owner-invalid')
    h.state.session = SID
    code(() => h.open(), 'revoked')
  })
})

describe('Open/list/present expose only existing bounded display requests', () => {
  it('generates unpredictable Host ids, a private promise, and a fixed five-minute expiry', () => {
    const h = harness(), first = h.open(), second = h.open()
    expect(CREATOR_CONSENT_TTL_MS).toBe(300_000)
    expect(CREATOR_CONSENT_MAX_PENDING).toBe(64)
    expect(first.expiresAt).toBe(301_000)
    expect(first.id).not.toBe(second.id)
    expect(first.result).toBeInstanceOf(Promise)
    expect(Object.keys(first).sort()).toEqual(['expiresAt', 'id', 'result'])
    expect(JSON.stringify(h.registry)).toBe('{}')
  })
  it.each(['id', 'binding', 'token', 'owner', 'agent', 'sessionId', 'taskId', 'sourceVerified', 'expiresAt', 'grant', 'signal'])('cannot create a prompt with HTTP authority field %s', key => {
    const h = harness()
    code(() => h.open({ ...prompt(), [key]: 'forged' } as CreatorConsentPromptInput), 'invalid-input')
    expect(h.registry.health().pending).toBe(0)
  })
  it('strictly copies prompt input without reading getters', () => {
    const h = harness(), source = prompt(), getter = vi.fn()
    Object.defineProperty(source, 'sourceLabel', { get: getter })
    code(() => h.open(source), 'invalid-input')
    expect(getter).not.toHaveBeenCalled()
  })
  it('snapshots and redacts only finite display fields, never serializes the Host reference', () => {
    const h = harness(), source = prompt({ sourceLabel: 'Bearer source-secret', workspaceLabel: 'https://name:password@example.test/plugin', taskLabel: 'token=task-secret', reason: 'api_key=reason-secret' })
    const handle = h.open(source)
    source.availableOperations.length = 0
    const listing = h.registry.list(SID)
    expect(listing).toHaveLength(1)
    expect(listing[0]!.prompt.id).toBe(handle.id)
    expect(listing[0]!.prompt.availableOperations).toHaveLength(4)
    const text = JSON.stringify(listing)
    expect(text).toContain('[REDACTED]')
    for (const secret of ['source-secret', 'task-secret', 'reason-secret', 'name:password']) expect(text).not.toContain(secret)
    expect(Object.keys(listing[0]!).sort()).toEqual(['expiresAt', 'prompt'])
    for (const field of ['owner', 'token', 'exec', 'viewNonce', 'sessionId', 'result']) expect(listing[0]).not.toHaveProperty(field)
    expect(Object.isFrozen(listing[0]!.prompt.availableOperations)).toBe(true)
    expect(h.registry.list('another-session')).toEqual([])
  })
  it('does not issue any nonce from list or permit an undisplayed confirm', () => {
    const h = harness(), handle = h.open()
    code(() => h.registry.confirm(handle.id, '0'.repeat(48) + ':1', ONCE), 'invalid-view')
    expect(h.registry.health().pending).toBe(1)
  })
  it('does not create requests from a client-chosen id during present/confirm', () => {
    const h = harness(), unknown = 'cc:00000000-0000-0000-0000-000000000000:1'
    code(() => h.registry.present(unknown, SID), 'not-found')
    code(() => h.registry.confirm(unknown, '0'.repeat(48) + ':1', REMEMBER), 'not-found')
    expect(h.registry.list(SID)).toEqual([])
  })
  it('checks exact Session on present; wrong Session does not rotate a legitimate view', () => {
    const h = prepared()
    code(() => h.registry.present(h.handle.id, 'session-b'), 'session-mismatch')
    expect(h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE).status).toBe('accepted')
  })
  it('rotates view nonce without extending the original deadline', () => {
    const h = prepared(); h.state.now += 10
    const replacement = h.registry.present(h.handle.id, SID)
    expect(replacement.viewNonce).not.toBe(h.view.viewNonce)
    expect(replacement.expiresAt).toBe(h.handle.expiresAt)
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'invalid-view')
    expect(h.registry.confirm(h.handle.id, replacement.viewNonce, ONCE).status).toBe('accepted')
  })
  it('binds nonce to its existing request; another Session/view cannot reuse it', () => {
    const h = prepared(), otherOwner = Object.freeze({})
    h.owners.add(otherOwner)
    h.state.session = 'session-b'
    const other = h.registry.open(otherOwner, prompt()), otherView = h.registry.present(other.id, 'session-b')
    code(() => h.registry.confirm(other.id, h.view.viewNonce, ONCE), 'invalid-view')
    expect(h.registry.confirm(other.id, otherView.viewNonce, REJECT).status).toBe('accepted')
    // This proves request/view matching, NOT the physical holder of a stolen nonce.
  })
  it.each(['', 'session with space', null, {}, 1])('rejects malformed Session selector %s', session => {
    const h = prepared()
    code(() => h.registry.list(session as string), 'invalid-input')
    code(() => h.registry.present(h.handle.id, session as string), 'invalid-input')
  })
  it('accepts only a genuine live AbortSignal, not client signal-shaped JSON', () => {
    const h = harness()
    code(() => h.open(prompt(), { aborted: false, addEventListener() {} } as unknown as AbortSignal), 'invalid-input')
    const controller = new AbortController(); controller.abort()
    code(() => h.open(prompt(), controller.signal), 'aborted')
    expect(h.registry.health().pending).toBe(0)
  })
})

describe('Closed consent results, exact retry and no permission construction', () => {
  it.each([ONCE, REMEMBER, REJECT, { decision: 'allow', lifetime: 'task', operations: ['check', 'hot-reload'] }])('delivers exactly the explicit consent result %j', async answer => {
    const h = prepared()
    expect(h.registry.confirm(h.handle.id, h.view.viewNonce, answer)).toEqual({ id: h.handle.id, status: 'accepted' })
    expect(await h.handle.result).toEqual({ kind: 'consent', id: h.handle.id, answer })
    expect(h.registry.list(SID)).toEqual([])
    expect(h.registry.health()).toMatchObject({ pending: 0, receipts: 1 })
  })
  it.each(['allowed-once', 'allowed', { decision: 'allow' }, { decision: 'allow', source: 'human' }, { ...ONCE, binding: {} },
    { ...ONCE, token: 'fake' }, { ...ONCE, sourceVerified: true }, { ...REMEMBER, rememberDays: '7' }, { ...REMEMBER, rememberDays: 365 },
    { ...ONCE, operations: ['check'] }, { ...ONCE, operations: ['check', 'hot-reload'] }, { ...REJECT, rememberDays: 7 },
  ])('does not upgrade native/AI/fake HTTP result %j into remember', answer => {
    const h = prepared()
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, answer), 'invalid-input')
    expect(h.registry.health().pending).toBe(1)
    expect(h.registry.confirm(h.handle.id, h.view.viewNonce, REJECT).status).toBe('accepted')
  })
  it('cannot select task/remember or extra operations unavailable in the Host prompt', () => {
    const h = harness(), handle = h.open(prompt({ allowTask: false, allowRemember: false, availableOperations: ['hot-reload'] })), view = h.registry.present(handle.id, SID)
    code(() => h.registry.confirm(handle.id, view.viewNonce, REMEMBER), 'invalid-input')
    code(() => h.registry.confirm(handle.id, view.viewNonce, { decision: 'allow', lifetime: 'task', operations: ['hot-reload'] }), 'invalid-input')
    expect(h.registry.confirm(handle.id, view.viewNonce, ONCE).status).toBe('accepted')
  })
  it('same normalized answer is idempotent, but a changed answer conflicts and never settles twice', async () => {
    const h = prepared(), settled = vi.fn()
    void h.handle.result.then(settled)
    const answer = { decision: 'allow', lifetime: 'task', operations: ['hot-reload', 'check'] }
    h.registry.confirm(h.handle.id, h.view.viewNonce, answer)
    expect(h.registry.confirm(h.handle.id, h.view.viewNonce, { ...answer, operations: ['check', 'hot-reload'] }).status).toBe('duplicate')
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, REJECT), 'conflict')
    code(() => h.registry.present(h.handle.id, SID), 'conflict')
    await h.handle.result
    expect(settled).toHaveBeenCalledOnce()
    expect(h.registry.delegate(h.handle.id)).toBe(false)
  })
  it('does not let external answer mutations change its result or retry comparison', async () => {
    const h = prepared(), answer = structuredClone(ONCE)
    h.registry.confirm(h.handle.id, h.view.viewNonce, answer)
    if (answer.decision === 'allow') answer.operations.length = 0
    const result = await h.handle.result
    expect(result).toEqual({ kind: 'consent', id: h.handle.id, answer: ONCE })
    expect(Object.isFrozen(result)).toBe(true)
    if (result.kind === 'consent' && result.answer.decision === 'allow') expect(Object.isFrozen(result.answer.operations)).toBe(true)
    expect(h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE).status).toBe('duplicate')
  })
})

describe('Cancellation, revocation, generation and time are monotonic', () => {
  it.each(['cancelled', 'disconnected'] as const)('%s removes pending and refuses a late confirm', async reason => {
    const h = prepared()
    expect(h.registry.cancel(h.handle.id, reason)).toBe(true)
    expect(await h.handle.result).toEqual({ kind: 'cancelled', id: h.handle.id, reason })
    expect(h.registry.cancel(h.handle.id, reason)).toBe(false)
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, REMEMBER), 'not-found')
  })
  it('delegation is neither rejection nor an allow, and does not revive on late answers', async () => {
    const h = prepared()
    expect(h.registry.delegate(h.handle.id)).toBe(true)
    expect(await h.handle.result).toEqual({ kind: 'delegated', id: h.handle.id })
    expect(h.registry.delegate(h.handle.id)).toBe(false)
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'not-found')
  })
  it('native signal abort settles cancellation without an unhandled rejection', async () => {
    const h = harness(), controller = new AbortController(), handle = h.open(prompt(), controller.signal), view = h.registry.present(handle.id, SID)
    controller.abort(new Error('must not be stored or reflected'))
    expect(await handle.result).toEqual({ kind: 'cancelled', id: handle.id, reason: 'aborted' })
    code(() => h.registry.confirm(handle.id, view.viewNonce, ONCE), 'not-found')
    expect(h.registry.health()).toMatchObject({ pending: 0, receipts: 0 })
  })
  it('cancellation after an answer invalidates retry but cannot retroactively turn a delivered fact into permission', async () => {
    const h = harness(), controller = new AbortController(), handle = h.open(prompt(), controller.signal), view = h.registry.present(handle.id, SID)
    h.registry.confirm(handle.id, view.viewNonce, ONCE)
    controller.abort()
    code(() => h.registry.confirm(handle.id, view.viewNonce, ONCE), 'not-found')
    expect(await handle.result).toEqual({ kind: 'consent', id: handle.id, answer: ONCE })
    // The future broker must revalidate before dispatch; this module emits no permit.
  })
  it('owner revocation closes all its requests/receipts, not another owner, and cannot revive', async () => {
    const h = prepared(), another = h.open(), otherOwner = Object.freeze({})
    h.owners.add(otherOwner)
    const independent = h.registry.open(otherOwner, prompt())
    h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE)
    expect(h.registry.revokeOwner(h.owner)).toBe(2)
    expect(await another.result).toEqual({ kind: 'cancelled', id: another.id, reason: 'revoked' })
    code(() => h.open(), 'revoked')
    expect(h.registry.list(SID).map(item => item.prompt.id)).toEqual([independent.id])
  })
  it('callback owner invalidation is permanent even after the oracle incorrectly returns true again', async () => {
    const h = prepared(); h.owners.delete(h.owner)
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'owner-invalid')
    expect(await h.handle.result).toMatchObject({ kind: 'cancelled', reason: 'owner-invalid' })
    h.owners.add(h.owner)
    code(() => h.open(), 'revoked')
  })
  it('rechecks the Host owner Session on confirm and rejects an old view after migration', async () => {
    const h = prepared(); h.state.session = 'session-b'
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'session-changed')
    expect(await h.handle.result).toMatchObject({ kind: 'cancelled', reason: 'session-changed' })
    code(() => h.open(), 'revoked')
  })
  it('generation loss closes every pending and receipt; a later true does not reactivate it', async () => {
    const h = prepared(), other = h.open()
    h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE)
    h.state.current = false
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'not-current-owner')
    expect(await other.result).toMatchObject({ kind: 'cancelled', reason: 'not-current-owner' })
    h.state.current = true
    code(() => h.open(), 'not-current-owner')
  })
  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, 999])('fails permanently on invalid/backwards Host clock %s', async now => {
    const h = prepared(); h.state.now = now
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'clock-invalid')
    expect(await h.handle.result).toMatchObject({ kind: 'cancelled', reason: 'clock-invalid' })
    h.state.now = 10_000
    code(() => h.open(), 'clock-invalid')
  })
  it('rejects clock overflow rather than installing an unbounded timer', () => {
    const h = harness(); h.state.now = Number.MAX_SAFE_INTEGER - 1
    code(() => h.open(), 'clock-invalid')
  })
  it('expiry at the exact deadline prunes pending and receipts before any late response', async () => {
    const h = prepared(), waiting = h.open()
    h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE)
    h.state.now = waiting.expiresAt
    expect(h.registry.sweep()).toBe(2)
    expect(await waiting.result).toMatchObject({ kind: 'cancelled', reason: 'expired' })
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'not-found')
  })
  it('hard timeout cleans up even without polling or an advancing injected wall clock', async () => {
    const h = harness({ ttlMs: 20 }), handle = h.open(), view = h.registry.present(handle.id, SID)
    vi.advanceTimersByTime(20)
    expect(await handle.result).toMatchObject({ kind: 'cancelled', reason: 'expired' })
    code(() => h.registry.confirm(handle.id, view.viewNonce, ONCE), 'not-found')
  })
  it('dispose clears all resources, settles pending once, and is irreversible', async () => {
    const h = prepared(), settled = vi.fn(); void h.handle.result.then(settled)
    h.registry.dispose(); h.registry.dispose()
    expect(await h.handle.result).toMatchObject({ kind: 'cancelled', reason: 'disposed' })
    expect(settled).toHaveBeenCalledOnce()
    code(() => h.open(), 'disposed')
    expect(h.registry.health()).toEqual({ ok: false, pending: 0, receipts: 0, reason: 'disposed' })
  })
})

describe('Exceptions, asynchronous callbacks and synchronous races fail closed', () => {
  it.each(['isCurrentOwner', 'validateOwner', 'sessionOfOwner', 'now'] as const)('throws from %s without leaking errors or leaving pending work', async callback => {
    const h = prepared()
    h.callbacks[callback].mockImplementation(() => { throw new Error('private metadata must not leak') })
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'callback-invalid')
    expect(await h.handle.result).toMatchObject({ kind: 'cancelled', reason: 'callback-invalid' })
    expect(JSON.stringify(h.registry.health())).not.toContain('private metadata')
  })
  it.each(['isCurrentOwner', 'validateOwner', 'sessionOfOwner', 'now'] as const)('consumes rejected async %s but never uses its value', async callback => {
    let rejectAsync = false
    // No spy wraps this return path: the registry, not the test framework, must
    // attach the rejection observer to the actual returned native Promise.
    const realCallback = () => rejectAsync ? Promise.reject(new Error('async callback is forbidden'))
      : callback === 'sessionOfOwner' ? SID : callback === 'now' ? 1_000 : true
    const h = prepared(harness({ [callback]: realCallback } as Partial<CreatorConsentRegistryOptions>)), unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      rejectAsync = true
      code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'callback-invalid')
      expect(await h.handle.result).toMatchObject({ kind: 'cancelled', reason: 'callback-invalid' })
      await new Promise<void>(resolve => realImmediate(resolve))
      expect(unhandled).not.toHaveBeenCalled()
    } finally { process.removeListener('unhandledRejection', unhandled) }
  })
  it.each([1, 'true', {}, Promise.resolve(true)])('rejects non-boolean generation answer %s', value => {
    const h = harness({ isCurrentOwner: (() => value) as never })
    code(() => h.open(), 'callback-invalid')
    expect(h.registry.health().ok).toBe(false)
  })
  it('observes a throwing then getter in an invalid callback return', async () => {
    let answer: unknown = true
    const h = prepared(harness({ validateOwner: (() => answer) as never })), then = vi.fn(() => { throw new Error('bad then') })
    answer = Object.defineProperty({}, 'then', { get: then })
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'callback-invalid')
    await new Promise<void>(resolve => realImmediate(resolve))
    expect(then).toHaveBeenCalledOnce()
  })
  it('drains a native rejected promise whose .then was overridden', async () => {
    // Use a plain callback: spy wrappers may inspect .then and throw before the
    // actual returned Promise ever reaches the registry under test.
    let answer: unknown = true
    const h = prepared(harness({ validateOwner: (() => answer) as never })), promise = Promise.reject(new Error('drain native'))
    Object.defineProperty(promise, 'then', { get() { throw new Error('do not invoke overwritten then') } })
    answer = promise
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'callback-invalid')
    await new Promise<void>(resolve => realImmediate(resolve))
  })
  it('closes on callback reentry rather than permitting nested confirmation', async () => {
    const h = prepared()
    h.callbacks.validateOwner.mockImplementation(() => { h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE); return true })
    expect(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE)).toThrow(CreatorConsentError)
    expect(await h.handle.result).toMatchObject({ kind: 'cancelled', reason: 'reentrant' })
    expect(h.registry.health().reason).toBe('reentrant')
  })
  it('does not restore an entry aborted synchronously inside validation', async () => {
    const h = harness(), controller = new AbortController(), handle = h.open(prompt(), controller.signal), view = h.registry.present(handle.id, SID)
    h.callbacks.validateOwner.mockImplementation(() => { controller.abort(); return true })
    expect(() => h.registry.confirm(handle.id, view.viewNonce, REMEMBER)).toThrow(CreatorConsentError)
    expect(await handle.result).toMatchObject({ kind: 'cancelled', reason: 'aborted' })
    expect(h.registry.health()).toMatchObject({ pending: 0, receipts: 0 })
  })
  it('disposal in a callback wins even when that callback returns true', async () => {
    const h = prepared()
    h.callbacks.validateOwner.mockImplementation(() => { h.registry.dispose(); return true })
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'disposed')
    expect(await h.handle.result).toMatchObject({ kind: 'cancelled', reason: 'disposed' })
  })
  it('rechecks the clock after owner validation, not only at method entry', async () => {
    const h = prepared()
    h.callbacks.validateOwner.mockImplementation(() => { h.state.now = h.handle.expiresAt; return true })
    code(() => h.registry.confirm(h.handle.id, h.view.viewNonce, ONCE), 'expired')
    expect(await h.handle.result).toMatchObject({ kind: 'cancelled', reason: 'expired' })
  })
})

describe('Bounded memory, no persistence, and independent registry generations', () => {
  it('has at most 64 pending and frees capacity on explicit cancellation', async () => {
    const h = harness(), handles: CreatorConsentHandle[] = []
    for (let index = 0; index < 64; index += 1) handles.push(h.open())
    code(() => h.open(), 'capacity')
    expect(h.registry.health().pending).toBe(64)
    h.registry.cancel(handles[0]!.id)
    expect(await handles[0]!.result).toMatchObject({ kind: 'cancelled' })
    expect(h.open().id).not.toBe(handles[0]!.id)
  })
  it('keeps at most one bounded receipt pool and cannot revive an evicted nonce/id', () => {
    const h = harness({ maxPending: 2 }), values: Array<{ id: string; nonce: string }> = []
    for (let index = 0; index < 6; index += 1) {
      const handle = h.open(), view = h.registry.present(handle.id, SID)
      h.registry.confirm(handle.id, view.viewNonce, ONCE)
      values.push({ id: handle.id, nonce: view.viewNonce })
      expect(h.registry.health().receipts).toBeLessThanOrEqual(2)
    }
    code(() => h.registry.confirm(values[0]!.id, values[0]!.nonce, ONCE), 'not-found')
    expect(h.registry.confirm(values[5]!.id, values[5]!.nonce, ONCE).status).toBe('duplicate')
    expect(vi.getTimerCount()).toBe(2)
  })
  it('never lets another registry consume an old request/nonce pair', () => {
    const first = prepared(), second = harness()
    code(() => second.registry.confirm(first.handle.id, first.view.viewNonce, ONCE), 'not-found')
    first.registry.dispose()
    const fresh = prepared(second)
    code(() => fresh.registry.confirm(fresh.handle.id, first.view.viewNonce, ONCE), 'invalid-view')
  })
  it('provides only correlation and imports no persistence, network, grants, or production bridge', () => {
    const source = readFileSync(new URL('../src/creator-consent.ts', import.meta.url), 'utf8')
    for (const forbidden of ['node:fs', 'fetch(', 'createRemembered(', 'creator-grants.ts', 'approval.request(', 'ctx.remote', 'registerRoute', 'exec.token']) expect(source).not.toContain(forbidden)
  })
})
