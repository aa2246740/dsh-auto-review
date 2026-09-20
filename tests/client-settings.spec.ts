import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/client/index.tsx'
import { validateRule } from '../src/rules.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ApprovalDashboard, ApprovalSettings, ReviewRecord } from '../src/contracts.ts'
import { en, zh } from '../src/client/i18n.ts'
import {
  ApprovalApiError, canSaveAutomatic, dashboardUrl, EMPTY_FILTER, getDashboard,
  MAX_RULE_HOURS, NUMERIC_SETTINGS, parseIntegerDraft, persistSettings, postCommand,
  redactedHistoryExport, ruleFromRecord, ruleProblem, withRuleScope,
} from '../src/client/settings-helpers.ts'

const now = 1_800_000_000_000
const id = '9c390128-29f6-4527-98fe-e6ba989954d1'
const record: ReviewRecord = {
  id: 'record-1', createdAt: now, updatedAt: now, sessionId: 'session-1', stage: 'pre-execute', toolName: 'dshx_hot_reload',
  pluginId: 'my-plugin', argumentFingerprint: 'a'.repeat(64), argumentsSummary: '{"name":"my-plugin"}', permissionSummary: 'Host mutation; redacted',
  status: 'pending-human', source: 'failure', reason: 'Review unavailable', model: 'provider/model', elapsedMs: 13,
  execution: 'not-started', ruleId: 'rule-1',
}
const dashboard = (): ApprovalDashboard => ({
  version: 1, revision: 7, records: [record], rules: [], nextBefore: now,
  capabilities: { creatorPlus: { automatic: false, reason: 'No trusted source' }, creator: { automatic: false, reason: 'No trusted source' } },
  storage: { ok: true, retentionDays: 30, maxRecords: 1000 },
})
const response = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('approval client endpoint contract', () => {
  it('uses only the exact relative endpoint and encodes server-side filters', () => {
    const url = new URL(dashboardUrl({ sessionId: 's&x=1', status: 'pending-human', toolName: 'dshx_check' }, now), 'https://example.test')
    expect(url.pathname).toBe('/api/approve-for-me')
    expect(url.searchParams.get('sessionId')).toBe('s&x=1')
    expect(url.searchParams.get('status')).toBe('pending-human')
    expect(url.searchParams.get('toolName')).toBe('dshx_check')
    expect(url.searchParams.get('limit')).toBe('25')
    expect(url.searchParams.get('before')).toBe(String(now))
  })
  it('gets with same-origin credentials and abort signal, never auth state', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(dashboard()))
    vi.stubGlobal('fetch', fetcher)
    const signal = new AbortController().signal
    expect(await getDashboard(EMPTY_FILTER, undefined, signal)).toEqual(dashboard())
    expect(fetcher).toHaveBeenCalledWith('/api/approve-for-me?limit=25', { credentials: 'same-origin', cache: 'no-store', signal })
  })
  it('posts version-fenced rules with the required UI header', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ ok: true, revision: 8 }))
    vi.stubGlobal('fetch', fetcher)
    const command = { action: 'save-rule' as const, expectedRevision: 7, rule: ruleFromRecord(record, 'Ask', now, id) }
    expect(await postCommand(command)).toEqual({ ok: true, revision: 8 })
    expect(fetcher).toHaveBeenCalledWith('/api/approve-for-me', {
      method: 'POST', credentials: 'same-origin', headers: { 'x-dsh-approval-ui': '1', 'content-type': 'application/json' }, body: JSON.stringify(command),
    })
  })
  it('previews the exact record without executing or mutating a tool', async () => {
    const match = { matched: true, action: 'ask', reason: 'Exact binding' }
    const fetcher = vi.fn().mockResolvedValue(response(match))
    vi.stubGlobal('fetch', fetcher)
    expect(await postCommand({ action: 'preview', rule: ruleFromRecord(record, 'Ask', now, id), recordId: record.id })).toEqual(match)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ action: 'preview', recordId: record.id })
  })
  it.each([400, 409, 503])('preserves HTTP %s and Host errors for visible presentation', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Host refused' }, status)))
    await expect(postCommand({ action: 'delete-rule', expectedRevision: 7, id })).rejects.toMatchObject({ status, message: 'Host refused' })
  })
  it('rejects a malformed success response instead of claiming saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({})))
    await expect(postCommand({ action: 'delete-rule', expectedRevision: 7, id })).rejects.toBeInstanceOf(ApprovalApiError)
  })
  it('rejects an absent capabilities contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ version: 1, revision: 1, records: [], rules: [] })))
    await expect(getDashboard(EMPTY_FILTER)).rejects.toBeInstanceOf(ApprovalApiError)
  })
})

