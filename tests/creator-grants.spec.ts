/** Isolated private ledger tests. No Host, UI, model, external command or activation. */
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreatorGrantStore, CreatorGrantStoreError, CREATOR_GRANT_FILENAME, CREATOR_GRANT_MAX_LIFETIME_MS } from '../src/creator-grants.ts'
import type { CreateCreatorRememberedGrant, CreatorGrantBinding, CreatorGrantOperation, CreatorGrantStoreOptions } from '../src/creator-grant-types.ts'

// Keep a mutable, shared facade for narrowly injected fs failures; all ordinary calls use real temp files.
vi.mock('node:fs', async () => ({ ...await vi.importActual<typeof import('node:fs')>('node:fs') }))
let root: string
let directory: string
let now: number
let counter: number
let stores: CreatorGrantStore[]
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'creator-grants-')))
  directory = join(root, 'ledger')
  now = 1_800_000_000_000
  counter = 0
  stores = []
})
afterEach(() => { stores.forEach(store => store.dispose()); vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })
function binding(): CreatorGrantBinding {
  return { engine: 'creator-plus-v1', harnessRoot: '/host/harness', sourceRoot: '/source/example-plugin', pluginId: 'example-plugin', sourceDirectoryIdentity: { dev: '123', ino: '456' }, workspaceRoot: '/workspace/one' }
}
function input(patch: Partial<CreateCreatorRememberedGrant> = {}): CreateCreatorRememberedGrant {
  return { binding: binding(), operations: ['hot-reload'], expiresAt: now + 60_000, confirmationId: `confirmed-${++counter}`, futureVersions: true, enabled: true, ...patch }
}
function open(options: Partial<CreatorGrantStoreOptions> = {}): CreatorGrantStore {
  const store = new CreatorGrantStore({ directory, now: () => now, ...options })
  stores.push(store)
  return store
}
function state(): any { return JSON.parse(fs.readFileSync(join(directory, CREATOR_GRANT_FILENAME), 'utf8')) }
function put(value: unknown): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  fs.writeFileSync(join(directory, CREATOR_GRANT_FILENAME), typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 })
}
function code(action: () => unknown, expected: string): void {
  try { action(); throw new Error('Expected ledger rejection') } catch (error) {
    expect(error).toBeInstanceOf(CreatorGrantStoreError)
    expect((error as CreatorGrantStoreError).code).toBe(expected)
  }
}
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Generate a closed schema fixture from an actual committed seed, without executing 1000 fsyncs. */
function filled(count: number, events = count): any {
  const store = open()
  store.createRemembered(input())
  store.dispose()
  const initial = state()
  const seed = initial.grants[0]
  const grants = Array.from({ length: count }, (_, i) => ({ ...seed, id: `grant-${i}`, confirmationId: `receipt-${i}` }))
  const confirmations = grants.map(grant => ({ id: grant.confirmationId, grantId: grant.id, createdAt: grant.createdAt, enabled: true,
    inputHash: hash({ binding: grant.binding, operations: grant.operations, expiresAt: grant.expiresAt, confirmationId: grant.confirmationId, futureVersions: true, enabled: true }) }))
  return { version: 1, revision: events, grants, confirmations,
    events: Array.from({ length: events }, (_, i) => ({ ...initial.events[0], id: `event-${i}`, revision: i + 1, grantId: grants[i % count]!.id })) }
}

