import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { ApprovalRule, ApprovalSettings, ReviewRecord } from '../src/contracts.ts'
import type { ReviewSubject } from '../src/reviewer.ts'
import { ApprovalAuditStore } from '../src/audit.ts'
import { argumentFingerprint, auditText, summarizeArguments, targetPlugin } from '../src/approval-context.ts'

const NOW = Date.UTC(2026, 8, 13, 12)
const DAY = 86_400_000
const FINGERPRINT = 'a'.repeat(64)
let root: string

// Every filesystem operation in these tests is contained in this test's own
// canonical mkdtemp directory. No real Host, profile, Session log or network is used.
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-approval-audit-test-')))
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

function execution(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    name: 'read', arguments: { file_path: 'src/example.ts' },
    callId: 'call-1', rootCallId: 'root-call-1', token: Symbol('audit-test'),
    signal: new AbortController().signal,
    agent: { id: 'agent-1', session: { header: { id: 'session-1' } } },
    ...overrides,
  } as unknown as ToolExecution
}

function subject(exec = execution(), overrides: Partial<ReviewSubject> = {}): ReviewSubject {
  return {
    stage: 'pre-execute', toolName: exec.name, arguments: exec.arguments,
    agent: exec.agent, recentUserRequests: [], trustedDeveloperInstructions: [],
    trustedUserResponses: [], recentAssistantMessages: [], recentExecutionEvidence: [],
    downstream: { kind: 'ask', reason: '必须确认' },
    ...overrides,
  }
}

function result(value: unknown = { exitCode: 0 }, isError = false): ToolExecutionResult {
  return { isError, value } as ToolExecutionResult
}

function record(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'record-1', createdAt: NOW - 1000, updatedAt: NOW - 1000,
    sessionId: 'session-1', callId: 'call-1', rootCallId: 'root-call-1',
    stage: 'pre-execute', toolName: 'read', argumentFingerprint: FINGERPRINT,
    argumentsSummary: '{"file_path":"src/example.ts"}', permissionSummary: '需要审批',
    status: 'allowed', source: 'human', reason: '已确认', execution: 'not-started',
    ...overrides,
  }
}

function rule(overrides: Partial<ApprovalRule> = {}): ApprovalRule {
  return {
    id: 'rule-1', version: 1, name: '人工确认', enabled: true, action: 'ask',
    scope: 'exact-arguments', sessionId: 'session-1', stage: 'pre-execute',
    toolName: 'read', argumentFingerprint: FINGERPRINT,
    createdAt: NOW - 1000, expiresAt: NOW + DAY,
    ...overrides,
  }
}

function store(settings: ApprovalSettings = {}, directory = join(root, 'audit')): ApprovalAuditStore {
  return new ApprovalAuditStore(directory, () => settings)
}

function seed(records: ReviewRecord[] = [], rules: ApprovalRule[] = [], revision = 0): string {
  const directory = join(root, 'audit')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'history-v1.json'), JSON.stringify({ version: 1, revision, records, rules }), { mode: 0o600 })
  return directory
}

function snapshot(current: ApprovalAuditStore): string {
  return readFileSync(current.path, 'utf8')
}

function begin(current: ApprovalAuditStore, exec = execution(), overrides: Partial<ReviewSubject> = {}): ReviewRecord {
  const row = current.begin(subject(exec, overrides), exec)
  expect(row).toBeDefined()
  return row!
}