describe('bounded user-owned rules', () => {
  it('defaults to session + fixed plugin, asks a human, version 1, and eight hours', () => {
    expect(ruleFromRecord(record, 'My rule', now, id)).toMatchObject({
      id, version: 1, action: 'ask', enabled: true, scope: 'creator-plugin', sessionId: record.sessionId,
      stage: record.stage, toolName: record.toolName, pluginId: record.pluginId, createdAt: now, expiresAt: now + 8 * 3_600_000,
    })
  })
  it('creates Host-valid plugin rules without an extra fingerprint and preserves exact scope switching', () => {
    const pluginRule = ruleFromRecord(record, 'Plugin rule', now, id)
    expect(pluginRule).not.toHaveProperty('argumentFingerprint')
    expect(validateRule(pluginRule)).toEqual(pluginRule)
    const exactRule = withRuleScope(pluginRule, 'exact-arguments', record.argumentFingerprint)
    expect(exactRule).toMatchObject({ argumentFingerprint: record.argumentFingerprint, pluginId: record.pluginId })
    expect(validateRule(exactRule)).toEqual(exactRule)
    const back = withRuleScope(exactRule, 'creator-plugin')
    expect(back).not.toHaveProperty('argumentFingerprint')
    expect(validateRule(back)).toEqual(pluginRule)
  })
  it('uses exact arguments for non-creator tools or approval-request stage, retaining fixed plugin binding', () => {
    for (const source of [{ ...record, toolName: 'read' }, { ...record, stage: 'approval-request' as const }]) {
      const rule = ruleFromRecord(source, 'Exact rule', now, id)
      expect(rule.scope).toBe('exact-arguments')
      expect(rule.pluginId).toBe(record.pluginId)
      expect(validateRule(rule)).toEqual(rule)
    }
  })
  it('uses crypto.randomUUID for a new rule, not an invented or shared id', () => {
    const uuid = vi.fn().mockReturnValue(id)
    vi.stubGlobal('crypto', { randomUUID: uuid })
    expect(ruleFromRecord(record, 'My rule', now).id).toBe(id)
    expect(uuid).toHaveBeenCalledOnce()
  })
  it('falls back to an exact fingerprint binding when there is no plugin', () => {
    const { pluginId: _plugin, ...unbound } = record
    const rule = ruleFromRecord({ ...unbound, toolName: 'read' }, 'Exact', now, id)
    expect(rule.scope).toBe('exact-arguments')
    expect(rule.argumentFingerprint).toBe(record.argumentFingerprint)
    expect(ruleProblem(rule, false, true, now)).toBeUndefined()
  })
  it('allows ask and deny but blocks saving automatic allow on unsupported capability', () => {
    const rule = ruleFromRecord(record, 'Rule', now, id)
    expect(ruleProblem(rule, false, true, now)).toBeUndefined()
    expect(ruleProblem({ ...rule, action: 'deny' }, false, true, now)).toBeUndefined()
    expect(ruleProblem({ ...rule, action: 'allow' }, false, true, now)).toBe('autoBlocked')
    expect(ruleProblem({ ...rule, action: 'allow', enabled: false }, false, true, now)).toBe('autoBlocked')
    expect(ruleProblem({ ...rule, action: 'allow' }, false, false, now)).toBeUndefined()
  })
  it('does not guess a record mode or session capability', () => {
    const value = dashboard()
    expect(canSaveAutomatic(undefined)).toBe(false)
    expect(canSaveAutomatic(value)).toBe(false)
    value.capabilities.creatorPlus.automatic = true
    expect(canSaveAutomatic(value)).toBe(false)
    value.capabilities.creator.automatic = true
    expect(canSaveAutomatic(value)).toBe(true)
  })
  it('rejects missing exact arguments and missing fixed plugin bindings', () => {
    const rule = ruleFromRecord(record, 'Rule', now, id)
    expect(ruleProblem({ ...rule, scope: 'exact-arguments', argumentFingerprint: undefined }, false, true, now)).toBe('ruleFingerprintRequired')
    expect(ruleProblem({ ...rule, scope: 'creator-plugin', pluginId: undefined }, false, true, now)).toBe('rulePluginRequired')
    expect(ruleProblem({ ...rule, sessionId: '' }, false, true, now)).toBe('ruleBindingRequired')
  })
  it('enforces expiry after now and at most 30 days after original creation', () => {
    const rule = ruleFromRecord(record, 'Rule', now, id)
    expect(ruleProblem({ ...rule, expiresAt: now }, true, true, now)).toBe('ruleExpiryInvalid')
    expect(ruleProblem({ ...rule, expiresAt: now + MAX_RULE_HOURS * 3_600_000 + 1 }, true, true, now)).toBe('ruleExpiryInvalid')
    expect(ruleProblem({ ...rule, expiresAt: now + MAX_RULE_HOURS * 3_600_000 }, true, true, now)).toBeUndefined()
  })
})

