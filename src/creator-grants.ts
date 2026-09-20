/** Private, synchronous Host ledger. Lookup returns policy data, never execution authority. */
import { createHash, randomUUID } from 'node:crypto'
import { userInfo } from 'node:os'
import {
  constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, unlinkSync, writeFileSync, type BigIntStats,
} from 'node:fs'
import { isAbsolute, join, parse, resolve, sep } from 'node:path'
import { CREATOR_GRANT_OPERATIONS } from './creator-grant-types.ts'
import type {
  CreateCreatorRememberedGrant, CreatorGrantBinding, CreatorGrantEvent, CreatorGrantFailure,
  CreatorGrantHealth, CreatorGrantOperation, CreatorGrantStoreOptions, CreatorRememberedGrant,
} from './creator-grant-types.ts'
export type {
  CreateCreatorRememberedGrant, CreatorGrantBinding, CreatorGrantEvent, CreatorGrantFailure,
  CreatorGrantHealth, CreatorGrantOperation, CreatorGrantStoreOptions, CreatorRememberedGrant,
} from './creator-grant-types.ts'

export const CREATOR_GRANT_MAX_LIFETIME_MS = 30 * 86_400_000
export const CREATOR_GRANT_FILENAME = 'creator-grants-v1.json'
const MAX_GRANTS = 200
const MAX_EVENTS = 1_000
const MAX_CONFIRMATIONS = 1_000 // Never evict receipts: deleting a grant must not reopen its confirmation.
const MAX_BYTES = 16 * 1024 * 1024
const MAX_TIME = 8_640_000_000_000_000
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const HASH = /^[a-f0-9]{64}$/
const PLUGIN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const DECIMAL = /^(?:0|[1-9][0-9]{0,39})$/
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const PROTECTED = ['dsh-creator-mode-plus', 'dsh-approve-for-me', 'dsh-external-plugin-devkit']
interface ConfirmationReceipt { id: string; grantId: string; inputHash: string; createdAt: number; enabled: boolean }
interface State { version: 1; revision: number; grants: CreatorRememberedGrant[]; confirmations: ConfirmationReceipt[]; events: CreatorGrantEvent[] }
interface Lock { fd: number; identity: string; stamp: string }
interface Snapshot { text: string; anchor: string }

