import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ApprovalSettings } from './contracts.ts'
import { ApprovalAuditStore } from './audit.ts'
import { installApprovalApi } from './api.ts'
import { argumentFingerprint, targetPlugin } from './approval-context.ts'
import { matchRules } from './rules.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { AutoReviewCoordinator, registerCoordinatorPolicyEvents } from './coordinator.ts'
import { ApprovalReviewer } from './reviewer.ts'
import { CreatorGrantStore } from './creator-grants.ts'
import { createCreatorAuthorizerHost } from './creator-authorizer-host.ts'
import { creatorExecutionAudit } from './creator-execution-audit.ts'
import { installCreatorConsentApi } from './creator-consent-api.ts'
import {
  DEFAULT_REVIEW_HISTORY_CHARS,
  DEFAULT_REVIEW_HISTORY_PAIRS,
} from './review-session.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-approve-for-me': { kind: 'dsh-approve-for-me' } & ContextFormed
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Official Web permission-preset service required by this plugin. */
    permissionPresets: {
      current(session: Agent['session']): string
    }
  }
}

export const name = 'dsh-approve-for-me'
export const inject = ['tools', 'llm', 'approval', 'permissionPresets', 'connection']

/** Permission-preset key that delegates approval requests to this reviewer. */
export const APPROVE_FOR_ME_PRESET = 'approve-for-me'

/** Durable settings namespace shared with the browser half. */
export const APPROVE_FOR_ME_SETTINGS_NAMESPACE = 'dsh-approve-for-me'

/** User-owned reviewer settings. */
export interface ReviewerSettings extends ApprovalSettings {
  /** Whether the reviewer participates in approval waterfalls. */
  enabled?: boolean
  /** Follow the current agent route, or use one explicit registered DSH route. */
  modelMode?: 'follow-agent' | 'fixed'
  /** JSON tuple `[provider, model]`, written atomically by the browser. */
  reviewerRoute?: string
  /** Prefer the model's `low` effort when available, or preserve its default. */
  reasoningMode?: 'low' | 'provider-default'
  /** Total deadline shared by every reviewer attempt. */
  timeoutMs?: number
  /** Additional attempts for transient transport or malformed-output failures. */
  transportRetries?: number
  /** Reviewer response ceiling. */
  maxOutputTokens?: number
  /** Maximum framed authorization context sent to the reviewer. */
  maxInputChars?: number
  /** Maximum prior reviewer assessment pairs retained in one reusable conversation. */
  reviewHistoryPairs?: number
  /** Maximum serialized characters retained across prior reviewer assessments. */
  reviewHistoryChars?: number
}

export type Config = ReviewerSettings

/** Composition and durable settings schema. */
interface LiveValue<T> { get(): T | undefined }

/** Loader-resolved volatile config. Each decision calls `get()` so a settings write is visible immediately. */
export interface LiveReviewerConfig {
  enabled: LiveValue<boolean>
  failureMode: LiveValue<'human' | 'reject'>
  historyRetentionDays: LiveValue<number>
  historyMaxRecords: LiveValue<number>
  modelMode: LiveValue<'follow-agent' | 'fixed'>
  reviewerRoute: LiveValue<string>
  reasoningMode: LiveValue<'low' | 'provider-default'>
  timeoutMs: LiveValue<number>
  transportRetries: LiveValue<number>
  maxOutputTokens: LiveValue<number>
  maxInputChars: LiveValue<number>
  reviewHistoryPairs: LiveValue<number>
  reviewHistoryChars: LiveValue<number>
}

export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  failureMode: z.union(['human', 'reject'] as const).default('human').volatile(),
  historyRetentionDays: z.number().step(1).min(1).max(365).default(30).volatile(),
  historyMaxRecords: z.number().step(1).min(100).max(10_000).default(1_000).volatile(),
  modelMode: z.union(['follow-agent', 'fixed'] as const).default('follow-agent').volatile(),
  reviewerRoute: z.string().default('').volatile(),
  reasoningMode: z.union(['low', 'provider-default'] as const).default('low').volatile(),
  timeoutMs: z.number().step(1).min(1_000).max(120_000).default(90_000).volatile(),
  transportRetries: z.number().step(1).min(0).max(2).default(2).volatile(),
  maxOutputTokens: z.number().step(1).min(128).max(4_096).default(256).volatile(),
  maxInputChars: z.number().step(1).min(2_000).max(100_000).default(20_000).volatile(),
  reviewHistoryPairs: z.number().step(1).min(1).max(12).default(DEFAULT_REVIEW_HISTORY_PAIRS).volatile(),
  reviewHistoryChars: z.number().step(1).min(2_000).max(100_000).default(DEFAULT_REVIEW_HISTORY_CHARS).volatile(),
})

