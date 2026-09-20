/** Real ApprovalService hook via the private host factory. Not physical-human proof. */
import * as fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import PermissionPresetService from '@deepseek-ai/dsh-permission-presets'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import { CreatorGrantStore } from '../src/creator-grants.ts'
import type { CreatorGrantBinding } from '../src/creator-grant-types.ts'
import type { CreatorOwnerInspection, CreatorPreparedInspection } from '../src/creator-authorizer.ts'
import { createCreatorAuthorizerHost } from '../src/creator-authorizer-host.ts'

const ONCE = { decision: 'allow' as const, lifetime: 'once' as const, operations: ['hot-reload' as const] }
const disposers: Array<() => void | Promise<void>> = []
let root: string
async function flush() { for (let index = 0; index < 20; index += 1) await Promise.resolve() }
beforeEach(() => { root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'creator-authorizer-host-'))) })
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('Private authorizer host factory', () => {
  it('hooks the real approval/request channel and consume returns literal true', async () => {
    const ctx = new Context()
    const fibers = [await ctx.plugin(SessionStore), await ctx.plugin(SessionProjectionRegistry), await ctx.plugin(ApprovalService)]
    ctx.provide('shell', { sandboxMode: 'danger-full-access', run() { throw new Error('No dispatch') } })
    fibers.push(await ctx.plugin(PermissionPresetService, { presets: { 'approve-for-me': { sandbox: 'danger-full-access', approval: 'ask' } }, defaultPreset: 'approve-for-me' }))
    const workspace = join(root, 'workspace'), source = join(root, 'example-plugin'), harness = join(root, 'harness')
    for (const directory of [workspace, source, harness]) fs.mkdirSync(directory)
    fibers.push(await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access', workspaceRoot: workspace }))
    const session = ctx.sessions.create(SessionId('host-session'))
    session.append('turn/start', { turn: 1 })
    const agent = { session } as unknown as Agent
    const stat = fs.statSync(source, { bigint: true })
    const binding: CreatorGrantBinding = { engine: 'creator-plus-v1', harnessRoot: harness, sourceRoot: source, pluginId: 'example-plugin',
      sourceDirectoryIdentity: { dev: String(stat.dev), ino: String(stat.ino) }, workspaceRoot: workspace }
    const store = new CreatorGrantStore({ directory: join(root, 'ledger'), isCurrentOwner: () => true })
    const host = createCreatorAuthorizerHost(ctx, { store, isCurrentOwner: () => true, audit: () => true })
    const owner = Object.freeze({}), preparation = Object.freeze({}), abort = new AbortController(), prep = new AbortController()
    const request = Object.freeze({ agent, toolName: 'dshx_hot_reload', signal: abort.signal })
    const facts: CreatorOwnerInspection = { exactNativeRequest: request, binding, operation: 'hot-reload', policyEpoch: Object.freeze({}), signal: abort.signal }
    const prepared: CreatorPreparedInspection = { owner, binding, operation: 'hot-reload', seal: Object.freeze({}), signal: prep.signal }
    const lease = host.createAuthorizer({
      signal: abort.signal,
      inspectOwner: value => value === owner ? facts : undefined,
      inspectPrepared: value => value === preparation ? prepared : undefined,
      supportedOperations: ['hot-reload'],
    })
    const pending = lease.authorize(owner, preparation)
    void pending.catch(() => {})
    await flush()
    const listed = host.list(session.id)
    expect(listed).toHaveLength(1)
    const view = host.present(listed[0]!.prompt.id, session.id)
    expect(host.confirm(view.prompt.id, view.viewNonce, ONCE).status).toBe('accepted')
    const cap = await pending
    expect(lease.consume(cap, owner, preparation)).toBe(true)
    expect(() => lease.consume(cap, owner, preparation)).toThrow()
    host.dispose(); store.dispose()
    for (const fiber of fibers.reverse()) await fiber.dispose()
  })
})
