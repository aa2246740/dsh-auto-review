/** Regressions from the independent security review. No live Host, server, browser or real tool runs. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { AutoReviewCoordinator, type CoordinatorOptions } from '../src/coordinator.ts'
import { ApprovalAuditStore, type ReviewAuditPort } from '../src/audit.ts'
import { approvalApiResponse } from '../src/api.ts'
import { argumentFingerprint } from '../src/approval-context.ts'
import { apply as applyApprovalPlugin } from '../src/dsh-approve-for-me.ts'
import type { ReviewDecision, ReviewSubject } from '../src/reviewer.ts'
import type { ApprovalRule, ReviewRecord } from '../src/contracts.ts'

const ALLOW: ReviewDecision = { source: 'model', decision: 'allow', riskLevel: 'medium', userAuthorization: 'high', reason: 'Synthetic authorized decision' }
const DENY: ReviewDecision = { source: 'model', decision: 'deny', riskLevel: 'high', userAuthorization: 'low', reason: 'Synthetic security denial' }
const OFFLINE: ReviewDecision = { source: 'failure', decision: 'deny', failureKind: 'transport', reason: 'Synthetic unavailable reviewer' }
let root: string
let cleanups: Array<() => void | Promise<void>>

beforeEach(() => {
  // Canonical temp paths avoid macOS /var -> /private/var symlinks in the store's safety checks.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-security-regression-')))
  cleanups = []
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network is forbidden in security regression tests'))
})
afterEach(async () => {
  try {
    for (const cleanup of cleanups.toReversed()) await cleanup()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  }
})

function owner(id = 'security-session'): Agent {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [{ type: 'turn/start', data: { turn: 1 } }]
  return {
    id, inject: vi.fn(), cancel: vi.fn(),
    session: {
      header: { id, cwd: '/workspace' },
      get seq() { return events.length },
      eventAt: (index: number) => events[index],
      snapshotEvents: () => [...events],
      append: (type: string, data: Record<string, unknown>) => { const event = { type, data }; events.push(event); return event },
    },
  } as unknown as Agent
}
function execution(agent: Agent, overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    agent, name: 'write', callId: ToolCallId('security-call'), rootCallId: ToolCallId('security-call'),
    arguments: { file_path: '/outside/target.md', content: 'Synthetic content, never executed' },
    signal: new AbortController().signal, token: Symbol('security-execution'), ...overrides,
  } as ToolExecution
}
function subject(exec: ToolExecution, downstream: PreToolDecision): ReviewSubject {
  return {
    stage: 'pre-execute', toolName: exec.name, arguments: exec.arguments, agent: exec.agent,
    recentUserRequests: [], trustedDeveloperInstructions: [], trustedUserResponses: [], recentAssistantMessages: [], recentExecutionEvidence: [], downstream,
  }
}
function row(exec: ToolExecution): ReviewRecord {
  const now = Date.now()
  return {
    id: 'synthetic-audit-row', createdAt: now, updatedAt: now, sessionId: 'security-session',
    callId: String(exec.callId), stage: 'pre-execute', toolName: exec.name,
    argumentsSummary: '[synthetic summary]', permissionSummary: '[synthetic permission]',
    status: 'reviewing', source: 'model', reason: '', execution: 'not-started',
  }
}
function auditPort(exec: ToolExecution, failure: 'begin' | 'update' | 'none' = 'none'): ReviewAuditPort {
  return { begin: vi.fn(() => failure === 'begin' ? undefined : row(exec)), update: vi.fn(() => failure !== 'update'), toolResult: vi.fn() }
}
function coordinator(exec: ToolExecution, options: CoordinatorOptions = {}, decisions: ReviewDecision[] = [ALLOW]) {
  const review = vi.fn(async (): Promise<ReviewDecision> => {
    const value = decisions.shift()
    if (value === undefined) throw new Error('Unexpected extra reviewer call')
    return value
  })
  const reviewer = { subject, review, log: vi.fn() }
  const value = new AutoReviewCoordinator(reviewer, () => true, { canAsk: () => true, audit: auditPort(exec), ...options })
  cleanups.push(() => value.dispose())
  return { value, review }
}
function request(exec: ToolExecution): ApprovalRequest {
  return { agent: exec.agent!, toolName: exec.name, callId: exec.callId, reason: 'Synthetic exact-call approval request', signal: exec.signal }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { resolve, promise }
}
function store(): ApprovalAuditStore {
  const value = new ApprovalAuditStore(join(root, 'audit'), () => ({}))
  cleanups.push(() => value.dispose())
  return value
}

/** Known denials must remain denials; a storage failure may only remove permission, not add it. */
describe('security: audit failure never downgrades a known denial to human approval', () => {
  const cases = (['hard', 'rule'] as const).flatMap(kind => (['begin', 'update'] as const).flatMap(failure =>
    (['pre-execute', 'approval-request'] as const).map(stage => ({ kind, failure, stage }))))
  it.each(cases)('preserves $kind deny when audit.$failure fails at $stage', async ({ kind, failure, stage }) => {
    const agent = owner()
    // This command is DATA ONLY; no shell/tool execution occurs in these tests.
    const exec = execution(agent, kind === 'hard' ? { name: 'bash', arguments: { command: 'rm -rf /' } } : {})
    const rule: CoordinatorOptions['rule'] = kind === 'rule'
      ? () => ({ matched: true, action: 'deny', reason: 'User-owned explicit deny rule', ruleId: 'rule-deny' }) : undefined
    const { value, review } = coordinator(exec, {
      audit: auditPort(exec, failure), failureMode: () => 'human', ...(rule ? { rule } : {}),
    }, [])
    const human = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    if (stage === 'pre-execute') {
      expect(await value.preExecute(exec, { kind: 'ask', reason: 'Needs approval' })).toMatchObject({ kind: 'deny' })
    } else {
      await value.preExecute(exec, { kind: 'allow' })
      expect(await value.approvalRequest(request(exec), human)).toBe('rejected')
    }
    expect(review).not.toHaveBeenCalled()
    expect(human).not.toHaveBeenCalled()
  })

  // A model deny can only be known after a successful begin and an assessment.
  // With begin unavailable there is no model decision yet: that remains a genuine failure-mode case.
  it.each(['pre-execute', 'approval-request'] as const)('preserves an already-returned model deny when audit.update fails at %s', async stage => {
    const exec = execution(owner())
    const { value, review } = coordinator(exec, { audit: auditPort(exec, 'update'), failureMode: () => 'human' }, [DENY])
    const human = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    if (stage === 'pre-execute') {
      expect(await value.preExecute(exec, { kind: 'ask' })).toMatchObject({ kind: 'deny' })
    } else {
      await value.preExecute(exec, { kind: 'allow' })
      expect(await value.approvalRequest(request(exec), human)).toBe('rejected')
    }
    expect(review).toHaveBeenCalledOnce()
    expect(human).not.toHaveBeenCalled()
  })
})