describe('settings drafts and read-back', () => {
  it.each(['', ' ', 'NaN', 'Infinity', '1.5', '1e2', '-1', '121'])('rejects invalid numeric draft %j', value => {
    expect(parseIntegerDraft(value, 1, 120)).toBeUndefined()
  })
  it('accepts only whole in-range values', () => {
    expect(parseIntegerDraft(' 90 ', 1, 120)).toBe(90)
    expect(parseIntegerDraft('0', 0, 2)).toBe(0)
    expect(parseIntegerDraft('120', 1, 120)).toBe(120)
  })
  it('matches the Host retention and record-count bounds', () => {
    expect(NUMERIC_SETTINGS.find(spec => spec.key === 'historyRetentionDays')).toMatchObject({ min: 1, max: 365, fallback: 30 })
    expect(NUMERIC_SETTINGS.find(spec => spec.key === 'historyMaxRecords')).toMatchObject({ min: 100, max: 10000, fallback: 1000 })
  })
  function fakeScope(accept: boolean, status: 'ready' | 'unavailable' = 'ready') {
    let value: ApprovalSettings = { enabled: true, modelMode: 'follow-agent' }
    const mutate = vi.fn(async (ops: Array<{ path: string[]; value: unknown }>) => {
      if (accept) value = { ...value, ...Object.fromEntries(ops.map(op => [op.path[0], op.value])) }
    })
    const scope = { getSnapshot: () => ({ status, writable: status === 'ready', value }), mutate } as unknown as SettingsScope<ApprovalSettings>
    return { scope, mutate }
  }
  it('does not confuse a silently recovered rejection with a successful write', async () => {
    const { scope } = fakeScope(false)
    expect(await persistSettings(scope, { enabled: false })).toBe(false)
  })
  it('writes reviewer route and fixed mode atomically, then confirms retained fields', async () => {
    const { scope, mutate } = fakeScope(true)
    expect(await persistSettings(scope, { reviewerRoute: '["provider","model"]', modelMode: 'fixed' })).toBe(true)
    expect(mutate).toHaveBeenCalledOnce()
    expect(mutate.mock.calls[0]![0]).toHaveLength(2)
  })
  it('does not write in the terminal unavailable branch', async () => {
    const { scope, mutate } = fakeScope(true, 'unavailable')
    expect(await persistSettings(scope, { enabled: false })).toBe(false)
    expect(mutate).not.toHaveBeenCalled()
  })
})