describe('ApprovalAuditStore: lifecycle and interruption', () => {
  it('begins an exact redacted review without inventing approval or execution success', () => {
    const current = store()
    const exec = execution({ name: 'dshx_hot_reload', arguments: { name: 'demo-plugin' } })
    const row = begin(current, exec)
    expect(row).toMatchObject({
      sessionId: 'session-1', callId: 'call-1', rootCallId: 'root-call-1',
      stage: 'pre-execute', toolName: 'dshx_hot_reload', pluginId: 'demo-plugin',
      status: 'reviewing', execution: 'not-started', source: 'model',
      permissionSummary: '必须确认', argumentFingerprint: argumentFingerprint(exec.arguments),
    })
    expect(current.record(row.id)).toEqual(row)
    expect(current.dashboard().storage.ok).toBe(true)
    expect(current.dashboard().revision).toBe(0)
    expect(current.dashboard().capabilities.creatorPlus.automatic).toBe(false)
    expect(current.dashboard().capabilities.creator.automatic).toBe(false)
  })

  it('does not invent a call binding or exact fingerprint without execution context', () => {
    const current = store()
    const row = current.begin(subject())!
    expect(row).toBeDefined()
    expect(row.callId).toBeUndefined()
    expect(row.rootCallId).toBeUndefined()
    expect(row.argumentFingerprint).toBeUndefined()
  })

  it('updates a row while preserving its immutable id and creation time', () => {
    const current = store()
    const row = begin(current)
    vi.mocked(Date.now).mockReturnValue(NOW + 5000)
    expect(current.update(row.id, { id: 'forged', createdAt: 0, status: 'allowed', source: 'human', reason: '人工确认' })).toBe(true)
    expect(current.record(row.id)).toMatchObject({ id: row.id, createdAt: row.createdAt, updatedAt: NOW + 5000, status: 'allowed', execution: 'not-started', source: 'human' })
    expect(current.record('forged')).toBeUndefined()
    expect(current.dashboard().revision).toBe(0)
    expect(current.update('missing', { status: 'allowed' })).toBe(false)
  })

  it('returns detached snapshots for begin, record, dashboard and rules', () => {
    const current = store()
    const row = begin(current)
    row.reason = 'caller changed begin'
    current.record(row.id)!.reason = 'caller changed record'
    current.dashboard().records[0]!.reason = 'caller changed dashboard'
    current.saveRule(rule(), 0)
    current.rules()[0]!.name = 'caller changed rule'
    expect(current.record(row.id)?.reason).toBe('')
    expect(current.rules()[0]?.name).toBe('人工确认')
  })

  it.each(['reviewing', 'pending-human'] as const)('reload converts unfinished %s to interrupted without restoring approval', status => {
    seed([record({ status })])
    const current = store()
    expect(current.record('record-1')).toMatchObject({ status: 'interrupted', execution: 'unknown', updatedAt: NOW })
    expect(JSON.parse(snapshot(current)).records[0].status).toBe('interrupted')
  })

  it('reload preserves finished approval and execution states', () => {
    seed([record({ status: 'allowed', execution: 'succeeded' }), record({ id: 'denied', status: 'denied', execution: 'blocked' })])
    const current = store()
    expect(current.record('record-1')).toMatchObject({ status: 'allowed', execution: 'succeeded' })
    expect(current.record('denied')).toMatchObject({ status: 'denied', execution: 'blocked' })
  })

  it('dispose interrupts unfinished rows and prevents subsequent writes', () => {
    const current = store()
    const row = begin(current)
    current.update(row.id, { status: 'pending-human' })
    current.dispose()
    const persisted = snapshot(current)
    expect(current.record(row.id)).toMatchObject({ status: 'interrupted', execution: 'unknown' })
    expect(current.begin(subject())).toBeUndefined()
    expect(current.update(row.id, { status: 'allowed' })).toBe(false)
    expect(() => current.saveRule(rule(), 0)).toThrow()
    expect(() => current.dispose()).not.toThrow()
    expect(snapshot(current)).toBe(persisted)
    expect(store().record(row.id)?.status).toBe('interrupted')
  })

  it('uses approvalReason ahead of downstream reason and redacts it', () => {
    const current = store()
    const row = begin(current, execution(), { approvalReason: 'token=PERMISSION_TOKEN' })
    expect(row.permissionSummary).toContain('[REDACTED]')
    expect(snapshot(current)).not.toContain('PERMISSION_TOKEN')
  })
})