describe('security: public ApprovalService default never reaches the pre-execution gate', () => {
  it('does not convert ask to allow when there is no session override and the real service defaults to never', async () => {
    const serviceContext = new Context()
    const fiber = await serviceContext.plugin(ApprovalService, { policy: 'never' })
    cleanups.push(() => fiber.dispose())
    const approval = serviceContext.approval
    const agent = owner('no-policy-override')
    expect(approval.overrideOf(agent.session)).toBeUndefined()
    expect(approval.config.policy).toBe('never')
    const human = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    serviceContext.on('approval/request', human)

    vi.stubEnv('DSH_HOME', root)
    const hooks = new Map<string, (...args: any[]) => any>()
    const llmAccess = vi.fn(() => { throw new Error('A never-policy pre-execution ask must not reach an LLM') })
    const fakeContext = {
      approval,
      root: serviceContext.root,
      provide: serviceContext.provide.bind(serviceContext), // Real public in-memory service registration; no HTTP route.
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      permissionPresets: { current: () => 'approve-for-me' },
      fiber: {},
      inject: (_names: string[], callback: (child: { effect: (setup: () => unknown) => void; settings: { configure: () => () => void } }) => void) => {
        callback({
          effect: (setup) => { const cleanup = setup(); if (typeof cleanup === 'function') cleanups.push(cleanup as () => void) },
          settings: { configure: () => () => {} },
        })
      },
      tools: { guard: vi.fn() },
      // This is a capture-only carrier: no endpoint, HTTP listener, or live Host is installed.
      connection: { fetch: { register: vi.fn(() => () => {}) } },
      llm: { listProviders: llmAccess, resolveModel: llmAccess, stream: llmAccess },
      effect: (setup: () => unknown) => { const cleanup = setup(); if (typeof cleanup === 'function') cleanups.push(cleanup as () => void) },
      on: (event: string, callback: (...args: any[]) => any) => { hooks.set(event, callback); return () => {} },
    }
    applyApprovalPlugin(fakeContext as unknown as Context, {
      enabled: { get: () => true },
      failureMode: { get: () => 'human' },
      historyRetentionDays: { get: () => 30 },
      historyMaxRecords: { get: () => 1_000 },
      modelMode: { get: () => 'follow-agent' },
      reviewerRoute: { get: () => '' },
      reasoningMode: { get: () => 'low' },
      timeoutMs: { get: () => 90_000 },
      transportRetries: { get: () => 2 },
      maxOutputTokens: { get: () => 256 },
      maxInputChars: { get: () => 20_000 },
      reviewHistoryPairs: { get: () => 4 },
      reviewHistoryChars: { get: () => 20_000 },
    })
    expect(Reflect.get(serviceContext, 'creatorAuthorizer')).toMatchObject({ protocol: 'creator-authorizer-host-v1' })
    const preExecute = hooks.get('tools/pre-execute')!
    expect(preExecute).toBeTypeOf('function')
    // Previously this deterministic read allowance skipped ApprovalService.request entirely.
    const exec = execution(agent, { name: 'read', arguments: { file_path: '/workspace/example.ts' } })
    const gate = await preExecute(exec, async (): Promise<PreToolDecision> => ({ kind: 'ask', reason: 'Native policy asks' })) as PreToolDecision
    expect(gate.kind).not.toBe('allow')
    if (gate.kind === 'ask') {
      expect(await approval.request({ ...request(exec), ...(gate.reason ? { reason: gate.reason } : {}) })).toBe('rejected')
    }
    expect(llmAccess).not.toHaveBeenCalled()
    expect(human).not.toHaveBeenCalled()
  })
})

