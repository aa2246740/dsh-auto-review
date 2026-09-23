import { describe, expect, it, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import styles from '../src/client/styles.module.css'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ApprovalDashboard, ApprovalSettings, ReviewRecord } from '../src/contracts.ts'
import { Overview } from '../src/client/overview.tsx'
import { ReviewSettings } from '../src/client/index.tsx'
import { zh, type ApprovalTranslate } from '../src/client/i18n.ts'

const t = ((key: keyof typeof zh, values?: Record<string, string | number>) => Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), zh[key])) as ApprovalTranslate
const dashboard: ApprovalDashboard = { version: 1, revision: 1, records: [], rules: [], storage: { ok: true, retentionDays: 30, maxRecords: 1000 }, capabilities: { creator: { automatic: false, reason: 'CREATOR_LIMIT' }, creatorPlus: { automatic: false, reason: 'PLUS_LIMIT' } } }
function scope(value: ApprovalSettings = {}, writable = true): ConfigForm<ApprovalSettings> {
  const snapshot = { status: 'ready' as const, value, writable, revision: 1, mode: 'host' as const }
  return { getSnapshot: () => snapshot, subscribe: () => () => {} } as unknown as ConfigForm<ApprovalSettings>
}
const loadCatalog = vi.fn(async () => [])
const basic = (value: ApprovalSettings = {}, writable = true) => <ReviewSettings scope={scope(value, writable)} loadCatalog={loadCatalog} t={t} section="basic" />
const renderOverview = (data = dashboard) => renderToStaticMarkup(<Overview dashboard={data} t={t} onHistory={() => {}}>{basic()}</Overview>)

describe('compact approval layout', () => {
  it('shows three useful controls instead of capability cards and explanatory headings', () => {
    const html = renderOverview()
    const visible = html.replace(/<details\b[\s\S]*?<\/details>/g, '')
    for (const label of [zh.globalSwitch, zh.modelChoice, zh.failureMode, zh.recentActivity, zh.modeBrief]) expect(visible).toContain(label)
    expect(visible).not.toContain('CREATOR_LIMIT')
    expect(visible).not.toContain('PLUS_LIMIT')
    expect(visible).not.toContain(zh.modeTitle)
    expect(visible.match(/<h3\b/g)).toHaveLength(1)
    expect(visible).toContain('role="switch"')
    // Optional visual artifact: actual production components/CSS, no Host/authentication.
    const output = Reflect.get(process.env, 'APPROVAL_LAYOUT_PREVIEW')
    if (typeof output === 'string' && output) {
      const css = readFileSync(new URL('../src/client/styles.module.css', import.meta.url), 'utf8').replace(/\.([A-Za-z_][\w-]*)/g, (selector, key: string) => styles[key] ? `.${styles[key]}` : selector)
      const frame = renderToStaticMarkup(<main className={styles['root']}><header className={styles['heading']}><div className={styles['titleRow']}><h2 className={styles['pageTitle']}>{zh.title}</h2><span className={styles['badge']}>{zh.enabled}</span></div><button className={styles['button']}>{zh.refresh}</button></header><nav className={styles['tabs']}>{(['overview', 'rules', 'history', 'advanced'] as const).map(key => <button className={styles['tab']} key={key} aria-selected={key === 'overview'}>{zh[key]}</button>)}</nav><div className={styles['panel']}><Overview dashboard={dashboard} t={t} onHistory={() => {}}>{basic()}</Overview></div></main>)
      writeFileSync(output, `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approval layout fixture — no Host connection</title><style>body{margin:0;padding:24px;font-family:system-ui,sans-serif;background:#fff;color:#202124}body>aside{font-size:11px;color:#777;margin:0 auto 24px;max-width:840px}${css}</style><body><aside>静态布局预览 · 使用实际组件与样式 · 未连接 Host</aside>${frame}</body></html>`)
    }
  })
  it('keeps source restrictions and permission explanations in native closed details', () => {
    const html = renderOverview()
    expect(html).toContain(`<summary>${zh.learnMore}</summary>`)
    expect(html).toContain('PLUS_LIMIT')
    expect(html).toContain('CREATOR_LIMIT')
    expect(html).not.toMatch(/<details[^>]*\bopen[\s=>]/)
  })
  it('has an honest empty state rather than meaningless zero counters', () => {
    const html = renderOverview()
    expect(html).toContain(zh.noActivity)
    expect(html).not.toContain('<strong>0</strong>')
    expect(html).toContain(zh.viewHistory)
  })
  it('preserves the visible strict-reject warning and readonly controls', () => {
    const html = renderToStaticMarkup(basic({ enabled: true, failureMode: 'reject' }, false))
    expect(html).toContain(zh.rejectHint)
    expect(html).toContain(zh.readOnly)
    expect(html.match(/ disabled=""/g)?.length).toBe(3)
  })
  it('keeps numeric tuning in Advanced, not on the overview', () => {
    const html = renderToStaticMarkup(<ReviewSettings scope={scope()} loadCatalog={loadCatalog} t={t} section="advanced" />)
    expect(html).toContain(zh.timeoutMs)
    expect(html).toContain(zh.historyRetentionDays)
    expect(html).toContain(zh.autoSave)
    expect(html).not.toContain('role="switch"')
    expect(html).not.toContain(zh.modeExplanation)
    expect(renderToStaticMarkup(basic())).not.toContain(zh.timeoutMs)
  })
  it('bounds recent rows and tolerates an invalid timestamp', () => {
    const records = Array.from({ length: 5 }, (_, i) => ({ id: `row-${i}`, toolName: `visible-tool-${i}`, status: 'pending-human', createdAt: i === 0 ? 1e100 : 1_800_000_000_000 } as ReviewRecord))
    const html = renderOverview({ ...dashboard, records })
    expect(html).toContain('visible-tool-2')
    expect(html).not.toContain('visible-tool-3')
    expect(html).toContain(zh.unknown)
  })
})