describe('ApprovalAuditStore: bounded retention and stable pagination', () => {
  it.each([
    [{ historyMaxRecords: -1, historyRetentionDays: 0 }, 100, 1],
    [{ historyMaxRecords: 100, historyRetentionDays: 1 }, 100, 1],
    [{ historyMaxRecords: 10_000, historyRetentionDays: 365 }, 10_000, 365],
    [{ historyMaxRecords: 50_000, historyRetentionDays: 999 }, 10_000, 365],
    [{}, 1000, 30],
  ] as const)('bounds configured limits %#', (settings, maxRecords, retentionDays) => {
    expect(store(settings).dashboard().storage).toMatchObject({ ok: true, maxRecords, retentionDays })
  })

  it('retains only the newest 100 rows at the minimum bound', () => {
    seed(Array.from({ length: 101 }, (_, index) => record({ id: `row-${index}`, createdAt: NOW - 1000 + index })))
    const current = store({ historyMaxRecords: 1 })
    expect(current.record('row-0')).toBeUndefined()
    expect(current.dashboard({ limit: 200 }).records).toHaveLength(100)
    expect(JSON.parse(snapshot(current)).records).toHaveLength(100)
    expect(current.record('row-100')).toBeDefined()
  })

  it('keeps exactly 10000 newest records after append at the maximum bound', () => {
    seed(Array.from({ length: 10_000 }, (_, index) => record({ id: `row-${index}`, createdAt: NOW - 10_000 + index })))
    const current = store({ historyMaxRecords: 99_999 })
    const appended = begin(current)
    const persisted = JSON.parse(snapshot(current)).records as ReviewRecord[]
    expect(persisted).toHaveLength(10_000)
    expect(persisted[0]?.id).toBe('row-1')
    expect(persisted.at(-1)?.id).toBe(appended.id)
    expect(current.record('row-0')).toBeUndefined()
  })

  it('prunes before the retention cutoff but preserves its inclusive boundary', () => {
    seed([
      record({ id: 'old', createdAt: NOW - DAY - 1 }),
      record({ id: 'boundary', createdAt: NOW - DAY }),
      record({ id: 'new', createdAt: NOW - 1 }),
    ])
    const current = store({ historyRetentionDays: 1 })
    expect(current.dashboard().records.map(row => row.id)).toEqual(['new', 'boundary'])
    expect(JSON.parse(snapshot(current)).records.map((row: ReviewRecord) => row.id)).toEqual(['boundary', 'new'])
  })

  it('applies changed retention settings to reads and the next committed snapshot', () => {
    const settings: ApprovalSettings = { historyRetentionDays: 30 }
    seed([record({ id: 'older', createdAt: NOW - 2 * DAY }), record({ id: 'newer', createdAt: NOW - 1 })])
    const current = store(settings)
    expect(current.dashboard().records).toHaveLength(2)
    settings.historyRetentionDays = 1
    expect(current.dashboard().records.map(row => row.id)).toEqual(['newer'])
    current.update('newer', { reason: '更新' })
    expect(JSON.parse(snapshot(current)).records).toHaveLength(1)
  })

  it('paginates same-clock entries without repeats or gaps after concurrent append/update', () => {
    const current = store()
    const created = Array.from({ length: 5 }, () => begin(current))
    expect(new Set(created.map(row => row.createdAt)).size).toBe(5)
    const first = current.dashboard({ limit: 2 })
    expect(first.records.map(row => row.id)).toEqual([created[4]!.id, created[3]!.id])
    const later = begin(current)
    current.update(created[2]!.id, { status: 'allowed' })
    const second = current.dashboard({ limit: 2, before: first.nextBefore })
    const third = current.dashboard({ limit: 2, before: second.nextBefore })
    const seen = [...first.records, ...second.records, ...third.records].map(row => row.id)
    expect(seen).toEqual(created.toReversed().map(row => row.id))
    expect(seen).not.toContain(later.id)
    expect(new Set(seen).size).toBe(5)
    expect(third.nextBefore).toBeUndefined()
  })

  it('combines history filters and never exposes another session in that page', () => {
    seed([
      record({ id: 'wanted', sessionId: 'session-1', status: 'allowed', toolName: 'dshx_hot_reload' }),
      record({ id: 'other-session', sessionId: 'session-2', status: 'allowed', toolName: 'dshx_hot_reload' }),
      record({ id: 'other-status', sessionId: 'session-1', status: 'denied', toolName: 'dshx_hot_reload' }),
      record({ id: 'other-tool', sessionId: 'session-1', status: 'allowed', toolName: 'read' }),
    ])
    expect(store().dashboard({ sessionId: 'session-1', status: 'allowed', toolName: 'hot_reload' }).records.map(row => row.id)).toEqual(['wanted'])
  })

  it('bounds page size to 1 through 200', () => {
    seed(Array.from({ length: 201 }, (_, index) => record({ id: `row-${index}`, createdAt: NOW - 1000 + index })))
    const current = store()
    expect(current.dashboard({ limit: 0 }).records).toHaveLength(1)
    expect(current.dashboard({ limit: 999 }).records).toHaveLength(200)
  })
})

