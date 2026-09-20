/**
 * Host-private, memory-only request/view correlation. NOT a source/human verifier,
 * execution capability, grant ledger, HTTP API, or production approval handler.
 *
 * validateOwner must recognize the real Host reference by identity in its private
 * closure. Session strings, JSON fields, authenticated HTTP and possession of a
 * view nonce do not prove an execution source or physical human. The future broker
 * must independently verify those facts and revalidate before any actual dispatch.
 */
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { setTimeout as schedule, clearTimeout as unschedule } from 'node:timers'
import { parseCreatorApprovalPrompt, parseCreatorApprovalResult } from './creator-approval-contract.ts'
import type { CreatorApprovalPrompt, CreatorApprovalResult } from './creator-approval-contract.ts'
import { redactText } from './redaction.ts'

export const CREATOR_CONSENT_MAX_PENDING = 64
export const CREATOR_CONSENT_TTL_MS = 5 * 60_000
/** Object identity is meaningful only to the mandatory Host validateOwner closure. */
export type CreatorConsentOwner = object
export type CreatorConsentPromptInput = Omit<CreatorApprovalPrompt, 'id'>
export interface CreatorConsentRegistryOptions {
  /** Permanently revocable generation lease; observing false permanently closes this instance. */
  isCurrentOwner: () => boolean
  validateOwner: (owner: CreatorConsentOwner) => boolean
  sessionOfOwner: (owner: CreatorConsentOwner) => string | undefined
  now?: () => number
  /** Optional reductions for bounded callers/tests; cannot exceed 64 or five minutes. */
  maxPending?: number
  ttlMs?: number
}
export type CreatorConsentCancellation =
  | 'cancelled' | 'disconnected' | 'revoked' | 'aborted' | 'expired' | 'disposed'
  | 'owner-invalid' | 'session-changed' | 'not-current-owner' | 'clock-invalid' | 'callback-invalid' | 'reentrant'
export type CreatorConsentFailure = CreatorConsentCancellation
  | 'invalid-options' | 'invalid-input' | 'capacity' | 'not-found' | 'session-mismatch' | 'invalid-view' | 'conflict' | 'entropy-failed'
export class CreatorConsentError extends Error {
  constructor(readonly code: CreatorConsentFailure) { super(`Creator confirmation unavailable: ${code}`); this.name = 'CreatorConsentError' }
}
/** A correlation result only. A reject remains an explicit reject; delegation/cancellation are not answers. */
export type CreatorConsentOutcome =
  | { kind: 'consent'; id: string; answer: CreatorApprovalResult }
  | { kind: 'delegated'; id: string }
  | { kind: 'cancelled'; id: string; reason: CreatorConsentCancellation }
/** Host-only handle: its original Promise settles once and never rejects. Do not serialize or expose it. */
export interface CreatorConsentHandle { id: string; expiresAt: number; result: Promise<CreatorConsentOutcome> }
/** These are bounded, detached, redacted display fields, not a bound execution target. */
export interface CreatorConsentListing { prompt: CreatorApprovalPrompt; expiresAt: number }
export interface CreatorConsentView extends CreatorConsentListing { viewNonce: string }
export interface CreatorConsentAcknowledgement { id: string; status: 'accepted' | 'duplicate' }
export interface CreatorConsentHealth { ok: boolean; pending: number; receipts: number; reason?: CreatorConsentCancellation }