describe('security: a public request object is not an authorization ticket', () => {
  it('reassesses sequential reuse rather than returning a settled model allowance', async () => {
    const exec = execution(owner())
    const { value, review } = coordinator(exec, {}, [ALLOW, DENY])
    await value.preExecute(exec, { kind: 'allow' })
    const shared = request(exec)
    const human = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    expect(await value.approvalRequest(shared, human)).toBe('allowed-once')
    expect(await value.approvalRequest(shared, human)).toBe('rejected')
    expect(review).toHaveBeenCalledTimes(2)
    expect(human).not.toHaveBeenCalled()
  })

  it('does not share an in-flight model decision between concurrent calls with the same object', async () => {
    const exec = execution(owner())
    const first = deferred<ReviewDecision>(), second = deferred<ReviewDecision>()
    const review = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const value = new AutoReviewCoordinator({ subject, review, log: vi.fn() }, () => true, { canAsk: () => true, audit: auditPort(exec) })
    cleanups.push(() => value.dispose())
    await value.preExecute(exec, { kind: 'allow' })
    const shared = request(exec)
    const human = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    const one = value.approvalRequest(shared, human)
    const two = value.approvalRequest(shared, human)
    first.resolve(ALLOW); second.resolve(DENY)
    expect(await Promise.all([one, two])).toEqual(['allowed-once', 'rejected'])
    expect(review).toHaveBeenCalledTimes(2)
    expect(human).not.toHaveBeenCalled()
  })

  it.each(['sequential', 'concurrent'] as const)('requires independent native human answers for %s reuse', async timing => {
    const exec = execution(owner())
    const { value, review } = coordinator(exec, { failureMode: () => 'human' }, [OFFLINE, OFFLINE])
    await value.preExecute(exec, { kind: 'allow' })
    const shared = request(exec)
    const firstHuman = deferred<ApprovalOutcome>(), secondHuman = deferred<ApprovalOutcome>()
    const human = vi.fn().mockImplementationOnce(() => firstHuman.promise).mockImplementationOnce(() => secondHuman.promise)
    const first = value.approvalRequest(shared, human)
    firstHuman.resolve('allowed-once')
    let results: ApprovalOutcome[]
    if (timing === 'sequential') {
      expect(await first).toBe('allowed-once')
      const second = value.approvalRequest(shared, human)
      secondHuman.resolve('rejected')
      results = [await first, await second]
    } else {
      const second = value.approvalRequest(shared, human)
      secondHuman.resolve('rejected')
      results = await Promise.all([first, second])
    }
    expect(results).toEqual(['allowed-once', 'rejected'])
    expect(review).toHaveBeenCalledTimes(2)
    expect(human).toHaveBeenCalledTimes(2)
  })
})