describe('ApprovalAuditStore: rules, revision and optimistic concurrency', () => {
  it('creates, updates, reloads and deletes a versioned rule with revision checks', () => {
    const current = store()
    expect(current.saveRule(rule(), 0)).toBe(1)
    expect(current.saveRule(rule({ version: 2, action: 'deny' }), 1)).toBe(2)
    expect(current.rules()).toEqual([rule({ version: 2, action: 'deny' })])
    const reloaded = store()
    expect(reloaded.dashboard().revision).toBe(2)
    expect(reloaded.rules()).toEqual(current.rules())
    expect(reloaded.deleteRule('rule-1', 2)).toBe(3)
    expect(reloaded.rules()).toEqual([])
    expect(store().dashboard().revision).toBe(3)
  })

  it.each(['save', 'delete', 'clear'] as const)('rejects stale revision for %s without writing', operation => {
    const current = store()
    current.saveRule(rule(), 0)
    const before = snapshot(current)
    const mutate = () => operation === 'save'
      ? current.saveRule(rule({ id: 'rule-2' }), 0)
      : operation === 'delete' ? current.deleteRule('rule-1', 0) : current.clearHistory(0)
    expect(mutate).toThrow('版本冲突')
    expect(current.dashboard().revision).toBe(1)
    expect(snapshot(current)).toBe(before)
  })

  it('rejects nonsequential rule versions and changing the creation timestamp', () => {
    const current = store()
    expect(() => current.saveRule(rule({ version: 2 }), 0)).toThrow('版本冲突')
    current.saveRule(rule(), 0)
    expect(() => current.saveRule(rule(), 1)).toThrow('版本冲突')
    expect(() => current.saveRule(rule({ version: 3 }), 1)).toThrow('版本冲突')
    expect(() => current.saveRule(rule({ version: 2, createdAt: NOW - 500 }), 1)).toThrow('创建时间')
    expect(current.dashboard().revision).toBe(1)
  })

  it.each([NOW - 1, NOW])('rejects expired rule ending at %s without advancing revision', expiresAt => {
    const current = store()
    expect(() => current.saveRule(rule({ expiresAt }), 0)).toThrow('过期')
    expect(current.dashboard().revision).toBe(0)
    expect(current.rules()).toEqual([])
  })

  it('rejects enabled allow but accepts and preserves a disabled allow draft', () => {
    const current = store()
    expect(() => current.saveRule(rule({ action: 'allow' }), 0)).toThrow('禁用草稿')
    expect(current.dashboard().revision).toBe(0)
    const draft = rule({ action: 'allow', enabled: false })
    expect(current.saveRule(draft, 0)).toBe(1)
    expect(store().rules()).toEqual([draft])
    expect(() => current.saveRule({ ...draft, enabled: true, version: 2 }, 1)).toThrow('禁用草稿')
    expect(current.rules()[0]?.enabled).toBe(false)
  })

  it.each(['ask', 'deny'] as const)('accepts enabled %s rules while automatic capability is unavailable', action => {
    const current = store()
    expect(current.saveRule(rule({ action }), 0)).toBe(1)
    expect(current.dashboard().capabilities.creatorPlus.automatic).toBe(false)
  })

  it('caps stored rules at 200 while permitting an existing rule update', () => {
    seed([], Array.from({ length: 200 }, (_, index) => rule({ id: `rule-${index}` })), 7)
    const current = store()
    expect(() => current.saveRule(rule({ id: 'new-rule' }), 7)).toThrow('200')
    expect(current.saveRule(rule({ id: 'rule-0', version: 2, action: 'deny' }), 7)).toBe(8)
    expect(current.rules()).toHaveLength(200)
  })

  it('rejects deletion of a missing rule without advancing revision', () => {
    const current = store()
    expect(() => current.deleteRule('missing', 0)).toThrow('不存在')
    expect(current.dashboard().revision).toBe(0)
  })

  it('refuses clearing pending reviews and preserves rules when settled history is cleared', () => {
    const current = store()
    const row = begin(current)
    current.saveRule(rule(), 0)
    expect(() => current.clearHistory(1)).toThrow('待决')
    current.update(row.id, { status: 'pending-human' })
    expect(() => current.clearHistory(1)).toThrow('待决')
    current.update(row.id, { status: 'denied', execution: 'blocked' })
    expect(current.clearHistory(1)).toBe(2)
    expect(current.dashboard().records).toEqual([])
    expect(current.rules()).toEqual([rule()])
  })
})

