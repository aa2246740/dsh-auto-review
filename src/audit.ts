/** Plugin-owned bounded audit/rule storage. Atomic snapshots never rewrite Session logs. */
import { randomUUID } from 'node:crypto'
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, parse, resolve, sep } from 'node:path'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { ReviewSubject } from './reviewer.ts'
import type { ApprovalDashboard, ApprovalRule, ApprovalSettings, ReviewRecord, ReviewStatus } from './contracts.ts'
import { argumentFingerprint, auditText, summarizeArguments, targetPlugin } from './approval-context.ts'
import { validateRule } from './rules.ts'

interface StoredState { version: 1; revision: number; records: ReviewRecord[]; rules: ApprovalRule[] }
export interface HistoryFilter { limit?: number; before?: number; sessionId?: string; status?: string; toolName?: string }
export interface ReviewAuditPort {
  begin(subject: ReviewSubject, exec?: ToolExecution): ReviewRecord | undefined
  update(id: string, patch: Partial<ReviewRecord>): boolean
  toolResult(exec: Readonly<ToolExecution>, result?: Readonly<ToolExecutionResult>): void
}

export const CAPABILITIES: ApprovalDashboard['capabilities'] = {
  creatorPlus: {
    automatic: false,
    reason: '当前公共工具协议不能证明注册来源与实际执行绑定。Creator+ 自动重载规则暂不可启用；精确请求仍可交人工审核，不以工具名替代来源证明。',
  },
  creator: {
    automatic: false,
    reason: '普通 Creator 的客户端激活使用独立的 cordis/request-run。此版本不自动接管该入口，请使用官方单版本审批；不会自动批准未来版本。',
  },
}

const STATUSES = new Set<ReviewStatus>(['reviewing', 'pending-human', 'allowed', 'denied', 'failed', 'cancelled', 'unavailable', 'interrupted'])
const SOURCES = new Set(['model', 'deterministic', 'rule', 'human', 'failure'])
const EXECUTIONS = new Set(['not-started', 'unknown', 'succeeded', 'failed', 'cancelled', 'blocked'])
const ROW_KEYS = new Set(['id', 'createdAt', 'updatedAt', 'sessionId', 'callId', 'rootCallId', 'stage', 'toolName', 'pluginId', 'argumentFingerprint', 'argumentsSummary', 'permissionSummary', 'status', 'source', 'reason', 'failureKind', 'riskLevel', 'model', 'elapsedMs', 'ruleId', 'execution'])
function lstatIfPresent(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path) } catch (error: unknown) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}
function safeDirectory(path: string): void {
  const absolute = resolve(path)
  let current = parse(absolute).root
  for (const part of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part)
    const stat = lstatIfPresent(current)
    if (stat !== undefined && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('unsafe audit directory')
  }
}
function safeRow(row: ReviewRecord): ReviewRecord {
  if (Object.keys(row).some(key => !ROW_KEYS.has(key)) || !SOURCES.has(row.source) || !EXECUTIONS.has(row.execution)) throw new Error('invalid audit row fields')
  for (const key of ['id', 'sessionId', 'toolName'] as const) {
    if (typeof row[key] !== 'string' || row[key].length === 0 || row[key].length > 256) throw new Error('invalid audit identity')
  }
  for (const key of ['callId', 'rootCallId', 'pluginId', 'argumentFingerprint', 'failureKind', 'riskLevel', 'model', 'ruleId'] as const) {
    if (row[key] !== undefined && (typeof row[key] !== 'string' || row[key].length > 256)) throw new Error('invalid audit metadata')
  }
  return {
    ...row, reason: auditText(row.reason), argumentsSummary: auditText(row.argumentsSummary, 2_000),
    permissionSummary: auditText(row.permissionSummary),
    ...row.model === undefined ? {} : { model: auditText(row.model, 256) },
  }
}
function parseState(text: string): StoredState {
  const value: unknown = JSON.parse(text)
  if (value === null || typeof value !== 'object') throw new Error('invalid audit store')
  const state = value as Partial<StoredState>
  if (state.version !== 1 || !Number.isSafeInteger(state.revision) || (state.revision ?? -1) < 0
    || !Array.isArray(state.records) || state.records.length > 10_000
    || !Array.isArray(state.rules) || state.rules.length > 200) throw new Error('unsupported audit store')
  const records = state.records.map(row => {
    if (row === null || typeof row !== 'object' || typeof row.id !== 'string'
      || typeof row.sessionId !== 'string' || typeof row.toolName !== 'string'
      || !Number.isFinite(row.createdAt) || !Number.isFinite(row.updatedAt)
      || !STATUSES.has(row.status) || (row.stage !== 'pre-execute' && row.stage !== 'approval-request')
      || typeof row.reason !== 'string' || typeof row.argumentsSummary !== 'string'
      || typeof row.permissionSummary !== 'string') throw new Error('invalid audit row')
    return safeRow(row)
  })
  const rules = state.rules.map(validateRule)
  if (Object.keys(state).some(key => !['version', 'revision', 'records', 'rules'].includes(key))
    || new Set(records.map(row => row.id)).size !== records.length || new Set(rules.map(rule => rule.id)).size !== rules.length) throw new Error('invalid audit store fields')
  return { version: 1, revision: state.revision!, records, rules }
}

