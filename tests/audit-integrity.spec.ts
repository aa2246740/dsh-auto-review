import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { ReviewSubject } from '../src/reviewer.ts'
import { redactArguments } from '../src/reviewer.ts'
import { ApprovalAuditStore } from '../src/audit.ts'
import type { ApprovalRule } from '../src/contracts.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'approval-integrity-')))
  roots.push(root)
  const store = new ApprovalAuditStore(root, () => ({}))
  const agent = { id: 'agent', session: { header: { id: 'session', cwd: root } } } as unknown as Agent
  const exec = { agent, name: 'write', callId: 'call', rootCallId: 'call', arguments: { file_path: '/outside/a', content: 'body' }, token: Symbol('original'), signal: new AbortController().signal } as unknown as ToolExecution
  const subject: ReviewSubject = { stage: 'pre-execute', toolName: exec.name, arguments: exec.arguments, agent, downstream: { kind: 'ask' }, recentUserRequests: [], trustedDeveloperInstructions: [], trustedUserResponses: [], recentAssistantMessages: [], recentExecutionEvidence: [] }
  return { root, store, exec, subject }
}
const success = { isError: false, value: { exitCode: 0 }, content: [] } as ToolExecutionResult

describe('audit execution identity and configuration trail', () => {
  it('does not attribute one execution result to another execution sharing its callId', () => {
    const { store, exec, subject } = fixture()
    const second = { ...exec, token: Symbol('second'), arguments: { file_path: '/outside/b' } }
    const one = store.begin(subject, exec)!
    const two = store.begin({ ...subject, arguments: second.arguments }, second)!
    store.update(one.id, { status: 'allowed' }); store.update(two.id, { status: 'allowed' })
    store.toolResult(exec, success)
    expect(store.record(one.id)?.execution).toBe('succeeded')
    expect(store.record(two.id)?.execution).toBe('not-started')
  })

  it('does not invent execution evidence after loading an old snapshot', () => {
    const { root, store, exec, subject } = fixture()
    const row = store.begin(subject, exec)!
    store.update(row.id, { status: 'allowed' })
    store.dispose()
    const reloaded = new ApprovalAuditStore(root, () => ({}))
    reloaded.toolResult(exec, success)
    expect(reloaded.record(row.id)?.execution).not.toBe('succeeded')
  })

  it('records user rule saves and deletions without executing the rule target', () => {
    const { store } = fixture()
    const rule: ApprovalRule = { id: 'rule-one', version: 1, name: 'require human', enabled: true, action: 'ask', scope: 'creator-plugin', sessionId: 'session', stage: 'pre-execute', toolName: 'dshx_hot_reload', pluginId: 'demo-plugin', createdAt: Date.now(), expiresAt: Date.now() + 60_000 }
    expect(store.saveRule(rule, 0)).toBe(1)
    expect(store.deleteRule(rule.id, 1)).toBe(2)
    const rows = store.dashboard().records
    expect(rows.map(row => row.toolName)).toEqual(['approval-rule.delete', 'approval-rule.save'])
    expect(rows.every(row => row.source === 'human' && row.ruleId === rule.id)).toBe(true)
    expect(store.rules()).toEqual([])
  })
})

describe('shared reviewer and audit credential redaction', () => {
  it.each(['access_token', 'refresh_token', 'ACCESS_TOKEN', '%61ccess%5Ftoken'])('does not send OAuth query key %s to the reviewer', key => {
    expect(JSON.stringify(redactArguments({ url: `https://example.invalid/?${key}=OAUTH_TEST_SECRET` }))).not.toContain('OAUTH_TEST_SECRET')
  })
  it('removes bearer/header and URL-userinfo credentials before model review', () => {
    const values = ['Authorization: Bearer HEADER_TEST_SECRET', 'https://URL_TEST_SECRET@example.invalid/path']
    const text = JSON.stringify(redactArguments(values))
    expect(text).not.toContain('HEADER_TEST_SECRET'); expect(text).not.toContain('URL_TEST_SECRET')
  })
})