describe('ApprovalAuditStore: corrupt files and symlink boundaries', () => {
  const corruptCases: [string, () => string][] = [
    ['malformed JSON', () => '{broken'],
    ['unsupported version', () => JSON.stringify({ version: 2, revision: 0, records: [], rules: [] })],
    ['negative revision', () => JSON.stringify({ version: 1, revision: -1, records: [], rules: [] })],
    ['missing records', () => JSON.stringify({ version: 1, revision: 0, rules: [] })],
    ['invalid row status', () => JSON.stringify({ version: 1, revision: 0, records: [{ ...record(), status: 'fake' }], rules: [] })],
    ['invalid row stage', () => JSON.stringify({ version: 1, revision: 0, records: [{ ...record(), stage: 'fake' }], rules: [] })],
    ['invalid rule', () => JSON.stringify({ version: 1, revision: 0, records: [], rules: [{ ...rule(), scope: 'all' }] })],
    ['invalid decision source', () => JSON.stringify({ version: 1, revision: 0, records: [{ ...record(), source: 'fabricated' }], rules: [] }, null, 2)],
    ['invalid execution status', () => JSON.stringify({ version: 1, revision: 0, records: [{ ...record(), execution: 'fabricated' }], rules: [] }, null, 2)],
    ['unrecognized raw payload field', () => JSON.stringify({ version: 1, revision: 0, records: [{ ...record(), rawArguments: { password: 'NEVER_PERSIST_RAW_PAYLOAD' } }], rules: [] }, null, 2)],
  ]

  it.each(corruptCases)('preserves corrupt bytes and disables storage: %s', (_name, content) => {
    const directory = join(root, 'audit')
    mkdirSync(directory)
    const path = join(directory, 'history-v1.json')
    const original = content()
    writeFileSync(path, original)
    const current = store()
    expect.soft(current.dashboard().storage.ok).toBe(false)
    expect.soft(current.dashboard().storage.reason).toBeTruthy()
    expect.soft(current.begin(subject())).toBeUndefined()
    expect.soft(() => current.saveRule(rule(), 0)).toThrow()
    expect.soft(readFileSync(path, 'utf8')).toBe(original)
  })

  it('rejects an oversized persisted record collection instead of silently rewriting it', () => {
    seed(Array.from({ length: 10_001 }, (_, index) => record({ id: `row-${index}` })))
    const original = readFileSync(join(root, 'audit/history-v1.json'), 'utf8')
    const current = store()
    expect(current.dashboard().storage.ok).toBe(false)
    expect(snapshot(current)).toBe(original)
  })

  it('rejects a symlink store file and leaves its target untouched', () => {
    const directory = join(root, 'audit')
    mkdirSync(directory)
    const target = join(root, 'target.json')
    writeFileSync(target, 'TARGET_MUST_STAY_UNCHANGED')
    symlinkSync(target, join(directory, 'history-v1.json'))
    const current = store()
    expect(current.dashboard().storage.ok).toBe(false)
    expect(current.begin(subject())).toBeUndefined()
    expect(readFileSync(target, 'utf8')).toBe('TARGET_MUST_STAY_UNCHANGED')
    expect(lstatSync(current.path).isSymbolicLink()).toBe(true)
  })

  it('rejects a dangling symlink file instead of replacing it as a missing file', () => {
    const directory = join(root, 'audit')
    mkdirSync(directory)
    const target = join(root, 'absent-target.json')
    symlinkSync(target, join(directory, 'history-v1.json'))
    const current = store()
    expect.soft(current.dashboard().storage.ok).toBe(false)
    expect.soft(current.begin(subject())).toBeUndefined()
    expect.soft(lstatSync(current.path).isSymbolicLink()).toBe(true)
    expect.soft(existsSync(target)).toBe(false)
  })

  it('rejects a direct symlink directory without creating files in its target', () => {
    const target = join(root, 'target-directory')
    mkdirSync(target)
    const directory = join(root, 'linked-audit')
    symlinkSync(target, directory, 'dir')
    const current = store({}, directory)
    expect(current.dashboard().storage.ok).toBe(false)
    expect(current.begin(subject())).toBeUndefined()
    expect(readdirSync(target)).toEqual([])
  })

  it('rejects a symlink ancestor without creating the target subdirectory or file', () => {
    const target = join(root, 'target-directory')
    mkdirSync(target)
    const alias = join(root, 'alias')
    symlinkSync(target, alias, 'dir')
    const current = store({}, join(alias, 'audit'))
    expect.soft(current.dashboard().storage.ok).toBe(false)
    expect.soft(current.begin(subject())).toBeUndefined()
    expect.soft(readdirSync(target)).toEqual([])
  })

  it('rejects a symlink file introduced after opening the store', () => {
    const current = store()
    const row = begin(current)
    const target = join(root, 'replacement-target.json')
    writeFileSync(target, 'REPLACEMENT_TARGET_UNCHANGED')
    unlinkSync(current.path)
    symlinkSync(target, current.path)
    expect(current.update(row.id, { status: 'allowed' })).toBe(false)
    expect(current.dashboard().storage.ok).toBe(false)
    expect(readFileSync(target, 'utf8')).toBe('REPLACEMENT_TARGET_UNCHANGED')
    expect(lstatSync(current.path).isSymbolicLink()).toBe(true)
  })

  it('rejects a symlink directory introduced after opening the store', () => {
    const directory = join(root, 'audit')
    const current = store({}, directory)
    const row = begin(current)
    const target = join(root, 'replacement-directory')
    mkdirSync(target)
    renameSync(directory, join(root, 'retired-audit'))
    symlinkSync(target, directory, 'dir')
    expect(current.update(row.id, { status: 'allowed' })).toBe(false)
    expect(current.dashboard().storage.ok).toBe(false)
    expect(readdirSync(target)).toEqual([])
  })
})