describe('security: overlapping call IDs cannot select the wrong execution context', () => {
  it.each(['different arguments', 'same arguments'] as const)('treats different execution tokens with %s as ambiguous, not an automatic association', async shape => {
    const agent = owner()
    const first = execution(agent, { arguments: { file_path: '/first-sensitive-target', content: 'first' } })
    const second = execution(agent, {
      token: Symbol('another-execution') as ToolExecution['token'],
      arguments: shape === 'same arguments' ? first.arguments : { file_path: '/second-safe-target', content: 'second' },
    })
    expect(first.callId).toBe(second.callId)
    expect(first.token).not.toBe(second.token)
    const { value, review } = coordinator(first, {}, [ALLOW])
    await value.preExecute(first, { kind: 'allow' })
    await value.preExecute(second, { kind: 'allow' })
    const human = vi.fn(async (): Promise<ApprovalOutcome> => 'rejected')
    expect(await value.approvalRequest(request(first), human)).toBe('rejected')
    expect(review).not.toHaveBeenCalled()
    expect(human).toHaveBeenCalledOnce()
  })
})

const BROWSER_ORIGIN = 'http://127.0.0.1:43127'
const BROWSER_HOST = '127.0.0.1:43127'
function validRule(): ApprovalRule {
  return {
    id: 'carrier-rule', version: 1, name: 'Native human confirmation', enabled: true, action: 'ask',
    scope: 'exact-arguments', sessionId: 'security-session', stage: 'pre-execute', toolName: 'read',
    argumentFingerprint: argumentFingerprint({ file_path: '/workspace/example.ts' }), createdAt: Date.now(), expiresAt: Date.now() + 3_600_000,
  }
}
function carrierPost(origin = BROWSER_ORIGIN): Request {
  // Connection http-bridge deliberately presents an internal URL while retaining real Host/Origin.
  return new Request('http://dsh.internal/api/approve-for-me', {
    method: 'POST', headers: { host: BROWSER_HOST, origin, 'x-dsh-approval-ui': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'save-rule', expectedRevision: 0, rule: validRule() }),
  })
}

describe('security: real Connection carrier shape preserves same-origin control-plane behavior', () => {
  it('accepts a same-origin browser POST through dsh.internal and persists an ask rule', async () => {
    const current = store()
    const response = await approvalApiResponse(current, carrierPost())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, revision: 1 })
    expect(current.dashboard().rules).toHaveLength(1)
    expect(current.dashboard().rules[0]).toMatchObject({ id: 'carrier-rule', action: 'ask', enabled: true })
  })
  it.each(['http://evil.example.invalid', 'http://127.0.0.1:49999', 'null'])('rejects cross-origin carrier POST %s without changing rules', async origin => {
    const current = store()
    const response = await approvalApiResponse(current, carrierPost(origin))
    expect(response.status).toBe(403)
    expect(await response.json()).toHaveProperty('error')
    expect(current.dashboard()).toMatchObject({ revision: 0, rules: [] })
  })
})

describe('security: OAuth query credentials never enter the audit file', () => {
  it('redacts access_token and refresh_token in arguments, permission summaries and decision explanations before persistence', () => {
    const current = store()
    const access = 'REGRESSION_ACCESS_TOKEN_MUST_NOT_PERSIST'
    const refresh = 'REGRESSION_REFRESH_TOKEN_MUST_NOT_PERSIST'
    const url = `https://example.invalid/resource?access_token=${access}&refresh_token=${refresh}`
    const exec = execution(owner(), { name: 'read', arguments: { url } })
    const row = current.begin({ ...subject(exec, { kind: 'ask', reason: `Permission for ${url}` }), approvalReason: `Approval for ${url}` }, exec)
    expect(row).toBeDefined()
    expect(current.update(row!.id, { status: 'denied', reason: `Do not send ${url}` })).toBe(true)
    const persisted = readFileSync(current.path, 'utf8')
    expect(persisted).not.toContain(access)
    expect(persisted).not.toContain(refresh)
    const stored = JSON.parse(persisted) as { records: ReviewRecord[] }
    expect(stored.records[0]?.argumentFingerprint).toBe(argumentFingerprint(exec.arguments))
    for (const field of ['argumentsSummary', 'permissionSummary', 'reason'] as const) {
      expect(stored.records[0]?.[field]).toContain('[REDACTED]')
    }
  })
})