/** Deliberately generic: exception messages contain neither source paths nor confirmation payloads. */
export class CreatorGrantStoreError extends Error {
  constructor(readonly code: CreatorGrantFailure) { super(`Creator grant ledger: ${code}`); this.name = 'CreatorGrantStoreError' }
}
function fail(code: CreatorGrantFailure = 'invalid-input'): never { throw new CreatorGrantStoreError(code) }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail()
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return fail()
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) return fail()
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return fail()
    result[key] = descriptor.value as unknown
  }
  return result
}
function text(value: unknown, pattern: RegExp = ID, max = 128): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || CONTROL.test(value) || !pattern.test(value)) return fail()
  return value
}
function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0) || value > MAX_TIME) return fail()
  return value
}
function integer(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || Object.is(value, -0)) return fail()
  return value
}
function flag(value: unknown): boolean { if (typeof value !== 'boolean') return fail(); return value }
function rootPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096 || CONTROL.test(value)
    || !isAbsolute(value) || value !== resolve(value)) return fail()
  return value
}
function binding(value: unknown): CreatorGrantBinding {
  const data = record(value, ['engine', 'harnessRoot', 'sourceRoot', 'pluginId', 'sourceDirectoryIdentity', 'workspaceRoot'])
  if (data['engine'] !== 'creator-plus-v1') return fail()
  const pluginId = text(data['pluginId'], PLUGIN, 64)
  if (PROTECTED.some(id => pluginId === id || pluginId.startsWith(`${id}-`))) return fail()
  const identity = record(data['sourceDirectoryIdentity'], ['dev', 'ino'])
  return {
    engine: 'creator-plus-v1', harnessRoot: rootPath(data['harnessRoot']), sourceRoot: rootPath(data['sourceRoot']), pluginId,
    sourceDirectoryIdentity: { dev: text(identity['dev'], DECIMAL, 40), ino: text(identity['ino'], DECIMAL, 40) },
    workspaceRoot: rootPath(data['workspaceRoot']),
  }
}
function operation(value: unknown): CreatorGrantOperation {
  if (typeof value !== 'string' || !CREATOR_GRANT_OPERATIONS.includes(value as CreatorGrantOperation)) return fail()
  return value as CreatorGrantOperation
}
function operations(value: unknown): CreatorGrantOperation[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > CREATOR_GRANT_OPERATIONS.length) return fail()
  // Reject sparse/accessor arrays and extra own properties without calling their getters.
  if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return fail()
  const result: CreatorGrantOperation[] = []
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return fail()
    result.push(operation(descriptor.value))
  }
  if (new Set(result).size !== result.length) return fail()
  return result.sort()
}
function input(value: unknown): Required<CreateCreatorRememberedGrant> {
  const data = record(value, ['binding', 'operations', 'expiresAt', 'confirmationId', 'futureVersions', 'enabled'])
  if (data['futureVersions'] !== true) return fail()
  return {
    binding: binding(data['binding']), operations: operations(data['operations']), expiresAt: timestamp(data['expiresAt']),
    confirmationId: text(data['confirmationId']), futureVersions: true,
    enabled: Object.hasOwn(data, 'enabled') ? flag(data['enabled']) : false,
  }
}
function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function intentHash(grant: Pick<CreatorRememberedGrant, 'binding' | 'operations' | 'expiresAt' | 'confirmationId'>, enabled: boolean): string {
  return digest({ binding: grant.binding, operations: grant.operations, expiresAt: grant.expiresAt, confirmationId: grant.confirmationId, futureVersions: true, enabled })
}
function grant(value: unknown): CreatorRememberedGrant {
  const data = record(value, ['id', 'version', 'binding', 'operations', 'createdAt', 'expiresAt', 'confirmationId', 'futureVersions', 'enabled', 'revokedAt'])
  const normalized = input({ binding: data['binding'], operations: data['operations'], expiresAt: data['expiresAt'], confirmationId: data['confirmationId'], futureVersions: data['futureVersions'], enabled: data['enabled'] })
  const createdAt = timestamp(data['createdAt'])
  if (normalized.expiresAt <= createdAt || normalized.expiresAt - createdAt > CREATOR_GRANT_MAX_LIFETIME_MS) return fail()
  const revokedAt = Object.hasOwn(data, 'revokedAt') ? timestamp(data['revokedAt']) : undefined
  if (revokedAt !== undefined && (normalized.enabled || revokedAt < createdAt)) return fail()
  return { id: text(data['id']), version: integer(data['version'], 1), ...normalized, createdAt, ...(revokedAt === undefined ? {} : { revokedAt }) }
}
function receipt(value: unknown): ConfirmationReceipt {
  const data = record(value, ['id', 'grantId', 'inputHash', 'createdAt', 'enabled'])
  return { id: text(data['id']), grantId: text(data['grantId']), inputHash: text(data['inputHash'], HASH, 64), createdAt: timestamp(data['createdAt']), enabled: flag(data['enabled']) }
}
function event(value: unknown): CreatorGrantEvent {
  const data = record(value, ['id', 'at', 'action', 'grantId', 'grantVersion', 'revision', 'bindingHash', 'operations'])
  if (!['create', 'disable', 'revoke', 'delete'].includes(String(data['action']))) return fail()
  return {
    id: text(data['id']), at: timestamp(data['at']), action: data['action'] as CreatorGrantEvent['action'], grantId: text(data['grantId']),
    grantVersion: integer(data['grantVersion'], 1), revision: integer(data['revision'], 1), bindingHash: text(data['bindingHash'], HASH, 64), operations: operations(data['operations']),
  }
}
function parseState(raw: string): State {
  const data = record(JSON.parse(raw) as unknown, ['version', 'revision', 'grants', 'confirmations', 'events'])
  if (data['version'] !== 1) return fail()
  const revision = integer(data['revision'])
  const collection = <T>(value: unknown, max: number, validate: (item: unknown) => T): T[] => {
    if (!Array.isArray(value) || value.length > max) return fail()
    return value.map(validate)
  }
  const grants = collection(data['grants'], MAX_GRANTS, grant)
  const confirmations = collection(data['confirmations'], MAX_CONFIRMATIONS, receipt)
  const events = collection(data['events'], MAX_EVENTS, event)
  for (const entries of [grants, confirmations, events]) if (new Set(entries.map(item => item.id)).size !== entries.length) return fail()
  if (new Set(confirmations.map(item => item.grantId)).size !== confirmations.length) return fail()
  for (const current of grants) {
    const confirmation = confirmations.find(item => item.id === current.confirmationId)
    if (confirmation === undefined || confirmation.grantId !== current.id || confirmation.createdAt !== current.createdAt
      || (current.enabled && !confirmation.enabled) || confirmation.inputHash !== intentHash(current, confirmation.enabled)) return fail()
  }
  if (confirmations.length > revision || grants.some(item => item.version > revision)
    || events.length !== Math.min(revision, MAX_EVENTS)
    || (revision > 0 && events.at(-1)?.revision !== revision)
    || events.some((item, index) => item.revision !== revision - events.length + index + 1
      || (index > 0 && item.at < events[index - 1]!.at))) return fail()
  return { version: 1, revision, grants, confirmations, events }
}
function stat(path: string): BigIntStats | undefined {
  try { return lstatSync(path, { bigint: true }) } catch (error: unknown) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}
