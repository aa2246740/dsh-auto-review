/**
 * Private A factory for one Root ApprovalService + one GrantStore.
 * Each producer gets its own Authorizer/Registry and a real approval/request
 * prepend hook. This is not an HTTP grant API and does not mint capabilities
 * from JSON, callId, or native allowed-once alone.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import { CreatorAuthorizer } from './creator-authorizer.ts'
import type {
  CreatorAuthorizerOptions,
  CreatorExecutionAudit,
  CreatorOwnerInspection,
  CreatorPreparedInspection,
} from './creator-authorizer.ts'
import { CreatorConsentRegistry } from './creator-consent.ts'
import { CreatorGrantStore } from './creator-grants.ts'
import type { CreatorGrantOperation } from './creator-grant-types.ts'

export interface CreatorAuthorizerFactoryInput {
  signal: AbortSignal
  inspectOwner(owner: object): CreatorOwnerInspection | undefined
  inspectPrepared(preparation: object): CreatorPreparedInspection | undefined
  supportedOperations: readonly CreatorGrantOperation[]
}
export interface CreatorAuthorizerLease {
  signal: AbortSignal
  authorize(owner: object, preparation: object): Promise<object>
  consume(capability: object, owner: object, preparation: object): true
  revalidateStarted(capability: object, owner: object, preparation: object): true
  dispose(): void
}
export interface CreatorAuthorizerMember {
  consent: CreatorConsentRegistry
  authorizer: CreatorAuthorizer
  dispose(): void
}
export interface CreatorAuthorizerHostOptions {
  store: CreatorGrantStore
  isCurrentOwner: () => boolean
  audit: (event: Readonly<CreatorExecutionAudit>) => true
  now?: () => number
}
export class CreatorAuthorizerHostError extends Error {
  constructor(readonly code: string) {
    super(`Creator authorizer host: ${code}`)
    this.name = 'CreatorAuthorizerHostError'
  }
}

function fail(code: string): never { throw new CreatorAuthorizerHostError(code) }

export class CreatorAuthorizerHost {
  readonly members: CreatorAuthorizerMember[] = []
  readonly createAuthorizer: (input: CreatorAuthorizerFactoryInput) => CreatorAuthorizerLease
  private readonly life = new AbortController()
  private readonly store: CreatorGrantStore
  constructor(ctx: Context, options: CreatorAuthorizerHostOptions) {
    if (!ctx || typeof ctx.on !== 'function' || !(ctx.approval instanceof ApprovalService)
      || !(options?.store instanceof CreatorGrantStore) || typeof options.isCurrentOwner !== 'function'
      || typeof options.audit !== 'function') throw new CreatorAuthorizerHostError('invalid-options')
    const store = this.store = options.store
    const ownerLease = options.isCurrentOwner
    const audit = options.audit
    const now = options.now
    this.createAuthorizer = (input: CreatorAuthorizerFactoryInput): CreatorAuthorizerLease => {
      if (this.life.signal.aborted || ownerLease() !== true) fail('closed')
      if (!(input?.signal instanceof AbortSignal) || input.signal.aborted
        || typeof input.inspectOwner !== 'function' || typeof input.inspectPrepared !== 'function'
        || !Array.isArray(input.supportedOperations)) fail('invalid-factory-input')
      if (this.members.length >= 32) return fail('capacity')
      const inspectOwner = input.inspectOwner, inspectPrepared = input.inspectPrepared
      const operations = Object.freeze([...input.supportedOperations])
      const ownLife = new AbortController()
      const signal = AbortSignal.any([input.signal, ownLife.signal, this.life.signal])
      const consent = new CreatorConsentRegistry({
        isCurrentOwner: () => !signal.aborted && ownerLease() === true,
        validateOwner: owner => input.inspectOwner(owner) !== undefined,
        sessionOfOwner: owner => {
          const facts = input.inspectOwner(owner)
          const id = facts?.exactNativeRequest.agent.session.id
          return typeof id === 'string' ? id : undefined
        },
        ...now === undefined ? {} : { now },
      })
      const authorizerOptions: CreatorAuthorizerOptions = {
        approval: ctx.approval, store, consent,
        isCurrentOwner: () => !signal.aborted && ownerLease() === true,
        inspectOwner: input.inspectOwner, inspectPrepared: input.inspectPrepared,
        supportedOperations: input.supportedOperations, audit,
        ...now === undefined ? {} : { now },
      }
      let authorizer: CreatorAuthorizer
      try { authorizer = new CreatorAuthorizer({ ...authorizerOptions, inspectOwner, inspectPrepared, supportedOperations: operations }) }
      catch (error) { consent.dispose(); throw error }
      const off = ctx.on('approval/request', (request: ApprovalRequest, next: () => Promise<ApprovalOutcome>) => authorizer.handleNativeRequest(request, next), { prepend: true })
      let closed = false
      const dispose = (): void => {
        if (closed) return
        closed = true
        const index = this.members.indexOf(member)
        if (index >= 0) this.members.splice(index, 1)
        signal.removeEventListener('abort', dispose)
        ownLife.abort()
        try { off() } catch { /* already removed */ }
        authorizer.dispose()
        consent.dispose()
      }
      const member: CreatorAuthorizerMember = { consent, authorizer, dispose }
      signal.addEventListener('abort', dispose, { once: true })
      this.members.push(member)
      if (signal.aborted) { dispose(); return fail('closed') }
      return Object.freeze({
        signal,
        authorize: (owner: object, preparation: object) => authorizer.authorize(owner, preparation),
        consume: (capability: object, owner: object, preparation: object) => authorizer.consume(capability, owner, preparation),
        revalidateStarted: (capability: object, owner: object, preparation: object) => authorizer.revalidateStarted(capability, owner, preparation),
        dispose,
      })
    }
  }
  pending(sessionId: string): Array<{ member: CreatorAuthorizerMember; listing: ReturnType<CreatorConsentRegistry['list']>[number] }> {
    const found: Array<{ member: CreatorAuthorizerMember; listing: ReturnType<CreatorConsentRegistry['list']>[number] }> = []
    for (const member of this.members) {
      for (const listing of member.consent.list(sessionId)) found.push({ member, listing })
    }
    return found
  }
  private registry(id: string): CreatorConsentRegistry {
    const matches = this.members.filter(member => member.consent.has(id))
    if (matches.length !== 1) return fail('not-found')
    return matches[0]!.consent
  }
  list(sessionId: string) { return this.pending(sessionId).map(row => row.listing) }
  present(id: string, sessionId: string) { return this.registry(id).present(id, sessionId) }
  confirm(id: string, nonce: string, answer: unknown) { return this.registry(id).confirm(id, nonce, answer) }
  delegate(id: string, nonce: string) { return this.registry(id).delegatePresented(id, nonce) }
  grants() { return { revision: this.store.health().revision, rules: this.store.list(), storage: this.store.health() } }
  revoke(id: string, revision: number) { this.store.revoke(id, revision); return this.grants() }
  invalidate(): void { for (const member of [...this.members]) member.dispose() }
  dispose(): void {
    if (this.life.signal.aborted) return
    this.life.abort()
    this.invalidate()
  }
}

export function createCreatorAuthorizerHost(ctx: Context, options: CreatorAuthorizerHostOptions): CreatorAuthorizerHost {
  return new CreatorAuthorizerHost(ctx, options)
}
