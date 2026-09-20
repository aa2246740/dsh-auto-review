/** Independent Creator confirmation UI. No production entry, Remote subscription or HTTP endpoint is installed here. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PendingInteractionPublisher } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { CreatorGrantOperation } from '../creator-grant-types.ts'
import { parseCreatorApprovalPrompt, parseCreatorApprovalResult } from '../creator-approval-contract.ts'
import type { CreatorApprovalLifetime, CreatorApprovalPrompt, CreatorApprovalResult, CreatorRememberDays } from '../creator-approval-contract.ts'
import css from './creator-approval.module.css'

/** The signal is a live presentation lifetime, never part of the JSON prompt/decision. */
export interface CreatorApprovalPresentation { prompt: CreatorApprovalPrompt; signal?: AbortSignal }
export type CreatorApprovalPendingStatus = 'pending' | 'answered' | 'delegated' | 'cancelled'

declare module '@deepseek-ai/dsh-client-ui-session/client' {
  interface SessionPendingInteractionMap { 'creator-approval': PendingCreatorApproval }
}
let nextPresentationKey = 0

/** Exactly one answerable, Session-scoped presentation. Its key is not a Host authorization token. */
export class PendingCreatorApproval {
  readonly kind = 'creator-approval'
  readonly key: string
  readonly prompt: CreatorApprovalPrompt
  readonly result: Promise<CreatorApprovalResult>
  readonly #resolve: (result: CreatorApprovalResult) => void
  readonly #reject: (reason: unknown) => void
  readonly #signal: AbortSignal | undefined
  readonly #onAbort: (() => void) | undefined
  readonly #delegated = Symbol('creator approval delegated')
  readonly #listeners = new Set<() => void>()
  #status: CreatorApprovalPendingStatus = 'pending'

