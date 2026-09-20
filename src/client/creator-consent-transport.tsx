/**
 * Opt-in public-client observation + typed transport. No URLs, HTTP adapter,
 * Remote subscription, Host API or production entry are installed here.
 * Transport authentication and a matching nonce are NOT proof of a human/source.
 *
 * Public seam: conversation.input.overlay (session/list) supplies the resident
 * composer's real sessionId. Its null observer never replaces the composer.
 * The official root calls renderSlotChain(...,{overlay:true}), keeping that
 * fallback mounted during takeovers. Chain selectors are pure first-match
 * elections, NOT middleware: no next/render-next API is assumed.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PendingInteractionPublisher } from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { parseCreatorApprovalPrompt, parseCreatorApprovalResult } from '../creator-approval-contract.ts'
import type { CreatorApprovalPrompt, CreatorApprovalResult } from '../creator-approval-contract.ts'
import { CREATOR_APPROVAL_COPY, CreatorApprovalView, PendingCreatorApproval, createCreatorApprovalDraft, reduceCreatorApprovalDraft, creatorApprovalDraftResult } from './creator-approval.tsx'
import type { CreatorApprovalDraft, CreatorApprovalDraftAction } from './creator-approval.tsx'

export interface CreatorConsentListItem { prompt: CreatorApprovalPrompt; expiresAt: number }
export interface CreatorConsentPresented extends CreatorConsentListItem { viewNonce: string }
export interface CreatorConsentConfirmInput { id: string; viewNonce: string; answer: CreatorApprovalResult }
export interface CreatorConsentDelegateInput { id: string; viewNonce: string }
export interface CreatorConsentConfirmAck { id: string; status: 'accepted' | 'duplicate' }
export interface CreatorConsentDelegateAck { id: string; status: 'delegated' | 'duplicate' }
export interface CreatorConsentTransport {
  list(sessionId: SessionId, signal: AbortSignal): Promise<readonly CreatorConsentListItem[]>
  present(id: string, sessionId: SessionId, signal: AbortSignal): Promise<CreatorConsentPresented>
  confirm(input: CreatorConsentConfirmInput, signal: AbortSignal): Promise<CreatorConsentConfirmAck>
  /** A future server broker MUST validate this nonce. Never expose registry.delegate(id) directly. */
  delegate(input: CreatorConsentDelegateInput, signal: AbortSignal): Promise<CreatorConsentDelegateAck>
}
export type CreatorConsentPhase = 'discovered' | 'presenting' | 'ready' | 'confirming' | 'delegating' | 'unknown' | 'ended' | 'acknowledged' | 'dismissed'
export interface CreatorConsentSnapshot {
  pending: PendingCreatorConsent
  prompt: CreatorApprovalPrompt
  expiresAt: number
  draft: CreatorApprovalDraft
  phase: CreatorConsentPhase
  listed: boolean
  canRetry: boolean
}
/** Separate public pending kind: the old immediate-answer card cannot capture an ACK-gated request. */
export class PendingCreatorConsent {
  readonly kind = 'creator-consent'
  readonly key: string
  readonly sessionId: SessionId
  readonly result: Promise<CreatorApprovalResult>
  readonly #owner: symbol
  constructor(pending: PendingCreatorApproval, owner: symbol) {
    this.key = pending.key; this.sessionId = pending.sessionId; this.result = pending.result; this.#owner = owner
  }
  belongsTo(owner: symbol): boolean { return this.#owner === owner }
}
declare module '@deepseek-ai/dsh-client-ui-session/client' {
  interface SessionPendingInteractionMap { 'creator-consent': PendingCreatorConsent }
}
export interface CreatorConsentControllerOptions {
  transport: CreatorConsentTransport
  publish: PendingInteractionPublisher<PendingCreatorConsent>
  signal?: AbortSignal
  now?: () => number
  pollMs?: number
  requestTimeoutMs?: number
  maxPending?: number
}
type Intent = { kind: 'confirm'; answer: CreatorApprovalResult } | { kind: 'delegate' }
interface Entry {
  id: string
  sessionId: SessionId
  prompt: CreatorApprovalPrompt
  fingerprint: string
  expiresAt: number
  pending: PendingCreatorApproval
  publicPending: PendingCreatorConsent
  signal: AbortController
  remove: (() => void) | undefined
  timer: ReturnType<typeof setTimeout> | undefined
  noticeTimer: ReturnType<typeof setTimeout> | undefined
  phase: CreatorConsentPhase
  draft: CreatorApprovalDraft
  listed: boolean
  attemptedPresent: boolean
  nonce: string | undefined
  intent: Intent | undefined
  work: Promise<boolean> | undefined
  snapshot: CreatorConsentSnapshot
}
const MAX = 64
const TTL = 300_000
const NOTICE_TTL = 30_000
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError('Invalid confirmation transport data')
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) throw new TypeError('Unexpected confirmation transport field')
    const property = Object.getOwnPropertyDescriptor(value, key)
    if (property === undefined || !property.enumerable || !('value' in property)) throw new TypeError('Invalid confirmation transport property')
    copy[key] = property.value as unknown
  }
  return copy
}
function item(value: unknown, withNonce: false): CreatorConsentListItem
function item(value: unknown, withNonce: true): CreatorConsentPresented
function item(value: unknown, withNonce: boolean): CreatorConsentListItem | CreatorConsentPresented {
  const data = object(value, withNonce ? ['prompt', 'expiresAt', 'viewNonce'] : ['prompt', 'expiresAt'])
  const prompt = parseCreatorApprovalPrompt(data['prompt'])
  Object.freeze(prompt.availableOperations); Object.freeze(prompt)
  if (typeof data['expiresAt'] !== 'number' || !Number.isSafeInteger(data['expiresAt']) || data['expiresAt'] <= 0) throw new TypeError('Invalid confirmation deadline')
  if (!withNonce) return { prompt, expiresAt: data['expiresAt'] }
  if (typeof data['viewNonce'] !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/.test(data['viewNonce'])) throw new TypeError('Invalid confirmation view')
  return { prompt, expiresAt: data['expiresAt'], viewNonce: data['viewNonce'] }
}
function listItems(value: unknown): CreatorConsentListItem[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX || Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError('Invalid confirmation list')
  const result: CreatorConsentListItem[] = []
  const ids = new Set<string>()
  for (let index = 0; index < value.length; index += 1) {
    const property = Object.getOwnPropertyDescriptor(value, String(index))
    if (property === undefined || !('value' in property)) throw new TypeError('Invalid confirmation list entry')
    const parsed = item(property.value, false)
    if (ids.has(parsed.prompt.id)) throw new TypeError('Duplicate confirmation request')
    ids.add(parsed.prompt.id); result.push(parsed)
  }
  return result
}
function ack(value: unknown, id: string, kind: Intent['kind']): void {
  const data = object(value, ['id', 'status'])
  if (data['id'] !== id || (data['status'] !== 'duplicate' && data['status'] !== (kind === 'confirm' ? 'accepted' : 'delegated'))) throw new TypeError('Missing matching server acknowledgement')
}
function sessionId(value: unknown): value is SessionId {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u0020\u007f-\u009f]/.test(value)
}
function boundedNumber(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('Invalid confirmation polling limit')
  return value
}
/** Abort races consume late results/rejections even if an injected transport ignores its signal. */
async function request<T>(parent: AbortSignal, timeoutMs: number, invoke: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const abort = (): void => { controller.abort() }
  parent.addEventListener('abort', abort, { once: true })
  if (parent.aborted) abort()
  let reject!: (reason: unknown) => void
  const aborted = new Promise<never>((_resolve, failed) => { reject = failed })
  const rejectAbort = (): void => { reject(new Error('Local request ended; server outcome unknown')) }
  controller.signal.addEventListener('abort', rejectAbort, { once: true })
  if (controller.signal.aborted) rejectAbort()
  const timer = setTimeout(abort, timeoutMs)
  try {
    return await Promise.race([aborted, Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return invoke(controller.signal)
    })])
  } finally {
    clearTimeout(timer); parent.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', rejectAbort)
    controller.abort()
  }
}