function currentSettings(config: LiveReviewerConfig): ReviewerSettings {
  return {
    enabled: config.enabled.get() ?? true,
    failureMode: config.failureMode.get() ?? 'human',
    historyRetentionDays: config.historyRetentionDays.get() ?? 30,
    historyMaxRecords: config.historyMaxRecords.get() ?? 1_000,
    modelMode: config.modelMode.get() ?? 'follow-agent',
    reviewerRoute: config.reviewerRoute.get() ?? '',
    reasoningMode: config.reasoningMode.get() ?? 'low',
    timeoutMs: config.timeoutMs.get() ?? 90_000,
    transportRetries: config.transportRetries.get() ?? 2,
    maxOutputTokens: config.maxOutputTokens.get() ?? 256,
    maxInputChars: config.maxInputChars.get() ?? 20_000,
    reviewHistoryPairs: config.reviewHistoryPairs.get() ?? DEFAULT_REVIEW_HISTORY_PAIRS,
    reviewHistoryChars: config.reviewHistoryChars.get() ?? DEFAULT_REVIEW_HISTORY_CHARS,
  }
}

/** True only for the explicit preset and an enabled reviewer kill switch. */
export function reviewerModeActive(
  ctx: Context,
  agent: Agent,
  settings: ReviewerSettings,
): boolean {
  return settings.enabled !== false
    && ctx.permissionPresets.current(agent.session) === APPROVE_FOR_ME_PRESET
}

/** The public override intentionally omits the deployment default; include both before any fast path. */
export function canRequestApproval(ctx: Context, agent: Agent): boolean {
  return (ctx.approval.overrideOf(agent.session) ?? ctx.approval.config.policy ?? 'ask') === 'ask'
}

/** Install approval-only Auto-review without changing DSH core policy or tool definitions. */
export function apply(ctx: Context, config: LiveReviewerConfig): void {
  ctx.logger.info('[my-plugins/dsh-approve-for-me] loaded')
  const source = (): ReviewerSettings => currentSettings(config)
  // Custom settings pages own their UI. Volatile fields stay readable without this policy.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })

  const reviewer = new ApprovalReviewer(ctx, source)
  const configuredHome: unknown = Reflect.get(process.env, 'DSH_HOME')
  const directory = join(typeof configuredHome === 'string' && configuredHome.length > 0 ? configuredHome : join(homedir(), '.dsh'), 'approve-for-me')
  const audit = new ApprovalAuditStore(directory, source)
  const coordinator = new AutoReviewCoordinator(
    reviewer,
    agent => reviewerModeActive(ctx, agent, source()),
    {
      failureMode: () => source().failureMode ?? 'human',
      canAsk: agent => canRequestApproval(ctx, agent),
      audit,
      rule: (exec, stage) => matchRules(audit.rules(), {
        sessionId: String(exec.agent?.session.header.id ?? 'unbound'),
        stage, toolName: exec.name, argumentFingerprint: argumentFingerprint(exec.arguments),
        ...targetPlugin(exec.name, exec.arguments) === undefined ? {} : { pluginId: targetPlugin(exec.name, exec.arguments)! },
        sourceVerified: false, // No public execution-bound tool provenance capability in this Host.
        permissionRaised: stage === 'approval-request',
        policyNever: exec.agent !== undefined && !canRequestApproval(ctx, exec.agent),
        now: Date.now(),
      }),
    },
  )
  installApprovalApi(ctx, audit)
  const grants = new CreatorGrantStore({ directory, isCurrentOwner: () => true })
  const authorizerHost = createCreatorAuthorizerHost(ctx, {
    store: grants,
    isCurrentOwner: () => source().enabled !== false,
    audit: creatorExecutionAudit(directory),
  })
  installCreatorConsentApi(ctx, authorizerHost)
  if (typeof ctx.provide === 'function') {
    ctx.provide('creatorAuthorizer', Object.freeze({
      protocol: 'creator-authorizer-host-v1',
      createAuthorizer: authorizerHost.createAuthorizer,
    }))
  }
  ctx.effect(() => () => {
    coordinator.dispose(); audit.dispose(); authorizerHost.dispose(); grants.dispose()
  }, 'approve-for-me: cancel pending reviews and close audit/grant stores')
  registerCoordinatorPolicyEvents(ctx, coordinator)
  ctx.tools.guard(exec => {
    if (exec.agent === undefined || !reviewerModeActive(ctx, exec.agent, source()) || !['write', 'edit'].includes(exec.name)) return undefined
    const args = exec.arguments !== null && typeof exec.arguments === 'object' && !Array.isArray(exec.arguments)
      ? exec.arguments as Record<string, unknown> : undefined
    const path = args?.['file_path'] ?? args?.['path']
    if (typeof path !== 'string') return undefined
    const cwd = exec.agent.session.header.cwd
    if (cwd === undefined) return undefined
    const absolute = resolve(cwd, path)
    const protectedRoot = resolve(directory)
    return absolute === protectedRoot || absolute.startsWith(`${protectedRoot}${sep}`)
      ? '审批规则与审核存储只能通过用户审批管理页面修改，不能由模型自行改写。' : undefined
  })

  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const downstream = await next()
    return coordinator.preExecute(exec, downstream)
  }, { prepend: true })

  ctx.on('approval/request', (
    request: ApprovalRequest,
    next,
  ): Promise<ApprovalOutcome> => coordinator.approvalRequest(request, next), { prepend: true })

  ctx.on('tools/result', (exec, result) => {
    coordinator.toolResult(exec, result)
  })
}