describe('ApprovalAuditStore: execution results are not approval outcomes', () => {
  it('records success only after an actual successful result', () => {
    const current = store()
    const exec = execution()
    const row = begin(current, exec)
    current.update(row.id, { status: 'allowed' })
    expect(current.record(row.id)?.execution).toBe('not-started')
    current.toolResult(exec, result())
    expect(current.record(row.id)).toMatchObject({ status: 'allowed', execution: 'succeeded' })
  })

  it.each([1, 2, -1, 127])('records exitCode %s as failed even with isError false', exitCode => {
    const current = store()
    const exec = execution()
    const row = begin(current, exec)
    current.update(row.id, { status: 'allowed' })
    current.toolResult(exec, result({ exitCode }))
    expect(current.record(row.id)).toMatchObject({ status: 'allowed', execution: 'failed' })
  })

  it('records a tool protocol error as failed', () => {
    const current = store()
    const exec = execution()
    const row = begin(current, exec)
    current.update(row.id, { status: 'allowed' })
    current.toolResult(exec, result({ message: 'failed' }, true))
    expect(current.record(row.id)?.execution).toBe('failed')
  })

  it('leaves execution unknown when no result is supplied', () => {
    const current = store()
    const exec = execution()
    const row = begin(current, exec)
    current.update(row.id, { status: 'allowed' })
    current.toolResult(exec)
    expect(current.record(row.id)?.execution).toBe('unknown')
  })

  it('preserves cancellation instead of claiming success from a late result', () => {
    const current = store()
    const exec = execution()
    const row = begin(current, exec)
    current.update(row.id, { status: 'cancelled' })
    current.toolResult(exec, result())
    expect(current.record(row.id)).toMatchObject({ status: 'cancelled', execution: 'cancelled' })
  })

  it.each(['denied', 'failed', 'unavailable'] as const)('records %s review as blocked despite a late successful result', status => {
    const current = store()
    const exec = execution()
    const row = begin(current, exec)
    current.update(row.id, { status })
    current.toolResult(exec, result())
    expect(current.record(row.id)).toMatchObject({ status, execution: 'blocked' })
  })

  it('does not infer allowed from an unfinished review when a result arrives', () => {
    const current = store()
    const exec = execution()
    const row = begin(current, exec)
    current.toolResult(exec, result())
    expect(current.record(row.id)).toMatchObject({ status: 'interrupted', execution: 'succeeded' })
  })

  it('binds results to both call id and session id', () => {
    const current = store()
    const exec = execution()
    const row = begin(current, exec)
    current.update(row.id, { status: 'allowed' })
    current.toolResult(execution({ callId: 'other-call' as ToolExecution['callId'] }), result())
    const otherSession = execution({ agent: { id: 'other-agent', session: { header: { id: 'session-2' } } } as ToolExecution['agent'] })
    current.toolResult(otherSession, result())
    expect(current.record(row.id)?.execution).toBe('not-started')
    current.toolResult(exec, result())
    expect(current.record(row.id)?.execution).toBe('succeeded')
  })
})