function identity(value: BigIntStats): string { return `${value.dev}:${value.ino}` }
function signature(value: BigIntStats): string { return `${identity(value)}:${value.size}:${value.mtimeNs}:${value.ctimeNs}:${value.mode}:${value.nlink}:${value.uid}` }
// The shared client types narrow node:process; use an explicit Host OS API.
// Windows reports uid=-1 because it has no POSIX UID.
function currentUserOwns(value: BigIntStats): boolean {
  const uid = userInfo().uid
  return uid === -1 || value.uid === BigInt(uid)
}
function safeFile(value: BigIntStats): void {
  if (!value.isFile() || value.isSymbolicLink() || value.nlink !== 1n || (value.mode & 0o777n) !== 0o600n
    || !currentUserOwns(value)) return fail('unsafe-storage')
}

/**
 * One immutable-snapshot reader/writer. A second writer or external replacement suspends
 * older instances; construct a new current-owner instance to intentionally adopt a snapshot.
 * An unknown lock is never stolen, even after restart. No legacy approval store is read.
 */
export class CreatorGrantStore {
  readonly path: string
  private readonly directory: string
  private readonly lockPath: string
  private readonly options: CreatorGrantStoreOptions
  private state: State = { version: 1, revision: 0, grants: [], confirmations: [], events: [] }
  private anchor: string | undefined
  private directoryIdentity: string | undefined
  private fault: CreatorGrantFailure | undefined
  private disposed = false
  private lastClock = 0
  private readonly localDenials = new Set<string>()

  constructor(options: CreatorGrantStoreOptions) {
    this.options = options
    this.directory = resolve(options.directory)
    this.path = join(this.directory, CREATOR_GRANT_FILENAME)
    this.lockPath = join(this.directory, '.creator-grants-v1.lock')
    try {
      this.assertOwner()
      this.clock()
      this.checkDirectory(true)
      this.checkLock()
      const current = this.readDisk()
      if (current !== undefined) {
        try { this.state = parseState(current.text) } catch { this.suspend('storage-corrupt'); return }
        this.anchor = current.anchor
      }
    } catch (error: unknown) { this.suspend(this.code(error, 'unsafe-storage')) }
  }

