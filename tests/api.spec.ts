import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ReviewSubject } from '../src/reviewer.ts'
import type { ApprovalDashboard, ApprovalRule, ReviewRecord, RuleMatch } from '../src/contracts.ts'
import { APPROVAL_API_PATH } from '../src/contracts.ts'
import { approvalApiResponse, installApprovalApi } from '../src/api.ts'
import { ApprovalAuditStore } from '../src/audit.ts'
import { argumentFingerprint } from '../src/approval-context.ts'

const ORIGIN = 'https://approval.example.invalid'
const URL = `${ORIGIN}${APPROVAL_API_PATH}`
const NOW = Date.UTC(2026, 8, 13, 12)
const DAY = 86_400_000
const ARGUMENTS = { file_path: 'src/example.ts' }
let root: string

// Requests are in-memory values: no server, actual Host or network is started.
// All persisted test data is isolated under a per-test canonical mkdtemp root.
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-approval-api-test-')))
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in isolated API tests'))
})

afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled()
  } finally {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  }
})

function store(): ApprovalAuditStore {
  return new ApprovalAuditStore(join(root, 'audit'), () => ({}))
}

function disk(current: ApprovalAuditStore): string | undefined {
  return existsSync(current.path) ? readFileSync(current.path, 'utf8') : undefined
}

function rule(overrides: Partial<ApprovalRule> = {}): ApprovalRule {
  return {
    id: 'rule-1', version: 1, name: '人工确认', enabled: true, action: 'ask',
    scope: 'exact-arguments', sessionId: 'session-1', stage: 'pre-execute',
    toolName: 'read', argumentFingerprint: argumentFingerprint(ARGUMENTS),
    createdAt: NOW - 1000, expiresAt: NOW + DAY,
    ...overrides,
  }
}

function begin(current: ApprovalAuditStore, overrides: Partial<ReviewSubject> = {}): ReviewRecord {
  const exec = {
    name: overrides.toolName ?? 'read', arguments: overrides.arguments ?? ARGUMENTS,
    callId: 'call-1', rootCallId: 'root-call-1', token: Symbol('api-test'),
    signal: new AbortController().signal,
    agent: { id: 'agent-1', session: { header: { id: 'session-1' } } },
  } as unknown as ToolExecution
  const subject: ReviewSubject = {
    stage: 'pre-execute', toolName: exec.name, arguments: exec.arguments, agent: exec.agent,
    recentUserRequests: [], trustedDeveloperInstructions: [], trustedUserResponses: [],
    recentAssistantMessages: [], recentExecutionEvidence: [], downstream: { kind: 'ask', reason: '确认' },
    ...overrides,
  }
  const row = current.begin(subject, exec)
  expect(row).toBeDefined()
  return row!
}

function post(body: unknown, options: RequestInit = {}, url = URL): Request {
  const headers = new Headers({ origin: ORIGIN, 'x-dsh-approval-ui': '1', 'content-type': 'application/json' })
  new Headers(options.headers).forEach((value, key) => headers.set(key, value))
  return new Request(url, { method: 'POST', body: JSON.stringify(body), ...options, headers })
}

function saveBody(value: unknown = rule(), expectedRevision: unknown = 0): object {
  return { action: 'save-rule', expectedRevision, rule: value }
}

async function payload<T = Record<string, unknown>>(response: Response): Promise<T> {
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('content-type')).toContain('application/json')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  return await response.json() as T
}

function unchanged(current: ApprovalAuditStore, original: string | undefined, revision = 0): void {
  expect(disk(current)).toBe(original)
  expect(current.dashboard().revision).toBe(revision)
}

function unavailableStore(): ApprovalAuditStore {
  const directory = join(root, 'audit')
  mkdirSync(directory)
  writeFileSync(join(directory, 'history-v1.json'), 'CORRUPT_FILE_MUST_REMAIN_UNCHANGED')
  const current = store()
  expect(current.dashboard().storage.ok).toBe(false)
  return current
}