interface Entry {
  id: string
  owner: CreatorConsentOwner
  sessionId: string
  prompt: CreatorApprovalPrompt
  expiresAt: number
  status: 'pending' | 'answered' | 'delegated' | 'retired'
  nonce: string | undefined
  answer: CreatorApprovalResult | undefined
  answerJson: string | undefined
  resolve: ((outcome: CreatorConsentOutcome) => void) | undefined
  signal: AbortSignal | undefined
  abort: (() => void) | undefined
  timer: ReturnType<typeof schedule> | undefined
}
const addListener = EventTarget.prototype.addEventListener
const removeListener = EventTarget.prototype.removeEventListener
const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!
const inputKeys = ['protocol', 'pluginId', 'sourceLabel', 'workspaceLabel', 'currentOperation', 'availableOperations', 'allowTask', 'allowRemember', 'taskLabel', 'reason'] as const
const optionKeys = ['isCurrentOwner', 'validateOwner', 'sessionOfOwner', 'now', 'maxPending', 'ttlMs'] as const

function fail(code: CreatorConsentFailure): never { throw new CreatorConsentError(code) }
function strictObject(value: unknown, keys: readonly string[], code: CreatorConsentFailure): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(code)
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype) return fail(code)
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) return fail(code)
    const property = Object.getOwnPropertyDescriptor(value, key)
    if (property === undefined || !property.enumerable || !('value' in property)) return fail(code)
    copy[key] = property.value as unknown
  }
  return copy
}
/** Drain accidentally returned promises without using their value as a callback answer. */
function observeInvalidReturn(value: unknown): void {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return
  try {
    // Use the intrinsic for real Promises, including a Promise with an overridden .then.
    void Promise.prototype.then.call(value, () => {}, () => {})
  } catch {
    // Assimilate a non-native thenable into an observed promise; throwing getters are also observed.
    void Promise.resolve(value).then(() => {}, () => {})
  }
}
function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u0020\u007f-\u009f]/.test(value)
}
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && Reflect.apply(abortedGetter, signal, []) === true
}
function freezeAnswer(answer: CreatorApprovalResult): CreatorApprovalResult {
  if (answer.decision === 'allow') Object.freeze(answer.operations)
  return Object.freeze(answer)
}
function displayPrompt(prompt: CreatorApprovalPrompt): CreatorApprovalPrompt {
  // Existing redaction is best effort, never a secret-detection guarantee. The Host
  // must still provide appropriate display labels; no raw tool arguments are accepted.
  const sanitized = {
    ...prompt,
    sourceLabel: redactText(prompt.sourceLabel).slice(0, 512),
    workspaceLabel: redactText(prompt.workspaceLabel).slice(0, 512),
    taskLabel: redactText(prompt.taskLabel).slice(0, 160),
    ...(prompt.reason === undefined ? {} : { reason: redactText(prompt.reason).slice(0, 1_200) }),
  }
  const result = parseCreatorApprovalPrompt(sanitized)
  Object.freeze(result.availableOperations)
  return Object.freeze(result)
}
function sameNonce(expected: string | undefined, received: unknown): boolean {
  if (expected === undefined || typeof received !== 'string' || received.length !== expected.length) return false
  if (!/^[0-9a-f]{48}:[1-9][0-9]{0,15}$/.test(received)) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}

/**
 * At most maxPending live entries AND maxPending recent answer receipts. Receipts
 * are evicted oldest-first, never extend the original TTL and cannot resurrect a
 * retired id. All requests have an unref'ed hard timeout in addition to wall-clock
 * checks on every operation. sweep() is available for explicit Host lifecycle ticks.
 *
 * On missing owner/generation, callback failure/async/reentry, clock rollback or
 * unload, no old instance is revived. No disk, network or executable metadata is used.
 */
export class CreatorConsentRegistry {
  readonly #isCurrentOwner: () => boolean
  readonly #validateOwner: (owner: CreatorConsentOwner) => boolean
  readonly #sessionOfOwner: (owner: CreatorConsentOwner) => string | undefined
  readonly #now: () => number
  readonly #maxPending: number
  readonly #ttlMs: number
  readonly #pending = new Map<string, Entry>()
  readonly #receipts = new Map<string, Entry>()
  readonly #revoked = new WeakSet<CreatorConsentOwner>()
  #closed: CreatorConsentCancellation | undefined
  #lastNow: number | undefined
  #busy = false
  #idSequence = 0
  #viewSequence = 0

