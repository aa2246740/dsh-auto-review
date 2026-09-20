/** Authenticated, same-origin settings/history API on the public Connection carrier. */
import type { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { APPROVAL_API_PATH, type RuleContext } from './contracts.ts'
import { ApprovalAuditStore } from './audit.ts'
import { matchRules, validateRule } from './rules.ts'

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}

/** Connection authenticates and checks Host/Origin before constructing its synthetic dsh.internal URL. */
function sameOriginIntent(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (origin === null || (fetchSite !== null && fetchSite !== 'same-origin')) return false
  try {
    const browserOrigin = new URL(origin)
    if (!['http:', 'https:'].includes(browserOrigin.protocol) || origin !== browserOrigin.origin) return false
    if (url.hostname !== 'dsh.internal') return browserOrigin.origin === url.origin
    const host = request.headers.get('host')
    if (host === null) return false
    const authority = new URL(`${browserOrigin.protocol}//${host}`)
    if (authority.username !== '' || authority.password !== '' || authority.pathname !== '/' || authority.search !== '' || authority.hash !== '') return false
    return browserOrigin.host === authority.host
  } catch { return false }
}

/** This handler must only be installed via Connection.fetch, never bare WebServer routes. */
export async function approvalApiResponse(store: ApprovalAuditStore, request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET') {
    const before = url.searchParams.get('before')
    const limit = url.searchParams.get('limit')
    const statuses = ['reviewing', 'pending-human', 'allowed', 'denied', 'failed', 'cancelled', 'unavailable', 'interrupted']
    if ([...url.searchParams.keys()].some(key => !['before', 'limit', 'sessionId', 'status', 'toolName'].includes(key) || url.searchParams.getAll(key).length !== 1)
      || (url.searchParams.get('sessionId')?.length ?? 0) > 256 || (url.searchParams.get('toolName')?.length ?? 0) > 128
      || (url.searchParams.has('status') && !statuses.includes(url.searchParams.get('status')!))) return json({ error: '筛选参数无效。' }, 400)
    if ((before !== null && (!/^\d+$/.test(before) || !Number.isSafeInteger(Number(before)) || Number(before) < 0))
      || (limit !== null && (!/^\d+$/.test(limit) || !Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 200))) return json({ error: '分页参数无效。' }, 400)
    return json(store.dashboard({
      ...before === null ? {} : { before: Number(before) },
      ...limit === null ? {} : { limit: Number(limit) },
      ...url.searchParams.has('sessionId') ? { sessionId: url.searchParams.get('sessionId')! } : {},
      ...url.searchParams.has('status') ? { status: url.searchParams.get('status')! } : {},
      ...url.searchParams.has('toolName') ? { toolName: url.searchParams.get('toolName')! } : {},
    }))
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  // Connection has already authenticated the caller. Require browser same-origin intent as well.
  if (!sameOriginIntent(request, url) || request.headers.get('x-dsh-approval-ui') !== '1') return json({ error: '需要同源审批管理页面。' }, 403)
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return json({ error: '需要 JSON 请求。' }, 415)
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 32_768) return json({ error: '请求过大。' }, 413)
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > 32_768) return json({ error: '请求过大。' }, 413)
    request.signal.throwIfAborted()
    const value: unknown = JSON.parse(text)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return json({ error: '请求无效。' }, 400)
    const body = value as Record<string, unknown>
    const action = body['action']
    if (action === 'preview') {
      if (Object.keys(body).some(key => !['action', 'rule', 'recordId'].includes(key)) || typeof body['recordId'] !== 'string') return json({ error: '预览请求无效。' }, 400)
      const record = store.record(body['recordId'])
      if (record === undefined) return json({ error: '审核记录不存在或已过期。' }, 404)
      const rule = validateRule(body['rule'])
      const context: RuleContext = {
        sessionId: record.sessionId, stage: record.stage, toolName: record.toolName,
        ...record.argumentFingerprint === undefined ? {} : { argumentFingerprint: record.argumentFingerprint },
        ...record.pluginId === undefined ? {} : { pluginId: record.pluginId },
        // No request text, client field or tool name can make these trustworthy.
        sourceVerified: false, permissionRaised: record.stage === 'approval-request', policyNever: false, now: Date.now(),
      }
      return json(matchRules([rule], context))
    }
    if (!Number.isSafeInteger(body['expectedRevision']) || Number(body['expectedRevision']) < 0) return json({ error: '缺少规则版本，请刷新。' }, 400)
    const expectedRevision = Number(body['expectedRevision'])
    if (action === 'save-rule') {
      if (Object.keys(body).some(key => !['action', 'expectedRevision', 'rule'].includes(key))) return json({ error: '规则请求包含未知字段。' }, 400)
      return json({ ok: true, revision: store.saveRule(body['rule'], expectedRevision) })
    }
    if (action === 'delete-rule') {
      if (Object.keys(body).some(key => !['action', 'expectedRevision', 'id'].includes(key)) || typeof body['id'] !== 'string') return json({ error: '规则请求无效。' }, 400)
      return json({ ok: true, revision: store.deleteRule(body['id'], expectedRevision) })
    }
    if (action === 'clear-history') {
      if (Object.keys(body).some(key => !['action', 'expectedRevision'].includes(key))) return json({ error: '清理请求无效。' }, 400)
      return json({ ok: true, revision: store.clearHistory(expectedRevision) })
    }
    return json({ error: '不支持此操作。' }, 400)
  } catch (error: unknown) {
    const healthy = store.dashboard({ limit: 1 }).storage.ok
    const message = error instanceof Error ? error.message : '审批管理操作失败。'
    // Validation errors never contain raw arguments; storage exceptions remain generic.
    return json({ error: healthy ? message : '审核存储不可用，请检查权限或损坏情况。' }, !healthy ? 503 : message.includes('版本冲突') ? 409 : 400)
  }
}

/** Public Connection owns authentication, Host/Origin checks, body limits and disposal. */
export function installApprovalApi(ctx: Context, store: ApprovalAuditStore): void {
  const connection = Reflect.get(ctx, 'connection') as HostConnectionHandle
  ctx.effect(() => connection.fetch.register({
    path: APPROVAL_API_PATH, methods: ['GET', 'POST'], requestBody: 'buffered',
    fetch: request => approvalApiResponse(store, request),
  }), 'approve-for-me: authenticated audit and rule management')
}