  private code(error: unknown, fallback: CreatorGrantFailure): CreatorGrantFailure { return error instanceof CreatorGrantStoreError ? error.code : fallback }
  private suspend(code: CreatorGrantFailure): void { this.fault ??= code }
  private assertOwner(): void {
    if (this.disposed) return fail('disposed')
    let current = false
    try { current = this.options.isCurrentOwner === undefined ? true : this.options.isCurrentOwner() } catch { /* A failed ownership proof is not ownership. */ }
    if (current !== true) { this.suspend('not-current-owner'); return fail('not-current-owner') }
    if (this.fault !== undefined) return fail(this.fault)
  }
  private clock(): number {
    let value: number
    try { value = timestamp((this.options.now ?? Date.now)()) } catch { this.suspend('clock-invalid'); return fail('clock-invalid') }
    if (value < this.lastClock) { this.suspend('clock-invalid'); return fail('clock-invalid') }
    this.lastClock = value
    return value
  }
  private checkDirectory(create = false): void {
    let cursor = parse(this.directory).root
    for (const part of this.directory.slice(cursor.length).split(sep).filter(Boolean)) {
      cursor = join(cursor, part)
      const current = stat(cursor)
      if (current !== undefined && (!current.isDirectory() || current.isSymbolicLink())) return fail('unsafe-storage')
    }
    if (stat(this.directory) === undefined && create) { this.assertOwner(); mkdirSync(this.directory, { recursive: true, mode: 0o700 }) }
    const current = stat(this.directory)
    if (current === undefined || !current.isDirectory() || current.isSymbolicLink() || (current.mode & 0o777n) !== 0o700n
      || !currentUserOwns(current)) return fail('unsafe-storage')
    const key = identity(current)
    if (this.directoryIdentity !== undefined && this.directoryIdentity !== key) return fail('external-change')
    this.directoryIdentity = key
  }
  private checkLock(owned?: Lock): void {
    const current = stat(this.lockPath)
    if (owned === undefined) { if (current !== undefined) return fail('locked'); return }
    if (current === undefined || identity(current) !== owned.identity || signature(current) !== owned.stamp) return fail('external-change')
    safeFile(current)
  }
  private readDisk(): Snapshot | undefined {
    const initial = stat(this.path)
    if (initial === undefined) return undefined
    safeFile(initial)
    if (initial.size > BigInt(MAX_BYTES)) return fail('storage-corrupt')
    const fd = openSync(this.path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const before = fstatSync(fd, { bigint: true })
      safeFile(before)
      if (signature(before) !== signature(initial)) return fail('external-change')
      const bytes = readFileSync(fd)
      const after = fstatSync(fd, { bigint: true })
      const final = stat(this.path)
      if (bytes.byteLength > MAX_BYTES || final === undefined || signature(before) !== signature(after) || signature(after) !== signature(final)) return fail('external-change')
      const text = bytes.toString('utf8')
      if (!Buffer.from(text, 'utf8').equals(bytes)) return fail('storage-corrupt')
      return { text, anchor: `${signature(after)}:${createHash('sha256').update(bytes).digest('hex')}` }
    } finally { closeSync(fd) }
  }
  private verify(owned?: Lock): boolean {
    try {
      this.assertOwner(); this.clock(); this.checkDirectory(); this.checkLock(owned)
      if (this.readDisk()?.anchor !== this.anchor) return fail('external-change')
      return true
    } catch (error: unknown) { this.suspend(this.code(error, 'unsafe-storage')); return false }
  }
  private requireHealthy(owned?: Lock): void { if (!this.verify(owned)) return fail(this.fault ?? 'unsafe-storage') }