  constructor(options: CreatorConsentRegistryOptions) {
    const data = strictObject(options, optionKeys, 'invalid-options')
    if (typeof data['isCurrentOwner'] !== 'function' || typeof data['validateOwner'] !== 'function' || typeof data['sessionOfOwner'] !== 'function'
      || (Object.hasOwn(data, 'now') && typeof data['now'] !== 'function')) fail('invalid-options')
    const maxPending = data['maxPending'] ?? CREATOR_CONSENT_MAX_PENDING
    const ttlMs = data['ttlMs'] ?? CREATOR_CONSENT_TTL_MS
    if (typeof maxPending !== 'number' || !Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > CREATOR_CONSENT_MAX_PENDING
      || typeof ttlMs !== 'number' || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > CREATOR_CONSENT_TTL_MS
      || (Object.hasOwn(data, 'maxPending') && typeof data['maxPending'] !== 'number') || (Object.hasOwn(data, 'ttlMs') && typeof data['ttlMs'] !== 'number')) fail('invalid-options')
    this.#isCurrentOwner = data['isCurrentOwner'] as () => boolean
    this.#validateOwner = data['validateOwner'] as (owner: CreatorConsentOwner) => boolean
    this.#sessionOfOwner = data['sessionOfOwner'] as (owner: CreatorConsentOwner) => string | undefined
    this.#now = (data['now'] ?? Date.now) as () => number
    this.#maxPending = maxPending; this.#ttlMs = ttlMs
  }

