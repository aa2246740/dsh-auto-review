import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { ApprovalApiCommand, ApprovalDashboard, ApprovalRule, ApprovalSettings, ReviewRecord, RuleMatch } from '../contracts.ts'
import { en, zh, LOCALE_NS, type ApprovalLocaleKey, type ApprovalTranslate } from './i18n.ts'
import {
  ApprovalApiError, canSaveAutomatic, canUseCreatorPlugin, EMPTY_FILTER, getDashboard, MAX_RULE_HOURS,
  NUMERIC_SETTINGS, parseIntegerDraft, persistSettings, postCommand, redactedHistoryExport, REVIEW_STATUSES,
  ruleFromRecord, ruleProblem, withRuleScope, type HistoryFilter, type NumericSetting,
} from './settings-helpers.ts'
import styles from './styles.module.css'
import { HelpDisclosure, Overview } from './overview.tsx'
import { registerCreatorConsentTransport } from './creator-consent-transport.tsx'
import { createCreatorConsentHttpTransport, getRememberedGrants, revokeRememberedGrant, type RememberedGrantRow } from './creator-consent-http.ts'

export const name = 'dsh-approve-for-me-client'
export const inject = ['slots', 'configForms', 'remote', 'remote.session', 'locale', 'uiSession']
const SETTINGS_NAMESPACE = 'dsh-approve-for-me'
const TABS = ['overview', 'rules', 'history', 'advanced'] as const
type Tab = typeof TABS[number]
interface RouteOption { value: string; label: string }
interface CopyFace { t: ApprovalTranslate; subscribe: (listener: () => void) => () => void; getSnapshot: () => LocaleSnapshot }
interface PanelInjected { scope: ConfigForm<ApprovalSettings>; loadCatalog: () => Promise<RouteOption[]>; copy: CopyFace }

/** Public settings slots only. The card expands the same panel because no general settings-navigation face is public. */
export function apply(ctx: ClientContext): void {
  const scope = ctx.configForms.get<ApprovalSettings>(SETTINGS_NAMESPACE)
  const copy: CopyFace = {
    t: ctx.locale.bind(LOCALE_NS),
    subscribe: listener => ctx.locale.subscribe(listener),
    getSnapshot: () => ctx.locale.getSnapshot(),
  }
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'approve-for-me: owned settings dictionaries')
  registerCreatorConsentTransport(ctx, createCreatorConsentHttpTransport())
  const loadCatalog = async (): Promise<RouteOption[]> => {
    const response = await ctx.remote.session.modelCatalog()
    if (!response.ok) throw new Error(response.error.message)
    return response.value.groups.flatMap(group => group.models.map(model => ({
      value: JSON.stringify([group.id, model.id]), label: `${group.name} · ${model.name}`,
    })))
  }
  const injected = (): PanelInjected => ({ scope, loadCatalog, copy })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: SETTINGS_NAMESPACE, order: 24,
    label: () => copy.t('title'), locale: LOCALE_NS, inject: injected,
  }, ApprovalSection))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab', id: SETTINGS_NAMESPACE, order: 40,
    label: () => copy.t('title'), locale: LOCALE_NS, inject: injected,
  }, ApprovalCard))
}

function useCopy(copy: CopyFace): ApprovalTranslate {
  useSyncExternalStore(copy.subscribe, copy.getSnapshot, copy.getSnapshot)
  return copy.t
}
function useSettings(scope: ConfigForm<ApprovalSettings>) {
  return useSyncExternalStore(listener => scope.subscribe(listener), () => scope.getSnapshot(), () => scope.getSnapshot())
}
function errorText(error: unknown, t: ApprovalTranslate): string {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof ApprovalApiError) {
    if (error.status === 409) return t('conflict')
    if (error.status === 400) return t('invalidRequest', { message })
    if (error.status === 503) return t('storageFailed', { message })
  }
  return t('requestFailed', { message })
}
function Alert({ children }: { children: ReactNode }): ReactNode {
  return <p className={styles['error']} role="alert">{children}</p>
}
function Button({ children, onClick, disabled = false }: { children: ReactNode; onClick: () => void; disabled?: boolean }): ReactNode {
  return <button className={styles['button']} type="button" disabled={disabled} onClick={onClick}>{children}</button>
}