describe('rendered public settings contributions', () => {
  function registrations() {
    const entries: Array<{ options: { name: string; label?: () => string; inject: () => object }; component: ComponentType<object> }> = []
    const settings = { status: 'ready', writable: true, value: { enabled: true }, revision: 1, mode: 'host' }
    const locale = { active: 'en', revision: 1, locales: [] }
    const register = vi.fn(() => () => {})
    const context = {
      settingsScope: { bind: () => ({ getSnapshot: () => settings, subscribe: () => () => {} }) },
      remote: { session: { modelCatalog: vi.fn() } },
      locale: { bind: () => (key: keyof typeof en) => locale.active === 'zh' ? zh[key] : en[key], register, getSnapshot: () => locale, subscribe: () => () => {} },
      effect: (fn: () => unknown) => fn(),
      uiSession: { registerPendingInteraction: () => () => {} },
      slots: { inject: (_name: string, fn: () => unknown) => fn(), register: (options: typeof entries[number]['options'], component: ComponentType<object>) => { entries.push({ options, component }); return () => {} } },
    }
    apply(context as unknown as Context)
    return { entries, context, register, locale }
  }
  it('renders the four accessible tabs and a separate concise card without any network call during render', () => {
    const { entries, context, register } = registrations()
    const page = entries.find(entry => entry.options.name === 'settings.section')!
    const card = entries.find(entry => entry.options.name === 'settings.plugin.item')!
    const pageHtml = renderToStaticMarkup(createElement(page.component, page.options.inject()))
    const cardHtml = renderToStaticMarkup(createElement(card.component, card.options.inject()))
    for (const label of ['Overview', 'Rules', 'Review history', 'Advanced']) expect(pageHtml).toContain(label)
    expect(pageHtml).toContain('role="tablist"')
    expect(pageHtml).toContain('role="tabpanel"')
    expect(cardHtml).toContain('Open management panel')
    expect(cardHtml).toContain('aria-expanded="false"')
    expect(cardHtml).not.toContain('role="tablist"')
    expect(register).toHaveBeenCalledWith('settings.approveForMe', { zh, en })
    expect(context.remote.session.modelCatalog).not.toHaveBeenCalled()
  })
  it('reads localized navigation labels from the public locale instead of a browser guess', () => {
    const { entries, locale } = registrations()
    const page = entries.find(entry => entry.options.name === 'settings.section')!
    expect(page.options.label?.()).toBe('Automatic approval')
    locale.active = 'zh'
    expect(page.options.label?.()).toBe('自动审批')
    const html = renderToStaticMarkup(createElement(page.component, page.options.inject()))
    expect(html).toContain('审核历史')
    expect(html).toContain('概览')
  })
})

describe('redacted export and public UI wiring', () => {
  it('exports only a field whitelist even if an unexpected raw payload arrives', () => {
    const unsafe = { ...record, arguments: { password: 'DO-NOT-EXPORT' }, token: 'SECRET', rawPayload: 'RAW' }
    const text = redactedHistoryExport([unsafe])
    const value = JSON.parse(text)
    expect(value.records[0]).toMatchObject({ argumentsSummary: record.argumentsSummary, permissionSummary: record.permissionSummary, execution: 'not-started', status: 'pending-human', source: 'failure' })
    expect(value.records[0]).not.toHaveProperty('argumentFingerprint')
    expect(text).not.toContain('DO-NOT-EXPORT')
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain('rawPayload')
  })
  it('has matching locale-owned English and Chinese dictionary keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(en.title).toBe('Automatic approval')
    expect(zh.title).toBe('自动审批')
    const source = readFileSync(new URL('../src/client/i18n.ts', import.meta.url), 'utf8')
    expect(source).toContain('interface LocaleNamespaceMap')
  })
  it('declares every direct service and registers both official settings slots', () => {
    const source = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain("export const inject = ['slots', 'settingsScope', 'remote', 'remote.session', 'locale', 'uiSession']")
    expect(source).toContain("name: 'settings.section', id: SETTINGS_NAMESPACE")
    expect(source).toContain("name: 'settings.plugin.item', key: SETTINGS_NAMESPACE")
    expect(source).toContain("ctx.settingsScope.bind<ApprovalSettings>({ namespace: SETTINGS_NAMESPACE })")
    expect(source).toContain('ctx.remote.session.modelCatalog()')
    expect(source).not.toContain('ctx.remote.$host')
    expect(source).not.toContain('ctx.remote.settings')
    expect(source).not.toContain('localStorage')
    expect(source).not.toContain('querySelector')
    expect(source).not.toContain('history.pushState')
  })
  it('uses keyboard tabs and draft-on-blur instead of numeric keystroke writes', () => {
    const source = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('role="tablist"')
    expect(source).toContain('role="tabpanel"')
    expect(source).toContain("event.key === 'ArrowRight'")
    expect(source).toContain('onBlur={() => { void commit() }}')
    expect(source).toContain("if (snapshot.status === 'unavailable') return")
    expect(source.indexOf("if (snapshot.status === 'unavailable') return")).toBeLessThan(source.indexOf("if (snapshot.status === 'loading' || !snapshot.value) return"))
  })
})