  constructor(readonly sessionId: SessionId, presentation: CreatorApprovalPresentation) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new TypeError('Creator approval requires a scoped Session')
    this.prompt = parseCreatorApprovalPrompt(presentation.prompt)
    Object.freeze(this.prompt.availableOperations)
    Object.freeze(this.prompt)
    this.key = `creator-approval:${globalThis.crypto.randomUUID()}:${String(++nextPresentationKey)}`
    let resolve!: (result: CreatorApprovalResult) => void
    let reject!: (reason: unknown) => void
    this.result = new Promise<CreatorApprovalResult>((done, failed) => { resolve = done; reject = failed })
    this.#resolve = resolve; this.#reject = reject
    this.#signal = presentation.signal
    this.#onAbort = presentation.signal === undefined ? undefined : () => { this.abort(presentation.signal?.reason) }
    if (this.#onAbort !== undefined) {
      presentation.signal!.addEventListener('abort', this.#onAbort, { once: true })
      if (presentation.signal!.aborted) this.#onAbort()
    }
  }
  readonly getSnapshot = (): CreatorApprovalPendingStatus => this.#status
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
  /** Explicit UI decision only; validation never turns a native/AI result into a remembered grant. */
  answer(value: CreatorApprovalResult): Promise<void> {
    try {
      if (this.#signal?.aborted) this.abort(this.#signal.reason)
      const result = parseCreatorApprovalResult(value, this.prompt)
      if (result.decision === 'allow') Object.freeze(result.operations)
      Object.freeze(result)
      this.finish('answered', () => { this.#resolve(result) })
      return Promise.resolve()
    } catch (error) { return Promise.reject(error) }
  }
  /** User cancellation or plugin-domain teardown delegates without creating an answer. */
  delegate(): void { if (this.#status === 'pending') this.finish('delegated', () => { this.#reject(this.#delegated) }) }
  isDelegation(reason: unknown): boolean { return reason === this.#delegated }
  /** A Host/transport abort cancels, rather than opening a fresh fallback question. */
  abort(reason: unknown = new Error('Creator approval cancelled')): void {
    if (this.#status === 'pending') this.finish('cancelled', () => { this.#reject(reason) })
  }
  private finish(status: CreatorApprovalPendingStatus, settle: () => void): void {
    if (this.#status !== 'pending') throw new Error('Creator approval is already settled')
    this.#status = status
    if (this.#signal !== undefined && this.#onAbort !== undefined) this.#signal.removeEventListener('abort', this.#onAbort)
    settle()
    for (const listener of this.#listeners) { try { listener() } catch { /* A presentation observer cannot undo settlement. */ } }
    this.#listeners.clear()
  }
}

export interface CreatorApprovalDraft {
  lifetime: CreatorApprovalLifetime
  operations: CreatorGrantOperation[]
  rememberDays: CreatorRememberDays
  operationsExpanded: boolean
  phase: 'edit' | 'confirm-remember'
  acknowledged: boolean
}
export type CreatorApprovalDraftAction =
  | { type: 'lifetime'; value: CreatorApprovalLifetime }
  | { type: 'operations-expanded'; value: boolean }
  | { type: 'operation'; operation: CreatorGrantOperation; selected: boolean }
  | { type: 'remember-days'; value: CreatorRememberDays }
  | { type: 'review' } | { type: 'back' }
  | { type: 'acknowledge'; value: boolean }

export function createCreatorApprovalDraft(prompt: CreatorApprovalPrompt): CreatorApprovalDraft {
  const validated = parseCreatorApprovalPrompt(prompt)
  return { lifetime: 'once', operations: [validated.currentOperation], rememberDays: 1, operationsExpanded: false, phase: 'edit', acknowledged: false }
}
/** Pure interaction state: selecting scopes/options never settles a request. */
export function reduceCreatorApprovalDraft(prompt: CreatorApprovalPrompt, state: CreatorApprovalDraft, action: CreatorApprovalDraftAction): CreatorApprovalDraft {
  const next = { ...state, operations: [...state.operations] }
  const edit = (): CreatorApprovalDraft => ({ ...next, phase: 'edit', acknowledged: false })
  switch (action.type) {
    case 'lifetime':
      if (!['once', 'task', 'remember'].includes(action.value) || (action.value === 'task' && !prompt.allowTask) || (action.value === 'remember' && !prompt.allowRemember)) return next
      if (next.lifetime === action.value) return next
      return { ...edit(), lifetime: action.value, operations: [prompt.currentOperation], operationsExpanded: false }
    case 'operations-expanded': return { ...edit(), operationsExpanded: next.lifetime !== 'once' && action.value === true }
    case 'operation':
      if (next.lifetime === 'once' || !next.operationsExpanded || action.operation === prompt.currentOperation || !prompt.availableOperations.includes(action.operation)) return next
      return { ...edit(), operations: prompt.availableOperations.filter(operation => operation === prompt.currentOperation
        || (operation === action.operation ? action.selected : next.operations.includes(operation))) }
    case 'remember-days':
      if (![1, 7, 30].includes(action.value)) return next
      return { ...edit(), rememberDays: action.value }
    case 'review': return next.lifetime === 'remember' && prompt.allowRemember ? { ...next, phase: 'confirm-remember', acknowledged: false, operationsExpanded: false } : next
    case 'back': return edit()
    case 'acknowledge': return next.lifetime === 'remember' && next.phase === 'confirm-remember' ? { ...next, acknowledged: action.value === true } : next
  }
}
/** A remember reply requires a separate review step AND an initially unchecked acknowledgement. */
export function creatorApprovalDraftResult(prompt: CreatorApprovalPrompt, state: CreatorApprovalDraft): CreatorApprovalResult | undefined {
  if (state.lifetime === 'remember' && (state.phase !== 'confirm-remember' || !state.acknowledged)) return undefined
  try {
    return parseCreatorApprovalResult({ decision: 'allow', lifetime: state.lifetime, operations: state.operations,
      ...(state.lifetime === 'remember' ? { rememberDays: state.rememberDays } : {}) }, prompt)
  } catch { return undefined }
}

export interface CreatorApprovalCopy {
  title: string; once: string; task: string; remember: string; scope: string; source: string; workspace: string
  currentTask: string; onceHint: string; taskHint: string; rememberHint: string; unavailable: string
  operationScope: string; current: string; duration: string; day: string; days: string; review: string
  reviewTitle: string; futureVersions: string; acknowledgement: string; allow: string; confirmRemember: string
  reject: string; cancel: string; back: string; reason: string; boundary: string; settled: string; settlementFailed: string
  operations: Record<CreatorGrantOperation, string>
}
export const CREATOR_APPROVAL_COPY: Readonly<Record<'en' | 'zh', CreatorApprovalCopy>> = {
  zh: {
    title: 'Creator+ 操作确认', once: '仅这一次', task: '本任务', remember: '跨任务记住', scope: '授权范围', source: '插件来源', workspace: '工作区',
    currentTask: '当前任务', onceHint: '只批准当前请求，不创建可重用授权。', taskHint: '仅在 Host 确认的当前任务内有效。', rememberHint: '仅记住所列插件、工作区和操作；每次执行仍需重新检查。', unavailable: '当前请求不支持',
    operationScope: '操作范围', current: '当前操作', duration: '有效期', day: '天', days: '天', review: '核对记住范围',
    reviewTitle: '确认跨任务授权', futureVersions: '这会允许上述插件的未来版本在所列工作区内使用选定操作；不会跳过每次执行的安全检查。',
    acknowledgement: '我确认授权上述未来版本、操作范围和有效期。', allow: '允许', confirmRemember: '确认记住并允许', reject: '拒绝', cancel: '返回默认审批', back: '返回修改', reason: '请求说明',
    boundary: '不会扩大沙箱权限，也不会覆盖 never 策略。', settled: '此请求已结束，不能再次提交。', settlementFailed: '未能提交确认；没有报告授权成功。',
    operations: { check: '检查', 'activation-plan': '激活计划', 'hot-reload': '热替换', 'activate-new-client': '激活新客户端' },
  },
  en: {
    title: 'Creator+ confirmation', once: 'Just once', task: 'This task', remember: 'Remember across tasks', scope: 'Authorization scope', source: 'Plugin source', workspace: 'Workspace',
    currentTask: 'Current task', onceHint: 'Approve only this request, without a reusable authorization.', taskHint: 'Valid only within the current task identified by the Host.', rememberHint: 'Remember only this plugin, workspace and selected operations. Each execution is checked again.', unavailable: 'Not available for this request',
    operationScope: 'Operations', current: 'Current operation', duration: 'Expires after', day: 'day', days: 'days', review: 'Review remembered scope',
    reviewTitle: 'Confirm cross-task authorization', futureVersions: 'This covers future versions of the plugin above, for the selected operations in this workspace. Execution safety checks still apply.',
    acknowledgement: 'I confirm these future versions, selected operations and expiration.', allow: 'Allow', confirmRemember: 'Remember and allow', reject: 'Reject', cancel: 'Use default approval', back: 'Back to edit', reason: 'Request details',
    boundary: 'Does not expand sandbox permissions or override a never policy.', settled: 'This request has ended and cannot be answered again.', settlementFailed: 'Confirmation was not submitted; authorization was not reported as successful.',
    operations: { check: 'Check', 'activation-plan': 'Activation plan', 'hot-reload': 'Hot reload', 'activate-new-client': 'Activate new client' },
  },
}

export interface CreatorApprovalViewProps {
  prompt: CreatorApprovalPrompt
  draft: CreatorApprovalDraft
  idPrefix: string
  busy?: boolean
  error?: string
  copy?: CreatorApprovalCopy
  onAction: (action: CreatorApprovalDraftAction) => void
  onSubmit: () => void
  onReject: () => void
  onCancel: () => void
}
/** Controlled production view, also renderable without a live Host for isolated layout tests. */
export function CreatorApprovalView({ prompt, draft, idPrefix, busy = false, error, copy = CREATOR_APPROVAL_COPY.zh, onAction, onSubmit, onReject, onCancel }: CreatorApprovalViewProps): ReactNode {
  const remembering = draft.lifetime === 'remember'
  const reviewing = remembering && draft.phase === 'confirm-remember'
  const titleId = `${idPrefix}-title`
  const summaryId = `${idPrefix}-future`
  return <section className={css.root} aria-labelledby={titleId} aria-busy={busy} data-creator-approval={prompt.id}>
    <header className={css.heading}><h3 id={titleId}>{copy.title}</h3><span className={css.badge}>{copy.operations[prompt.currentOperation]}</span></header>
    <strong className={css.plugin}>{prompt.pluginId}</strong>
    <dl className={css.target}><div><dt>{copy.source}</dt><dd>{prompt.sourceLabel}</dd></div><div><dt>{copy.workspace}</dt><dd>{prompt.workspaceLabel}</dd></div></dl>
    <form onSubmit={event => { event.preventDefault(); if (!busy) onSubmit() }}>
      <fieldset className={css.fieldset} disabled={busy}>
        {reviewing ? <div className={css.confirmation}>
          <h4>{copy.reviewTitle}</h4><p id={summaryId}>{copy.futureVersions}</p>
          <dl className={css.summary}><div><dt>{copy.operationScope}</dt><dd>{draft.operations.map(operation => copy.operations[operation]).join(' · ')}</dd></div>
            <div><dt>{copy.duration}</dt><dd>{draft.rememberDays} {draft.rememberDays === 1 ? copy.day : copy.days}</dd></div></dl>
          <label className={css.acknowledgement}><input type="checkbox" required checked={draft.acknowledged} aria-describedby={summaryId}
            onChange={event => onAction({ type: 'acknowledge', value: event.target.checked })} /><span>{copy.acknowledgement}</span></label>
        </div> : <>
          <fieldset className={css.fieldset}><legend>{copy.scope}</legend><div className={css.lifetimes}>
            {(['once', 'task', 'remember'] as const).map(lifetime => {
              const unavailable = lifetime === 'task' ? !prompt.allowTask : lifetime === 'remember' ? !prompt.allowRemember : false
              return <label key={lifetime} className={css.choice} title={unavailable ? copy.unavailable : undefined}>
                <input type="radio" name={`${idPrefix}-lifetime`} value={lifetime} checked={draft.lifetime === lifetime} disabled={unavailable}
                  onChange={() => onAction({ type: 'lifetime', value: lifetime })} /><span>{copy[lifetime]}</span>
              </label>
            })}
          </div></fieldset>
          <p className={css.hint}>{draft.lifetime === 'once' ? copy.onceHint : draft.lifetime === 'task' ? copy.taskHint : copy.rememberHint}</p>
          {draft.lifetime === 'task' && <p className={css.task}><span>{copy.currentTask}: </span>{prompt.taskLabel}</p>}
          {draft.lifetime !== 'once' && <details className={css.details} open={draft.operationsExpanded}
            onToggle={event => onAction({ type: 'operations-expanded', value: event.currentTarget.open })}>
            <summary>{copy.operationScope} · {draft.operations.length}</summary><div className={css.operations}>
              {prompt.availableOperations.map(operation => <label key={operation}>
                <input type="checkbox" checked={draft.operations.includes(operation)} disabled={operation === prompt.currentOperation}
                  onChange={event => onAction({ type: 'operation', operation, selected: event.target.checked })} />
                <span>{copy.operations[operation]}{operation === prompt.currentOperation && <small> · {copy.current}</small>}</span>
              </label>)}
            </div>
          </details>}
          {remembering && <label className={css.duration}><span>{copy.duration}</span><select value={draft.rememberDays}
            onChange={event => onAction({ type: 'remember-days', value: Number(event.target.value) as CreatorRememberDays })}>
            {([1, 7, 30] as const).map(days => <option value={days} key={days}>{days} {days === 1 ? copy.day : copy.days}</option>)}
          </select></label>}
        </>}
        <div className={css.actions}>
          <button type="button" className={css.secondary} onClick={onReject}>{copy.reject}</button>
          {reviewing && <button type="button" className={css.secondary} onClick={() => onAction({ type: 'back' })}>{copy.back}</button>}
          <button type="submit" className={css.primary} disabled={reviewing && !draft.acknowledged}>{reviewing ? copy.confirmRemember : remembering ? copy.review : copy.allow}</button>
        </div>
      </fieldset>
    </form>
    {busy && <p role="status" className={css.hint}>{copy.settled}</p>}
    {error && <p role="alert" className={css.error}>{error}</p>}
    <footer className={css.footer}><span>{copy.boundary}</span><button type="button" disabled={busy} onClick={onCancel}>{copy.cancel}</button></footer>
    {prompt.reason && <details className={css.details}><summary>{copy.reason}</summary><p className={css.reason}>{prompt.reason}</p></details>}
  </section>
}

/** React unmount from switching Sessions is NOT cancellation; the public pending domain owns its lifetime. */
export function CreatorApprovalCard({ pending, copy = CREATOR_APPROVAL_COPY.zh }: { pending: PendingCreatorApproval; copy?: CreatorApprovalCopy }): ReactNode {
  return <CreatorApprovalFlow key={pending.key} pending={pending} copy={copy} />
}
/** Request replacement must remount draft state even when a consumer omits an outer React key. */
function CreatorApprovalFlow({ pending, copy }: { pending: PendingCreatorApproval; copy: CreatorApprovalCopy }): ReactNode {
  const status = useSyncExternalStore(pending.subscribe, pending.getSnapshot, pending.getSnapshot)
  const [draft, setDraft] = useState(() => createCreatorApprovalDraft(pending.prompt))
  const [failed, setFailed] = useState(false)
  const answer = (result: CreatorApprovalResult): void => {
    setFailed(false)
    void pending.answer(result).catch(() => { setFailed(true) })
  }
  return <CreatorApprovalView prompt={pending.prompt} draft={draft} idPrefix={pending.key} busy={status !== 'pending'} copy={copy}
    {...failed ? { error: copy.settlementFailed } : {}}
    onAction={action => { setFailed(false); setDraft(previous => reduceCreatorApprovalDraft(pending.prompt, previous, action)) }}
    onSubmit={() => {
      if (pending.getSnapshot() !== 'pending') return
      if (draft.lifetime === 'remember' && draft.phase === 'edit') { setDraft(previous => reduceCreatorApprovalDraft(pending.prompt, previous, { type: 'review' })); return }
      const result = creatorApprovalDraftResult(pending.prompt, draft)
      if (result !== undefined) answer(result)
    }} onReject={() => { answer({ decision: 'reject' }) }} onCancel={() => { pending.delegate() }} />
}

/** Preserve the Remote waterfall's opaque next marker; cancellation must still beat a late fallback. */
function awaitCreatorFallback(next: () => Promise<CreatorApprovalResult>, signal?: AbortSignal): Promise<CreatorApprovalResult> {
  if (signal === undefined) return next()
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const abort = (): void => { signal.removeEventListener('abort', abort); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    let answer: Promise<CreatorApprovalResult>
    try { answer = next() } catch (error) { signal.removeEventListener('abort', abort); reject(error); return }
    void Promise.resolve(answer).then(value => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) reject(signal.reason); else resolve(value)
    }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
}

/** One scoped Remote Event handler's lifecycle, without subscribing to any remote event. */
export async function presentCreatorApproval(
  sessionId: SessionId | undefined,
  presentation: CreatorApprovalPresentation,
  next: () => Promise<CreatorApprovalResult>,
  publish: PendingInteractionPublisher<PendingCreatorApproval>,
): Promise<CreatorApprovalResult> {
  if (sessionId === undefined) return awaitCreatorFallback(next, presentation.signal)
  const pending = new PendingCreatorApproval(sessionId, presentation)
  if (pending.getSnapshot() !== 'pending') return pending.result
  let complete!: () => void
  const completed = new Promise<void>(resolve => { complete = resolve })
  let remove: (() => void) | undefined
  try {
    remove = publish(pending, async () => { pending.delegate(); await completed })
    try {
      const result = await pending.result
      presentation.signal?.throwIfAborted()
      return result
    } catch (error) {
      if (pending.isDelegation(error)) return await awaitCreatorFallback(next, presentation.signal)
      throw error
    }
  } catch (error) {
    if (remove === undefined) { pending.abort(error); void pending.result.catch(() => {}) }
    throw error
  } finally { try { remove?.() } finally { complete() } }
}

/** Declare these direct reads plus any public client service the caller's scope resolver reads. */
export const CREATOR_APPROVAL_CLIENT_INJECT = ['uiSession', 'slots'] as const
/** Public client scope lookup signature; never a model/sessionId field or Host SessionStore assertion. */
export type CreatorApprovalScopeResolver = (owner: ClientContext) => SessionId | undefined
export type ScopedCreatorApprovalHandler = (this: ClientContext, presentation: CreatorApprovalPresentation, next: () => Promise<CreatorApprovalResult>) => Promise<CreatorApprovalResult>

/**
 * Opt-in public domain/composer wiring. Returns a scoped handler; does NOT call remote.$on.
 * A mandatory resolver supplied from the real public client scope service avoids the
 * Host/client Context.sessions declaration collision in this mixed package. No runtime
 * copy of the scope module/private Symbol is imported, and no service type is asserted.
 * The caller owns its resolver's public client service injection and shared-module identity.
 * The current Host Remote assembly has a static allowlist and a sole forwarding source.
 * A supported future forwarding extension must be proven before subscribing this handler.
 */
export function registerCreatorApprovalPresentation(ctx: ClientContext, resolveSession: CreatorApprovalScopeResolver, copy: CreatorApprovalCopy = CREATOR_APPROVAL_COPY.zh): ScopedCreatorApprovalHandler {
  if (typeof resolveSession !== 'function') throw new TypeError('Creator approval requires an explicit client scope resolver')
  const publish = ctx.uiSession.registerPendingInteraction<PendingCreatorApproval>(() => 0)
  let active = true
  ctx.effect(() => () => { active = false }, 'Creator 确认界面生命周期')
  ctx.slots.inject('conversation.composer', () => ctx.slots.register({
    name: 'conversation.composer', priority: 2,
    select: ({ pendingInteraction, sessionId }: ComposerChainProps): PendingCreatorApproval | null =>
      pendingInteraction instanceof PendingCreatorApproval && pendingInteraction.sessionId === sessionId ? pendingInteraction : null,
  }, ({ matched }: { matched: PendingCreatorApproval }) => <CreatorApprovalCard key={matched.key} pending={matched} copy={copy} />))
  return async function (presentation, next) {
    if (!active) return awaitCreatorFallback(next, presentation.signal)
    const sessionId = resolveSession(this)
    if (sessionId !== undefined && typeof sessionId !== 'string') {
      void Promise.resolve(sessionId).then(() => {}, () => {})
      throw new TypeError('Creator approval client scope resolver must be synchronous')
    }
    if (!active) return awaitCreatorFallback(next, presentation.signal)
    return presentCreatorApproval(sessionId, presentation, next, publish)
  }
}