describe('approval-context: complete fingerprints and metadata-only summaries', () => {
  it('hashes sorted nested object keys deterministically without changing input', () => {
    const left = { z: [{ beta: 2, alpha: 1 }], a: { b: true, a: null } }
    const right = { a: { a: null, b: true }, z: [{ alpha: 1, beta: 2 }] }
    const original = JSON.stringify(left)
    expect(argumentFingerprint(left)).toMatch(/^[a-f0-9]{64}$/)
    expect(argumentFingerprint(left)).toBe(argumentFingerprint(right))
    expect(JSON.stringify(left)).toBe(original)
  })

  it('distinguishes array order, primitive types and complete JSON structure', () => {
    const values = [[1, 2], [2, 1], null, false, 0, '0', {}, [], { value: null }]
    expect(new Set(values.map(argumentFingerprint)).size).toBe(values.length)
  })

  it('distinguishes secret values even when their redacted summaries are identical', () => {
    const left = { token: 'FIRST_TOKEN' }
    const right = { token: 'OTHER_TOKEN' }
    expect(summarizeArguments(left)).toBe(summarizeArguments(right))
    expect(argumentFingerprint(left)).not.toBe(argumentFingerprint(right))
  })

  it('hashes complete content, including differences beyond summary truncation', () => {
    const left = { file_path: 'src/example.ts', content: 'x'.repeat(5000) + 'a' }
    const right = { file_path: 'src/example.ts', content: 'x'.repeat(5000) + 'b' }
    expect(summarizeArguments(left)).toBe(summarizeArguments(right))
    expect(argumentFingerprint(left)).not.toBe(argumentFingerprint(right))
  })

  it.each(['token', 'password', 'api_key', 'authorization', 'private_key'])('redacts credential field %s from nested summaries', key => {
    const summary = summarizeArguments({ nested: [{ [key]: 'CREDENTIAL_VALUE_MUST_NOT_APPEAR' }] })
    expect(summary).not.toContain('CREDENTIAL_VALUE_MUST_NOT_APPEAR')
    expect(summary).toContain('[REDACTED]')
  })

  it.each(['content', 'text', 'code', 'script', 'command', 'cmd', 'input', 'chars', 'old_string', 'new_string', 'javascript'])('omits full file/shell/JS payload field %s, not merely its suffix', key => {
    const summary = summarizeArguments({ file_path: 'src/example.ts', [key]: 'FULL_PROGRAM_OR_FILE_PAYLOAD' })
    expect(summary).not.toContain('FULL_PROGRAM_OR_FILE_PAYLOAD')
    expect(summary).toContain('omitted')
    expect(summary).toContain('src/example.ts')
  })

  it.each(['fileContent', 'file_content'])('omits complete file contents under alias %s', key => {
    expect(summarizeArguments({ [key]: 'FULL_FILE_CONTENT_MUST_NOT_APPEAR' })).not.toContain('FULL_FILE_CONTENT_MUST_NOT_APPEAR')
  })

  it('bounds summaries for long, wide and deeply nested arguments', () => {
    const wide = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`field-${index}`, 'v'.repeat(1000)]))
    const deep = { a: { b: { c: { d: { e: { f: { token: 'DEEP_TOKEN', value: 'DEEP_PAYLOAD' } } } } } } }
    expect(summarizeArguments(wide).length).toBeLessThanOrEqual(2000)
    expect(summarizeArguments(deep)).not.toContain('DEEP_TOKEN')
    expect(summarizeArguments(deep)).not.toContain('DEEP_PAYLOAD')
    expect(summarizeArguments(deep)).toContain('omitted')
    expect(JSON.parse(summarizeArguments(Array.from({ length: 100 }, (_, index) => index)))).toHaveLength(12)
  })

  it('redacts inline token and password explanations', () => {
    const text = auditText('token=INLINE_TOKEN password:INLINE_PASSWORD')
    expect(text).not.toContain('INLINE_TOKEN')
    expect(text).not.toContain('INLINE_PASSWORD')
    expect(text).toContain('[REDACTED]')
  })

  it('redacts URL credentials and secret query parameters from explanations', () => {
    const text = auditText('https://alice:URL_PASSWORD@example.invalid/path?token=QUERY_TOKEN&signature=QUERY_SIGNATURE')
    for (const secret of ['alice', 'URL_PASSWORD', 'QUERY_TOKEN', 'QUERY_SIGNATURE']) expect(text).not.toContain(secret)
  })

  it('redacts standard Authorization Bearer credentials from explanations', () => {
    expect(auditText('Authorization: Bearer BEARER_SECRET_VALUE')).not.toContain('BEARER_SECRET_VALUE')
  })

  it('redacts quoted JSON token and password pairs in explanations', () => {
    const text = auditText('参数 {"token":"JSON_TOKEN_VALUE","password":"JSON_PASSWORD_VALUE"}')
    expect.soft(text).not.toContain('JSON_TOKEN_VALUE')
    expect.soft(text).not.toContain('JSON_PASSWORD_VALUE')
  })

  it('redacts URL credential values in argument summaries as well as explanations', () => {
    expect(summarizeArguments({ url: 'https://alice:SUMMARY_URL_PASSWORD@example.invalid/path' })).not.toContain('SUMMARY_URL_PASSWORD')
  })

  it('bounds explanation length', () => {
    expect(auditText('x'.repeat(5000))).toHaveLength(600)
    expect(auditText('x'.repeat(5000), 40)).toHaveLength(40)
  })

  it('returns target metadata only for a Creator-family tool with a plugin-shaped name', () => {
    expect(targetPlugin('dshx_hot_reload', { name: 'demo-plugin' })).toBe('demo-plugin')
    expect(targetPlugin('read', { name: 'demo-plugin' })).toBeUndefined()
    expect(targetPlugin('dshx_hot_reload', { name: '../demo-plugin' })).toBeUndefined()
    expect(targetPlugin('dshx_hot_reload', null)).toBeUndefined()
  })

  it('never persists original credentials, file bodies or shell programs from begin', () => {
    const current = store()
    const exec = execution({ name: 'bash', arguments: {
      token: 'BEGIN_TOKEN_VALUE', password: 'BEGIN_PASSWORD_VALUE',
      content: 'BEGIN_FILE_CONTENT_VALUE', command: 'echo BEGIN_SHELL_PROGRAM_VALUE',
    } })
    const row = begin(current, exec)
    const persisted = snapshot(current)
    for (const secret of ['BEGIN_TOKEN_VALUE', 'BEGIN_PASSWORD_VALUE', 'BEGIN_FILE_CONTENT_VALUE', 'BEGIN_SHELL_PROGRAM_VALUE']) {
      expect(row.argumentsSummary).not.toContain(secret)
      expect(persisted).not.toContain(secret)
    }
    expect(persisted).toContain(argumentFingerprint(exec.arguments))
  })

  it('redacts every updateable summary field before persisting it', () => {
    const current = store()
    const row = begin(current)
    expect(current.update(row.id, {
      reason: 'token=UPDATE_REASON_TOKEN',
      permissionSummary: 'password=UPDATE_PERMISSION_PASSWORD',
      argumentsSummary: 'token=UPDATE_ARGUMENT_TOKEN',
    })).toBe(true)
    const persisted = snapshot(current)
    expect.soft(persisted).not.toContain('UPDATE_REASON_TOKEN')
    expect.soft(persisted).not.toContain('UPDATE_PERMISSION_PASSWORD')
    expect.soft(persisted).not.toContain('UPDATE_ARGUMENT_TOKEN')
  })
})
