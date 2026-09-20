// @vitest-environment jsdom
/** Real controller + mounted React/DOM and SSR tests; no live WebUI or HTTP/human authentication proof. */
import { readFileSync } from 'node:fs'
import { act, Children, isValidElement, StrictMode } from 'react'
import type { ReactNode, ReactElement, ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { CreatorApprovalView, PendingCreatorApproval } from '../src/client/creator-approval.tsx'
import {
  CreatorConsentController, CreatorConsentCard, CreatorConsentView, CreatorConsentSessionObserver, PendingCreatorConsent,
  CREATOR_CONSENT_TRANSPORT_COPY, CREATOR_CONSENT_TRANSPORT_INJECT, registerCreatorConsentTransport,
} from '../src/client/creator-consent-transport.tsx'
import type { CreatorConsentListItem, CreatorConsentConfirmAck, CreatorConsentDelegateAck, CreatorConsentTransport, CreatorConsentControllerOptions } from '../src/client/creator-consent-transport.tsx'

const SID = 'session-a' as SessionId, OTHER = 'session-b' as SessionId
const ID = 'request-1'
const controllers: CreatorConsentController[] = []
function listed(id = ID, expiresAt = 100_000): CreatorConsentListItem {
  return { prompt: { protocol: 1, id, pluginId: 'sample-plugin', sourceLabel: '/safe/plugin', workspaceLabel: '/safe/workspace',
    currentOperation: 'hot-reload', availableOperations: ['check', 'hot-reload'], allowTask: true, allowRemember: true, taskLabel: 'Host task' }, expiresAt }
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((done, failed) => { resolve = done; reject = failed }); return { promise, resolve, reject } }
async function flush() { for (let count = 0; count < 12; count += 1) await Promise.resolve() }
function elements(node: ReactNode): Array<ReactElement<any>> {
  return Children.toArray(node).flatMap(child => isValidElement<{ children?: ReactNode }>(child) ? [child, ...elements(child.props.children)] : [])
}
function rig(options: Partial<Omit<CreatorConsentControllerOptions, 'transport' | 'publish'>> = {}) {
  const rows = new Map<SessionId, CreatorConsentListItem[]>([[SID, [listed()]], [OTHER, [listed('request-2')]]])
  const transport = {
    list: vi.fn(async (session: SessionId, _signal: AbortSignal) => rows.get(session) ?? []),
    present: vi.fn(async (id: string, session: SessionId, _signal: AbortSignal) => ({ ...rows.get(session)!.find(row => row.prompt.id === id)!, viewNonce: `nonce:${id}` })),
    confirm: vi.fn(async (input: Parameters<CreatorConsentTransport['confirm']>[0], _signal: AbortSignal): Promise<CreatorConsentConfirmAck> => ({ id: input.id, status: 'accepted' })),
    delegate: vi.fn(async (input: Parameters<CreatorConsentTransport['delegate']>[0], _signal: AbortSignal): Promise<CreatorConsentDelegateAck> => ({ id: input.id, status: 'delegated' })),
  }
  const published: PendingCreatorConsent[] = [], removed = vi.fn(), cleanups: Array<() => Promise<void>> = []
  const publish = vi.fn((pending: PendingCreatorConsent, teardown: () => Promise<void>) => { published.push(pending); cleanups.push(teardown); return () => { removed(pending.key) } })
  const controller = new CreatorConsentController({ transport, publish, pollMs: 30_000, requestTimeoutMs: 50, ...options })
  controllers.push(controller)
  return { controller, rows, transport, published, removed, cleanups, publish }
}
async function ready(h = rig()) {
  const release = h.controller.observeSession(SID)
  await h.controller.pollNow()
  expect(await h.controller.ensurePresented(ID)).toBe(true)
  return { ...h, release, pending: h.controller.snapshot(ID)!.pending }
}
const mounted: Array<{ root: Root; container: HTMLDivElement }> = []
function domRoot() {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container), pair = { root, container }; mounted.push(pair); return pair
}
function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(element => element.textContent === text)
  if (found === undefined) throw new Error(`Missing button: ${text}`)
  return found
}
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.setSystemTime(1_000); vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No HTTP adapter exists in these tests')) })
afterEach(async () => {
  await act(async () => { for (const { root, container } of mounted.splice(0)) { root.unmount(); container.remove() } })
  controllers.splice(0).forEach(controller => controller.dispose())
  await flush()
  expect(vi.getTimerCount()).toBe(0)
  expect(globalThis.fetch).not.toHaveBeenCalled()
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

describe('Public compositor observation and root-owned lifetime', () => {
  it('does not poll without a real observed Session, and SSR observation has no render-time side effects', async () => {
    const h = rig()
    await h.controller.pollNow()
    expect(h.transport.list).not.toHaveBeenCalled()
    expect(renderToStaticMarkup(<CreatorConsentSessionObserver sessionId={SID} controller={h.controller} />)).toBe('')
    expect(h.transport.list).not.toHaveBeenCalled()
  })
  it('discovers only through the selected Session and does not present before the card asks', async () => {
    const h = rig(); h.controller.observeSession(SID)
    await h.controller.pollNow()
    expect(h.transport.list).toHaveBeenCalledWith(SID, expect.any(AbortSignal))
    expect(h.controller.snapshot(ID)!.phase).toBe('discovered')
    expect(h.transport.present).not.toHaveBeenCalled()
    expect(h.controller.snapshot('request-2')).toBeUndefined()
    expect(h.published).toHaveLength(1)
  })
  it('only presents once across ordinary polling and duplicate mount/effect calls', async () => {
    const h = await ready()
    await h.controller.pollNow(); await h.controller.pollNow()
    await Promise.all([h.controller.ensurePresented(ID), h.controller.ensurePresented(ID)])
    expect(h.transport.present).toHaveBeenCalledOnce()
  })
  it('retains draft and pending through view/Session changes, never copies them into another request', async () => {
    const h = await ready()
    h.controller.change(ID, { type: 'lifetime', value: 'remember' })
    h.release()
    const releaseOther = h.controller.observeSession(OTHER)
    await h.controller.pollNow()
    expect(h.controller.snapshot(ID)!.draft.lifetime).toBe('remember')
    expect(h.controller.snapshot('request-2')!.draft.lifetime).toBe('once')
    expect(h.controller.snapshot('request-2')!.pending.key).not.toBe(h.pending.key)
    expect(h.transport.delegate).not.toHaveBeenCalled()
    expect(h.removed).not.toHaveBeenCalled()
    releaseOther(); h.controller.observeSession(SID)
    await h.controller.pollNow(); await h.controller.ensurePresented(ID)
    expect(h.transport.present).toHaveBeenCalledTimes(1)
  })
  it('ignores late discovery after the observation leaves, rather than opening hidden new prompts', async () => {
    const h = rig(), list = deferred<CreatorConsentListItem[]>()
    h.transport.list.mockReturnValueOnce(list.promise)
    const release = h.controller.observeSession(SID), poll = h.controller.pollNow()
    await flush(); release(); list.resolve([listed()]); await poll
    expect(h.published).toHaveLength(0)
    expect(h.transport.present).not.toHaveBeenCalled()
  })
  it('deduplicates concurrent poll calls and bounds a noncooperative list request', async () => {
    const h = rig(); h.controller.observeSession(SID)
    h.transport.list.mockImplementationOnce(() => new Promise(() => {}))
    const first = h.controller.pollNow(), second = h.controller.pollNow()
    expect(second).toBe(first)
    await flush(); expect(h.transport.list).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(50); await first
    expect(h.controller.health().connection).toBe('unavailable')
  })
  it('synchronous teardown during publication removes the just-returned publisher and starts no orphan timers', async () => {
    const h = rig(), remove = vi.fn()
    const controller = new CreatorConsentController({ transport: h.transport, publish: (_pending, teardown) => { void teardown(); return remove } })
    controllers.push(controller); controller.observeSession(SID); await controller.pollNow()
    expect(controller.health()).toMatchObject({ closed: true, connection: 'closed', known: 0 })
    expect(remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(h.transport.present).not.toHaveBeenCalled()
  })
  it('an end-state observer may dispose the plugin without a late notice timer surviving teardown', async () => {
    const h = await ready()
    h.controller.subscribe(() => { if (h.controller.snapshot(ID)?.phase === 'ended') h.controller.dispose() })
    h.rows.set(SID, []); await h.controller.pollNow()
    expect(h.controller.health()).toMatchObject({ closed: true, connection: 'closed' })
    expect(vi.getTimerCount()).toBe(0)
    expect(h.transport.delegate).not.toHaveBeenCalled()
  })
  it('root/publisher teardown closes only local work, never invokes the server delegate endpoint', async () => {
    const h = await ready(), ended = h.pending.result.catch(error => error)
    await h.cleanups[0]!()
    expect(await ended).toMatchObject({ name: 'AbortError' }) // DOMException belongs to the browser realm, not Node's Error class.
    expect(h.controller.health().closed).toBe(true)
    expect(h.removed).toHaveBeenCalledOnce()
    expect(h.transport.delegate).not.toHaveBeenCalled()
    await h.controller.pollNow()
    expect(await h.controller.submit(ID)).toBe(false)
  })
})

describe('A matching server ACK must precede any local answer', () => {
  it('once remains unsettled while confirm waits, then settles exactly once after ACK', async () => {
    const h = await ready(), server = deferred<CreatorConsentConfirmAck>(), answer = vi.fn(), failed = vi.fn()
    void h.pending.result.then(answer, failed)
    h.transport.confirm.mockReturnValueOnce(server.promise)
    const work = h.controller.submit(ID)
    await flush()
    expect(h.controller.snapshot(ID)!.phase).toBe('confirming')
    expect(answer).not.toHaveBeenCalled(); expect(h.removed).not.toHaveBeenCalled()
    expect(h.transport.confirm).toHaveBeenCalledWith({ id: ID, viewNonce: `nonce:${ID}`, answer: { decision: 'allow', lifetime: 'once', operations: ['hot-reload'] } }, expect.any(AbortSignal))
    server.resolve({ id: ID, status: 'accepted' }); expect(await work).toBe(true)
    expect(answer).toHaveBeenCalledOnce(); expect(failed).not.toHaveBeenCalled()
    expect(h.removed).toHaveBeenCalledOnce()
    expect(await h.controller.submit(ID)).toBe(false)
    await h.controller.pollNow()
    expect(h.transport.present).toHaveBeenCalledOnce()
    expect(h.published).toHaveLength(1)
  })
  it('remember requires review and explicit acknowledgement, and still waits for server ACK', async () => {
    const h = await ready(), server = deferred<CreatorConsentConfirmAck>(), answer = vi.fn()
    void h.pending.result.then(answer, () => {})
    h.controller.change(ID, { type: 'lifetime', value: 'remember' })
    h.controller.change(ID, { type: 'remember-days', value: 7 })
    expect(await h.controller.submit(ID)).toBe(false)
    expect(h.controller.snapshot(ID)!.draft.phase).toBe('confirm-remember')
    expect(await h.controller.submit(ID)).toBe(false)
    expect(h.transport.confirm).not.toHaveBeenCalled()
    h.controller.change(ID, { type: 'acknowledge', value: true })
    h.transport.confirm.mockReturnValueOnce(server.promise)
    const work = h.controller.submit(ID); await flush()
    expect(answer).not.toHaveBeenCalled()
    expect(h.transport.confirm.mock.calls[0]![0].answer).toEqual({ decision: 'allow', lifetime: 'remember', operations: ['hot-reload'], rememberDays: 7 })
    server.resolve({ id: ID, status: 'accepted' }); expect(await work).toBe(true)
    expect(answer).toHaveBeenCalledOnce()
  })
  it.each([{ id: 'wrong-id', status: 'accepted' }, { id: ID, status: 'saved' }, { id: ID, status: 'accepted', sourceVerified: true }, 'allowed-once'])('does not settle on malformed ACK %j', reply => {
    return (async () => {
      const h = await ready(), answer = vi.fn(); void h.pending.result.then(answer, () => {})
      h.transport.confirm.mockResolvedValueOnce(reply as CreatorConsentConfirmAck)
      expect(await h.controller.submit(ID)).toBe(false)
      expect(h.controller.snapshot(ID)!.phase).toBe('unknown')
      expect(answer).not.toHaveBeenCalled(); expect(h.removed).not.toHaveBeenCalled()
    })()
  })
  it('does not mistake disappearance from pending list for rejection or lost confirmation', async () => {
    const h = await ready(), server = deferred<CreatorConsentConfirmAck>(), answer = vi.fn()
    void h.pending.result.then(answer, () => {}); h.transport.confirm.mockReturnValueOnce(server.promise)
    const work = h.controller.submit(ID); await flush()
    h.rows.set(SID, []); await h.controller.pollNow()
    expect(h.controller.snapshot(ID)).toMatchObject({ phase: 'confirming', listed: false })
    expect(answer).not.toHaveBeenCalled()
    const html = renderToStaticMarkup(<CreatorConsentCard pending={h.pending} controller={h.controller} />)
    expect(html).toContain(CREATOR_CONSENT_TRANSPORT_COPY.zh.disappeared)
    server.resolve({ id: ID, status: 'accepted' }); expect(await work).toBe(true)
    expect(answer).toHaveBeenCalledOnce()
  })
  it('unknown confirm failure locks the intent and retries exactly the same id/nonce/answer', async () => {
    const h = await ready(), answer = vi.fn(); void h.pending.result.then(answer, () => {})
    h.transport.confirm.mockRejectedValueOnce(new Error('HTTP response lost; may have committed'))
    expect(await h.controller.submit(ID)).toBe(false)
    const original = h.transport.confirm.mock.calls[0]![0]
    h.controller.change(ID, { type: 'lifetime', value: 'remember' })
    expect(h.controller.snapshot(ID)!.draft.lifetime).toBe('once')
    expect(await h.controller.reject(ID)).toBe(false); expect(await h.controller.delegate(ID)).toBe(false)
    h.rows.set(SID, []); await h.controller.pollNow()
    expect(h.controller.snapshot(ID)).toMatchObject({ phase: 'unknown', listed: false, canRetry: true })
    h.transport.confirm.mockResolvedValueOnce({ id: ID, status: 'duplicate' })
    expect(await h.controller.retry(ID)).toBe(true)
    expect(h.transport.confirm.mock.calls[1]![0]).toEqual(original)
    expect(answer).toHaveBeenCalledOnce()
    expect(h.transport.present).toHaveBeenCalledOnce()
  })
  it('discards a timed-out response even when its transport ignores abort and resolves late', async () => {
    const h = await ready(), server = deferred<CreatorConsentConfirmAck>(), answer = vi.fn(); void h.pending.result.then(answer, () => {})
    h.transport.confirm.mockReturnValueOnce(server.promise)
    const work = h.controller.submit(ID); await flush()
    await vi.advanceTimersByTimeAsync(50); expect(await work).toBe(false)
    server.resolve({ id: ID, status: 'accepted' }); await flush()
    expect(h.controller.snapshot(ID)!.phase).toBe('unknown')
    expect(answer).not.toHaveBeenCalled()
  })
  it('external abort/unload wins over an outstanding ACK', async () => {
    const signal = new AbortController(), h = await ready(rig({ signal: signal.signal })), server = deferred<CreatorConsentConfirmAck>(), answer = vi.fn()
    void h.pending.result.then(answer, () => {}); h.transport.confirm.mockReturnValueOnce(server.promise)
    const work = h.controller.submit(ID); await flush(); signal.abort()
    expect(await work).toBe(false)
    server.resolve({ id: ID, status: 'accepted' }); await flush()
    expect(answer).not.toHaveBeenCalled(); expect(h.transport.delegate).not.toHaveBeenCalled()
  })
  it('typed delegate carries the nonce and only delegates locally after its ACK', async () => {
    const h = await ready(), server = deferred<CreatorConsentDelegateAck>(), settled = vi.fn(), failed = vi.fn()
    void h.pending.result.then(settled, failed); h.transport.delegate.mockReturnValueOnce(server.promise)
    const work = h.controller.delegate(ID); await flush()
    expect(failed).not.toHaveBeenCalled(); expect(h.removed).not.toHaveBeenCalled()
    expect(h.transport.delegate).toHaveBeenCalledWith({ id: ID, viewNonce: `nonce:${ID}` }, expect.any(AbortSignal))
    server.resolve({ id: ID, status: 'delegated' }); expect(await work).toBe(true)
    expect(typeof failed.mock.calls[0]![0]).toBe('symbol')
    expect(settled).not.toHaveBeenCalled(); expect(h.transport.confirm).not.toHaveBeenCalled()
  })
  it('delegate failure stays unknown; a retry is still the same nonce, not an unprotected cancel', async () => {
    const h = await ready(), failed = vi.fn(); void h.pending.result.then(() => {}, failed)
    h.transport.delegate.mockRejectedValueOnce(new Error('no ACK'))
    expect(await h.controller.delegate(ID)).toBe(false)
    expect(failed).not.toHaveBeenCalled()
    h.transport.delegate.mockResolvedValueOnce({ id: ID, status: 'duplicate' })
    expect(await h.controller.retry(ID)).toBe(true)
    expect(h.transport.delegate.mock.calls[1]![0]).toEqual(h.transport.delegate.mock.calls[0]![0])
    expect(failed).toHaveBeenCalledOnce()
  })
})

describe('Protocol conflicts, expiry, bounded memory and truthful views', () => {
  it('failed present is not retried by polling, remounts or confirmation actions', async () => {
    const h = rig(); h.controller.observeSession(SID); await h.controller.pollNow()
    h.transport.present.mockRejectedValueOnce(new Error('view reply lost'))
    expect(await h.controller.ensurePresented(ID)).toBe(false)
    await h.controller.pollNow(); await h.controller.ensurePresented(ID)
    expect(h.transport.present).toHaveBeenCalledOnce()
    expect(await h.controller.submit(ID)).toBe(false)
    expect(await h.controller.retry(ID)).toBe(false)
    expect(h.transport.confirm).not.toHaveBeenCalled()
    h.controller.dismiss(ID); await h.controller.pollNow()
    expect(h.published).toHaveLength(1)
  })
  it('same request id cannot silently change its prompt, expiry or Session', async () => {
    const h = await ready()
    h.rows.set(SID, [{ ...listed(), prompt: { ...listed().prompt, pluginId: 'different-plugin' } }])
    await h.controller.pollNow()
    expect(h.controller.snapshot(ID)!.phase).toBe('ended')
    expect(await h.controller.submit(ID)).toBe(false)
    h.rows.set(SID, [listed()]); await h.controller.pollNow(); await h.controller.ensurePresented(ID)
    expect(h.transport.present).toHaveBeenCalledOnce()
  })
  it('mismatched present response does not yield an actionable view or another present', async () => {
    const h = rig(); h.controller.observeSession(SID); await h.controller.pollNow()
    h.transport.present.mockResolvedValueOnce({ ...listed('wrong-request'), viewNonce: 'not-for-this-request' })
    expect(await h.controller.ensurePresented(ID)).toBe(false)
    expect(h.controller.snapshot(ID)!.phase).toBe('unknown')
    expect(await h.controller.submit(ID)).toBe(false)
  })
  it('a disappearing unanswered request is shown as ended/unknown, never answered as rejected', async () => {
    const h = await ready(), answer = vi.fn(); void h.pending.result.then(answer, () => {})
    h.rows.set(SID, []); await h.controller.pollNow()
    expect(h.controller.snapshot(ID)!.phase).toBe('ended')
    expect(renderToStaticMarkup(<CreatorConsentCard pending={h.pending} controller={h.controller} />)).toContain(CREATOR_CONSENT_TRANSPORT_COPY.zh.ended)
    expect(answer).not.toHaveBeenCalled(); expect(h.transport.confirm).not.toHaveBeenCalled()
    h.controller.dismiss(ID); expect(h.removed).toHaveBeenCalledOnce()
    expect(h.transport.delegate).not.toHaveBeenCalled()
  })
  it('TTL terminates actions/network even with a hung request and bounded notices expire', async () => {
    const h = rig({ requestTimeoutMs: 1_000 }); h.rows.set(SID, [listed(ID, 1_020)])
    const r = await ready(h), server = deferred<CreatorConsentConfirmAck>(), answer = vi.fn()
    void r.pending.result.then(answer, () => {}); h.transport.confirm.mockReturnValueOnce(server.promise)
    const work = h.controller.submit(ID); await flush(); await vi.advanceTimersByTimeAsync(20)
    expect(await work).toBe(false)
    expect(h.controller.snapshot(ID)!.phase).toBe('ended')
    server.resolve({ id: ID, status: 'accepted' }); await flush(); expect(answer).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(h.controller.snapshot(ID)).toBeUndefined()
    expect(await h.controller.submit(ID)).toBe(false)
  })
  it('a frozen injected clock cannot retain expired notices forever or recycle an acknowledged id', async () => {
    const h = rig({ now: () => 1_000 }); h.rows.set(SID, [listed(ID, 1_020)])
    await ready(h); await h.controller.submit(ID)
    await vi.advanceTimersByTimeAsync(20)
    expect(h.controller.health()).toMatchObject({ closed: true, known: 0 })
    await h.controller.pollNow()
    expect(h.transport.present).toHaveBeenCalledOnce()
  })
  it('a clock callback exception closes the controller instead of leaving usable pending work', async () => {
    let fail = false
    const h = await ready(rig({ now: () => { if (fail) throw new Error('clock source failed'); return 1_000 } }))
    fail = true
    expect(await h.controller.submit(ID)).toBe(false)
    expect(h.controller.health().closed).toBe(true)
    expect(h.transport.confirm).not.toHaveBeenCalled()
  })
  it.each([NaN, 999])('local invalid/rolled-back clock %s fails closed before submitting', async now => {
    let clock = 1_000
    const h = await ready(rig({ now: () => clock })); clock = now
    expect(await h.controller.submit(ID)).toBe(false)
    expect(h.controller.health().closed).toBe(true)
    expect(h.transport.confirm).not.toHaveBeenCalled()
  })
  it('retains bounded tombstones rather than evicting ids early and presenting them twice', async () => {
    const h = rig({ maxPending: 2 }); h.rows.set(SID, [listed(), listed('request-2'), listed('request-3')])
    h.controller.observeSession(SID); await h.controller.pollNow()
    expect(h.controller.health()).toMatchObject({ known: 2, connection: 'capacity' })
    await h.controller.ensurePresented(ID); await h.controller.submit(ID); await h.controller.pollNow()
    expect(h.published).toHaveLength(2)
    expect(h.transport.present).toHaveBeenCalledOnce()
  })
  it('rejects malformed/oversized list data and never publishes authority-shaped extras', async () => {
    const h = rig(); h.controller.observeSession(SID)
    h.transport.list.mockResolvedValueOnce(Array.from({ length: 65 }, (_, index) => listed(`id-${index}`)))
    await h.controller.pollNow(); expect(h.published).toHaveLength(0)
    h.transport.list.mockResolvedValueOnce([{ ...listed(), owner: 'fake', token: 'fake' }] as CreatorConsentListItem[])
    await h.controller.pollNow(); expect(h.published).toHaveLength(0)
    h.transport.list.mockResolvedValueOnce([listed(), listed()])
    await h.controller.pollNow(); expect(h.published).toHaveLength(0)
  })
  it('actual view callbacks use the controller, never PendingCreatorApproval.answer directly', async () => {
    const h = await ready(), server = deferred<CreatorConsentConfirmAck>(); h.transport.confirm.mockReturnValueOnce(server.promise)
    const submit = vi.spyOn(h.controller, 'submit')
    const rendered = CreatorConsentView({ snapshot: h.controller.snapshot(ID)!, controller: h.controller })
    const view = elements(rendered).find(element => element.type === CreatorApprovalView)!
    view.props.onSubmit(); await flush()
    expect(submit).toHaveBeenCalledWith(ID)
    expect(h.controller.snapshot(ID)!.phase).toBe('confirming')
    const html = renderToStaticMarkup(<CreatorConsentCard pending={h.pending} controller={h.controller} />)
    expect(html).toContain(CREATOR_CONSENT_TRANSPORT_COPY.zh.waiting)
    expect(html).not.toContain('此请求已结束')
    server.resolve({ id: ID, status: 'accepted' }); await submit.mock.results[0]!.value
  })
  it('unknown English/Chinese UI makes no save/rejection/execution claim', async () => {
    const h = await ready(); h.transport.confirm.mockRejectedValueOnce(new Error('no ACK')); await h.controller.submit(ID)
    const zh = renderToStaticMarkup(<CreatorConsentCard pending={h.pending} controller={h.controller} />)
    const en = renderToStaticMarkup(<CreatorConsentCard pending={h.pending} controller={h.controller} locale="en" />)
    expect(zh).toContain(CREATOR_CONSENT_TRANSPORT_COPY.zh.unknown)
    expect(en).toContain(CREATOR_CONSENT_TRANSPORT_COPY.en.unknown)
    expect(zh).not.toContain('保存成功')
    expect(zh).toContain(CREATOR_CONSENT_TRANSPORT_COPY.zh.retry)
    expect(zh).toContain(CREATOR_CONSENT_TRANSPORT_COPY.zh.dismiss)
  })
})

describe('Mounted real React components with a simulated DOM (not live HTTP)', () => {
  it('mount effects discover and present once under StrictMode; actual remember clicks await ACK across view unmount', async () => {
    const h = rig(), { root, container } = domRoot()
    await act(async () => { root.render(<StrictMode><CreatorConsentSessionObserver sessionId={SID} controller={h.controller} /></StrictMode>) })
    expect(h.controller.health().observations).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const pending = h.controller.snapshot(ID)!.pending
    expect(h.transport.list).toHaveBeenCalledWith(SID, expect.any(AbortSignal))
    expect(h.transport.present).not.toHaveBeenCalled()
    await act(async () => { root.render(<StrictMode><CreatorConsentSessionObserver sessionId={SID} controller={h.controller} /><CreatorConsentCard pending={pending} controller={h.controller} locale="en" /></StrictMode>) })
    expect(h.controller.snapshot(ID)!.phase).toBe('ready')
    expect(h.transport.present).toHaveBeenCalledOnce()
    await act(async () => { container.querySelector<HTMLInputElement>('input[value="remember"]')!.click() })
    await act(async () => { button(container, 'Review remembered scope').click() })
    expect(button(container, 'Remember and allow').disabled).toBe(true)
    expect(h.transport.confirm).not.toHaveBeenCalled()
    await act(async () => { container.querySelector<HTMLInputElement>('input[type="checkbox"][required]')!.click() })
    const server = deferred<CreatorConsentConfirmAck>(), answered = vi.fn()
    void pending.result.then(answered, () => {})
    h.transport.confirm.mockReturnValueOnce(server.promise)
    await act(async () => { button(container, 'Remember and allow').click(); await flush() })
    expect(h.controller.snapshot(ID)!.phase).toBe('confirming')
    expect(answered).not.toHaveBeenCalled()
    expect(container.textContent).toContain(CREATOR_CONSENT_TRANSPORT_COPY.en.waiting)
    expect(h.transport.confirm.mock.calls[0]![0].answer).toMatchObject({ decision: 'allow', lifetime: 'remember' })
    await act(async () => { root.render(<CreatorConsentSessionObserver sessionId={OTHER} controller={h.controller} />) })
    expect(h.controller.health().observations).toBe(1)
    expect(h.transport.confirm.mock.calls[0]![1].aborted).toBe(false)
    expect(h.removed).not.toHaveBeenCalled(); expect(h.transport.delegate).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(h.controller.snapshot('request-2')!.draft.lifetime).toBe('once')
    await act(async () => { server.resolve({ id: ID, status: 'accepted' }); await flush() })
    expect(answered).toHaveBeenCalledOnce()
    expect(h.removed).toHaveBeenCalledOnce()
    expect(h.transport.present).toHaveBeenCalledOnce()
  })
  it('a mounted failure view offers only same-submit retry/dismiss; actual plugin disposal drops the late ACK', async () => {
    const h = await ready(), { root, container } = domRoot(), late = deferred<CreatorConsentConfirmAck>(), answered = vi.fn()
    void h.pending.result.then(answered, () => {})
    await act(async () => { root.render(<CreatorConsentCard pending={h.pending} controller={h.controller} locale="en" />) })
    h.transport.confirm.mockRejectedValueOnce(new Error('unacknowledged HTTP'))
    await act(async () => { button(container, 'Allow').click(); await flush() })
    expect(container.textContent).toContain(CREATOR_CONSENT_TRANSPORT_COPY.en.unknown)
    expect(container.querySelector('fieldset')!.disabled).toBe(true)
    h.transport.confirm.mockReturnValueOnce(late.promise)
    await act(async () => { button(container, 'Retry the same submission').click(); await flush() })
    await act(async () => { h.controller.dispose(); late.resolve({ id: ID, status: 'accepted' }); await flush() })
    expect(answered).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
    expect(h.transport.confirm.mock.calls[1]![0]).toEqual(h.transport.confirm.mock.calls[0]![0])
  })
})

describe('Exact public slot registration; no fabricated chain middleware', () => {
  it('uses resident overlay observation + pure own-pending election, without sessions/Remote/shell access', async () => {
    const h = rig(), registrations: Array<{ config: any; component: ComponentType<any> }> = [], disposers: Array<() => void> = []
    const ctx = {
      uiSession: { registerPendingInteraction: vi.fn(() => h.publish) },
      slots: { inject: vi.fn((_slot: string, setup: () => unknown) => setup()), register: vi.fn((config: any, component: ComponentType<any>) => { registrations.push({ config, component }); return () => {} }) },
      effect: (setup: () => () => void) => { disposers.push(setup()) },
      get sessions() { throw new Error('Mixed Context.sessions must not be read') },
      get remote() { throw new Error('Native approval/Remote stream must not be intercepted') },
    } as unknown as Context
    const controller = registerCreatorConsentTransport(ctx, h.transport, { pollMs: 30_000 }); controllers.push(controller)
    expect(CREATOR_CONSENT_TRANSPORT_INJECT).toEqual(['uiSession', 'slots'])
    expect(registrations.map(value => value.config.name)).toEqual(['conversation.input.overlay', 'conversation.composer'])
    const observer = registrations[0]!, elected = registrations[1]!
    expect(observer.config.select).toBeUndefined()
    const Observer = observer.component
    expect(renderToStaticMarkup(<Observer sessionId={SID} />)).toBe('')
    expect(h.transport.list).not.toHaveBeenCalled()
    controller.observeSession(SID); await controller.pollNow()
    const pending = controller.snapshot(ID)!.pending
    expect(elected.config.select({ sessionId: SID, pendingInteraction: pending })).toBe(pending)
    expect(elected.config.select({ sessionId: OTHER, pendingInteraction: pending })).toBe(null)
    const legacy = new PendingCreatorApproval(SID, { prompt: listed().prompt }); void legacy.result.catch(() => {})
    expect(elected.config.select({ sessionId: SID, pendingInteraction: legacy })).toBe(null); legacy.delegate()
    const foreign = await ready()
    expect(elected.config.select({ sessionId: SID, pendingInteraction: foreign.pending })).toBe(null)
    const count = h.transport.list.mock.calls.length
    for (let index = 0; index < 3; index += 1) elected.config.select({ sessionId: SID, pendingInteraction: pending })
    expect(h.transport.list).toHaveBeenCalledTimes(count)
    const Card = elected.component
    expect(renderToStaticMarkup(<Card matched={pending} />)).toContain('Creator+')
    expect(h.transport.present).not.toHaveBeenCalled() // SSR is not mount-effect or live UI proof.
    disposers.forEach(dispose => dispose()); expect(controller.health().closed).toBe(true)
    expect(h.transport.delegate).not.toHaveBeenCalled()
  })
  it('contains no fabricated endpoint, Host registry route, composer replacement or native listener', () => {
    const source = readFileSync('src/client/creator-consent-transport.tsx', 'utf8') // Vitest's jsdom import.meta URL is HTTP, not a filesystem URL.
    for (const forbidden of ['fetch(', 'http://', "name: 'conversation.composer.bar'", "$on('approval/request'", 'registerRemoteEvents(', "from '../creator-consent.ts'"]) expect(source).not.toContain(forbidden)
    expect(source).toContain("name: 'conversation.input.overlay'")
    expect(source).toContain('useEffect(() => controller.observeSession(sessionId)')
  })
})