function ApprovalSection(props: Partial<PanelInjected>): ReactNode {
  if (!props.scope || !props.loadCatalog || !props.copy) return null
  return <ManagementPanel scope={props.scope} loadCatalog={props.loadCatalog} copy={props.copy} />
}
function ApprovalCard(props: Partial<PanelInjected>): ReactNode {
  if (!props.scope || !props.loadCatalog || !props.copy) return null
  return <LoadedCard scope={props.scope} loadCatalog={props.loadCatalog} copy={props.copy} />
}
function LoadedCard(props: PanelInjected): ReactNode {
  const t = useCopy(props.copy)
  const snapshot = useSettings(props.scope)
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  return <section className={styles['root']}>
    <div className={styles['card']}>
      <header className={styles['heading']}>
        <h3 className={styles['title']}>{t('title')}</h3>
        <span className={styles['badge']}>{snapshot.status !== 'ready' || !snapshot.value ? t('enabledUnknown') : t(snapshot.value.enabled === false ? 'disabled' : 'enabled')}</span>
      </header>
      <p className={styles['muted']}>{t('modeBrief')}</p>
      {snapshot.status === 'unavailable' && <Alert>{t('settingsUnavailable')}</Alert>}
      <button className={styles['button']} type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)}>{t(expanded ? 'collapse' : 'manage')}</button>
    </div>
    {expanded && <div id={panelId}><ManagementPanel {...props} /></div>}
  </section>
}

interface RuleDraft { rule: ApprovalRule; expectedRevision: number; recordId: string; sourceFingerprint?: string }
function ManagementPanel({ scope, loadCatalog, copy }: PanelInjected): ReactNode {
  const t = useCopy(copy)
  const settings = useSettings(scope)
  const [tab, setTab] = useState<Tab>('overview')
  const [dashboard, setDashboard] = useState<ApprovalDashboard>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>()
  const [writeError, setWriteError] = useState<unknown>()
  const [saved, setSaved] = useState(false)
  const [writing, setWriting] = useState(false)
  const lock = useRef(false)
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER)
  const [before, setBefore] = useState<number>()
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [draft, setDraft] = useState<RuleDraft>()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const id = useId()
  const refresh = (): void => { setRefreshVersion(value => value + 1) }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(undefined)
    void getDashboard(filter, before, controller.signal).then(value => {
      if (!controller.signal.aborted) setDashboard(value)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(error)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort() }
  }, [filter, before, refreshVersion])

  const mutate = async (command: ApprovalApiCommand): Promise<boolean> => {
    if (lock.current) return false
    lock.current = true
    setWriting(true); setWriteError(undefined); setSaved(false)
    try {
      await postCommand(command)
      setSaved(true)
      refresh()
      return true
    } catch (error: unknown) { setWriteError(error); return false }
    finally { lock.current = false; setWriting(false) }
  }
  const beginDraft = (record: ReviewRecord): void => {
    if (!dashboard) return
    try {
      setDraft({ rule: ruleFromRecord(record, t('ruleDraftName', { tool: record.toolName })), expectedRevision: dashboard.revision, recordId: record.id,
        ...(record.argumentFingerprint ? { sourceFingerprint: record.argumentFingerprint } : {}) })
      setTab('rules'); setWriteError(undefined); setSaved(false)
    } catch (error: unknown) { setWriteError(error) }
  }
  const selectTab = (value: Tab): void => {
    // Overview always shows recent records, never a retained historical filter/page.
    if (value === 'overview' && (before !== undefined || Object.values(filter).some(Boolean))) {
      setDashboard(undefined); setLoading(true); setFilter(EMPTY_FILTER); setBefore(undefined)
    }
    setTab(value)
  }
  const tabKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else return
    event.preventDefault()
    const nextTab = TABS[next]
    if (nextTab) { selectTab(nextTab); tabRefs.current[next]?.focus() }
  }
  return <section className={styles['root']} aria-label={t('title')}>
    <header className={styles['heading']}>
      <div className={styles['titleRow']}><h2 className={styles['pageTitle']}>{t('title')}</h2><span className={styles['badge']}>{settings.status !== 'ready' || !settings.value ? t('enabledUnknown') : t(settings.value.enabled === false ? 'disabled' : 'enabled')}</span></div>
      <Button onClick={refresh} disabled={loading || writing}>{loading ? t('loading') : t('refresh')}</Button>
    </header>
    <div className={styles['tabs']} role="tablist" aria-label={t('tabs')}>
      {TABS.map((item, index) => <button key={item} ref={element => { tabRefs.current[index] = element }}
        className={styles['tab']} role="tab" id={`${id}-tab-${item}`} aria-controls={`${id}-panel-${item}`}
        aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} type="button"
        onClick={() => selectTab(item)} onKeyDown={event => tabKey(event, index)}>{t(item)}</button>)}
    </div>
    {loadError !== undefined && <Alert>{dashboard && <>{t('stale')} </>}{errorText(loadError, t)}</Alert>}
    {writeError !== undefined && <Alert>{errorText(writeError, t)}</Alert>}
    {saved && <p role="status" className={styles['muted']}>{t('saved')}</p>}
    <div role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} className={styles['panel']} aria-busy={loading || writing}>
      {tab === 'advanced' ? <ReviewSettings scope={scope} loadCatalog={loadCatalog} t={t} section="advanced" /> : !dashboard ? (
        <div className={styles['empty']}><p role="status">{loading ? t('loading') : t('unavailable')}</p>{!loading && <Button onClick={refresh}>{t('retryLoad')}</Button>}</div>
      ) : <>
        {!dashboard.storage.ok && <Alert>{t('storageNotOk')}: {dashboard.storage.reason ?? t('unknown')}</Alert>}
        {tab === 'overview' && <Overview dashboard={dashboard} t={t} onHistory={() => setTab('history')}><ReviewSettings scope={scope} loadCatalog={loadCatalog} t={t} section="basic" /></Overview>}
        {tab === 'history' && <History dashboard={dashboard} t={t} filter={filter} onFilter={value => { setFilter(value); setBefore(undefined) }}
          before={before} onBefore={setBefore} busy={loading || writing} onDraft={beginDraft} />}
        {tab === 'rules' && <Rules dashboard={dashboard} t={t} draft={draft} onDraft={setDraft} onHistory={() => setTab('history')}
          mutate={mutate} busy={writing || loading || loadError !== undefined || !dashboard.storage.ok} />}
      </>}
    </div>
  </section>
}

