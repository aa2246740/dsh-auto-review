/** Authenticated same-origin confirmation and remembered-grant routing. Not a capability mint. */
import type { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { CREATOR_CONSENT_API_PATH } from './contracts.ts'
import { CreatorAuthorizerHost, CreatorAuthorizerHostError } from './creator-authorizer-host.ts'
import { CreatorConsentError } from './creator-consent.ts'
import { CreatorGrantStoreError } from './creator-grants.ts'
import type { CreatorRememberedGrant } from './creator-grant-types.ts'

export { CREATOR_CONSENT_API_PATH }

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
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
function sessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
}
function publicGrant(grant: CreatorRememberedGrant) {
  return {
    id: grant.id, version: grant.version, pluginId: grant.binding.pluginId, operations: grant.operations,
    createdAt: grant.createdAt, expiresAt: grant.expiresAt, enabled: grant.enabled,
    ...grant.revokedAt === undefined ? {} : { revokedAt: grant.revokedAt },
  }
}
function failStatus(code: string): number {
  if (code === 'not-found') return 404
  if (code === 'conflict' || code === 'invalid-view' || code === 'confirmation-used') return 409
  if (code === 'closed' || code === 'disabled' || code === 'not-current-owner') return 403
  return 400
}
function caught(error: unknown): Response {
  const code = error instanceof CreatorConsentError || error instanceof CreatorAuthorizerHostError || error instanceof CreatorGrantStoreError
    ? error.code : 'invalid-input'
  return json({ error: '确认请求无效。', code }, failStatus(code))
}

export async function creatorConsentApiResponse(host: CreatorAuthorizerHost, request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET') {
    if ([...url.searchParams.keys()].some(key => !['sessionId', 'grants'].includes(key) || url.searchParams.getAll(key).length !== 1)) {
      return json({ error: '筛选参数无效。' }, 400)
    }
    if (url.searchParams.get('grants') === '1') {
      if (url.searchParams.has('sessionId')) return json({ error: '筛选参数无效。' }, 400)
      const snapshot = host.grants()
      return json({ ok: true, revision: snapshot.revision, rules: snapshot.rules.map(publicGrant), storage: snapshot.storage })
    }
    const id = url.searchParams.get('sessionId')
    if (!sessionId(id)) return json({ error: '会话无效。' }, 400)
    return json(host.list(id))
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
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
    if (action === 'present') {
      if (Object.keys(body).some(key => !['action', 'id', 'sessionId'].includes(key)) || typeof body['id'] !== 'string' || !sessionId(body['sessionId'])) {
        return json({ error: '确认请求无效。' }, 400)
      }
      return json(host.present(body['id'], body['sessionId']))
    }
    if (action === 'confirm') {
      if (Object.keys(body).some(key => !['action', 'id', 'viewNonce', 'answer'].includes(key))
        || typeof body['id'] !== 'string' || typeof body['viewNonce'] !== 'string') return json({ error: '确认请求无效。' }, 400)
      return json(host.confirm(body['id'], body['viewNonce'], body['answer']))
    }
    if (action === 'delegate') {
      if (Object.keys(body).some(key => !['action', 'id', 'viewNonce'].includes(key))
        || typeof body['id'] !== 'string' || typeof body['viewNonce'] !== 'string') return json({ error: '确认请求无效。' }, 400)
      return json(host.delegate(body['id'], body['viewNonce']))
    }
    if (action === 'revoke-grant') {
      if (Object.keys(body).some(key => !['action', 'id', 'expectedRevision'].includes(key))
        || typeof body['id'] !== 'string' || !Number.isSafeInteger(body['expectedRevision']) || Number(body['expectedRevision']) < 0) {
        return json({ error: '规则请求无效。' }, 400)
      }
      const snapshot = host.revoke(body['id'], Number(body['expectedRevision']))
      return json({ ok: true, revision: snapshot.revision, rules: snapshot.rules.map(publicGrant) })
    }
    return json({ error: '不支持此操作。' }, 400)
  } catch (error: unknown) {
    return caught(error)
  }
}

export function installCreatorConsentApi(ctx: Context, host: CreatorAuthorizerHost): void {
  const connection = Reflect.get(ctx, 'connection') as HostConnectionHandle
  ctx.effect(() => connection.fetch.register({
    path: CREATOR_CONSENT_API_PATH, methods: ['GET', 'POST'], requestBody: 'buffered',
    fetch: request => creatorConsentApiResponse(host, request),
  }), 'approve-for-me: authenticated creator confirmation routing')
}