/**
 * Root-plugin-owned state, not React-owned request lifetime. Up to 64 known ids
 * (including short-lived completed-id tombstones) are retained until original TTL;
 * never evict a seen id early and accidentally present it again. Expired unknown
 * notices can remain visible for at most 30s, but network/actions stop at TTL.
 */
export class CreatorConsentController {
  readonly ownerTag = Symbol('creator-consent-controller')
  readonly #transport: CreatorConsentTransport
  readonly #publish: PendingInteractionPublisher<PendingCreatorConsent>
  readonly #now: () => number
  readonly #pollMs: number
  readonly #requestTimeoutMs: number
  readonly #limit: number
  readonly #root = new AbortController()
  readonly #entries = new Map<string, Entry>()
  readonly #observations = new Map<symbol, SessionId>()
  readonly #listeners = new Set<() => void>()
  readonly #external: AbortSignal | undefined
  readonly #externalAbort: () => void
  #lastNow: number | undefined
  #pollTimer: ReturnType<typeof setTimeout> | undefined
  #polling: Promise<void> | undefined
  #closed = false
  #connection: 'idle' | 'ready' | 'unavailable' | 'capacity' | 'closed' = 'idle'

  constructor(options: CreatorConsentControllerOptions) {
    if (options === null || typeof options !== 'object' || typeof options.publish !== 'function'
      || ['list', 'present', 'confirm', 'delegate'].some(key => typeof options.transport?.[key as keyof CreatorConsentTransport] !== 'function')) throw new TypeError('Explicit confirmation transport and publisher are required')
    this.#transport = options.transport; this.#publish = options.publish
    this.#now = options.now ?? Date.now
    if (typeof this.#now !== 'function') throw new TypeError('A synchronous clock is required')
    this.#pollMs = boundedNumber(options.pollMs ?? 1_500, 100, 30_000)
    this.#requestTimeoutMs = boundedNumber(options.requestTimeoutMs ?? 10_000, 1, 30_000)
    this.#limit = boundedNumber(options.maxPending ?? MAX, 1, MAX)
    this.#external = options.signal; this.#externalAbort = () => { this.dispose() }
    this.#external?.addEventListener('abort', this.#externalAbort, { once: true })
    if (this.#external?.aborted) this.dispose()
  }
  readonly subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener) } }
  snapshot(id: string): CreatorConsentSnapshot | undefined { return this.#entries.get(id)?.snapshot }
  snapshotByPending(pending: PendingCreatorConsent): CreatorConsentSnapshot | undefined {
    for (const entry of this.#entries.values()) if (entry.publicPending === pending) return entry.snapshot
    return undefined
  }
  health(): { closed: boolean; known: number; observations: number; connection: string } {
    return { closed: this.#closed, known: this.#entries.size, observations: this.#observations.size, connection: this.#connection }
  }
  /** A read-only observation lease. Releasing it does NOT delegate/cancel any Host request. */
  observeSession(id: SessionId): () => void {
    if (this.#closed) return () => {}
    if (!sessionId(id) || this.#observations.size >= MAX) throw new TypeError('Invalid confirmation session observation')
    const token = Symbol('composer observation')
    this.#observations.set(token, id)
    this.#clearPollTimer(); this.#schedule(0)
    return () => { this.#observations.delete(token); if (!this.#hasWork()) this.#clearPollTimer() }
  }
  pollNow(): Promise<void> {
    if (this.#closed) return Promise.resolve()
    if (this.#polling !== undefined) return this.#polling
    this.#clearPollTimer()
    this.#polling = this.#poll().catch(() => { if (!this.#closed) this.#connection = 'unavailable' }).finally(() => {
      this.#polling = undefined; this.#schedule(this.#pollMs)
    })
    return this.#polling
  }
  /** Called by the elected card's mount effect, not every poll or a render-time selector. */
  ensurePresented(id: string): Promise<boolean> {
    const entry = this.#entries.get(id)
    if (entry === undefined || !this.#live(entry) || entry.attemptedPresent) return entry?.work ?? Promise.resolve(entry?.phase === 'ready')
    entry.attemptedPresent = true; entry.phase = 'presenting'; this.#emit(entry)
    entry.work = (async () => {
      try {
        const value = item(await request(entry.signal.signal, this.#timeout(entry), signal => this.#transport.present(id, entry.sessionId, signal)), true)
        if (!this.#live(entry) || entry.phase !== 'presenting') return false
        if (value.prompt.id !== id || JSON.stringify(value.prompt) !== entry.fingerprint || value.expiresAt !== entry.expiresAt) throw new TypeError('Confirmation view changed its request')
        entry.nonce = value.viewNonce; entry.phase = 'ready'; this.#emit(entry); return true
      } catch { if (this.#live(entry)) { entry.phase = 'unknown'; this.#emit(entry) } return false }
      finally { entry.work = undefined }
    })()
    return entry.work
  }
  change(id: string, action: CreatorApprovalDraftAction): void {
    const entry = this.#entries.get(id)
    if (entry === undefined || !this.#live(entry) || entry.phase !== 'ready' || entry.intent !== undefined) return
    entry.draft = reduceCreatorApprovalDraft(entry.prompt, entry.draft, action); this.#emit(entry)
  }
  submit(id: string): Promise<boolean> {
    const entry = this.#entries.get(id)
    if (entry === undefined || !this.#live(entry) || entry.phase !== 'ready' || entry.intent !== undefined) return Promise.resolve(false)
    if (entry.draft.lifetime === 'remember' && entry.draft.phase === 'edit') {
      this.change(id, { type: 'review' }); return Promise.resolve(false)
    }
    const answer = creatorApprovalDraftResult(entry.prompt, entry.draft)
    if (answer === undefined) return Promise.resolve(false)
    return this.#start(entry, { kind: 'confirm', answer: parseCreatorApprovalResult(answer, entry.prompt) })
  }
  reject(id: string): Promise<boolean> {
    const entry = this.#entries.get(id)
    return entry !== undefined && this.#live(entry) && entry.phase === 'ready' && entry.intent === undefined
      ? this.#start(entry, { kind: 'confirm', answer: { decision: 'reject' } }) : Promise.resolve(false)
  }
  delegate(id: string): Promise<boolean> {
    const entry = this.#entries.get(id)
    return entry !== undefined && this.#live(entry) && entry.phase === 'ready' && entry.intent === undefined
      ? this.#start(entry, { kind: 'delegate' }) : Promise.resolve(false)
  }
  /** Only the exact already-submitted intent may be retried after a missing ACK. */
  retry(id: string): Promise<boolean> {
    const entry = this.#entries.get(id)
    return entry !== undefined && this.#live(entry) && entry.phase === 'unknown' && entry.intent !== undefined
      ? this.#start(entry, entry.intent) : Promise.resolve(false)
  }
  /** Close a local unknown notice. This says nothing about rejection/execution on the Host. */
  dismiss(id: string): void {
    const entry = this.#entries.get(id)
    if (entry === undefined || !['unknown', 'ended'].includes(entry.phase)) return
    entry.phase = 'dismissed'; entry.signal.abort(); this.#remove(entry); this.#emit(entry)
  }
  dispose(): void {
    if (this.#closed) return
    this.#closed = true; this.#connection = 'closed'; this.#root.abort(); this.#clearPollTimer()
    this.#external?.removeEventListener('abort', this.#externalAbort)
    for (const entry of this.#entries.values()) {
      entry.signal.abort(); entry.pending.abort(new Error('Local publisher closed; Host outcome unknown')); this.#remove(entry)
      if (entry.timer !== undefined) clearTimeout(entry.timer)
      if (entry.noticeTimer !== undefined) clearTimeout(entry.noticeTimer)
    }
    this.#entries.clear(); this.#observations.clear(); this.#notify(); this.#listeners.clear()
  }

  #start(entry: Entry, intent: Intent): Promise<boolean> {
    if (entry.work !== undefined) return entry.work
    if (entry.nonce === undefined || !this.#live(entry)) return Promise.resolve(false)
    if (intent.kind === 'confirm') { if (intent.answer.decision === 'allow') Object.freeze(intent.answer.operations); Object.freeze(intent.answer) }
    entry.intent = Object.freeze(intent); entry.phase = intent.kind === 'confirm' ? 'confirming' : 'delegating'; this.#emit(entry)
    const nonce = entry.nonce
    entry.work = (async () => {
      try {
        const value = await request<CreatorConsentConfirmAck | CreatorConsentDelegateAck>(entry.signal.signal, this.#timeout(entry), signal => intent.kind === 'confirm'
          ? this.#transport.confirm(Object.freeze({ id: entry.id, viewNonce: nonce, answer: intent.answer }), signal)
          : this.#transport.delegate(Object.freeze({ id: entry.id, viewNonce: nonce }), signal))
        if (!this.#live(entry)) return false
        ack(value, entry.id, intent.kind)
        // The local answer is intentionally AFTER the matching server ACK.
        if (intent.kind === 'confirm') await entry.pending.answer(intent.answer)
        else entry.pending.delegate()
        entry.phase = 'acknowledged'; entry.nonce = undefined; this.#remove(entry); this.#emit(entry); return true
      } catch { if (this.#live(entry)) { entry.phase = 'unknown'; this.#emit(entry) } return false }
      finally { entry.work = undefined }
    })()
    return entry.work
  }
  async #poll(): Promise<void> {
    const sessions = new Set(this.#observations.values())
    for (const entry of this.#entries.values()) if (this.#pollable(entry)) sessions.add(entry.sessionId)
    for (const id of sessions) {
      if (this.#closed) return
      if (!this.#observed(id) && ![...this.#entries.values()].some(entry => entry.sessionId === id && this.#pollable(entry))) continue
      try {
        const values = listItems(await request(this.#root.signal, this.#requestTimeoutMs, signal => this.#transport.list(id, signal)))
        if (this.#closed) return
        const now = this.#time()
        const known = new Set(values.map(value => value.prompt.id))
        for (const entry of this.#entries.values()) {
          if (entry.sessionId !== id || !this.#pollable(entry)) continue
          entry.listed = known.has(entry.id)
          if (!entry.listed && entry.intent === undefined) this.#end(entry)
          else this.#emit(entry) // A disappeared request may still have a confirm ACK in flight.
        }
        for (const value of values) {
          const existing = this.#entries.get(value.prompt.id)
          if (existing !== undefined) {
            if (existing.sessionId !== id || existing.fingerprint !== JSON.stringify(value.prompt) || existing.expiresAt !== value.expiresAt) this.#end(existing)
            continue
          }
          if (!this.#observed(id) || value.expiresAt <= now || value.expiresAt > now + TTL) continue
          if (this.#entries.size >= this.#limit) { this.#connection = 'capacity'; continue }
          this.#add(id, value)
        }
        if (this.#closed) return
        if (this.#connection !== 'capacity') this.#connection = 'ready'
      } catch { if (!this.#closed) this.#connection = 'unavailable' }
    }
  }
  #add(id: SessionId, value: CreatorConsentListItem): void {
    const signal = new AbortController()
    const pending = new PendingCreatorApproval(id, { prompt: value.prompt, signal: signal.signal })
    void pending.result.catch(() => {}) // Local abort/delegation are not unhandled failures or Host answers.
    const publicPending = new PendingCreatorConsent(pending, this.ownerTag)
    const initial: CreatorConsentSnapshot = { pending: publicPending, prompt: value.prompt, expiresAt: value.expiresAt, draft: createCreatorApprovalDraft(value.prompt), phase: 'discovered', listed: true, canRetry: false }
    const entry: Entry = { id: value.prompt.id, sessionId: id, prompt: value.prompt, fingerprint: JSON.stringify(value.prompt), expiresAt: value.expiresAt,
      pending, publicPending, signal, remove: undefined, timer: undefined, noticeTimer: undefined, phase: 'discovered', draft: initial.draft, listed: true,
      attemptedPresent: false, nonce: undefined, intent: undefined, work: undefined, snapshot: Object.freeze(initial) }
    this.#entries.set(entry.id, entry)
    try {
      const remove = this.#publish(publicPending, async () => { this.dispose() })
      // Publication can synchronously notify a listener that unloads the plugin.
      // Its just-returned disposer must not escape that already-completed teardown.
      if (this.#closed || this.#entries.get(entry.id) !== entry) { remove(); return }
      entry.remove = remove
      const delay = Math.max(1, value.expiresAt - this.#time())
      if (this.#closed) return
      entry.timer = setTimeout(() => {
        // A frozen/slow injected clock must not recycle a supposedly unexpired
        // seen id after the hard timer, or hold unknown notices forever.
        try { if (this.#time() < entry.expiresAt) { this.dispose(); return } } catch { return }
        if (['acknowledged', 'dismissed'].includes(entry.phase)) this.#forget(entry)
        else this.#end(entry, true)
      }, delay)
      this.#emit(entry)
    } catch { this.dispose() }
  }
  #end(entry: Entry, expires = false): void {
    if (['acknowledged', 'dismissed'].includes(entry.phase)) { if (expires) this.#forget(entry); return }
    entry.phase = 'ended'; entry.nonce = undefined; entry.signal.abort(); entry.pending.abort(new Error('Request ended locally; server outcome unknown')); this.#emit(entry)
    if (!this.#closed && entry.noticeTimer === undefined) entry.noticeTimer = setTimeout(() => {
      entry.noticeTimer = undefined
      try { if (this.#time() >= entry.expiresAt) this.#forget(entry); else this.dismiss(entry.id) } catch { /* Invalid clocks close the controller. */ }
    }, NOTICE_TTL)
  }
  #forget(entry: Entry): void {
    this.#remove(entry); entry.signal.abort()
    if (entry.timer !== undefined) clearTimeout(entry.timer)
    if (entry.noticeTimer !== undefined) clearTimeout(entry.noticeTimer)
    this.#entries.delete(entry.id); this.#notify()
  }
  #remove(entry: Entry): void { const remove = entry.remove; entry.remove = undefined; try { remove?.() } catch { /* Local teardown cannot claim a Host outcome. */ } }
  #emit(entry: Entry): void {
    Object.freeze(entry.draft.operations); Object.freeze(entry.draft)
    entry.snapshot = Object.freeze({ pending: entry.publicPending, prompt: entry.prompt, expiresAt: entry.expiresAt, draft: entry.draft,
      phase: entry.phase, listed: entry.listed, canRetry: entry.phase === 'unknown' && entry.intent !== undefined && entry.nonce !== undefined })
    this.#notify()
  }
  #notify(): void { for (const listener of this.#listeners) { try { listener() } catch { /* Observer failure cannot acknowledge a request. */ } } }
  #time(): number {
    let now: unknown
    try { now = this.#now() } catch { this.dispose(); throw new Error('Invalid local confirmation clock') }
    if (typeof now !== 'number' || !Number.isSafeInteger(now) || now < 0 || (this.#lastNow !== undefined && now < this.#lastNow)) {
      this.dispose()
      if (now !== null && (typeof now === 'object' || typeof now === 'function')) {
        try { void Promise.resolve(now).then(() => {}, () => {}) } catch { /* The controller is already closed. */ }
      }
      throw new Error('Invalid local confirmation clock')
    }
    this.#lastNow = now; return now
  }
  #live(entry: Entry): boolean {
    if (this.#closed || this.#entries.get(entry.id) !== entry || ['ended', 'acknowledged', 'dismissed'].includes(entry.phase)) return false
    try { if (this.#time() >= entry.expiresAt) { this.#end(entry, true); return false } } catch { return false }
    return !entry.signal.signal.aborted
  }
  #timeout(entry: Entry): number { return Math.max(1, Math.min(this.#requestTimeoutMs, entry.expiresAt - this.#time())) }
  #pollable(entry: Entry): boolean { return !['ended', 'acknowledged', 'dismissed'].includes(entry.phase) }
  #observed(id: SessionId): boolean { return [...this.#observations.values()].includes(id) }
  #hasWork(): boolean { return this.#observations.size > 0 || [...this.#entries.values()].some(entry => this.#pollable(entry)) }
  #clearPollTimer(): void { if (this.#pollTimer !== undefined) { clearTimeout(this.#pollTimer); this.#pollTimer = undefined } }
  #schedule(delay: number): void {
    if (this.#closed || this.#polling !== undefined || this.#pollTimer !== undefined || !this.#hasWork()) return
    this.#pollTimer = setTimeout(() => { this.#pollTimer = undefined; void this.pollNow() }, delay)
  }
}

export const CREATOR_CONSENT_TRANSPORT_COPY = {
  zh: { preparing: '正在准备服务器确认视图…', waiting: '正在等待服务器确认回执…', disappeared: '请求已从待办消失，尚未收到确认回执；状态未知。', unknown: '未收到可靠的服务器回执；状态未知，不代表已拒绝或未执行。', ended: '本地等待已结束；服务器状态未知，不代表已拒绝或未执行。', retry: '重试同一提交', dismiss: '关闭本地提示' },
  en: { preparing: 'Preparing the server confirmation view…', waiting: 'Waiting for the server acknowledgement…', disappeared: 'The request is no longer listed, but no acknowledgement has arrived. Its status is unknown.', unknown: 'No reliable server acknowledgement. The outcome is unknown, not rejected or known to be unexecuted.', ended: 'Local waiting has ended. The server outcome is unknown, not rejected or known to be unexecuted.', retry: 'Retry the same submission', dismiss: 'Dismiss local notice' },
} as const
export function CreatorConsentSessionObserver({ sessionId, controller }: { sessionId: SessionId; controller: CreatorConsentController }): ReactNode {
  useEffect(() => controller.observeSession(sessionId), [controller, sessionId])
  return null
}
export interface CreatorConsentViewProps { snapshot: CreatorConsentSnapshot; controller: CreatorConsentController; locale?: 'en' | 'zh' }
/** Actual controlled view; unknown/ended messages deliberately make no saved/rejected/executed claim. */
export function CreatorConsentView({ snapshot, controller, locale = 'zh' }: CreatorConsentViewProps): ReactNode {
  const { prompt, draft, phase } = snapshot
  const copy = CREATOR_CONSENT_TRANSPORT_COPY[locale]
  const message = phase === 'ended' ? copy.ended : phase === 'unknown' ? copy.unknown
    : (phase === 'confirming' || phase === 'delegating') ? (snapshot.listed ? copy.waiting : copy.disappeared) : copy.preparing
  return <div data-creator-consent-phase={phase}>
    <CreatorApprovalView prompt={prompt} draft={draft} idPrefix={snapshot.pending.key} busy={phase !== 'ready'}
      copy={{ ...CREATOR_APPROVAL_COPY[locale], settled: message }}
      onAction={action => controller.change(prompt.id, action)} onSubmit={() => { void controller.submit(prompt.id) }}
      onReject={() => { void controller.reject(prompt.id) }} onCancel={() => { void controller.delegate(prompt.id) }} />
    {snapshot.canRetry && <button type="button" onClick={() => { void controller.retry(prompt.id) }}>{copy.retry}</button>}
    {(phase === 'unknown' || phase === 'ended') && <button type="button" onClick={() => controller.dismiss(prompt.id)}>{copy.dismiss}</button>}
  </div>
}
export function CreatorConsentCard({ pending, controller, locale = 'zh' }: { pending: PendingCreatorConsent; controller: CreatorConsentController; locale?: 'en' | 'zh' }): ReactNode {
  // The public pending key identifies its one root-owned draft; switching React
  // views does not discard it or repeat present(). New requests have new keys.
  const read = (): CreatorConsentSnapshot | undefined => controller.snapshotByPending(pending)
  const snapshot = useSyncExternalStore(controller.subscribe, read, read)
  useEffect(() => { if (snapshot !== undefined) void controller.ensurePresented(snapshot.prompt.id) }, [controller, pending])
  return snapshot === undefined || ['acknowledged', 'dismissed'].includes(snapshot.phase) ? null : <CreatorConsentView snapshot={snapshot} controller={controller} locale={locale} />
}

/** Direct public service reads only; no mixed Context.sessions access or Remote listener. */
export const CREATOR_CONSENT_TRANSPORT_INJECT = ['uiSession', 'slots'] as const
export function registerCreatorConsentTransport(ctx: Context, transport: CreatorConsentTransport, options: Omit<CreatorConsentControllerOptions, 'transport' | 'publish'> & { locale?: 'en' | 'zh' } = {}): CreatorConsentController {
  const publish = ctx.uiSession.registerPendingInteraction<PendingCreatorConsent>(() => 0)
  const controller = new CreatorConsentController({ ...options, transport, publish })
  const owner = controller.ownerTag
  ctx.effect(() => () => { controller.dispose() }, 'Creator 确认轮询生命周期')
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({ name: 'conversation.input.overlay', id: 'creator-consent-observer' },
    ({ sessionId }: PropsRuntime<'conversation.input.overlay'>) => <CreatorConsentSessionObserver sessionId={sessionId} controller={controller} />))
  ctx.slots.inject('conversation.composer', () => ctx.slots.register({ name: 'conversation.composer', priority: 2,
    select: ({ sessionId, pendingInteraction }: ComposerChainProps): PendingCreatorConsent | null => pendingInteraction instanceof PendingCreatorConsent
      && pendingInteraction.belongsTo(owner) && pendingInteraction.sessionId === sessionId ? pendingInteraction : null,
  }, ({ matched }: { matched: PendingCreatorConsent }) => <CreatorConsentCard key={matched.key} pending={matched} controller={controller} {...options.locale === undefined ? {} : { locale: options.locale }} />))
  return controller
}