  open(owner: CreatorConsentOwner, promptWithoutId: CreatorConsentPromptInput, signal?: AbortSignal): CreatorConsentHandle {
    return this.#run(() => {
      const sessionId = this.#ownerSession(owner)
      if (signal !== undefined) {
        try { Reflect.apply(abortedGetter, signal, []) } catch { return fail('invalid-input') }
        if (isAborted(signal)) return fail('aborted')
      }
      let prompt: CreatorApprovalPrompt
      let id: string
      try {
        if (this.#idSequence >= Number.MAX_SAFE_INTEGER) return fail('entropy-failed')
        id = `cc:${randomUUID()}:${String(++this.#idSequence)}`
        prompt = displayPrompt(parseCreatorApprovalPrompt({ ...strictObject(promptWithoutId, inputKeys, 'invalid-input'), id }))
      } catch (error) { if (error instanceof CreatorConsentError) throw error; return fail('invalid-input') }
      if (this.#pending.size >= this.#maxPending) return fail('capacity')
      this.#ownerSession(owner, sessionId)
      const at = this.#checkpoint()
      if (isAborted(signal)) return fail('aborted')
      const expiresAt = at + this.#ttlMs
      if (!Number.isSafeInteger(expiresAt)) { this.#close('clock-invalid'); return fail('clock-invalid') }
      let resolve!: (outcome: CreatorConsentOutcome) => void
      const result = new Promise<CreatorConsentOutcome>(done => { resolve = done })
      const entry: Entry = { id, owner, sessionId, prompt, expiresAt, status: 'pending', nonce: undefined, answer: undefined, answerJson: undefined, resolve,
        signal, abort: undefined, timer: undefined }
      this.#pending.set(id, entry)
      try {
        if (signal !== undefined) {
          entry.abort = () => { this.#retire(entry, 'aborted') }
          Reflect.apply(addListener, signal, ['abort', entry.abort, { once: true }])
          if (isAborted(signal)) this.#retire(entry, 'aborted')
        }
        if (entry.status === 'pending') {
          entry.timer = schedule(() => {
            try { this.#run(() => { this.#retire(entry, 'expired') }) } catch { /* #run closed the generation or the entry is already terminal. */ }
          }, this.#ttlMs)
          entry.timer.unref()
        }
      } catch { this.#retire(entry, 'cancelled'); return fail('invalid-input') }
      return Object.freeze({ id, expiresAt, result })
    })
  }

  list(sessionId: string): CreatorConsentListing[] {
    return this.#run(() => {
      if (!isSessionId(sessionId)) return fail('invalid-input')
      const result: CreatorConsentListing[] = []
      for (const entry of this.#pending.values()) {
        if (entry.sessionId !== sessionId) continue
        try { this.#verifyEntry(entry) } catch (error) {
          if (this.#closed !== undefined) throw error
          continue
        }
        result.push(Object.freeze({ prompt: displayPrompt(entry.prompt), expiresAt: entry.expiresAt }))
      }
      return result
    })
  }

  /** Each display rotates the nonce, invalidating all previous views without extending expiry. */
  present(id: string, sessionId: string): CreatorConsentView {
    return this.#run(() => {
      if (!isSessionId(sessionId)) return fail('invalid-input')
      const entry = this.#lookup(id)
      if (entry.status !== 'pending') return fail('conflict')
      if (entry.sessionId !== sessionId) return fail('session-mismatch')
      this.#verifyEntry(entry)
      if (this.#viewSequence >= Number.MAX_SAFE_INTEGER) return fail('entropy-failed')
      let nonce: string
      try { nonce = `${randomBytes(24).toString('hex')}:${String(++this.#viewSequence)}` } catch { return fail('entropy-failed') }
      this.#verifyEntry(entry)
      entry.nonce = nonce
      return Object.freeze({ prompt: displayPrompt(entry.prompt), expiresAt: entry.expiresAt, viewNonce: nonce })
    })
  }

  /**
   * Correlate an answer with an existing view. No caller/session/human identity is
   * authenticated here: the future transport/broker must supply that independent gate.
   * Only open().result supplies the single private outcome; this ack is not a permit.
   */
  confirm(id: string, viewNonce: string, answer: unknown): CreatorConsentAcknowledgement {
    return this.#run(() => {
      const entry = this.#lookup(id)
      this.#verifyEntry(entry)
      if (entry.status === 'delegated') return fail('conflict')
      if (!sameNonce(entry.nonce, viewNonce)) return fail('invalid-view')
      let parsed: CreatorApprovalResult
      try { parsed = freezeAnswer(parseCreatorApprovalResult(answer, entry.prompt)) } catch { return fail('invalid-input') }
      const answerJson = JSON.stringify(parsed)
      this.#verifyEntry(entry)
      if (!sameNonce(entry.nonce, viewNonce)) return fail('invalid-view')
      if (entry.status === 'answered') {
        if (entry.answerJson !== answerJson) return fail('conflict')
        return Object.freeze({ id, status: 'duplicate' })
      }
      entry.status = 'answered'; entry.answer = parsed; entry.answerJson = answerJson
      this.#pending.delete(id)
      this.#receipts.set(id, entry)
      while (this.#receipts.size > this.#maxPending) {
        const first = this.#receipts.values().next().value as Entry | undefined
        if (first !== undefined) this.#forget(first)
      }
      const resolve = entry.resolve; entry.resolve = undefined
      resolve?.(Object.freeze({ kind: 'consent', id, answer: parsed }))
      return Object.freeze({ id, status: 'accepted' })
    })
  }

  /** Trusted Host lifecycle cancellation only; not an HTTP endpoint. Terminal ids are never reopened. */
  cancel(id: string, reason: 'cancelled' | 'disconnected' = 'cancelled'): boolean {
    return this.#run(() => {
      if (reason !== 'cancelled' && reason !== 'disconnected') return fail('invalid-input')
      const entry = this.#lookupOptional(id)
      if (entry === undefined) return false
      this.#retire(entry, reason); return true
    })
  }
  /** Delegate the original Host request; do not manufacture reject/allow or call a model. */
  delegate(id: string): boolean {
    return this.#run(() => {
      const entry = this.#lookupOptional(id)
      if (entry === undefined || entry.status !== 'pending') return false
      this.#verifyEntry(entry)
      const resolve = entry.resolve; entry.resolve = undefined
      this.#forget(entry)
      resolve?.(Object.freeze({ kind: 'delegated', id }))
      return true
    })
  }
  /** Private routing lookup: no permission, nonce, or owner information. */
  has(id: string): boolean {
    return this.#run(() => {
      if (typeof id !== 'string' || id.length > 100 || !/^cc:[0-9a-f-]{36}:[1-9][0-9]{0,15}$/.test(id)) return false
      return (this.#pending.get(id) ?? this.#receipts.get(id)) !== undefined
    })
  }
  /** Request-specific browser delegation, with the same nonce fence as confirm. */
  delegatePresented(id: string, viewNonce: string): Readonly<{ id: string; status: 'delegated' | 'duplicate' }> {
    return this.#run(() => {
      const entry = this.#lookup(id)
      this.#verifyEntry(entry)
      if (!sameNonce(entry.nonce, viewNonce)) return fail('invalid-view')
      if (entry.status === 'delegated') return Object.freeze({ id, status: 'duplicate' })
      if (entry.status !== 'pending') return fail('conflict')
      entry.status = 'delegated'
      this.#pending.delete(id); this.#receipts.set(id, entry)
      while (this.#receipts.size > this.#maxPending) {
        const first = this.#receipts.values().next().value as Entry | undefined
        if (first !== undefined) this.#forget(first)
      }
      const resolve = entry.resolve; entry.resolve = undefined
      resolve?.(Object.freeze({ kind: 'delegated', id }))
      return Object.freeze({ id, status: 'delegated' })
    })
  }
  /** Revocation is permanent for this reference, even if an erroneous callback later says true. */
  revokeOwner(owner: CreatorConsentOwner): number {
    return this.#run(() => {
      if (owner === null || typeof owner !== 'object') return fail('invalid-input')
      return this.#revoke(owner, 'revoked')
    })
  }
  /** Explicit cleanup/checkpoint; hard timers also clean up without polling or cooperative callers. */
  sweep(): number {
    const before = this.#pending.size + this.#receipts.size
    this.#run(() => {
      for (const entry of [...this.#pending.values(), ...this.#receipts.values()]) {
        try { this.#verifyEntry(entry) } catch (error) { if (this.#closed !== undefined) throw error }
      }
    })
    return before - this.#pending.size - this.#receipts.size
  }
  health(): CreatorConsentHealth {
    try { this.#run(() => {}) } catch { /* Content-free state; never report an invalid callback as healthy. */ }
    return { ok: this.#closed === undefined, pending: this.#pending.size, receipts: this.#receipts.size,
      ...(this.#closed === undefined ? {} : { reason: this.#closed }) }
  }
  /** Unload is monotonic and does not invoke untrusted callbacks or wait on any remote work. */
  dispose(): void { this.#close('disposed') }

  #run<T>(action: () => T): T {
    if (this.#busy) { this.#close('reentrant'); return fail('reentrant') }
    this.#busy = true
    try {
      const at = this.#checkpoint()
      for (const entry of [...this.#pending.values(), ...this.#receipts.values()]) if (at >= entry.expiresAt) this.#retire(entry, 'expired')
      return action()
    } finally { this.#busy = false }
  }
  #callback(callback: () => unknown, accept: (value: unknown) => boolean): unknown {
    let value: unknown
    try { value = callback() } catch { this.#close('callback-invalid'); return fail('callback-invalid') }
    if (!accept(value)) {
      // Close before observing foreign thenables: even an invalid Promise whose
      // constructor/species accessor throws cannot leave an answerable registry.
      this.#close('callback-invalid')
      try { observeInvalidReturn(value) } catch { /* No foreign accessor failure can reopen this instance. */ }
      return fail('callback-invalid')
    }
    if (this.#closed !== undefined) return fail(this.#closed)
    return value
  }
  #checkpoint(): number {
    if (this.#closed !== undefined) return fail(this.#closed)
    if (this.#callback(this.#isCurrentOwner, value => typeof value === 'boolean') !== true) { this.#close('not-current-owner'); return fail('not-current-owner') }
    const value = this.#callback(this.#now, value => typeof value === 'number') as number
    if (!Number.isSafeInteger(value) || value < 0 || (this.#lastNow !== undefined && value < this.#lastNow)) { this.#close('clock-invalid'); return fail('clock-invalid') }
    this.#lastNow = value
    return value
  }
  #ownerSession(owner: CreatorConsentOwner, expected?: string): string {
    if (owner === null || typeof owner !== 'object') return fail('owner-invalid')
    if (this.#revoked.has(owner)) return fail('revoked')
    if (this.#callback(() => this.#validateOwner(owner), value => typeof value === 'boolean') !== true) {
      this.#revoke(owner, 'owner-invalid'); return fail('owner-invalid')
    }
    const session = this.#callback(() => this.#sessionOfOwner(owner), value => value === undefined || isSessionId(value)) as string | undefined
    if (session === undefined) { this.#revoke(owner, 'owner-invalid'); return fail('owner-invalid') }
    if (expected !== undefined && session !== expected) { this.#revoke(owner, 'session-changed'); return fail('session-changed') }
    this.#checkpoint()
    if (this.#revoked.has(owner)) return fail('revoked')
    return session
  }
  #verifyEntry(entry: Entry): void {
    this.#ownerSession(entry.owner, entry.sessionId)
    const at = this.#checkpoint()
    if (at >= entry.expiresAt) { this.#retire(entry, 'expired'); return fail('expired') }
    if (isAborted(entry.signal)) { this.#retire(entry, 'aborted'); return fail('aborted') }
    if (entry.status === 'retired' || (this.#pending.get(entry.id) !== entry && this.#receipts.get(entry.id) !== entry)) return fail('not-found')
  }
  #lookupOptional(id: string): Entry | undefined {
    if (typeof id !== 'string' || id.length > 100 || !/^cc:[0-9a-f-]{36}:[1-9][0-9]{0,15}$/.test(id)) return fail('invalid-input')
    return this.#pending.get(id) ?? this.#receipts.get(id)
  }
  #lookup(id: string): Entry { return this.#lookupOptional(id) ?? fail('not-found') }
  #revoke(owner: CreatorConsentOwner, reason: CreatorConsentCancellation): number {
    this.#revoked.add(owner)
    let count = 0
    for (const entry of [...this.#pending.values(), ...this.#receipts.values()]) if (entry.owner === owner) { this.#retire(entry, reason); count += 1 }
    return count
  }
  #retire(entry: Entry, reason: CreatorConsentCancellation): void {
    if (entry.status === 'retired') return
    const resolve = entry.resolve; entry.resolve = undefined
    this.#forget(entry)
    resolve?.(Object.freeze({ kind: 'cancelled', id: entry.id, reason }))
  }
  #forget(entry: Entry): void {
    this.#pending.delete(entry.id); this.#receipts.delete(entry.id)
    entry.status = 'retired'; entry.nonce = undefined; entry.answer = undefined; entry.answerJson = undefined
    if (entry.timer !== undefined) { unschedule(entry.timer); entry.timer = undefined }
    if (entry.signal !== undefined && entry.abort !== undefined) Reflect.apply(removeListener, entry.signal, ['abort', entry.abort])
    entry.signal = undefined; entry.abort = undefined
  }
  #close(reason: CreatorConsentCancellation): void {
    if (this.#closed !== undefined) return
    this.#closed = reason
    for (const entry of [...this.#pending.values(), ...this.#receipts.values()]) this.#retire(entry, reason)
  }
}