describe('CreatorGrantStore: explicit remembered-only scope and detached lookup', () => {
  it('creates an independent 0700 directory but no grant/ledger without confirmation', () => {
    const store = open()
    expect(store.health()).toEqual({ ok: true, revision: 0, durableRevocationGuaranteed: true })
    expect(store.list()).toEqual([])
    expect(fs.statSync(directory).mode & 0o777).toBe(0o700)
    expect(fs.existsSync(store.path)).toBe(false)
  })
  it('defaults disabled, persists explicit futureVersions, and load never enables it', () => {
    const store = open()
    const { enabled: _, ...candidate } = input()
    const grant = store.createRemembered(candidate)
    expect(grant).toMatchObject({ enabled: false, futureVersions: true, version: 1 })
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(open().list()[0]?.enabled).toBe(false)
    expect(open().findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(fs.statSync(store.path).mode & 0o777).toBe(0o600)
  })
  it('loads a confirmed enabled remembered rule, not an execution ticket or session grant', () => {
    const candidate = input({ operations: ['check', 'hot-reload'] })
    const grant = open().createRemembered(candidate)
    const store = open()
    expect(store.findMatch(binding(), 'hot-reload')).toEqual(grant)
    expect(store.findMatch(binding(), 'check')).toEqual(grant)
    expect(store.findMatch(binding(), 'activation-plan')).toBeUndefined()
    expect(store.findMatch(binding(), 'activate-new-client')).toBeUndefined()
    expect(grant).not.toHaveProperty('token')
    expect(grant).not.toHaveProperty('sessionId')
    expect(grant).not.toHaveProperty('artifactDigest')
  })
  it('normalizes operation set order and returns copies from every read/create', () => {
    const store = open(), candidate = input({ operations: ['hot-reload', 'check'] })
    const grant = store.createRemembered(candidate)
    candidate.binding.pluginId = 'changed'
    candidate.operations.push('activate-new-client')
    grant.enabled = false
    store.list()[0]!.binding.sourceRoot = '/attacker'
    const found = store.findMatch(binding(), 'hot-reload')!
    found.operations.length = 0
    expect(store.findMatch(binding(), 'hot-reload')?.operations).toEqual(['check', 'hot-reload'])
    expect(store.list()[0]?.binding).toEqual(binding())
  })
  it.each(['harnessRoot', 'sourceRoot', 'workspaceRoot', 'pluginId'] as const)('requires exact %s binding', key => {
    const store = open(); store.createRemembered(input())
    const other = { ...binding(), [key]: key === 'pluginId' ? 'other-plugin' : '/other/root' }
    expect(store.findMatch(other, 'hot-reload')).toBeUndefined()
  })
  it.each(['dev', 'ino'] as const)('requires exact source directory %s identity', key => {
    const store = open(); store.createRemembered(input())
    const other = binding(); other.sourceDirectoryIdentity[key] = '999'
    expect(store.findMatch(other, 'hot-reload')).toBeUndefined()
  })
  it('does not match by a familiar tool name, wrong engine or omitted workspace', () => {
    const store = open(); store.createRemembered(input())
    expect(store.findMatch(binding(), 'dshx_hot_reload' as CreatorGrantOperation)).toBeUndefined()
    expect(store.findMatch({ ...binding(), engine: 'creator' } as unknown as CreatorGrantBinding, 'hot-reload')).toBeUndefined()
    const { workspaceRoot: _, ...withoutWorkspace } = binding()
    expect(store.findMatch(withoutWorkspace as CreatorGrantBinding, 'hot-reload')).toBeUndefined()
  })
  it('permits a full thirty-day lifetime and excludes its exact expiry boundary', () => {
    const store = open(); store.createRemembered(input({ expiresAt: now + CREATOR_GRANT_MAX_LIFETIME_MS }))
    now += CREATOR_GRANT_MAX_LIFETIME_MS - 1
    expect(store.findMatch(binding(), 'hot-reload')).toBeDefined()
    now += 1
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(open().findMatch(binding(), 'hot-reload')).toBeUndefined()
  })
  it('never reads legacy approvals/history and never creates pending/task/once state', () => {
    fs.mkdirSync(directory, { mode: 0o700 })
    fs.writeFileSync(join(directory, 'history-v1.json'), JSON.stringify({ version: 1, rules: [{ enabled: true, action: 'allow' }], records: [{ source: 'human', status: 'allowed' }] }))
    expect(open().list()).toEqual([])
    expect(fs.existsSync(join(directory, CREATOR_GRANT_FILENAME))).toBe(false)
  })
})

describe('CreatorGrantStore: strict internal confirmation input', () => {
  const malformed: Array<[string, (candidate: any) => void]> = [
    ['unknown field', value => { value.taskId = 'model-task' }],
    ['fabricated source', value => { value.source = 'human' }],
    ['artifact digest in reusable rule', value => { value.artifactDigest = 'a'.repeat(64) }],
    ['future versions missing', value => { delete value.futureVersions }],
    ['future versions false', value => { value.futureVersions = false }],
    ['enabled string', value => { value.enabled = 'true' }],
    ['empty confirmation', value => { value.confirmationId = '' }],
    ['multiline confirmation', value => { value.confirmationId = 'a\nsecret' }],
    ['empty operations', value => { value.operations = [] }],
    ['duplicate operations', value => { value.operations = ['check', 'check'] }],
    ['shell operation', value => { value.operations = ['bash'] }],
    ['write operation', value => { value.operations = ['write'] }],
    ['build operation', value => { value.operations = ['build'] }],
    ['removal operation', value => { value.operations = ['delete'] }],
    ['wrong engine', value => { value.binding.engine = 'creator' }],
    ['relative path', value => { value.binding.harnessRoot = 'relative' }],
    ['unnormalized root', value => { value.binding.sourceRoot = '/source/../plugin' }],
    ['missing workspace', value => { delete value.binding.workspaceRoot }],
    ['unknown binding field', value => { value.binding.sessionId = 'borrowed' }],
    ['leading zero inode', value => { value.binding.sourceDirectoryIdentity.ino = '0456' }],
    ['numeric device', value => { value.binding.sourceDirectoryIdentity.dev = 123 }],
    ['extra identity field', value => { value.binding.sourceDirectoryIdentity.epoch = 1 }],
    ['invalid slug', value => { value.binding.pluginId = '*' }],
    ['expired', value => { value.expiresAt = now }],
    ['over thirty days', value => { value.expiresAt = now + CREATOR_GRANT_MAX_LIFETIME_MS + 1 }],
    ['fractional time', value => { value.expiresAt = now + 1.5 }],
    ['unsafe time', value => { value.expiresAt = Number.MAX_SAFE_INTEGER + 1 }],
  ]
  it.each(malformed)('rejects %s without recording authorization', (_, change) => {
    const store = open(), candidate = input()
    change(candidate)
    code(() => store.createRemembered(candidate), 'invalid-input')
    expect(store.health().revision).toBe(0)
    expect(store.health().ok).toBe(true)
    expect(store.list()).toEqual([])
  })
  it.each(['dsh-creator-mode-plus', 'dsh-approve-for-me', 'dsh-external-plugin-devkit', 'dsh-creator-mode-plus-new'])('refuses infrastructure %s even as a disabled draft', pluginId => {
    const store = open(), candidate = input({ enabled: false })
    candidate.binding.pluginId = pluginId
    code(() => store.createRemembered(candidate), 'invalid-input')
  })
  it.each(['top', 'binding', 'identity', 'operation'])('rejects %s accessors without evaluating their getters', target => {
    const candidate = input()
    const getter = vi.fn(() => 'untrusted')
    if (target === 'top') Object.defineProperty(candidate, 'confirmationId', { enumerable: true, get: getter })
    if (target === 'binding') Object.defineProperty(candidate.binding, 'sourceRoot', { enumerable: true, get: getter })
    if (target === 'identity') Object.defineProperty(candidate.binding.sourceDirectoryIdentity, 'dev', { enumerable: true, get: getter })
    if (target === 'operation') Object.defineProperty(candidate.operations, '0', { enumerable: true, get: getter })
    code(() => open().createRemembered(candidate), 'invalid-input')
    expect(getter).not.toHaveBeenCalled()
  })
  it('rejects inherited fields, symbol fields and sparse operation arrays', () => {
    const candidate = input(), store = open()
    code(() => store.createRemembered(Object.create(candidate)), 'invalid-input')
    code(() => store.createRemembered({ ...candidate, [Symbol('authority')]: true }), 'invalid-input')
    const sparse = [...candidate.operations]; sparse.length = 2
    code(() => store.createRemembered({ ...candidate, operations: sparse }), 'invalid-input')
  })
})

describe('CreatorGrantStore: one confirmation, CAS and irreversible control operations', () => {
  it('is idempotent for identical reordered inputs, including retry with stale creation revision', () => {
    const store = open(), candidate = input({ operations: ['hot-reload', 'check'] })
    const grant = store.createRemembered(candidate, 0)
    expect(store.createRemembered({ ...candidate, operations: ['check', 'hot-reload'] }, 0)).toEqual(grant)
    expect(store.health().revision).toBe(1)
    expect(state().events).toHaveLength(1)
    expect(open().createRemembered(candidate)).toEqual(grant)
  })
  it.each(['scope', 'operation', 'expiry', 'enabled'])('same confirmation cannot expand/change %s', change => {
    const store = open(), candidate = input({ enabled: false })
    store.createRemembered(candidate)
    const next = structuredClone(candidate)
    if (change === 'scope') next.binding.workspaceRoot = '/workspace/two'
    if (change === 'operation') next.operations.push('check')
    if (change === 'expiry') next.expiresAt += 1
    if (change === 'enabled') next.enabled = true
    code(() => store.createRemembered(next), 'conflict')
    expect(store.health().revision).toBe(1)
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
  })
  it.each(['disable', 'revoke', 'delete'] as const)('keeps %s effective across restart and never recycles confirmation', method => {
    const store = open(), candidate = input(), grant = store.createRemembered(candidate)
    const changed = store[method](grant.id, 1)
    expect(changed.version).toBe(2)
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    const reopened = open()
    expect(reopened.findMatch(binding(), 'hot-reload')).toBeUndefined()
    if (method === 'delete') code(() => reopened.createRemembered(candidate), 'confirmation-used')
    else expect(reopened.createRemembered(candidate).enabled).toBe(false)
    expect(state().confirmations).toHaveLength(1)
    expect(state().events.map((event: any) => event.action)).toEqual(['create', method])
  })
  it('requires a genuinely new confirmation for another enabled rule after disabling', () => {
    const store = open(), candidate = input(), grant = store.createRemembered(candidate)
    store.disable(grant.id)
    expect(store.createRemembered(candidate).enabled).toBe(false)
    const next = store.createRemembered({ ...candidate, confirmationId: 'new-confirmation' })
    expect(next.id).not.toBe(grant.id)
    expect(store.findMatch(binding(), 'hot-reload')?.id).toBe(next.id)
  })
  it('guards explicit creation revision without pausing the otherwise healthy ledger', () => {
    const store = open(); store.createRemembered(input(), 0)
    code(() => store.createRemembered(input(), 0), 'conflict')
    expect(store.health()).toMatchObject({ ok: true, revision: 1 })
  })
  it('locally denies and reports no durable guarantee if revocation loses CAS', () => {
    const store = open(), grant = store.createRemembered(input())
    code(() => store.revoke(grant.id, 0), 'conflict')
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(store.health()).toMatchObject({ ok: false, durableRevocationGuaranteed: false })
    expect(state().grants[0].enabled).toBe(true) // Never falsely report persistence after failed CAS.
  })
  it('caps active stored records but still permits revocation/deletion at the cap', () => {
    put(filled(200))
    const store = open()
    code(() => store.createRemembered(input()), 'capacity')
    store.revoke('grant-0')
    store.delete('grant-1')
    expect(store.list()).toHaveLength(199)
    store.createRemembered(input())
    expect(store.list()).toHaveLength(200)
  })
  it('bounds event history while retaining old confirmation tombstones', () => {
    const populated = filled(1, 1_000)
    put(populated)
    const store = open(); store.delete('grant-0')
    expect(state().events).toHaveLength(1_000)
    expect(state().events[0].id).toBe('event-1')
    const seed = populated.grants[0]
    code(() => store.createRemembered({ binding: seed.binding, operations: seed.operations, confirmationId: seed.confirmationId, expiresAt: seed.expiresAt, futureVersions: true, enabled: true }), 'confirmation-used')
  })
  it('never silently evicts confirmation receipts at capacity; revoke/delete remain available', () => {
    const populated = filled(1, 1_000)
    populated.confirmations.push(...Array.from({ length: 999 }, (_, i) => ({ ...populated.confirmations[0], id: `deleted-confirmation-${i}`, grantId: `deleted-grant-${i}` })))
    put(populated)
    const store = open()
    code(() => store.createRemembered(input()), 'capacity')
    store.revoke('grant-0')
    store.delete('grant-0')
    expect(state().confirmations).toHaveLength(1_000)
    expect(store.health().ok).toBe(true)
  })
  it('stores only bounded fixed event metadata, not paths, nonces, taskIds or explanations', () => {
    const store = open(), grant = store.createRemembered(input({ confirmationId: 'private-confirmation-marker' }))
    store.revoke(grant.id)
    const serialized = JSON.stringify(state().events)
    for (const secret of ['/source/', '/workspace/', 'private-confirmation-marker', 'artifactDigest', 'taskId']) expect(serialized).not.toContain(secret)
    expect(Object.keys(state().events[0]).sort()).toEqual(['id', 'at', 'action', 'grantId', 'grantVersion', 'revision', 'bindingHash', 'operations'].sort())
  })
})

describe('CreatorGrantStore: exclusive writer, suspicious replacement and generation fences', () => {
  it('fences an older empty instance after another instance creates the first snapshot', () => {
    const first = open(), second = open()
    first.createRemembered(input())
    code(() => second.createRemembered(input()), 'external-change')
    expect(second.findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(state().grants).toHaveLength(1)
  })
  it('fences an older loaded instance after a current writer revokes', () => {
    const first = open(), grant = first.createRemembered(input()), second = open()
    second.revoke(grant.id)
    expect(first.findMatch(binding(), 'hot-reload')).toBeUndefined()
    code(() => first.createRemembered(input()), 'external-change')
    expect(open().findMatch(binding(), 'hot-reload')).toBeUndefined()
  })
  it.each(['invalid JSON', 'same bytes replacement', 'file deleted'])('suspends loaded policy on external %s', kind => {
    const store = open(); store.createRemembered(input())
    if (kind === 'invalid JSON') fs.writeFileSync(store.path, 'corrupt')
    if (kind === 'same bytes replacement') {
      const replacement = join(directory, 'replacement')
      fs.writeFileSync(replacement, fs.readFileSync(store.path), { mode: 0o600 })
      fs.renameSync(replacement, store.path)
    }
    if (kind === 'file deleted') fs.unlinkSync(store.path)
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(store.health()).toMatchObject({ ok: false, reason: 'external-change' })
    expect(store.list()).toEqual([])
  })
  it('does not recover automatically when an external editor puts the original bytes back', () => {
    const store = open(); store.createRemembered(input())
    const original = fs.readFileSync(store.path)
    fs.writeFileSync(store.path, '{}')
    expect(store.health().ok).toBe(false)
    fs.writeFileSync(store.path, original)
    expect(store.health().ok).toBe(false)
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
  })
  it('leaves unknown locks untouched, including after restart', () => {
    const first = open(); first.createRemembered(input())
    const lock = join(directory, '.creator-grants-v1.lock')
    fs.writeFileSync(lock, 'unknown-old-generation', { mode: 0o600 })
    expect(first.health()).toMatchObject({ ok: false, reason: 'locked' })
    const restarted = open()
    code(() => restarted.createRemembered(input()), 'locked')
    expect(fs.readFileSync(lock, 'utf8')).toBe('unknown-old-generation')
  })
  it('uses a real wx lock: a concurrent instance cannot read policy during the write transaction', () => {
    const first = open(), second = open()
    const realWrite = fs.writeFileSync
    let observed = false
    vi.spyOn(fs, 'writeFileSync').mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
      if (typeof args[1] === 'string' && args[1].includes('"owner"')) {
        observed = true
        expect(second.health()).toMatchObject({ ok: false, reason: 'locked' })
        code(() => second.createRemembered(input()), 'locked')
      }
      return realWrite(...args)
    })
    first.createRemembered(input())
    expect(observed).toBe(true)
    expect(first.health().ok).toBe(true)
  })
  it('rejects an owner that is false, throwing, undefined or becomes old before any disk access', () => {
    for (const callback of [() => false, () => { throw new Error('offline') }, () => undefined]) {
      const store = open({ directory: join(root, `blocked-${++counter}`), isCurrentOwner: callback as () => boolean })
      expect(store.health()).toMatchObject({ ok: false, reason: 'not-current-owner' })
      expect(fs.existsSync(join(root, `blocked-${counter}`))).toBe(false)
    }
  })
  it('A→B→C never revives an old generation even when newer instances are disposed', () => {
    let generation = 1
    const a = open({ isCurrentOwner: () => generation === 1 })
    a.createRemembered(input())
    generation = 2
    const b = open({ isCurrentOwner: () => generation === 2 })
    generation = 3
    const c = open({ isCurrentOwner: () => generation === 3 })
    const bytes = fs.readFileSync(a.path, 'utf8')
    c.dispose(); b.dispose()
    expect(a.findMatch(binding(), 'hot-reload')).toBeUndefined()
    generation = 1 // Even a broken caller cannot reactivate an already-observed expired owner.
    expect(a.findMatch(binding(), 'hot-reload')).toBeUndefined()
    code(() => a.createRemembered(input()), 'not-current-owner')
    a.dispose()
    expect(fs.readFileSync(a.path, 'utf8')).toBe(bytes)
  })
  it('rechecks ownership after preparing a write but before rename', () => {
    let current = true
    const store = open({ isCurrentOwner: () => current })
    const realWrite = fs.writeFileSync
    vi.spyOn(fs, 'writeFileSync').mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
      const result = realWrite(...args)
      if (typeof args[1] === 'string' && args[1].includes('"grants"')) current = false
      return result
    })
    code(() => store.createRemembered(input()), 'not-current-owner')
    expect(fs.existsSync(store.path)).toBe(false)
    expect(fs.readdirSync(directory)).toEqual([])
  })
  it('dispose does no write and prevents all future policy reads or mutations', () => {
    const store = open(), grant = store.createRemembered(input()), bytes = fs.readFileSync(store.path, 'utf8')
    store.dispose(); store.dispose()
    expect(store.list()).toEqual([])
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    code(() => store.revoke(grant.id), 'disposed')
    expect(fs.readFileSync(store.path, 'utf8')).toBe(bytes)
  })
  it.each([NaN, Infinity, -1])('fails closed for invalid current clock %s', value => {
    const store = open(); store.createRemembered(input()); now = value
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(store.health()).toMatchObject({ ok: false, reason: 'clock-invalid' })
  })
  it('suspends on clock rollback rather than extending remembered authority', () => {
    const store = open(); store.createRemembered(input()); now -= 1
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(store.health()).toMatchObject({ ok: false, reason: 'clock-invalid' })
  })
})