describe('installApprovalApi: public Connection carrier only', () => {
  it('registers only the exact authenticated Connection path, methods and buffered carrier', async () => {
    const current = store()
    const unregister = vi.fn()
    const register = vi.fn((_route: unknown) => unregister)
    const effect = vi.fn()
    const mockContext = { connection: { fetch: { register } }, effect }
    for (const property of ['webServer', 'server', 'router', 'tools']) {
      Object.defineProperty(mockContext, property, { get: () => { throw new Error(`Unsupported bare surface: ${property}`) } })
    }
    installApprovalApi(mockContext as unknown as Context, current)
    expect(effect).toHaveBeenCalledTimes(1)
    expect(register).not.toHaveBeenCalled()
    const setup = effect.mock.calls[0]![0] as () => unknown
    const teardown = setup()
    expect(register).toHaveBeenCalledTimes(1)
    const route = register.mock.calls[0]![0] as unknown as {
      path: string; methods: string[]; requestBody: string; fetch: (request: Request) => Promise<Response>
    }
    expect(route).toMatchObject({ path: APPROVAL_API_PATH, methods: ['GET', 'POST'], requestBody: 'buffered' })
    expect(Object.keys(route).sort()).toEqual(['fetch', 'methods', 'path', 'requestBody'])
    const response = await route.fetch(new Request(URL))
    expect(response.status).toBe(200)
    expect((await payload<ApprovalDashboard>(response)).version).toBe(1)
    expect(teardown).toBe(unregister)
    ;(teardown as () => void)()
    expect(unregister).toHaveBeenCalledTimes(1)
  })
})