/** One Host-owned store. Corrupt/unwritable stores disable new automatic grants, not the Host. */
export class ApprovalAuditStore implements ReviewAuditPort {
  readonly path: string
  private state: StoredState = { version: 1, revision: 0, records: [], rules: [] }
  private error: string | undefined
  private disposed = false
  private readonly executions = new WeakMap<Readonly<ToolExecution>, Set<string>>()

  constructor(private readonly directory: string, private readonly settings: () => ApprovalSettings) {
    this.path = join(directory, 'history-v1.json')
    try {
      safeDirectory(directory)
      if (lstatIfPresent(directory) === undefined) mkdirSync(directory, { recursive: true, mode: 0o700 })
      const fileStat = lstatIfPresent(this.path)
      if (fileStat !== undefined) {
        if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('unsafe audit file')
        const fd = openSync(this.path, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const stat = fstatSync(fd)
          if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('unsafe audit file')
          this.state = parseState(readFileSync(fd, 'utf8'))
        } finally { closeSync(fd) }
        const now = Date.now()
        const records = this.state.records.map(row => row.status === 'reviewing' || row.status === 'pending-human'
          ? { ...row, status: 'interrupted' as const, execution: 'unknown' as const, updatedAt: now, reason: '审核在插件卸载或 Host 退出时中断；未恢复旧许可。' }
          : row)
        this.commit({ ...this.state, records })
      }
    } catch {
      this.error = '审核存储不可读取或不可写；已停止自动授权，请检查插件存储权限或损坏情况。原文件未被替换。'
    }
  }

  private limits(): { retentionDays: number; maxRecords: number } {
    const settings = this.settings()
    return {
      retentionDays: Math.max(1, Math.min(365, settings.historyRetentionDays ?? 30)),
      maxRecords: Math.max(100, Math.min(10_000, settings.historyMaxRecords ?? 1_000)),
    }
  }

  private commit(next: StoredState): void {
    if (this.error !== undefined || this.disposed) throw new Error(this.error ?? 'audit store disposed')
    const limits = this.limits()
    const cutoff = Date.now() - limits.retentionDays * 86_400_000
    const bounded: StoredState = { ...next, records: next.records.filter(row => row.createdAt >= cutoff).slice(-limits.maxRecords) }
    const temporary = join(this.directory, `history-${randomUUID()}.tmp`)
    let created = false
    try {
      safeDirectory(this.directory)
      const fileStat = lstatIfPresent(this.path)
      if (fileStat !== undefined && (!fileStat.isFile() || fileStat.isSymbolicLink())) throw new Error('unsafe audit file')
      const fd = openSync(temporary, 'wx', 0o600)
      created = true
      try { writeFileSync(fd, JSON.stringify(bounded)); fsyncSync(fd) } finally { closeSync(fd) }
      renameSync(temporary, this.path)
      created = false
      this.state = bounded
    } catch (error: unknown) {
      this.error = '审核存储写入失败；没有授予新的自动许可。'
      throw error
    } finally {
      if (created) {
        try { unlinkSync(temporary) } catch { /* A failed temporary-file cleanup never changes the committed snapshot. */ }
      }
    }
  }