describe('CreatorGrantStore: corruption, filesystem safety and failed durable revocation', () => {
  const corruptions: Array<[string, (value: any) => void]> = [
    ['future schema', value => { value.version = 2 }],
    ['unknown top-level field', value => { value.approved = true }],
    ['negative revision', value => { value.revision = -1 }],
    ['lost event tail', value => { value.events = [] }],
    ['revision mismatch', value => { value.revision = 2 }],
    ['future grant version', value => { value.grants[0].version = 2 }],
    ['duplicate grant', value => { value.grants.push(value.grants[0]) }],
    ['missing confirmation', value => { value.confirmations = [] }],
    ['forged enabled without matching receipt', value => { value.confirmations[0].enabled = false }],
    ['expanded operations', value => { value.grants[0].operations.push('activate-new-client') }],
    ['mismatched binding', value => { value.grants[0].binding.workspaceRoot = '/changed' }],
    ['expired creation lifetime', value => { value.grants[0].expiresAt = value.grants[0].createdAt }],
    ['revoked but enabled', value => { value.grants[0].revokedAt = value.grants[0].createdAt }],
    ['event with raw payload', value => { value.events[0].command = 'secret content' }],
    ['oversized event array', value => { value.events = Array(1001).fill(value.events[0]) }],
    ['oversized receipts', value => { value.confirmations = Array(1001).fill(value.confirmations[0]) }],
  ]
  it.each(corruptions)('rejects %s on restart without replacing original bytes', (_, mutate) => {
    open().createRemembered(input())
    const corrupted = state(); mutate(corrupted); put(corrupted)
    const original = fs.readFileSync(join(directory, CREATOR_GRANT_FILENAME), 'utf8')
    const store = open()
    expect(store.health()).toMatchObject({ ok: false, reason: 'storage-corrupt' })
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    code(() => store.createRemembered(input()), 'storage-corrupt')
    expect(fs.readFileSync(store.path, 'utf8')).toBe(original)
  })
  it('does not replace invalid JSON with an empty store', () => {
    put('{broken')
    expect(open().health()).toMatchObject({ ok: false, reason: 'storage-corrupt' })
    expect(fs.readFileSync(join(directory, CREATOR_GRANT_FILENAME), 'utf8')).toBe('{broken')
  })
  it('rejects invalid UTF-8 without normalizing or replacing its bytes', () => {
    fs.mkdirSync(directory, { mode: 0o700 })
    const path = join(directory, CREATOR_GRANT_FILENAME)
    const bytes = Buffer.from([0x7b, 0xff, 0x7d])
    fs.writeFileSync(path, bytes, { mode: 0o600 })
    expect(open().health()).toMatchObject({ ok: false, reason: 'storage-corrupt' })
    expect(fs.readFileSync(path)).toEqual(bytes)
  })
  it.each(['file', 'dangling file', 'directory', 'ancestor'])('rejects a symlink %s without following it', kind => {
    const target = join(root, 'target')
    fs.mkdirSync(target, { mode: 0o700 })
    if (kind === 'directory') fs.symlinkSync(target, directory)
    else if (kind === 'ancestor') { fs.symlinkSync(target, join(root, 'parent')); directory = join(root, 'parent', 'child') }
    else {
      fs.mkdirSync(directory, { mode: 0o700 })
      const path = join(target, 'other')
      if (kind === 'file') fs.writeFileSync(path, 'do not modify', { mode: 0o600 })
      fs.symlinkSync(path, join(directory, CREATOR_GRANT_FILENAME))
    }
    const store = open()
    expect(store.health().ok).toBe(false)
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(fs.readdirSync(target)).toEqual(kind === 'file' ? ['other'] : [])
  })
  it('rejects a hardlinked or unexpectedly permissive ledger file', () => {
    open().createRemembered(input())
    const path = join(directory, CREATOR_GRANT_FILENAME)
    fs.linkSync(path, join(root, 'copy'))
    expect(open().health()).toMatchObject({ ok: false, reason: 'unsafe-storage' })
    fs.unlinkSync(join(root, 'copy'))
    fs.chmodSync(path, 0o644)
    expect(open().health()).toMatchObject({ ok: false, reason: 'unsafe-storage' })
  })
  it('rejects unexpectedly permissive directory mode', () => {
    fs.mkdirSync(directory, { mode: 0o755 })
    expect(open().health()).toMatchObject({ ok: false, reason: 'unsafe-storage' })
  })
  it.each(['writeFileSync', 'fsyncSync', 'renameSync'] as const)('pauses automatic lookup when %s fails and reports non-durable local revocation', method => {
    const store = open(), grant = store.createRemembered(input()), original = fs.readFileSync(store.path, 'utf8')
    vi.spyOn(fs, method).mockImplementationOnce(() => { throw new Error('EIO: secret path must not escape') })
    code(() => store.revoke(grant.id), 'write-failed')
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(store.health()).toMatchObject({ ok: false, reason: 'write-failed', durableRevocationGuaranteed: false })
    expect(fs.readFileSync(store.path, 'utf8')).toBe(original)
    expect(fs.readdirSync(directory)).toEqual([CREATOR_GRANT_FILENAME])
  })
  it('fails closed if revocation directory fsync fails after replacement, without claiming success', () => {
    const store = open(), grant = store.createRemembered(input()), realSync = fs.fsyncSync
    vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
      if (fs.fstatSync(fd).isDirectory()) throw new Error('directory sync failed')
      realSync(fd)
    })
    code(() => store.revoke(grant.id), 'write-failed')
    expect(store.health()).toMatchObject({ ok: false, durableRevocationGuaranteed: false })
    expect(store.findMatch(binding(), 'hot-reload')).toBeUndefined()
    expect(state().grants[0].enabled).toBe(false) // Replacement happened, but durability was not confirmed.
  })
  it.each(['replacement', 'in-place'])('does not remove an owned lock changed by foreign %s', kind => {
    const store = open(), realRename = fs.renameSync
    const lock = join(directory, '.creator-grants-v1.lock')
    vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      realRename(oldPath, newPath)
      if (kind === 'in-place') fs.writeFileSync(lock, 'foreign-owner')
      else {
        const replacement = join(directory, 'foreign-lock')
        fs.writeFileSync(replacement, 'foreign-owner', { mode: 0o600 })
        realRename(replacement, lock)
      }
    })
    code(() => store.createRemembered(input()), 'external-change')
    expect(fs.readFileSync(lock, 'utf8')).toBe('foreign-owner')
    expect(store.health().ok).toBe(false)
  })
})
