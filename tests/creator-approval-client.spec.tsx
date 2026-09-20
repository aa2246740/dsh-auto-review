/** Actual components in isolated SSR; pure interaction-state and pending timing tests, NOT live WebUI proof. */
import { readFileSync } from 'node:fs'
import { Children, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CreatorApprovalPrompt, CreatorApprovalResult } from '../src/creator-approval-contract.ts'
import { parseCreatorApprovalPrompt, parseCreatorApprovalResult } from '../src/creator-approval-contract.ts'
import {
  PendingCreatorApproval, CreatorApprovalCard, CreatorApprovalView, CREATOR_APPROVAL_COPY, CREATOR_APPROVAL_CLIENT_INJECT,
  createCreatorApprovalDraft, reduceCreatorApprovalDraft, creatorApprovalDraftResult, presentCreatorApproval, registerCreatorApprovalPresentation,
} from '../src/client/creator-approval.tsx'
import type { CreatorApprovalDraft, CreatorApprovalDraftAction, CreatorApprovalViewProps } from '../src/client/creator-approval.tsx'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION = 'creator-session' as SessionId
const ONCE: CreatorApprovalResult = { decision: 'allow', lifetime: 'once', operations: ['hot-reload'] }
const REJECT: CreatorApprovalResult = { decision: 'reject' }
const COPY = CREATOR_APPROVAL_COPY.zh
function prompt(patch: Partial<CreatorApprovalPrompt> = {}): CreatorApprovalPrompt {
  return { protocol: 1, id: 'host-prompt-1', pluginId: 'sample-plugin', sourceLabel: '/workspace/sample-plugin', workspaceLabel: '/workspace',
    currentOperation: 'hot-reload', availableOperations: ['check', 'activation-plan', 'hot-reload', 'activate-new-client'], allowTask: true, allowRemember: true, taskLabel: '修复当前插件', ...patch }
}
const pendingValues: PendingCreatorApproval[] = []
function pending(source = prompt(), signal?: AbortSignal): PendingCreatorApproval {
  const value = new PendingCreatorApproval(SESSION, { prompt: source, ...(signal === undefined ? {} : { signal }) })
  void value.result.catch(() => {})
  pendingValues.push(value)
  return value
}
function transition(source: CreatorApprovalPrompt, ...actions: CreatorApprovalDraftAction[]): CreatorApprovalDraft {
  return actions.reduce((state, action) => reduceCreatorApprovalDraft(source, state, action), createCreatorApprovalDraft(source))
}
function props(source = prompt(), draft = createCreatorApprovalDraft(source)): CreatorApprovalViewProps {
  return { prompt: source, draft, idPrefix: 'fixture', copy: COPY, onAction: vi.fn(), onSubmit: vi.fn(), onReject: vi.fn(), onCancel: vi.fn() }
}
function elements(node: ReactNode): Array<ReactElement<any>> {
  return Children.toArray(node).flatMap(child => isValidElement<{ children?: ReactNode }>(child) ? [child, ...elements(child.props.children)] : [])
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No HTTP calls are permitted in this UI unit test')) })
afterEach(() => {
  pendingValues.splice(0).forEach(value => value.delegate())
  expect(globalThis.fetch).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('Creator confirmation JSON-only contracts', () => {
  it('detaches prompt data and preserves only the specified display fields', () => {
    const source = prompt(), copy = parseCreatorApprovalPrompt(source)
    source.availableOperations.length = 0
    expect(copy.availableOperations).toHaveLength(4)
    expect(copy).not.toHaveProperty('signal')
    expect(copy).not.toHaveProperty('agent')
  })
  it.each(['binding', 'token', 'agent', 'sessionId', 'sourceVerified', 'signal', 'artifactDigest'])('rejects extra prompt authority field %s', key => {
    expect(() => parseCreatorApprovalPrompt({ ...prompt(), [key]: 'forged' })).toThrow(TypeError)
  })
  it.each([
    { protocol: 2 }, { id: '' }, { pluginId: '*' }, { sourceLabel: '' }, { taskLabel: 'x'.repeat(161) },
    { availableOperations: [] }, { availableOperations: ['check'] }, { availableOperations: ['hot-reload', 'hot-reload'] },
    { availableOperations: ['hot-reload', 'bash'] }, { allowTask: 'true' }, { allowRemember: null },
  ])('rejects malformed prompt %j', patch => { expect(() => parseCreatorApprovalPrompt({ ...prompt(), ...patch })).toThrow(TypeError) })
  it('rejects accessors without invoking them', () => {
    const value = prompt(), getter = vi.fn()
    Object.defineProperty(value, 'sourceLabel', { enumerable: true, get: getter })
    expect(() => parseCreatorApprovalPrompt(value)).toThrow(TypeError)
    expect(getter).not.toHaveBeenCalled()
  })
  it.each(['allowed-once', { decision: 'allow' }, { outcome: 'allow', source: 'model' }, { decision: 'reject', lifetime: 'remember' },
    { ...ONCE, token: 'fake' }, { ...ONCE, binding: {} }, { ...ONCE, rememberDays: 1 }, { ...ONCE, operations: ['hot-reload', 'check'] },
    { decision: 'allow', lifetime: 'task', operations: ['check'] }, { decision: 'allow', lifetime: 'remember', operations: ['hot-reload'] },
    { decision: 'allow', lifetime: 'remember', operations: ['hot-reload'], rememberDays: '7' },
    { decision: 'allow', lifetime: 'remember', operations: ['hot-reload'], rememberDays: 31 },
  ])('never converts native/AI/expanded result %j into this protocol', value => {
    expect(() => parseCreatorApprovalResult(value, prompt())).toThrow(TypeError)
  })
  it.each([1, 7, 30] as const)('accepts only explicit remember duration %s', rememberDays => {
    const result = { decision: 'allow', lifetime: 'remember', operations: ['hot-reload'], rememberDays } as const
    expect(parseCreatorApprovalResult(result, prompt())).toEqual(result)
  })
  it.each(['task', 'remember'] as const)('cannot opt into unavailable %s lifetime', lifetime => {
    expect(() => parseCreatorApprovalResult({ decision: 'allow', lifetime, operations: ['hot-reload'], ...(lifetime === 'remember' ? { rememberDays: 1 } : {}) }, prompt({ allowTask: false, allowRemember: false }))).toThrow(TypeError)
  })
  it('does not coerce object-valued rememberDays or execute its valueOf', () => {
    const valueOf = vi.fn(() => 7)
    expect(() => parseCreatorApprovalResult({ decision: 'allow', lifetime: 'remember', operations: ['hot-reload'], rememberDays: { valueOf } }, prompt())).toThrow(TypeError)
    expect(valueOf).not.toHaveBeenCalled()
  })
})

describe('Creator confirmation interaction-state helpers', () => {
  it('starts once/current-operation only, with extra operations closed and no acknowledgement', () => {
    const source = prompt(), draft = createCreatorApprovalDraft(source)
    expect(draft).toEqual({ lifetime: 'once', operations: ['hot-reload'], operationsExpanded: false, rememberDays: 1, phase: 'edit', acknowledged: false })
    expect(creatorApprovalDraftResult(source, draft)).toEqual(ONCE)
  })
  it('requires an explicit supported scope selection', () => {
    const source = prompt({ allowRemember: false, allowTask: false })
    expect(transition(source, { type: 'lifetime', value: 'remember' }, { type: 'lifetime', value: 'task' }).lifetime).toBe('once')
  })
  it('cannot add operations until explicitly expanding a reusable scope', () => {
    const source = prompt()
    const hidden = transition(source, { type: 'lifetime', value: 'task' }, { type: 'operation', operation: 'check', selected: true })
    expect(hidden.operations).toEqual(['hot-reload'])
    const visible = reduceCreatorApprovalDraft(source, hidden, { type: 'operations-expanded', value: true })
    const selected = reduceCreatorApprovalDraft(source, visible, { type: 'operation', operation: 'check', selected: true })
    expect(selected.operations).toEqual(['check', 'hot-reload'])
    expect(creatorApprovalDraftResult(source, selected)).toEqual({ decision: 'allow', lifetime: 'task', operations: ['check', 'hot-reload'] })
    expect(hidden.operations).toEqual(['hot-reload'])
  })
  it('cannot remove the current operation or introduce an unavailable operation', () => {
    const source = prompt({ availableOperations: ['hot-reload'] })
    const draft = transition(source, { type: 'lifetime', value: 'task' }, { type: 'operations-expanded', value: true },
      { type: 'operation', operation: 'check', selected: true }, { type: 'operation', operation: 'hot-reload', selected: false })
    expect(draft.operations).toEqual(['hot-reload'])
  })
  it('does not carry extra operations silently when changing lifetimes', () => {
    const source = prompt()
    const draft = transition(source, { type: 'lifetime', value: 'task' }, { type: 'operations-expanded', value: true },
      { type: 'operation', operation: 'check', selected: true }, { type: 'lifetime', value: 'remember' })
    expect(draft.operations).toEqual(['hot-reload'])
    expect(draft.operationsExpanded).toBe(false)
    expect(draft.acknowledged).toBe(false)
  })
  it('requires review AND a separate unchecked future-version acknowledgement for remember', () => {
    const source = prompt(), selected = transition(source, { type: 'lifetime', value: 'remember' }, { type: 'remember-days', value: 7 })
    expect(creatorApprovalDraftResult(source, selected)).toBeUndefined()
    const reviewing = reduceCreatorApprovalDraft(source, selected, { type: 'review' })
    expect(creatorApprovalDraftResult(source, reviewing)).toBeUndefined()
    const acknowledged = reduceCreatorApprovalDraft(source, reviewing, { type: 'acknowledge', value: true })
    expect(creatorApprovalDraftResult(source, acknowledged)).toEqual({ decision: 'allow', lifetime: 'remember', operations: ['hot-reload'], rememberDays: 7 })
    expect(selected.phase).toBe('edit')
  })
  it.each([{ type: 'back' }, { type: 'remember-days', value: 30 }, { type: 'lifetime', value: 'task' }] as const)('invalidates remembered acknowledgement after %j', action => {
    const source = prompt(), acknowledged = transition(source, { type: 'lifetime', value: 'remember' }, { type: 'review' }, { type: 'acknowledge', value: true })
    const changed = reduceCreatorApprovalDraft(source, acknowledged, action)
    expect(changed.acknowledged).toBe(false)
    expect(changed.phase).toBe('edit')
  })
  it('does not let an acknowledgement made before review authorize remembering', () => {
    const source = prompt(), draft = transition(source, { type: 'lifetime', value: 'remember' }, { type: 'acknowledge', value: true })
    expect(creatorApprovalDraftResult(source, draft)).toBeUndefined()
  })
})

describe('Actual compact Creator confirmation components (isolated SSR)', () => {
  it('renders once selected, all three scopes, exact source/workspace and no hidden future grant', () => {
    const html = renderToStaticMarkup(<CreatorApprovalCard pending={pending()} />)
    expect(html).toContain(COPY.once); expect(html).toContain(COPY.task); expect(html).toContain(COPY.remember)
    expect(html).toMatch(/checked=""[^>]*value="once"|value="once"[^>]*checked=""/)
    expect(html.match(/type="radio"/g)).toHaveLength(3)
    expect(html).toContain('/workspace/sample-plugin')
    expect(html).not.toContain(COPY.futureVersions)
    expect(html).not.toContain('type="checkbox"')
    expect(html).not.toContain(COPY.operations.check)
  })
  it('keys its own stateful child so request replacement cannot inherit a remembered draft', () => {
    const first = pending(), second = pending()
    const initial = CreatorApprovalCard({ pending: first }) as ReactElement
    const replacement = CreatorApprovalCard({ pending: second }) as ReactElement
    expect(initial.key).toBe(first.key)
    expect(replacement.key).toBe(second.key)
    expect(initial.key).not.toBe(replacement.key)
    expect(initial.type).toBe(replacement.type)
  })
  it('uses supplied English copy without changing the existing locale namespace', () => {
    const html = renderToStaticMarkup(<CreatorApprovalCard pending={pending()} copy={CREATOR_APPROVAL_COPY.en} />)
    expect(html).toContain('Just once')
    expect(html).toContain('Remember across tasks')
    expect(Object.keys(CREATOR_APPROVAL_COPY.en).sort()).toEqual(Object.keys(CREATOR_APPROVAL_COPY.zh).sort())
  })
  it('disables unavailable task/remember choices instead of trusting a client opt-in', () => {
    const html = renderToStaticMarkup(<CreatorApprovalCard pending={pending(prompt({ allowTask: false, allowRemember: false }))} />)
    expect(html).toMatch(/disabled=""[^>]*value="task"|value="task"[^>]*disabled=""/)
    expect(html).toMatch(/disabled=""[^>]*value="remember"|value="remember"[^>]*disabled=""/)
  })
  it('keeps additional operations and reason in initially closed native details', () => {
    const source = prompt({ reason: 'Review this bounded operation.' }), draft = transition(source, { type: 'lifetime', value: 'task' })
    const html = renderToStaticMarkup(<CreatorApprovalView {...props(source, draft)} />)
    expect(html.match(/<details/g)).toHaveLength(2)
    expect(html).not.toMatch(/<details[^>]*\bopen/)
    expect(html).toContain(COPY.operations.check)
    expect(html).toContain(source.taskLabel)
  })
  it('shows future-version/operation/expiry summary and disabled second confirmation before acknowledgement', () => {
    const source = prompt(), draft = transition(source, { type: 'lifetime', value: 'remember' }, { type: 'remember-days', value: 30 }, { type: 'review' })
    const html = renderToStaticMarkup(<CreatorApprovalView {...props(source, draft)} />)
    expect(html).toContain(COPY.futureVersions)
    expect(html).toContain('30')
    expect(html).toContain(COPY.acknowledgement)
    expect(html).toMatch(/type="checkbox" required=""/)
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/)
    expect(html).toMatch(/type="submit"[^>]*disabled=""/)
    expect(html).not.toContain('type="radio"')
  })
  it('passes real view radio/details/checkbox events only to state actions, not authorization', () => {
    const source = prompt(), view = props(source, transition(source, { type: 'lifetime', value: 'task' }))
    let tree = elements(CreatorApprovalView(view))
    tree.find(element => element.type === 'input' && element.props.value === 'remember')!.props.onChange()
    tree.find(element => element.type === 'details')!.props.onToggle({ currentTarget: { open: true } })
    expect(view.onAction).toHaveBeenCalledWith({ type: 'lifetime', value: 'remember' })
    expect(view.onAction).toHaveBeenCalledWith({ type: 'operations-expanded', value: true })
    expect(view.onSubmit).not.toHaveBeenCalled()
    const remember = props(source, transition(source, { type: 'lifetime', value: 'remember' }, { type: 'review' }))
    tree = elements(CreatorApprovalView(remember))
    tree.find(element => element.type === 'input' && element.props.type === 'checkbox')!.props.onChange({ target: { checked: true } })
    expect(remember.onAction).toHaveBeenCalledWith({ type: 'acknowledge', value: true })
    expect(remember.onSubmit).not.toHaveBeenCalled()
  })
  it('uses form submission for keyboard activation and blocks an ended request', () => {
    const view = props(), preventDefault = vi.fn()
    elements(CreatorApprovalView(view)).find(element => element.type === 'form')!.props.onSubmit({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(view.onSubmit).toHaveBeenCalledOnce()
    const ended = { ...props(), busy: true }
    elements(CreatorApprovalView(ended)).find(element => element.type === 'form')!.props.onSubmit({ preventDefault })
    expect(ended.onSubmit).not.toHaveBeenCalled()
    expect(renderToStaticMarkup(<CreatorApprovalView {...ended} />)).toContain(COPY.settled)
  })
  it('escapes Host labels/reason instead of inserting HTML', () => {
    const html = renderToStaticMarkup(<CreatorApprovalCard pending={pending(prompt({ sourceLabel: '<script>alert(1)</script>', reason: '<img onerror="bad">' }))} />)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img ')
  })
  it('has responsive/focus/reduced-motion styles without global overlay or fixed width', () => {
    const css = readFileSync(new URL('../src/client/creator-approval.module.css', import.meta.url), 'utf8')
    expect(css).toContain('@media (max-width: 480px)')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('prefers-reduced-motion')
    expect(css).toContain('minmax(0, 1fr)')
    expect(css).not.toContain('position: fixed')
  })
})

describe('PendingCreatorApproval: exactly-once cancellation and late answers', () => {
  it('copies/freeze-protects prompt and settled result and returns only explicit closed decisions', async () => {
    const source = prompt(), value = pending(source), answer = structuredClone(ONCE)
    source.allowRemember = false
    expect(value.prompt.allowRemember).toBe(true)
    expect(Object.isFrozen(value.prompt)).toBe(true)
    await value.answer(answer)
    expect(await value.result).toEqual(ONCE)
    if (answer.decision === 'allow') answer.operations.length = 0
    expect(await value.result).toEqual(ONCE)
    expect(Object.isFrozen(await value.result)).toBe(true)
    expect(value.getSnapshot()).toBe('answered')
    await expect(value.answer(REJECT)).rejects.toThrow('already settled')
  })
  it('does not settle on an invalid native or AI-shaped result', async () => {
    const value = pending()
    await expect(value.answer('allowed-once' as unknown as CreatorApprovalResult)).rejects.toThrow(TypeError)
    expect(value.getSnapshot()).toBe('pending')
    await value.answer(REJECT)
    expect(await value.result).toEqual(REJECT)
  })
  it('delegates only once, with an instance-local non-JSON marker; late answers fail', async () => {
    const first = pending(), second = pending()
    first.delegate(); first.delegate()
    const reason = await first.result.catch(value => value)
    expect(first.isDelegation(reason)).toBe(true)
    expect(second.isDelegation(reason)).toBe(false)
    await expect(first.answer(ONCE)).rejects.toThrow('already settled')
    expect(first.getSnapshot()).toBe('delegated')
  })
  it('aborts synchronously, removes the signal listener and discards a late allow', async () => {
    const controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener'), value = pending(prompt(), controller.signal)
    const reason = new Error('withdrawn')
    controller.abort(reason)
    await expect(value.result).rejects.toBe(reason)
    await expect(value.answer(ONCE)).rejects.toThrow('already settled')
    expect(value.getSnapshot()).toBe('cancelled')
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
  it('does not let late abort or subscriber failure undo an already committed answer', async () => {
    const controller = new AbortController(), value = pending(prompt(), controller.signal), observed = vi.fn()
    value.subscribe(() => { throw new Error('observer failure') }); value.subscribe(observed)
    await value.answer(ONCE)
    controller.abort()
    expect(await value.result).toEqual(ONCE)
    expect(observed).toHaveBeenCalledOnce()
  })
  it('uses independent render identity and decisions for repeated identical Host prompts', async () => {
    const first = pending(), second = pending()
    expect(first.key).not.toBe(second.key)
    expect(first.kind).toBe('creator-approval')
    expect(first.sessionId).toBe(SESSION)
    await Promise.all([first.answer(ONCE), second.answer(REJECT)])
    expect(await Promise.all([first.result, second.result])).toEqual([ONCE, REJECT])
  })
})

describe('Public pending publisher and composer adapter; no Remote production wiring', () => {
  it('publishes the exact Session and removes its pending entry after an answer', async () => {
    let value!: PendingCreatorApproval
    const remove = vi.fn(), next = vi.fn(async () => REJECT), publish = vi.fn((current: PendingCreatorApproval) => { value = current; return remove })
    const result = presentCreatorApproval(SESSION, { prompt: prompt() }, next, publish)
    expect(value.sessionId).toBe(SESSION)
    await value.answer(ONCE)
    expect(await result).toEqual(ONCE)
    expect(next).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledOnce()
  })
  it('public domain teardown delegates and waits until the original handler removes its pending entry', async () => {
    let teardown!: () => Promise<void>, value!: PendingCreatorApproval
    const fallback = deferred<CreatorApprovalResult>(), remove = vi.fn(), next = vi.fn(() => fallback.promise)
    const result = presentCreatorApproval(SESSION, { prompt: prompt() }, next, (current, delegate) => { value = current; teardown = delegate; return remove })
    const disposed = teardown(), finished = vi.fn()
    void disposed.then(finished)
    await Promise.resolve()
    expect(next).toHaveBeenCalledOnce(); expect(finished).not.toHaveBeenCalled()
    await expect(value.answer(ONCE)).rejects.toThrow('already settled')
    fallback.resolve(REJECT)
    expect(await result).toEqual(REJECT)
    await disposed
    expect(remove).toHaveBeenCalledOnce()
  })
  it('abort does not call next; pre-aborted requests are not published', async () => {
    const controller = new AbortController(), reason = new Error('Host ended'), next = vi.fn(async () => REJECT), publish = vi.fn(() => () => {})
    controller.abort(reason)
    await expect(presentCreatorApproval(SESSION, { prompt: prompt(), signal: controller.signal }, next, publish)).rejects.toBe(reason)
    expect(publish).not.toHaveBeenCalled(); expect(next).not.toHaveBeenCalled()
    const live = new AbortController(), remove = vi.fn()
    const result = presentCreatorApproval(SESSION, { prompt: prompt(), signal: live.signal }, next, () => remove)
    live.abort(reason)
    await expect(result).rejects.toBe(reason)
    expect(next).not.toHaveBeenCalled(); expect(remove).toHaveBeenCalledOnce()
  })
  it('Host cancellation beats an answer resolved just before handler delivery', async () => {
    const controller = new AbortController(), reason = new Error('cancelled before delivery')
    let value!: PendingCreatorApproval
    const result = presentCreatorApproval(SESSION, { prompt: prompt(), signal: controller.signal }, async () => REJECT, current => { value = current; return () => {} })
    void value.answer(ONCE)
    controller.abort(reason)
    await expect(result).rejects.toBe(reason)
  })
  it('teardown does not hang on a noncooperative fallback after Host cancellation', async () => {
    const controller = new AbortController(), reason = new Error('fallback cancelled'), fallback = deferred<CreatorApprovalResult>(), remove = vi.fn()
    let teardown!: () => Promise<void>
    const next = vi.fn(() => fallback.promise)
    const result = presentCreatorApproval(SESSION, { prompt: prompt(), signal: controller.signal }, next, (_current, delegate) => { teardown = delegate; return remove })
    const disposed = teardown()
    await Promise.resolve()
    expect(next).toHaveBeenCalledOnce()
    controller.abort(reason)
    await expect(result).rejects.toBe(reason)
    await disposed
    expect(remove).toHaveBeenCalledOnce()
    fallback.resolve(ONCE)
    await Promise.resolve()
    expect(remove).toHaveBeenCalledOnce()
  })
  it('preserves the Remote waterfall opaque delegation marker instead of interpreting it as JSON authorization', async () => {
    const marker = Symbol('remote-next')
    let teardown!: () => Promise<void>
    const result = presentCreatorApproval(SESSION, { prompt: prompt() }, async () => marker as unknown as CreatorApprovalResult, (_current, delegate) => { teardown = delegate; return () => {} })
    const disposed = teardown()
    expect(await result).toBe(marker)
    await disposed
  })
  it('delegates absent scope without making up a Session identity', async () => {
    const next = vi.fn(async () => REJECT), publish = vi.fn(() => () => {})
    expect(await presentCreatorApproval(undefined, { prompt: prompt() }, next, publish)).toEqual(REJECT)
    expect(next).toHaveBeenCalledOnce(); expect(publish).not.toHaveBeenCalled()
  })
  it('aborts and releases its signal listener if publisher registration fails', async () => {
    const controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener'), failure = new Error('publisher unavailable')
    await expect(presentCreatorApproval(SESSION, { prompt: prompt(), signal: controller.signal }, async () => REJECT, () => { throw failure })).rejects.toBe(failure)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
  it('registers only actual public domain/composer calls and scopes by listener this, not JSON fields', async () => {
    let registration: any, Component: any, value!: PendingCreatorApproval
    const cleanups: Array<() => void> = [], owner = {} as Context, remove = vi.fn()
    const scopeOf = vi.fn((context: Context) => context === owner ? SESSION : undefined)
    const publish = vi.fn((current: PendingCreatorApproval) => { value = current; return remove })
    const registerPendingInteraction = vi.fn(() => publish)
    const context = {
      uiSession: { registerPendingInteraction },
      get sessions() { throw new Error('Do not assert a mixed Host SessionStore is the public Client service') },
      slots: { inject: vi.fn((_slot: string, setup: () => void) => setup()), register: vi.fn((config: unknown, component: unknown) => { registration = config; Component = component; return () => {} }) },
      effect: (setup: () => () => void) => { cleanups.push(setup()) },
      get remote() { throw new Error('This isolated helper must not subscribe to Remote Events') },
    } as unknown as Context
    expect(() => Reflect.apply(registerCreatorApprovalPresentation, undefined, [context])).toThrow('explicit client scope resolver')
    expect(registerPendingInteraction).not.toHaveBeenCalled()
    const handler = registerCreatorApprovalPresentation(context, scopeOf)
    expect(CREATOR_APPROVAL_CLIENT_INJECT).toEqual(['uiSession', 'slots'])
    expect(registerPendingInteraction).toHaveBeenCalledWith(expect.any(Function))
    expect(registration.name).toBe('conversation.composer')
    const next = vi.fn(async () => REJECT), result = handler.call(owner, { prompt: prompt() }, next)
    expect(scopeOf).toHaveBeenCalledWith(owner)
    expect(registration.select({ pendingInteraction: value, sessionId: SESSION })).toBe(value)
    expect(registration.select({ pendingInteraction: value, sessionId: 'another-session' })).toBe(null)
    expect(registration.select({ pendingInteraction: { kind: 'approval', sessionId: SESSION }, sessionId: SESSION })).toBe(null)
    expect(renderToStaticMarkup(<Component matched={value} />)).toContain(COPY.once)
    await value.answer(REJECT); expect(await result).toEqual(REJECT)
    cleanups.forEach(cleanup => cleanup())
    expect(await handler.call(owner, { prompt: prompt() }, next)).toEqual(REJECT)
    expect(publish).toHaveBeenCalledOnce()
    const source = readFileSync(new URL('../src/client/creator-approval.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain("$on('approval/request'")
    expect(source).not.toContain('createRemembered(')
    expect(source).not.toContain('fetch(')
  })
})