  begin(subject: ReviewSubject, exec?: ToolExecution): ReviewRecord | undefined {
    if (this.error !== undefined || this.disposed) return undefined
    const createdAt = Math.max(Date.now(), (this.state.records.at(-1)?.createdAt ?? 0) + 1)
    const pluginId = targetPlugin(subject.toolName, subject.arguments)
    const row: ReviewRecord = {
      id: randomUUID(), createdAt, updatedAt: createdAt,
      sessionId: String(subject.agent?.session.header.id ?? subject.agent?.id ?? 'unbound'),
      ...exec === undefined ? {} : { callId: String(exec.callId), rootCallId: String(exec.rootCallId), argumentFingerprint: argumentFingerprint(exec.arguments) },
      stage: subject.stage, toolName: subject.toolName,
      ...pluginId === undefined ? {} : { pluginId },
      argumentsSummary: summarizeArguments(subject.arguments),
      permissionSummary: auditText(subject.approvalReason ?? (subject.downstream.kind === 'ask' ? subject.downstream.reason ?? '' : '')),
      status: 'reviewing', source: 'model', reason: '', execution: 'not-started',
    }
    try {
      this.commit({ ...this.state, records: [...this.state.records, row] })
      if (exec !== undefined) {
        let records = this.executions.get(exec)
        if (records === undefined) { records = new Set(); this.executions.set(exec, records) }
        records.add(row.id)
      }
      return structuredClone(row)
    } catch { return undefined }
  }

  update(id: string, patch: Partial<ReviewRecord>): boolean {
    if (this.error !== undefined || this.disposed) return false
    const index = this.state.records.findIndex(row => row.id === id)
    if (index < 0) return false
    const previous = this.state.records[index]!
    const row: ReviewRecord = safeRow({
      ...previous, ...patch, id: previous.id, createdAt: previous.createdAt, updatedAt: Date.now(),
      reason: auditText(patch.reason ?? previous.reason),
    })
    const records = [...this.state.records]
    records[index] = row
    try { this.commit({ ...this.state, records }); return true } catch { return false }
  }

  toolResult(exec: Readonly<ToolExecution>, result?: Readonly<ToolExecutionResult>): void {
    if (this.error !== undefined || this.disposed) return
    const executionRecords = this.executions.get(exec)
    if (executionRecords === undefined) return // HMR or a reused callId cannot prove which execution returned.
    const records = this.state.records.map(row => {
      if (!executionRecords.has(row.id)) return row
      const value = result?.isError === false && result.value !== null && typeof result.value === 'object' && !Array.isArray(result.value)
        ? result.value : undefined
      const bodyFailed = typeof value?.['exitCode'] === 'number' && value['exitCode'] !== 0
      const execution = row.status === 'denied' || row.status === 'failed' || row.status === 'unavailable' ? 'blocked' as const
        : row.status === 'cancelled' ? 'cancelled' as const
          : result === undefined ? 'unknown' as const : result.isError || bodyFailed ? 'failed' as const : 'succeeded' as const
      const status = row.status === 'pending-human' || row.status === 'reviewing' ? 'interrupted' as const : row.status
      return { ...row, status, execution, updatedAt: Date.now() }
    })
    if (records.some((row, index) => row !== this.state.records[index])) {
      try { this.commit({ ...this.state, records }) } catch { /* Storage health is surfaced through dashboard(), never a fabricated execution result. */ }
    }
    this.executions.delete(exec)
  }

  dashboard(filter: HistoryFilter = {}): ApprovalDashboard {
    const limit = Math.max(1, Math.min(200, filter.limit ?? 50))
    const cutoff = Date.now() - this.limits().retentionDays * 86_400_000
    const rows = this.state.records.filter(row => row.createdAt >= cutoff
      && (filter.before === undefined || row.createdAt < filter.before)
      && (filter.sessionId === undefined || row.sessionId === filter.sessionId)
      && (filter.status === undefined || row.status === filter.status)
      && (filter.toolName === undefined || row.toolName.includes(filter.toolName))).toReversed()
    return structuredClone({
      version: 1, revision: this.state.revision, records: rows.slice(0, limit), rules: this.state.rules,
      ...rows.length > limit ? { nextBefore: rows[limit - 1]!.createdAt } : {},
      capabilities: CAPABILITIES,
      storage: { ok: this.error === undefined, ...this.error === undefined ? {} : { reason: this.error }, ...this.limits() },
    })
  }

