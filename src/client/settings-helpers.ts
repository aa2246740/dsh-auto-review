import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { APPROVAL_API_PATH } from '../contracts.ts'
import type { ApprovalApiCommand, ApprovalDashboard, ApprovalRule, ApprovalSettings, ReviewRecord, ReviewStatus, RuleMatch } from '../contracts.ts'

export const DEFAULT_RULE_HOURS = 8
export const MAX_RULE_HOURS = 30 * 24
export const REVIEW_STATUSES: readonly ReviewStatus[] = ['reviewing', 'pending-human', 'allowed', 'denied', 'failed', 'cancelled', 'unavailable', 'interrupted']
export interface HistoryFilter { sessionId: string; status: string; toolName: string }
export const EMPTY_FILTER: HistoryFilter = { sessionId: '', status: '', toolName: '' }
export type NumericSetting = { key: keyof ApprovalSettings; min: number; max: number; fallback: number; scale?: number }
export const NUMERIC_SETTINGS: readonly NumericSetting[] = [
  { key: 'timeoutMs', min: 1, max: 120, fallback: 90_000, scale: 1_000 },
  { key: 'transportRetries', min: 0, max: 2, fallback: 2 },
  { key: 'maxOutputTokens', min: 128, max: 4_096, fallback: 256 },
  { key: 'maxInputChars', min: 2_000, max: 100_000, fallback: 20_000 },
  { key: 'reviewHistoryPairs', min: 1, max: 12, fallback: 4 },
  { key: 'reviewHistoryChars', min: 2_000, max: 100_000, fallback: 20_000 },
  { key: 'historyRetentionDays', min: 1, max: 365, fallback: 30 },
  { key: 'historyMaxRecords', min: 100, max: 10_000, fallback: 1_000 },
]

/** A resolved settings promise can mean recovery after rejection; read back the public mirror. */
export async function persistSettings(scope: ConfigForm<ApprovalSettings>, values: Partial<ApprovalSettings>): Promise<boolean> {
  const snapshot = scope.getSnapshot()
  if (snapshot.status !== 'ready' || !snapshot.writable) return false
  await scope.mutate(Object.entries(values).map(([key, value]) => ({ op: 'set' as const, path: [key], value })))
  const current = scope.getSnapshot()
  return current.status === 'ready' && current.value !== undefined
    && Object.entries(values).every(([key, value]) => current.value?.[key as keyof ApprovalSettings] === value)
}

/** Empty, fractional, exponential and non-finite drafts never become settings writes. */
export function parseIntegerDraft(text: string, min: number, max: number): number | undefined {
  if (!/^\d+$/.test(text.trim())) return undefined
  const value = Number(text)
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : undefined
}

export function dashboardUrl(filter: HistoryFilter = EMPTY_FILTER, before?: number): string {
  const query = new URLSearchParams({ limit: '25' })
  if (before !== undefined) query.set('before', String(before))
  for (const key of ['sessionId', 'status', 'toolName'] as const) {
    if (filter[key].trim()) query.set(key, filter[key].trim())
  }
  return `${APPROVAL_API_PATH}?${query.toString()}`
}

export class ApprovalApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'ApprovalApiError' }
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const validDate = (value: unknown): boolean => finiteNumber(value) && Number.isFinite(new Date(value).getTime())
function validRecord(value: unknown): boolean {
  if (!object(value)) return false
  return ['id', 'sessionId', 'toolName', 'argumentsSummary', 'permissionSummary', 'reason'].every(key => typeof value[key] === 'string')
    && ['callId', 'rootCallId', 'pluginId', 'argumentFingerprint', 'failureKind', 'riskLevel', 'model', 'ruleId'].every(key => value[key] === undefined || typeof value[key] === 'string')
    && validDate(value.createdAt) && validDate(value.updatedAt)
    && (value.elapsedMs === undefined || (finiteNumber(value.elapsedMs) && value.elapsedMs >= 0))
    && ['pre-execute', 'approval-request'].includes(String(value.stage))
    && REVIEW_STATUSES.includes(value.status as ReviewStatus)
    && ['model', 'deterministic', 'rule', 'human', 'failure'].includes(String(value.source))
    && ['not-started', 'unknown', 'succeeded', 'failed', 'cancelled', 'blocked'].includes(String(value.execution))
}
function validRule(value: unknown): boolean {
  if (!object(value)) return false
  return ['id', 'name', 'sessionId', 'toolName'].every(key => typeof value[key] === 'string')
    && ['pluginId', 'argumentFingerprint'].every(key => value[key] === undefined || typeof value[key] === 'string')
    && Number.isSafeInteger(value.version) && typeof value.enabled === 'boolean' && validDate(value.createdAt) && validDate(value.expiresAt)
    && ['allow', 'ask', 'deny'].includes(String(value.action)) && ['exact-arguments', 'creator-plugin'].includes(String(value.scope))
    && ['pre-execute', 'approval-request'].includes(String(value.stage))
}
async function readResponse(response: Response): Promise<unknown> {
  let value: unknown
  try { value = await response.json() } catch { throw new ApprovalApiError(response.status, 'Invalid JSON response') }
  if (!response.ok || (object(value) && typeof value.error === 'string')) {
    throw new ApprovalApiError(response.status, object(value) && typeof value.error === 'string' ? value.error : response.statusText)
  }
  return value
}