  /** Checks ownership, disk identity, lock state and health synchronously on every call. */
  health(): CreatorGrantHealth {
    const ok = this.verify()
    return { ok, revision: this.state.revision, ...(ok ? {} : { reason: this.disposed ? 'disposed' as const : this.fault! }), durableRevocationGuaranteed: this.localDenials.size === 0 }
  }
  /** Detached metadata only; a stale owner/suspicious snapshot exposes no matchable records. */
  list(): CreatorRememberedGrant[] { return this.verify() ? structuredClone(this.state.grants) : [] }
  /** Re-run at the consumer's final dispatch fence; even a match is NOT a reusable execution ticket. */
  findMatch(value: CreatorGrantBinding, action: CreatorGrantOperation): CreatorRememberedGrant | undefined {
    if (!this.verify()) return undefined
    let key: string, op: CreatorGrantOperation
    try { key = digest(binding(value)); op = operation(action) } catch { return undefined }
    const now = this.lastClock
    return structuredClone(this.state.grants.find(item => item.enabled && item.revokedAt === undefined && !this.localDenials.has(item.id)
      && item.createdAt <= now && now < item.expiresAt && digest(item.binding) === key && item.operations.includes(op)))
  }

  /** Internal Host API only. A confirmation is at most one creation, including after deletion. */
  createRemembered(value: CreateCreatorRememberedGrant, expectedRevision?: number): CreatorRememberedGrant {
    this.requireHealthy()
    if (expectedRevision !== undefined) integer(expectedRevision)
    const candidate = input(value)
    const hash = intentHash(candidate, candidate.enabled)
    const previous = this.state.confirmations.find(item => item.id === candidate.confirmationId)
    if (previous !== undefined) {
      if (previous.inputHash !== hash) return fail('conflict')
      const existing = this.state.grants.find(item => item.id === previous.grantId)
      if (existing === undefined) return fail('confirmation-used')
      return structuredClone(existing) // Never re-enable a previously disabled/revoked grant.
    }
    this.checkRevision(expectedRevision)
    const now = this.clock()
    if (candidate.expiresAt <= now || candidate.expiresAt - now > CREATOR_GRANT_MAX_LIFETIME_MS) return fail()
    if (this.state.grants.length >= MAX_GRANTS || this.state.confirmations.length >= MAX_CONFIRMATIONS) return fail('capacity')
    const current: CreatorRememberedGrant = { id: randomUUID(), version: 1, ...candidate, createdAt: now }
    const confirmation: ConfirmationReceipt = { id: candidate.confirmationId, grantId: current.id, inputHash: hash, createdAt: now, enabled: candidate.enabled }
    this.commit(this.change(current, 'create', {
      ...this.state, grants: [...this.state.grants, current], confirmations: [...this.state.confirmations, confirmation],
    }))
    return structuredClone(current)
  }
  disable(id: string, expectedRevision?: number): CreatorRememberedGrant { return this.deny(id, 'disable', expectedRevision)! }
  revoke(id: string, expectedRevision?: number): CreatorRememberedGrant { return this.deny(id, 'revoke', expectedRevision)! }
  /** Deletes the rule, NOT its confirmation tombstone. Returns the removed record. */
  delete(id: string, expectedRevision?: number): CreatorRememberedGrant { return this.deny(id, 'delete', expectedRevision)! }
  private deny(id: string, action: 'disable' | 'revoke' | 'delete', expectedRevision?: number): CreatorRememberedGrant {
    text(id)
    const previous = this.state.grants.find(item => item.id === id)
    if (previous === undefined) { this.requireHealthy(); return fail('not-found') }
    this.localDenials.add(id) // Must precede disk/owner/CAS failures.
    try {
      this.requireHealthy(); this.checkRevision(expectedRevision)
      if ((action === 'disable' && !previous.enabled) || (action === 'revoke' && previous.revokedAt !== undefined)) {
        this.localDenials.delete(id)
        return structuredClone(previous)
      }
      const current: CreatorRememberedGrant = { ...previous, enabled: false, version: integer(previous.version + 1, 1),
        ...(action === 'revoke' ? { revokedAt: this.clock() } : {}) }
      this.commit(this.change(current, action, { ...this.state, grants: this.state.grants.flatMap(item => item.id !== id ? [item] : action === 'delete' ? [] : [current]) }))
      this.localDenials.delete(id)
      return structuredClone(current)
    } catch (error: unknown) {
      this.suspend(this.code(error, 'write-failed'))
      throw error
    }
  }
  private checkRevision(expected?: number): void {
    if (expected !== undefined && integer(expected) !== this.state.revision) return fail('conflict')
  }
  private change(current: CreatorRememberedGrant, action: CreatorGrantEvent['action'], next: State): State {
    const revision = integer(this.state.revision + 1, 1)
    const entry: CreatorGrantEvent = { id: randomUUID(), at: this.clock(), action, grantId: current.id, grantVersion: current.version,
      revision, bindingHash: digest(current.binding), operations: [...current.operations] }
    return { ...next, revision, events: [...this.state.events, entry].slice(-MAX_EVENTS) }
  }
  private acquire(): Lock {
    this.assertOwner()
    const fd = openSync(this.lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    const initial = fstatSync(fd, { bigint: true })
    const owned: Lock = { fd, identity: identity(initial), stamp: signature(initial) }
    try {
      writeFileSync(fd, JSON.stringify({ version: 1, owner: randomUUID() }))
      owned.stamp = signature(fstatSync(fd, { bigint: true }))
      fsyncSync(fd)
      return owned
    } catch (error: unknown) { this.release(owned); throw error }
  }
  private release(owned: Lock): void {
    try { this.checkLock(owned); unlinkSync(this.lockPath) } finally { closeSync(owned.fd) }
  }
  private commit(next: State): void {
    this.requireHealthy()
    let lock: Lock | undefined
    let temporary: string | undefined
    let temporaryIdentity: string | undefined
    try {
      try { lock = this.acquire() } catch (error: unknown) {
        if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') return fail('locked')
        throw error
      }
      this.requireHealthy(lock)
      const serialized = JSON.stringify(next)
      if (Buffer.byteLength(serialized) > MAX_BYTES) return fail('capacity')
      // Validate our own transaction before it can replace any durable bytes.
      parseState(serialized)
      this.assertOwner()
      temporary = join(this.directory, `.creator-grants-${randomUUID()}.tmp`)
      const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      temporaryIdentity = identity(fstatSync(fd, { bigint: true }))
      try { writeFileSync(fd, serialized); fsyncSync(fd) } finally { closeSync(fd) }
      this.requireHealthy(lock)
      this.assertOwner() // No await/callback between this ownership fence and replacement.
      renameSync(temporary, this.path)
      temporary = undefined
      const dirFd = openSync(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      try { fsyncSync(dirFd) } finally { closeSync(dirFd) }
      const saved = this.readDisk()
      if (saved === undefined || saved.text !== serialized) return fail('external-change')
      this.state = next; this.anchor = saved.anchor
      this.assertOwner()
    } catch (error: unknown) {
      this.suspend(this.code(error, 'write-failed'))
      throw new CreatorGrantStoreError(this.fault!)
    } finally {
      if (temporary !== undefined) {
        // Clean only the exact file we created; never unlink a replaced path.
        try { const current = stat(temporary); if (current !== undefined && identity(current) === temporaryIdentity && !current.isSymbolicLink()) unlinkSync(temporary) } catch { this.suspend('write-failed') }
      }
      if (lock !== undefined) {
        try { this.release(lock) } catch { this.suspend('external-change'); throw new CreatorGrantStoreError(this.fault!) }
      }
    }
  }
  /** No write on teardown. Old generations may neither overwrite nor resurrect current state. */
  dispose(): void { this.disposed = true }
}