  rules(): ApprovalRule[] { return structuredClone(this.state.rules) }
  record(id: string): ReviewRecord | undefined { return structuredClone(this.state.records.find(row => row.id === id)) }

  private ruleChange(rule: ApprovalRule, action: 'save' | 'delete'): ReviewRecord {
    const createdAt = Math.max(Date.now(), (this.state.records.at(-1)?.createdAt ?? 0) + 1)
    return {
      id: randomUUID(), createdAt, updatedAt: createdAt, sessionId: rule.sessionId,
      stage: 'pre-execute', toolName: `approval-rule.${action}`, ruleId: rule.id,
      argumentsSummary: JSON.stringify({ ruleId: rule.id, version: rule.version, action: rule.action, enabled: rule.enabled, scope: rule.scope, expiresAt: rule.expiresAt }),
      permissionSummary: '已认证审批管理页面的显式规则操作；不是模型工具授权。',
      status: 'allowed', source: 'human', reason: action === 'save' ? '保存了用户规则；不会执行历史动作。' : '删除了用户规则。', execution: 'succeeded',
    }
  }

  saveRule(value: unknown, expectedRevision: number): number {
    this.checkRevision(expectedRevision)
    const rule = validateRule(value)
    if (rule.action === 'allow' && rule.enabled) throw new Error('工具执行来源尚不可验证，自动允许规则只能保存为禁用草稿。请使用必须人工或拒绝自动批准规则。')
    const previous = this.state.rules.find(item => item.id === rule.id)
    if (rule.version !== (previous?.version ?? 0) + 1) throw new Error('规则版本冲突，请刷新后重试。')
    if (previous !== undefined && previous.createdAt !== rule.createdAt) throw new Error('不能修改规则创建时间。')
    if (rule.expiresAt <= Date.now()) throw new Error('不能保存已过期的规则。')
    const rules = this.state.rules.filter(item => item.id !== rule.id)
    if (rules.length >= 200) throw new Error('最多保存 200 条规则。')
    this.commit({ ...this.state, revision: this.state.revision + 1, rules: [...rules, rule], records: [...this.state.records, this.ruleChange(rule, 'save')] })
    return this.state.revision
  }

  deleteRule(id: string, expectedRevision: number): number {
    this.checkRevision(expectedRevision)
    const previous = this.state.rules.find(rule => rule.id === id)
    if (previous === undefined) throw new Error('规则不存在，请刷新。')
    this.commit({ ...this.state, revision: this.state.revision + 1, rules: this.state.rules.filter(rule => rule.id !== id), records: [...this.state.records, this.ruleChange(previous, 'delete')] })
    return this.state.revision
  }

  clearHistory(expectedRevision: number): number {
    this.checkRevision(expectedRevision)
    if (this.state.records.some(row => row.status === 'pending-human' || row.status === 'reviewing')) throw new Error('存在待决审核，不能清理。')
    this.commit({ ...this.state, revision: this.state.revision + 1, records: [] })
    return this.state.revision
  }

  private checkRevision(revision: number): void {
    if (this.error !== undefined) throw new Error(this.error)
    if (revision !== this.state.revision) throw new Error('规则版本冲突，请刷新后重试。')
  }

  dispose(): void {
    if (this.disposed) return
    const records = this.state.records.map(row => row.status === 'pending-human' || row.status === 'reviewing'
      ? { ...row, status: 'interrupted' as const, execution: 'unknown' as const, updatedAt: Date.now(), reason: '插件已卸载，旧审核不能恢复为许可。' } : row)
    try { if (this.error === undefined) this.commit({ ...this.state, records }) } catch { /* A storage fault must not prevent safe plugin teardown. */ } finally { this.disposed = true }
  }
}