function FieldValue({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return <div><dt>{label}</dt><dd>{children}</dd></div>
}
function timestamp(value: number): string {
  return Number.isFinite(value) ? new Date(value).toLocaleString() : '—'
}
function RecordDetails({ record, t }: { record: ReviewRecord; t: ApprovalTranslate }): ReactNode {
  const unknown = t('unknown')
  return <dl className={styles['metadata']}>
    <FieldValue label={t('recordId')}>{record.id}</FieldValue><FieldValue label={t('session')}>{record.sessionId}</FieldValue>
    <FieldValue label={t('created')}>{timestamp(record.createdAt)}</FieldValue><FieldValue label={t('updated')}>{timestamp(record.updatedAt)}</FieldValue>
    <FieldValue label={t('stage')}>{t(`stage.${record.stage}`)}</FieldValue><FieldValue label={t('tool')}>{record.toolName}</FieldValue>
    <FieldValue label={t('approval')}>{t(`status.${record.status}`)}</FieldValue><FieldValue label={t('execution')}>{t(`execution.${record.execution}`)}</FieldValue>
    <FieldValue label={t('source')}>{t(`source.${record.source}`)}</FieldValue><FieldValue label={t('model')}>{record.model ?? unknown}</FieldValue>
    <FieldValue label={t('duration')}>{record.elapsedMs === undefined ? unknown : t('milliseconds', { value: record.elapsedMs })}</FieldValue>
    <FieldValue label={t('rule')}>{record.ruleId ?? unknown}</FieldValue><FieldValue label={t('plugin')}>{record.pluginId ?? unknown}</FieldValue>
    <FieldValue label={t('failureKind')}>{record.failureKind ?? unknown}</FieldValue><FieldValue label={t('risk')}>{record.riskLevel ?? unknown}</FieldValue>
    <FieldValue label={t('reason')}>{record.reason || unknown}</FieldValue>
    <FieldValue label={t('arguments')}><pre>{record.argumentsSummary}</pre></FieldValue><FieldValue label={t('permission')}><pre>{record.permissionSummary}</pre></FieldValue>
  </dl>
}
function History({ dashboard, t, filter, onFilter, before, onBefore, busy, onDraft }: {
  dashboard: ApprovalDashboard; t: ApprovalTranslate; filter: HistoryFilter; onFilter: (value: HistoryFilter) => void;
  before: number | undefined; onBefore: (value: number | undefined) => void; busy: boolean; onDraft: (record: ReviewRecord) => void;
}): ReactNode {
  const [draftFilter, setDraftFilter] = useState(filter)
  const [exportError, setExportError] = useState<unknown>()
  useEffect(() => { setDraftFilter(filter) }, [filter])
  const download = (): void => {
    setExportError(undefined)
    try {
      const blob = new Blob([redactedHistoryExport(dashboard.records)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'approval-history-redacted.json'
      document.body.append(anchor); anchor.click(); anchor.remove()
      // Delay revocation until the browser has consumed the local Blob download.
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch (error: unknown) { setExportError(error) }
  }
  return <>
    <form className={styles['filters']} onSubmit={event => { event.preventDefault(); onFilter({ ...draftFilter }) }}>
      <label className={styles['field']}><span>{t('session')}</span><input value={draftFilter.sessionId} onChange={event => setDraftFilter({ ...draftFilter, sessionId: event.target.value })} /></label>
      <label className={styles['field']}><span>{t('tool')}</span><input value={draftFilter.toolName} onChange={event => setDraftFilter({ ...draftFilter, toolName: event.target.value })} /></label>
      <label className={styles['field']}><span>{t('status')}</span><select value={draftFilter.status} onChange={event => setDraftFilter({ ...draftFilter, status: event.target.value })}>
        <option value="">{t('allStatuses')}</option>{REVIEW_STATUSES.map(status => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
      </select></label>
      <div className={styles['row']}><button className={styles['button']} type="submit" disabled={busy}>{t('filter')}</button><Button disabled={busy} onClick={() => { setDraftFilter(EMPTY_FILTER); onFilter({ ...EMPTY_FILTER }) }}>{t('reset')}</Button></div>
    </form>
    <div className={styles['row']}><Button onClick={download} disabled={busy || dashboard.records.length === 0}>{t('export')}</Button><span className={styles['muted']}>{t('exportHint')}</span></div>
    {exportError !== undefined && <Alert>{errorText(exportError, t)}</Alert>}
    {dashboard.records.length === 0 && <p className={styles['empty']}>{t('noRecords')}</p>}
    <div className={styles['recordList']}>
      {dashboard.records.map(record => <article key={record.id} className={styles['card']}>
        <header className={styles['heading']}><strong className={styles['mono']}>{record.toolName}</strong><time dateTime={new Date(record.createdAt).toISOString()}>{timestamp(record.createdAt)}</time></header>
        <div className={styles['row']}><span className={styles['badge']}>{t('approval')}: {t(`status.${record.status}`)}</span><span className={styles['badge']}>{t('execution')}: {t(`execution.${record.execution}`)}</span><span className={styles['muted']}>{t('source')}: {t(`source.${record.source}`)}</span></div>
        <p className={styles['summary']}>{record.reason}</p>
        <div className={styles['row']}><span>{t('model')}: {record.model ?? t('unknown')}</span><span>{t('duration')}: {record.elapsedMs === undefined ? t('unknown') : t('milliseconds', { value: record.elapsedMs })}</span></div>
        <details className={styles['details']}><summary>{t('details')}</summary><RecordDetails record={record} t={t} /></details>
        <Button disabled={busy} onClick={() => onDraft(record)}>{t('createRule')}</Button>
      </article>)}
    </div>
    <div className={styles['row']}>
      {before !== undefined && <Button disabled={busy} onClick={() => onBefore(undefined)}>{t('first')}</Button>}
      <Button disabled={busy || dashboard.nextBefore === undefined || dashboard.nextBefore === before} onClick={() => onBefore(dashboard.nextBefore)}>{t('next')}</Button>
    </div>
    <HelpDisclosure title={t('learnMore')}><p>{t('executionHint')}</p><p>{t('humanFallback')}</p><p>{t('noRetry')}</p></HelpDisclosure>
  </>
}

function RememberedGrants({ t, busy }: { t: ApprovalTranslate; busy: boolean }): ReactNode {
  const [rows, setRows] = useState<RememberedGrantRow[]>([])
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<unknown>()
  const load = useCallback(async () => {
    try { const snapshot = await getRememberedGrants(); setRows(snapshot.rules); setRevision(snapshot.revision); setError(undefined) }
    catch (cause) { setError(cause) }
  }, [])
  useEffect(() => { void load() }, [load])
  return <section className={styles['activity']} aria-label={t('rememberedTitle')}>
    <header className={styles['rowBetween']}><h3>{t('rememberedTitle')}</h3></header>
    <p className={styles['muted']}>{t('rememberedHint')}</p>
    {error !== undefined && <Alert>{errorText(error, t)}</Alert>}
    {rows.length === 0 && <p className={styles['empty']}>{t('noRemembered')}</p>}
    {rows.map(row => <article key={row.id} className={styles['card']}>
      <header className={styles['heading']}><h3>{row.pluginId}</h3><span className={styles['badge']}>{row.enabled ? t('ruleEnabled') : t('ruleDisabled')}</span></header>
      <p className={styles['muted']}>{row.operations.join(', ')} · {t('expires')}: {timestamp(row.expiresAt)}</p>
      {row.enabled && row.revokedAt === undefined && <Button disabled={busy} onClick={() => {
        void revokeRememberedGrant(row.id, revision).then(snapshot => { setRows(snapshot.rules); setRevision(snapshot.revision) }).catch(setError)
      }}>{t('revokeGrant')}</Button>}
    </article>)}
  </section>
}

function Rules({ dashboard, t, draft, onDraft, onHistory, mutate, busy }: {
  dashboard: ApprovalDashboard; t: ApprovalTranslate; draft: RuleDraft | undefined; onDraft: (value: RuleDraft | undefined) => void;
  onHistory: () => void; mutate: (command: ApprovalApiCommand) => Promise<boolean>; busy: boolean;
}): ReactNode {
  const [deleting, setDeleting] = useState<string>()
  const automatic = canSaveAutomatic(dashboard)
  return <>
    <Button onClick={onHistory}>{t('startFromHistory')}</Button>
    {!automatic && <p className={styles['muted']}>{t('autoBlocked')}</p>}
    <RememberedGrants t={t} busy={busy} />
    <HelpDisclosure title={t('learnMore')}><p>{t('rulesHint')}</p><p>{t('capabilityHint')}</p></HelpDisclosure>
    {draft && <RuleEditor key={draft.rule.id} draft={draft} dashboard={dashboard} t={t} onDraft={onDraft} mutate={mutate} busy={busy} />}
    {dashboard.rules.length === 0 && <p className={styles['empty']}>{t('noRules')}</p>}
    {dashboard.rules.map(rule => <article key={rule.id} className={styles['card']}>
      <header className={styles['heading']}><h3>{rule.name}</h3><span className={styles['badge']}>{t(`action.${rule.action}`)}</span></header>
      <div className={styles['row']}><span>{t(rule.enabled ? 'ruleEnabled' : 'ruleDisabled')}</span><span>{t('expires')}: {timestamp(rule.expiresAt)}{rule.expiresAt <= Date.now() && ` · ${t('expired')}`}</span></div>
      <p className={styles['muted']}>{t(rule.scope === 'creator-plugin' ? 'pluginScope' : 'exactScope')}</p>
      <dl className={styles['metadata']}><FieldValue label={t('session')}>{rule.sessionId}</FieldValue><FieldValue label={t('stage')}>{t(`stage.${rule.stage}`)}</FieldValue><FieldValue label={t('tool')}>{rule.toolName}</FieldValue><FieldValue label={t('plugin')}>{rule.pluginId ?? t('unknown')}</FieldValue></dl>
      <div className={styles['row']}>
        <Button disabled={busy} onClick={() => { onDraft({ rule: { ...rule }, expectedRevision: dashboard.revision, recordId: '', ...(rule.argumentFingerprint ? { sourceFingerprint: rule.argumentFingerprint } : {}) }); setDeleting(undefined) }}>{t('edit')}</Button>
        <label className={styles['switchLabel']}><input type="checkbox" checked={rule.enabled}
          disabled={busy || (!rule.enabled && (rule.expiresAt <= Date.now() || (rule.action === 'allow' && !automatic)))}
          onChange={event => {
            const enabled = event.target.checked
            // Disabling an existing auto rule is always permitted; unsupported auto rules are never enabled here.
            void mutate({ action: 'save-rule', expectedRevision: dashboard.revision, rule: { ...rule, enabled, version: rule.version + 1 } })
          }} /><span>{t('ruleEnabled')}</span></label>
        <Button disabled={busy} onClick={() => setDeleting(rule.id)}>{t('delete')}</Button>
      </div>
      {deleting === rule.id && <div className={styles['notice']} role="group" aria-label={t('confirmDelete')}>
        <p>{t('confirmDelete')}</p><div className={styles['row']}><Button disabled={busy} onClick={() => {
          void mutate({ action: 'delete-rule', id: rule.id, expectedRevision: dashboard.revision }).then(ok => { if (ok) { setDeleting(undefined); if (draft?.rule.id === rule.id) onDraft(undefined) } })
        }}>{t('confirm')}</Button><Button disabled={busy} onClick={() => setDeleting(undefined)}>{t('cancel')}</Button></div>
      </div>}
    </article>)}
  </>
}

function RuleEditor({ draft, dashboard, t, onDraft, mutate, busy }: {
  draft: RuleDraft; dashboard: ApprovalDashboard; t: ApprovalTranslate; onDraft: (value: RuleDraft | undefined) => void;
  mutate: (command: ApprovalApiCommand) => Promise<boolean>; busy: boolean;
}): ReactNode {
  const rule = draft.rule
  const [hours, setHours] = useState(String((rule.expiresAt - rule.createdAt) / 3_600_000))
  const [preview, setPreview] = useState<RuleMatch>()
  const [previewError, setPreviewError] = useState<unknown>()
  const [previewing, setPreviewing] = useState(false)
  const automatic = canSaveAutomatic(dashboard)
  const lifetime = parseIntegerDraft(hours, 1, MAX_RULE_HOURS)
  const sourceFingerprint = draft.sourceFingerprint ?? rule.argumentFingerprint
  const resolved = { ...rule, name: rule.name.trim(), ...(lifetime === undefined ? {} : { expiresAt: rule.createdAt + lifetime * 3_600_000 }) }
  const problem = lifetime === undefined ? 'ruleExpiryInvalid' : ruleProblem(resolved, automatic)
  const previewProblem = lifetime === undefined ? 'ruleExpiryInvalid' : ruleProblem(resolved, automatic, false)
  const patch = (value: Partial<ApprovalRule>): void => { onDraft({ ...draft, rule: { ...rule, ...value } }); setPreview(undefined) }
  const doPreview = async (): Promise<void> => {
    if (previewing || !draft.recordId.trim() || previewProblem) return
    setPreviewing(true); setPreviewError(undefined); setPreview(undefined)
    try {
      const response = await postCommand({ action: 'preview', rule: resolved, recordId: draft.recordId.trim() })
      if ('matched' in response) setPreview(response)
    } catch (error: unknown) { setPreviewError(error) }
    finally { setPreviewing(false) }
  }
  return <section className={styles['editor']} aria-label={t('ruleEditor')} aria-busy={busy || previewing}>
    <h3>{t('ruleEditor')}</h3><p className={styles['muted']}>{t('draftHint')}</p>
    <fieldset disabled={busy || previewing} className={styles['fieldset']}>
      <div className={styles['grid']}>
        <label className={styles['field']}><span>{t('ruleName')}</span><input maxLength={120} value={rule.name} onChange={event => patch({ name: event.target.value })} /></label>
        <label className={styles['field']}><span>{t('ruleAction')}</span><select value={rule.action} onChange={event => patch({ action: event.target.value as ApprovalRule['action'] })}>
          {(['ask', 'deny', 'allow'] as const).map(action => <option key={action} value={action}>{t(`action.${action}`)}</option>)}
        </select></label>
        <label className={styles['field']}><span>{t('scope')}</span><select value={rule.scope} onChange={event => {
          onDraft({ ...draft, rule: withRuleScope(rule, event.target.value as ApprovalRule['scope'], sourceFingerprint) }); setPreview(undefined)
        }}>
          <option value="exact-arguments" disabled={!sourceFingerprint}>{t('exactScope')}</option><option value="creator-plugin" disabled={!canUseCreatorPlugin(rule)}>{t('pluginScope')}</option>
        </select></label>
        <label className={styles['field']}><span>{t('lifetime')}</span><input type="number" min={1} max={MAX_RULE_HOURS} step={1} value={hours} onChange={event => { setHours(event.target.value); setPreview(undefined) }} aria-invalid={lifetime === undefined} /></label>
      </div>
      <label className={styles['switchLabel']}><input type="checkbox" checked={rule.enabled} disabled={rule.action === 'allow' && !automatic} onChange={event => patch({ enabled: event.target.checked })} /><span>{t('ruleEnabled')}</span></label>
    </fieldset>
    <p className={styles['muted']}>{t('scopeHint')}</p><p className={styles['muted']}>{t('expiryHint')}</p>
    <dl className={styles['metadata']}>
      <FieldValue label={t('session')}>{rule.sessionId}</FieldValue><FieldValue label={t('stage')}>{t(`stage.${rule.stage}`)}</FieldValue><FieldValue label={t('tool')}>{rule.toolName}</FieldValue>
      <FieldValue label={t('plugin')}>{rule.pluginId ?? t('unknown')}</FieldValue><FieldValue label={t('created')}>{timestamp(rule.createdAt)}</FieldValue><FieldValue label={t('expires')}>{timestamp(resolved.expiresAt)}</FieldValue>
      {rule.scope === 'exact-arguments' && <FieldValue label={t('fingerprint')}>{rule.argumentFingerprint ?? t('unknown')}<p className={styles['muted']}>{t('fingerprintHint')}</p></FieldValue>}
    </dl>
    {problem && <p className={styles['warning']}>{t(problem)}</p>}
    {draft.expectedRevision !== dashboard.revision && <p className={styles['notice']}>{t('conflict')} {t('draftRevisionHint')}</p>}
    <div className={styles['row']}>
      <Button disabled={busy || previewing || problem !== undefined || draft.expectedRevision !== dashboard.revision} onClick={() => {
        const exists = dashboard.rules.some(candidate => candidate.id === rule.id)
        void mutate({ action: 'save-rule', expectedRevision: draft.expectedRevision, rule: { ...resolved, version: exists ? rule.version + 1 : 1 } }).then(ok => { if (ok) onDraft(undefined) })
      }}>{busy ? t('saving') : t('saveRule')}</Button>
      <Button disabled={busy || previewing} onClick={() => onDraft(undefined)}>{t('cancel')}</Button>
    </div>
    <div className={styles['preview']}>
      <label className={styles['field']}><span>{t('previewRecord')}</span><input value={draft.recordId} disabled={previewing} onChange={event => { onDraft({ ...draft, recordId: event.target.value }); setPreview(undefined) }} /></label>
      <label className={styles['field']}><span>{t('chooseRecord')}</span><select value={dashboard.records.some(record => record.id === draft.recordId) ? draft.recordId : ''} disabled={previewing} onChange={event => { onDraft({ ...draft, recordId: event.target.value }); setPreview(undefined) }}>
        <option value="">{t('chooseRecord')}</option>{dashboard.records.map(record => <option value={record.id} key={record.id}>{record.toolName} · {record.id}</option>)}
      </select></label>
      <Button disabled={previewing || !draft.recordId.trim() || previewProblem !== undefined} onClick={() => { void doPreview() }}>{previewing ? t('loading') : t('preview')}</Button>
      {previewError !== undefined && <Alert>{errorText(previewError, t)}</Alert>}
      {preview && <div className={styles['notice']} role="status"><strong>{t('previewResult')}: {t(preview.matched ? 'matched' : 'notMatched')} · {t(`action.${preview.action}`)}</strong><p>{preview.reason}</p>{preview.capabilityBlocked && <p>{t('capabilityBlocked')}</p>}</div>}
    </div>
  </section>
}

export function ReviewSettings({ scope, loadCatalog, t, section }: { scope: ConfigForm<ApprovalSettings>; loadCatalog: () => Promise<RouteOption[]>; t: ApprovalTranslate; section: 'basic' | 'advanced' }): ReactNode {
  const snapshot = useSettings(scope)
  const [options, setOptions] = useState<RouteOption[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogError, setCatalogError] = useState<unknown>()
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [writing, setWriting] = useState(false)
  const [writeError, setWriteError] = useState<unknown>()
  const [saved, setSaved] = useState(false)
  const lock = useRef(false)
  useEffect(() => {
    if (section !== 'basic') return
    let active = true
    setCatalogState('loading'); setCatalogError(undefined)
    void loadCatalog().then(value => { if (active) { setOptions(value); setCatalogState('ready') } }).catch((error: unknown) => {
      if (active) { setCatalogError(error); setCatalogState('error') }
    })
    return () => { active = false }
  }, [loadCatalog, refreshVersion, section])
  const writeSettings = useCallback(async (values: Partial<ApprovalSettings>): Promise<boolean> => {
    if (lock.current || scope.getSnapshot().status !== 'ready' || !scope.getSnapshot().writable) return false
    lock.current = true; setWriting(true); setWriteError(undefined); setSaved(false)
    try {
      // Verify retained values: a resolved promise can also mean a rejected mutation followed by recovery.
      if (!await persistSettings(scope, values)) throw new Error(t('saveFailed'))
      setSaved(true)
      return true
    } catch (error: unknown) { setWriteError(error); return false }
    finally { lock.current = false; setWriting(false) }
  }, [scope, t])
  // Unavailable must be checked before missing value; otherwise a terminal state looks like endless loading.
  if (snapshot.status === 'unavailable') return <Alert>{t('settingsUnavailable')}</Alert>
  if (snapshot.status === 'loading' || !snapshot.value) return <p role="status">{t('settingsLoading')}</p>
  const settings = snapshot.value
  const disabled = !snapshot.writable || writing
  const route = settings.modelMode === 'fixed' ? settings.reviewerRoute ?? '' : ''
  const selectedAvailable = !route || options.some(option => option.value === route)
  const numericLabels: Record<keyof ApprovalSettings, ApprovalLocaleKey> = {
    enabled: 'globalSwitch', modelMode: 'modelChoice', reviewerRoute: 'modelChoice', reasoningMode: 'thinking', failureMode: 'failureMode',
    timeoutMs: 'timeoutMs', transportRetries: 'transportRetries', maxOutputTokens: 'maxOutputTokens', maxInputChars: 'maxInputChars',
    reviewHistoryPairs: 'reviewHistoryPairs', reviewHistoryChars: 'reviewHistoryChars', historyRetentionDays: 'historyRetentionDays', historyMaxRecords: 'historyMaxRecords',
  }
  return <>
    {!snapshot.writable && <p className={styles['notice']}>{t('readOnly')}</p>}
    {writeError !== undefined && <Alert>{errorText(writeError, t)}</Alert>}
    {saved && <p className={styles['saveStatus']} role="status">{t('saved')}</p>}
    {section === 'basic' ? <>
      <div className={styles['settingsGroup']}>
        <label className={`${styles['settingRow']} ${styles['toggleRow']}`}><span>{t('globalSwitch')}</span><input className={styles['toggle']} type="checkbox" role="switch" disabled={disabled} checked={settings.enabled !== false} onChange={event => { void writeSettings({ enabled: event.target.checked }) }} /></label>
        <label className={`${styles['field']} ${styles['settingRow']}`}><span>{t('modelChoice')}</span><select value={route} disabled={disabled || catalogState === 'loading'} onChange={event => {
          const value = event.target.value
          void writeSettings(value ? { reviewerRoute: value, modelMode: 'fixed' } : { modelMode: 'follow-agent' })
        }}><option value="">{t('followAgent')}</option>{!selectedAvailable && <option value={route}>{t('offlineModel')}</option>}{options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        <label className={`${styles['field']} ${styles['settingRow']}`}><span>{t('failureMode')}</span><select disabled={disabled} value={settings.failureMode ?? 'human'} onChange={event => { void writeSettings({ failureMode: event.target.value as NonNullable<ApprovalSettings['failureMode']> }) }}><option value="human">{t('human')}</option><option value="reject">{t('reject')}</option></select></label>
      </div>
      <p className={styles['inlineHint']}>{t('modeBrief')}</p>
      {settings.failureMode === 'reject' && <p className={styles['warning']}>{t('rejectHint')}</p>}
      {catalogState === 'error' && <Alert>{t('catalogError', { message: catalogError instanceof Error ? catalogError.message : String(catalogError) })}</Alert>}
      {catalogState === 'ready' && options.length === 0 && <p className={styles['muted']}>{t('catalogEmpty')}</p>}
      {catalogState === 'loading' && <p className={styles['inlineHint']} role="status">{t('catalogLoading')}</p>}
      {catalogState === 'error' && <Button onClick={() => setRefreshVersion(value => value + 1)}>{t('retryLoad')}</Button>}
    </> : <>
      <label className={styles['field']}><span>{t('thinking')}</span><select disabled={disabled} value={settings.reasoningMode ?? 'low'} onChange={event => { void writeSettings({ reasoningMode: event.target.value as NonNullable<ApprovalSettings['reasoningMode']> }) }}><option value="low">{t('thinkingLow')}</option><option value="provider-default">{t('thinkingDefault')}</option></select></label>
      <div className={styles['grid']}>{NUMERIC_SETTINGS.map(spec => <NumericField key={spec.key} spec={spec} label={t(numericLabels[spec.key])} value={typeof settings[spec.key] === 'number' ? settings[spec.key] as number : spec.fallback} disabled={disabled} t={t} onSave={value => writeSettings({ [spec.key]: value })} />)}</div>
      <p className={styles['inlineHint']}>{t('autoSave')}</p>
    </>}
  </>
}

function NumericField({ spec, label, value, disabled, onSave, t }: { spec: NumericSetting; label: string; value: number; disabled: boolean; onSave: (value: number) => Promise<boolean>; t: ApprovalTranslate }): ReactNode {
  const scale = spec.scale ?? 1
  const [draft, setDraft] = useState(String(value / scale))
  const [error, setError] = useState(false)
  const dirty = useRef(false)
  const saving = useRef(false)
  const id = useId()
  useEffect(() => { if (!dirty.current) setDraft(String(value / scale)) }, [value, scale])
  const commit = async (): Promise<void> => {
    if (disabled || !dirty.current || saving.current) return
    const next = parseIntegerDraft(draft, spec.min, spec.max)
    if (next === undefined) { setError(true); return }
    setError(false)
    if (next * scale === value) { dirty.current = false; setDraft(String(next)); return }
    saving.current = true
    try { if (await onSave(next * scale)) { dirty.current = false; setDraft(String(next)) } }
    finally { saving.current = false }
  }
  return <label className={styles['field']}><span>{label}</span><input type="number" min={spec.min} max={spec.max} step={1} inputMode="numeric" value={draft} disabled={disabled}
    aria-invalid={error} aria-describedby={error ? `${id}-error` : undefined}
    onChange={event => { dirty.current = true; setDraft(event.target.value); setError(false) }} onBlur={() => { void commit() }}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} />
    {error && <span id={`${id}-error`} className={styles['error']} role="alert">{t('fieldRange', { min: spec.min, max: spec.max })}</span>}
  </label>
}