describe('approvalApiResponse: GET history', () => {
  it('returns bounded metadata and unavailable automatic capabilities without writing', async () => {
    const current = store()
    const original = disk(current)
    const response = await approvalApiResponse(current, new Request(URL))
    expect(response.status).toBe(200)
    const body = await payload<ApprovalDashboard>(response)
    expect(body).toMatchObject({ version: 1, revision: 0, records: [], rules: [], storage: { ok: true } })
    expect(body.capabilities.creatorPlus.automatic).toBe(false)
    expect(body.capabilities.creator.automatic).toBe(false)
    unchanged(current, original)
  })

  it('paginates stably with before and limit and does not change revision', async () => {
    const current = store()
    const rows = Array.from({ length: 5 }, () => begin(current))
    const original = disk(current)
    const first = await payload<ApprovalDashboard>(await approvalApiResponse(current, new Request(`${URL}?limit=2`)))
    const second = await payload<ApprovalDashboard>(await approvalApiResponse(current, new Request(`${URL}?limit=2&before=${first.nextBefore}`)))
    const third = await payload<ApprovalDashboard>(await approvalApiResponse(current, new Request(`${URL}?limit=2&before=${second.nextBefore}`)))
    expect([...first.records, ...second.records, ...third.records].map(row => row.id)).toEqual(rows.toReversed().map(row => row.id))
    expect(third.nextBefore).toBeUndefined()
    unchanged(current, original)
  })

  it('forwards exact session/status and tool filters without mixing another session', async () => {
    const current = store()
    const wanted = begin(current, { toolName: 'dshx_hot_reload', arguments: { name: 'demo-plugin' } })
    current.update(wanted.id, { status: 'allowed' })
    begin(current)
    const other = begin(current, {
      toolName: 'dshx_hot_reload', arguments: { name: 'demo-plugin' },
      agent: { id: 'agent-2', session: { header: { id: 'session-2' } } } as ReviewSubject['agent'],
    })
    current.update(other.id, { status: 'allowed' })
    const original = disk(current)
    const response = await approvalApiResponse(current, new Request(`${URL}?sessionId=session-1&status=allowed&toolName=hot_reload`))
    expect(response.status).toBe(200)
    expect((await payload<ApprovalDashboard>(response)).records.map(row => row.id)).toEqual([wanted.id])
    unchanged(current, original)
  })

  it.each([
    'limit=0', 'limit=-1', 'limit=201', 'limit=1.5', 'limit=NaN', 'limit=',
    'before=-1', 'before=1.5', 'before=Infinity', 'before=9007199254740992',
    'before=not-a-number', 'before=',
    'status=not-a-review-status', `sessionId=${'s'.repeat(257)}`,
    `toolName=${'t'.repeat(129)}`, 'includeRawArguments=1',
  ])('rejects invalid query %s without writes', async query => {
    const current = store()
    const original = disk(current)
    const response = await approvalApiResponse(current, new Request(`${URL}?${query}`))
    expect.soft(response.status).toBe(400)
    expect.soft(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it('returns the health dashboard with 200 and storage.ok=false when storage is unavailable', async () => {
    const current = unavailableStore()
    const original = disk(current)
    const response = await approvalApiResponse(current, new Request(URL))
    expect(response.status).toBe(200)
    const body = await payload<ApprovalDashboard>(response)
    expect(body.storage.ok).toBe(false)
    expect(body.storage.reason).toBeTruthy()
    expect(body.capabilities.creatorPlus.automatic).toBe(false)
    unchanged(current, original)
  })
})

describe('approvalApiResponse: method and browser intent restrictions', () => {
  it.each(['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])('rejects unsupported method %s with no mutation', async method => {
    const current = store()
    const original = disk(current)
    const response = await approvalApiResponse(current, new Request(URL, { method }))
    expect(response.status).toBe(405)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it.each([
    ['origin', undefined], ['origin', 'null'], ['origin', 'https://foreign.example.invalid'],
    ['origin', `${ORIGIN}.evil.invalid`], ['origin', `${ORIGIN}/`],
    ['x-dsh-approval-ui', undefined], ['x-dsh-approval-ui', '0'],
    ['x-dsh-approval-ui', 'true'], ['x-dsh-approval-ui', '01'],
  ] as const)('requires exact browser-intent header %s=%s', async (header, value) => {
    const current = store()
    const original = disk(current)
    const request = post(saveBody())
    if (value === undefined) request.headers.delete(header)
    else request.headers.set(header, value)
    const response = await approvalApiResponse(current, request)
    expect(response.status).toBe(403)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it('binds origin to the actual request URL instead of a hard-coded Host', async () => {
    const current = store()
    const origin = 'https://another.example.invalid:8443'
    const response = await approvalApiResponse(current, post(saveBody(), { headers: { origin } }, `${origin}${APPROVAL_API_PATH}`))
    expect(response.status).toBe(200)
    expect(await payload(response)).toEqual({ ok: true, revision: 1 })
  })

  it.each([undefined, 'text/plain', 'application/x-www-form-urlencoded', 'application/jsonp', 'application/json-malicious'])('rejects non-JSON media type %s before writes', async contentType => {
    const current = store()
    const original = disk(current)
    const request = post(saveBody())
    if (contentType === undefined) request.headers.delete('content-type')
    else request.headers.set('content-type', contentType)
    const response = await approvalApiResponse(current, request)
    expect.soft(response.status).toBe(415)
    expect.soft(await payload(response)).toHaveProperty('error')
    expect.soft(disk(current)).toBe(original)
    expect.soft(current.dashboard().revision).toBe(0)
  })

  it('accepts JSON with an explicit charset', async () => {
    const current = store()
    const response = await approvalApiResponse(current, post(saveBody(), { headers: { 'content-type': 'application/json; charset=utf-8' } }))
    expect(response.status).toBe(200)
    expect(await payload(response)).toEqual({ ok: true, revision: 1 })
  })
})

describe('approvalApiResponse: strict JSON, body limits and cancellation', () => {
  it.each(['{broken', '', 'null', '[]', '"text"', '1', 'true'])('rejects malformed or non-object JSON %#', async body => {
    const current = store()
    const original = disk(current)
    const response = await approvalApiResponse(current, post(null, { body }))
    expect(response.status).toBe(400)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it.each(['execute', 'allow-once', 'restart-host', 'saveRule'])('rejects unsupported action %s without executing or writing', async action => {
    const current = store()
    const original = disk(current)
    const response = await approvalApiResponse(current, post({ action, expectedRevision: 0 }))
    expect(response.status).toBe(400)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it.each([
    { action: 'save-rule', expectedRevision: 0, rule: rule(), allowAll: true },
    { action: 'delete-rule', expectedRevision: 0, id: 'rule-1', sourceVerified: true },
    { action: 'clear-history', expectedRevision: 0, confirmed: true },
    { action: 'preview', recordId: 'record-1', rule: rule(), sourceVerified: true },
    { action: 'save-rule', expectedRevision: 0, rule: { ...rule(), sourceVerified: true } },
    { action: 'save-rule', expectedRevision: 0, rule: { ...rule(), unknown: true } },
  ])('rejects unknown request or nested rule fields %#', async body => {
    const current = store()
    const original = disk(current)
    const response = await approvalApiResponse(current, post(body))
    expect(response.status).toBe(400)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it.each([undefined, null, '0', -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('requires safe nonnegative expectedRevision %s', async revision => {
    const current = store()
    const original = disk(current)
    const response = await approvalApiResponse(current, post({ action: 'save-rule', rule: rule(), expectedRevision: revision }))
    expect(response.status).toBe(400)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it('rejects a declared body over 32768 bytes before consuming it', async () => {
    const current = store()
    const original = disk(current)
    const request = post(saveBody(), { headers: { 'content-length': '32769' } })
    const consume = vi.spyOn(request, 'text')
    const response = await approvalApiResponse(current, request)
    expect(response.status).toBe(413)
    expect(await payload(response)).toHaveProperty('error')
    expect(consume).not.toHaveBeenCalled()
    unchanged(current, original)
  })

  it.each([undefined, '10'])('rejects an actual oversized body despite declared size %s', async contentLength => {
    const current = store()
    const original = disk(current)
    const request = post(null, { body: JSON.stringify(saveBody()) + ' '.repeat(32769) })
    if (contentLength !== undefined) request.headers.set('content-length', contentLength)
    const response = await approvalApiResponse(current, request)
    expect(response.status).toBe(413)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it('enforces body limits in UTF-8 bytes, not only JavaScript character count', async () => {
    const current = store()
    const original = disk(current)
    const body = JSON.stringify(saveBody(rule({ name: '界'.repeat(12_000) })))
    expect(body.length).toBeLessThan(32768)
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(32768)
    const response = await approvalApiResponse(current, post(null, { body }))
    expect.soft(response.status).toBe(413)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it.each(['already-aborted', 'aborted-during-read'] as const)('never writes when request is %s', async when => {
    const current = store()
    const original = disk(current)
    const controller = new AbortController()
    const request = post(saveBody(), { signal: controller.signal })
    if (when === 'already-aborted') controller.abort()
    else vi.spyOn(request, 'text').mockImplementation(async () => {
      controller.abort()
      return JSON.stringify(saveBody())
    })
    const save = vi.spyOn(current, 'saveRule')
    const response = await approvalApiResponse(current, request)
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await payload(response)).toHaveProperty('error')
    expect(save).not.toHaveBeenCalled()
    unchanged(current, original)
  })
})

describe('approvalApiResponse: side-effect-free rule previews', () => {
  it('previews allow as ask with capabilityBlocked and cannot execute or change revision', async () => {
    const current = store()
    const row = begin(current)
    const original = disk(current)
    const mutators = [
      vi.spyOn(current, 'begin'), vi.spyOn(current, 'update'), vi.spyOn(current, 'toolResult'),
      vi.spyOn(current, 'saveRule'), vi.spyOn(current, 'deleteRule'), vi.spyOn(current, 'clearHistory'),
    ]
    const response = await approvalApiResponse(current, post({ action: 'preview', rule: rule({ action: 'allow' }), recordId: row.id }))
    expect(response.status).toBe(200)
    expect(await payload<RuleMatch>(response)).toMatchObject({ matched: true, action: 'ask', capabilityBlocked: true, ruleId: 'rule-1' })
    for (const mutation of mutators) expect(mutation).not.toHaveBeenCalled()
    unchanged(current, original)
    expect(current.record(row.id)).toEqual(row)
  })

  it('does not let a familiar Creator tool name verify its own source', async () => {
    const current = store()
    const row = begin(current, { toolName: 'dshx_hot_reload', arguments: { name: 'demo-plugin' } })
    const candidate: ApprovalRule = {
      id: 'creator-rule', version: 1, name: '重载插件', enabled: true, action: 'allow',
      scope: 'creator-plugin', sessionId: 'session-1', stage: 'pre-execute',
      toolName: 'dshx_hot_reload', pluginId: 'demo-plugin', createdAt: NOW - 1000, expiresAt: NOW + DAY,
    }
    const original = disk(current)
    const response = await approvalApiResponse(current, post({ action: 'preview', rule: candidate, recordId: row.id }))
    expect(response.status).toBe(200)
    expect(await payload<RuleMatch>(response)).toMatchObject({ action: 'ask', capabilityBlocked: true })
    unchanged(current, original)
  })

  it.each(['request', 'rule'] as const)('rejects sourceVerified spoofing in %s', async location => {
    const current = store()
    const row = begin(current)
    const original = disk(current)
    const candidate = rule({ action: 'allow' })
    const body = location === 'request'
      ? { action: 'preview', recordId: row.id, rule: candidate, sourceVerified: true }
      : { action: 'preview', recordId: row.id, rule: { ...candidate, sourceVerified: true } }
    const response = await approvalApiResponse(current, post(body))
    expect(response.status).toBe(400)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it('uses stored identity rather than client supplied context', async () => {
    const current = store()
    const row = begin(current)
    const original = disk(current)
    const response = await approvalApiResponse(current, post({ action: 'preview', recordId: row.id, rule: rule(), context: { sessionId: 'session-1', sourceVerified: true } }))
    expect(response.status).toBe(400)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it('returns none for a rule with a different fingerprint', async () => {
    const current = store()
    const row = begin(current)
    const original = disk(current)
    const response = await approvalApiResponse(current, post({ action: 'preview', recordId: row.id, rule: rule({ argumentFingerprint: 'b'.repeat(64) }) }))
    expect(response.status).toBe(200)
    expect(await payload<RuleMatch>(response)).toMatchObject({ matched: false, action: 'none' })
    unchanged(current, original)
  })

  it('never reuses allow when previewing approval-request stage', async () => {
    const current = store()
    const row = begin(current, { stage: 'approval-request' })
    const response = await approvalApiResponse(current, post({ action: 'preview', recordId: row.id, rule: rule({ action: 'allow', stage: 'approval-request' }) }))
    expect(response.status).toBe(200)
    expect(await payload<RuleMatch>(response)).toMatchObject({ action: 'ask', capabilityBlocked: true })
    expect(current.dashboard().revision).toBe(0)
  })

  it('returns 404 for a missing record without saving the candidate', async () => {
    const current = store()
    const original = disk(current)
    const response = await approvalApiResponse(current, post({ action: 'preview', rule: rule(), recordId: 'missing' }))
    expect(response.status).toBe(404)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it('does not return a permission or mutate the store when preview storage is unavailable', async () => {
    const current = unavailableStore()
    const original = disk(current)
    const response = await approvalApiResponse(current, post({ action: 'preview', rule: rule(), recordId: 'missing' }))
    expect(response.status).toBeGreaterThanOrEqual(400)
    const body = await payload(response)
    expect(body).toHaveProperty('error')
    expect(body['action']).not.toBe('allow')
    unchanged(current, original)
  })
})

describe('approvalApiResponse: versioned rule and history mutations', () => {
  it.each(['ask', 'deny'] as const)('saves, updates and deletes %s with exact versions', async action => {
    const current = store()
    const initial = await approvalApiResponse(current, post(saveBody(rule({ action }))))
    expect(initial.status).toBe(200)
    expect(await payload(initial)).toEqual({ ok: true, revision: 1 })
    expect(current.rules()).toEqual([rule({ action })])
    const update = await approvalApiResponse(current, post(saveBody(rule({ action, version: 2, name: '已更新' }), 1)))
    expect(update.status).toBe(200)
    expect(await payload(update)).toEqual({ ok: true, revision: 2 })
    expect(current.rules()[0]).toMatchObject({ version: 2, name: '已更新' })
    const deletion = await approvalApiResponse(current, post({ action: 'delete-rule', expectedRevision: 2, id: 'rule-1' }))
    expect(deletion.status).toBe(200)
    expect(await payload(deletion)).toEqual({ ok: true, revision: 3 })
    expect(current.rules()).toEqual([])
  })

  it('rejects enabled allow but permits a disabled draft without enabling capability', async () => {
    const current = store()
    const original = disk(current)
    const denied = await approvalApiResponse(current, post(saveBody(rule({ action: 'allow' }))))
    expect(denied.status).toBe(400)
    expect(await payload(denied)).toHaveProperty('error')
    unchanged(current, original)
    const draft = rule({ action: 'allow', enabled: false })
    const saved = await approvalApiResponse(current, post(saveBody(draft)))
    expect(saved.status).toBe(200)
    expect(await payload(saved)).toEqual({ ok: true, revision: 1 })
    expect(current.rules()).toEqual([draft])
    expect(current.dashboard().capabilities.creatorPlus.automatic).toBe(false)
  })

  it.each(['save-rule', 'delete-rule', 'clear-history'] as const)('returns 409 on stale revision for %s without writes', async action => {
    const current = store()
    current.saveRule(rule(), 0)
    const original = disk(current)
    const body = action === 'save-rule' ? saveBody(rule({ id: 'rule-2' }), 0)
      : action === 'delete-rule' ? { action, expectedRevision: 0, id: 'rule-1' }
        : { action, expectedRevision: 0 }
    const response = await approvalApiResponse(current, post(body))
    expect(response.status).toBe(409)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original, 1)
  })

  it('returns 409 for stale rule version even with the current revision', async () => {
    const current = store()
    current.saveRule(rule(), 0)
    const original = disk(current)
    const response = await approvalApiResponse(current, post(saveBody(rule(), 1)))
    expect(response.status).toBe(409)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original, 1)
  })

  it('returns 400 for an expired rule without incrementing revision', async () => {
    const current = store()
    const original = disk(current)
    const response = await approvalApiResponse(current, post(saveBody(rule({ expiresAt: NOW }))))
    expect(response.status).toBe(400)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it.each(['save-rule', 'delete-rule', 'clear-history'] as const)('returns generic 503 for unavailable-storage %s', async action => {
    const current = unavailableStore()
    const original = disk(current)
    const body = action === 'save-rule' ? saveBody()
      : action === 'delete-rule' ? { action, expectedRevision: 0, id: 'rule-1' }
        : { action, expectedRevision: 0 }
    const response = await approvalApiResponse(current, post(body))
    expect(response.status).toBe(503)
    const output = await payload(response)
    expect(output).toHaveProperty('error')
    expect(JSON.stringify(output)).not.toContain('CORRUPT_FILE_MUST_REMAIN_UNCHANGED')
    unchanged(current, original)
  })

  it.each(['reviewing', 'pending-human'] as const)('refuses history clearing while %s remains pending', async status => {
    const current = store()
    const row = begin(current)
    current.update(row.id, { status })
    const original = disk(current)
    const response = await approvalApiResponse(current, post({ action: 'clear-history', expectedRevision: 0 }))
    expect(response.status).toBe(400)
    expect(await payload(response)).toHaveProperty('error')
    unchanged(current, original)
  })

  it('clears settled history while preserving rules and increasing revision once', async () => {
    const current = store()
    const row = begin(current)
    current.update(row.id, { status: 'denied', execution: 'blocked' })
    current.saveRule(rule(), 0)
    const response = await approvalApiResponse(current, post({ action: 'clear-history', expectedRevision: 1 }))
    expect(response.status).toBe(200)
    expect(await payload(response)).toEqual({ ok: true, revision: 2 })
    expect(current.dashboard().records).toEqual([])
    expect(current.rules()).toEqual([rule()])
  })
})
