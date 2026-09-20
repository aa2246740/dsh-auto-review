import { describe, expect, it } from 'vitest'
import { CREATOR_CONSENT_API_PATH, creatorConsentApiResponse } from '../src/creator-consent-api.ts'
import { CreatorAuthorizerHostError } from '../src/creator-authorizer-host.ts'

const ORIGIN = 'https://approval.example.invalid'
const URL = `${ORIGIN}${CREATOR_CONSENT_API_PATH}`

function host(overrides: Record<string, unknown> = {}) {
  return {
    list: (sessionId: string) => [{ prompt: { id: 'req-1', pluginId: sessionId }, expiresAt: 1 }],
    present: (id: string, sessionId: string) => ({ prompt: { id, pluginId: sessionId }, expiresAt: 1, viewNonce: 'nonce-1' }),
    confirm: () => ({ id: 'req-1', status: 'accepted' }),
    delegate: () => ({ id: 'req-1', status: 'delegated' }),
    grants: () => ({ revision: 2, rules: [{ id: 'g1', version: 1, binding: { pluginId: 'example-plugin' }, operations: ['hot-reload'], createdAt: 1, expiresAt: 2, enabled: true }], storage: { ok: true, revision: 2, durableRevocationGuaranteed: true } }),
    revoke: () => ({ revision: 3, rules: [], storage: { ok: true, revision: 3, durableRevocationGuaranteed: true } }),
    ...overrides,
  } as never
}

describe('creatorConsentApiResponse', () => {
  it('lists by session and redacts remembered grant paths', async () => {
    const listed = await creatorConsentApiResponse(host(), new Request(`${URL}?sessionId=session-1`))
    expect(listed.status).toBe(200)
    expect(await listed.json()).toEqual([{ prompt: { id: 'req-1', pluginId: 'session-1' }, expiresAt: 1 }])
    const grants = await creatorConsentApiResponse(host(), new Request(`${URL}?grants=1`))
    const body = await grants.json() as { rules: Array<Record<string, unknown>> }
    expect(body.rules[0]).toMatchObject({ id: 'g1', pluginId: 'example-plugin', operations: ['hot-reload'] })
    expect(body.rules[0]).not.toHaveProperty('binding')
  })
  it('requires same-origin UI for confirm and maps missing requests to 404', async () => {
    const denied = await creatorConsentApiResponse(host(), new Request(URL, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm', id: 'req-1', viewNonce: 'x', answer: { decision: 'reject' } }),
    }))
    expect(denied.status).toBe(403)
    const missing = await creatorConsentApiResponse(host({
      confirm: () => { throw new CreatorAuthorizerHostError('not-found') },
    }), new Request(URL, {
      method: 'POST',
      headers: { origin: ORIGIN, 'x-dsh-approval-ui': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', id: 'req-1', viewNonce: 'x', answer: { decision: 'reject' } }),
    }))
    expect(missing.status).toBe(404)
  })
})
