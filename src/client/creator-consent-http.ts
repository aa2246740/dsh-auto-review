/** Same-origin confirmation client. Nonce/ACK is association, not physical humanity. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { CREATOR_CONSENT_API_PATH } from '../contracts.ts'
import type { CreatorConsentTransport } from './creator-consent-transport.tsx'

async function read(response: Response): Promise<unknown> {
  let value: unknown
  try { value = await response.json() } catch { throw new Error('Invalid confirmation response') }
  if (!response.ok) throw new Error(typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string' ? value.error : 'Confirmation request failed')
  return value
}

export function createCreatorConsentHttpTransport(): CreatorConsentTransport {
  return {
    async list(sessionId: SessionId, signal: AbortSignal) {
      const query = new URLSearchParams({ sessionId })
      const value = await read(await fetch(`${CREATOR_CONSENT_API_PATH}?${query.toString()}`, { credentials: 'same-origin', cache: 'no-store', signal }))
      if (!Array.isArray(value)) throw new Error('Invalid confirmation list')
      return value
    },
    async present(id, sessionId, signal) {
      const value = await read(await fetch(CREATOR_CONSENT_API_PATH, {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { 'x-dsh-approval-ui': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'present', id, sessionId }),
      }))
      return value as Awaited<ReturnType<CreatorConsentTransport['present']>>
    },
    async confirm(input, signal) {
      const value = await read(await fetch(CREATOR_CONSENT_API_PATH, {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { 'x-dsh-approval-ui': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', id: input.id, viewNonce: input.viewNonce, answer: input.answer }),
      }))
      return value as Awaited<ReturnType<CreatorConsentTransport['confirm']>>
    },
    async delegate(input, signal) {
      const value = await read(await fetch(CREATOR_CONSENT_API_PATH, {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { 'x-dsh-approval-ui': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delegate', id: input.id, viewNonce: input.viewNonce }),
      }))
      return value as Awaited<ReturnType<CreatorConsentTransport['delegate']>>
    },
  }
}

export interface RememberedGrantRow {
  id: string
  version: number
  pluginId: string
  operations: string[]
  createdAt: number
  expiresAt: number
  enabled: boolean
  revokedAt?: number
}

export async function getRememberedGrants(signal?: AbortSignal): Promise<{ revision: number; rules: RememberedGrantRow[] }> {
  const value = await read(await fetch(`${CREATOR_CONSENT_API_PATH}?grants=1`, { credentials: 'same-origin', cache: 'no-store', ...(signal === undefined ? {} : { signal }) }))
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { rules?: unknown }).rules)
    || !Number.isSafeInteger((value as { revision?: unknown }).revision)) throw new Error('Invalid remembered-rule response')
  return value as { revision: number; rules: RememberedGrantRow[] }
}

export async function revokeRememberedGrant(id: string, expectedRevision: number): Promise<{ revision: number; rules: RememberedGrantRow[] }> {
  const value = await read(await fetch(CREATOR_CONSENT_API_PATH, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'x-dsh-approval-ui': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'revoke-grant', id, expectedRevision }),
  }))
  if (typeof value !== 'object' || value === null || (value as { ok?: unknown }).ok !== true) throw new Error('Invalid remembered-rule response')
  return value as { revision: number; rules: RememberedGrantRow[] }
}