/** No Host RPC, token access, cross-origin credentials or private route inference. */
export async function getDashboard(filter: HistoryFilter, before?: number, signal?: AbortSignal): Promise<ApprovalDashboard> {
  const value = await readResponse(await fetch(dashboardUrl(filter, before), { credentials: 'same-origin', cache: 'no-store', ...(signal === undefined ? {} : { signal }) }))
  if (!object(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || !Array.isArray(value.records)
    || !Array.isArray(value.rules) || !object(value.capabilities) || !object(value.storage)
    || !object(value.capabilities.creatorPlus) || !object(value.capabilities.creator)
    || ![value.capabilities.creatorPlus, value.capabilities.creator].every(c => typeof c.automatic === 'boolean' && typeof c.reason === 'string')
    || typeof value.storage.ok !== 'boolean' || !finiteNumber(value.storage.retentionDays) || !finiteNumber(value.storage.maxRecords)
    || (value.storage.reason !== undefined && typeof value.storage.reason !== 'string')
    || (value.nextBefore !== undefined && !finiteNumber(value.nextBefore))
    || !value.records.every(validRecord) || !value.rules.every(validRule)) throw new ApprovalApiError(502, 'Invalid dashboard contract')
  return value as unknown as ApprovalDashboard
}

export async function postCommand(command: ApprovalApiCommand): Promise<{ ok: true; revision?: number } | RuleMatch> {
  const value = await readResponse(await fetch(APPROVAL_API_PATH, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'x-dsh-approval-ui': '1', 'content-type': 'application/json' },
    body: JSON.stringify(command),
  }))
  if (command.action === 'preview') {
    if (!object(value) || typeof value.matched !== 'boolean' || typeof value.reason !== 'string'
      || !['allow', 'ask', 'deny', 'none'].includes(String(value.action))) throw new ApprovalApiError(502, 'Invalid preview contract')
    return value as unknown as RuleMatch
  }
  if (!object(value) || value.ok !== true) throw new ApprovalApiError(502, 'Invalid mutation contract')
  return value as { ok: true; revision?: number }
}

/** Records have no mode discriminator: require both advertised modes, never guess the active session. */
export function canSaveAutomatic(dashboard: ApprovalDashboard | undefined): boolean {
  return dashboard?.capabilities.creatorPlus.automatic === true && dashboard.capabilities.creator.automatic === true
}

const FIXED_CREATOR_TOOLS = ['dshx_hot_reload', 'dshx_activate_new_client'] as const
export function canUseCreatorPlugin(value: Pick<ApprovalRule, 'stage' | 'toolName' | 'pluginId'>): boolean {
  return value.stage === 'pre-execute' && FIXED_CREATOR_TOOLS.some(tool => tool === value.toolName) && Boolean(value.pluginId)
}

/** Fingerprints belong only to exact scope. Keep the source digest in the local draft, never in a plugin-scope payload. */
export function withRuleScope(rule: ApprovalRule, scope: ApprovalRule['scope'], sourceFingerprint?: string): ApprovalRule {
  const { argumentFingerprint, ...binding } = rule
  const fingerprint = sourceFingerprint ?? argumentFingerprint
  return { ...binding, scope, ...(scope === 'exact-arguments' && fingerprint ? { argumentFingerprint: fingerprint } : {}) }
}

export function ruleFromRecord(record: ReviewRecord, name: string, now = Date.now(), id = crypto.randomUUID()): ApprovalRule {
  const scope = canUseCreatorPlugin(record) ? 'creator-plugin' : 'exact-arguments'
  return {
    id, version: 1, name: name.trim(), enabled: true, action: 'ask', scope,
    sessionId: record.sessionId, stage: record.stage, toolName: record.toolName,
    ...(scope === 'exact-arguments' && record.argumentFingerprint ? { argumentFingerprint: record.argumentFingerprint } : {}),
    ...(record.pluginId ? { pluginId: record.pluginId } : {}),
    createdAt: now, expiresAt: now + DEFAULT_RULE_HOURS * 3_600_000,
  }
}

export type RuleProblem = 'ruleNameRequired' | 'ruleBindingRequired' | 'ruleFingerprintRequired' | 'rulePluginRequired' | 'ruleExpiryInvalid' | 'autoBlocked'
export function ruleProblem(rule: ApprovalRule, automatic: boolean, forSave = true, now = Date.now()): RuleProblem | undefined {
  if (!rule.name.trim() || rule.name.length > 120) return 'ruleNameRequired'
  if (!rule.sessionId || !rule.toolName || !['pre-execute', 'approval-request'].includes(rule.stage)) return 'ruleBindingRequired'
  if (rule.scope === 'exact-arguments' && (!rule.argumentFingerprint || !/^[a-fA-F0-9]{64}$/.test(rule.argumentFingerprint))) return 'ruleFingerprintRequired'
  if (rule.scope === 'creator-plugin' && (!canUseCreatorPlugin(rule) || rule.argumentFingerprint !== undefined)) return 'rulePluginRequired'
  if (FIXED_CREATOR_TOOLS.some(tool => tool === rule.toolName) && !rule.pluginId) return 'rulePluginRequired'
  if (!Number.isFinite(rule.expiresAt) || rule.expiresAt <= now || rule.expiresAt - rule.createdAt > MAX_RULE_HOURS * 3_600_000) return 'ruleExpiryInvalid'
  if (forSave && rule.action === 'allow' && !automatic) return 'autoBlocked'
  return undefined
}

/** A deliberate field whitelist: never spread a record or export fingerprints/raw payloads. */
export function redactedHistoryExport(records: readonly ReviewRecord[]): string {
  return JSON.stringify({ version: 1, kind: 'redacted-approval-history', records: records.map(record => ({
    id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt,
    sessionId: record.sessionId, stage: record.stage, toolName: record.toolName, pluginId: record.pluginId,
    status: record.status, source: record.source, model: record.model, reason: record.reason,
    elapsedMs: record.elapsedMs, ruleId: record.ruleId, execution: record.execution,
    argumentsSummary: record.argumentsSummary, permissionSummary: record.permissionSummary,
  })) }, null, 2)
}
