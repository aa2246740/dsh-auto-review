import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { AutoReviewCoordinator } from './coordinator.ts'
import { ApprovalReviewer } from './reviewer.ts'
import {
  DEFAULT_REVIEW_HISTORY_CHARS,
  DEFAULT_REVIEW_HISTORY_PAIRS,
} from './review-session.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Official Web permission-preset service required by this plugin. */
    permissionPresets: {
      current(events: Agent['session']['events']): string
    }
  }
}

export const name = 'dsh-approve-for-me'
export const inject = ['tools', 'llm', 'approval', 'permissionPresets']

/** Permission-preset key that delegates approval requests to this reviewer. */
export const APPROVE_FOR_ME_PRESET = 'approve-for-me'

/** Durable settings namespace shared with the browser half. */
export const APPROVE_FOR_ME_SETTINGS_NAMESPACE = settingsNamespace('dsh-approve-for-me')

/** User-owned reviewer settings. */
export interface ReviewerSettings {
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
export const Config: z<ReviewerSettings> = z.object({
  enabled: z.boolean().default(true),
  modelMode: z.union(['follow-agent', 'fixed'] as const).default('follow-agent'),
  reviewerRoute: z.string().default(''),
  reasoningMode: z.union(['low', 'provider-default'] as const).default('low'),
  timeoutMs: z.number().step(1).min(1_000).max(120_000).default(90_000),
  transportRetries: z.number().step(1).min(0).max(2).default(2),
  maxOutputTokens: z.number().step(1).min(128).max(4_096).default(256),
  maxInputChars: z.number().step(1).min(2_000).max(100_000).default(20_000),
  reviewHistoryPairs: z.number().step(1).min(1).max(12).default(DEFAULT_REVIEW_HISTORY_PAIRS),
  reviewHistoryChars: z.number().step(1).min(2_000).max(100_000).default(DEFAULT_REVIEW_HISTORY_CHARS),
})

/** True only for the explicit preset and an enabled reviewer kill switch. */
export function reviewerModeActive(
  ctx: Context,
  agent: Agent,
  settings: ReviewerSettings,
): boolean {
  return settings.enabled !== false
    && ctx.permissionPresets.current(agent.session.events) === APPROVE_FOR_ME_PRESET
}

/** Install approval-only Auto-review without changing DSH core policy or tool definitions. */
export function apply(ctx: Context, config: Config): void {
  ctx.logger.info('[my-plugins/dsh-approve-for-me] loaded')
  let source: () => ReviewerSettings = () => config
  installSettingsSection(ctx, APPROVE_FOR_ME_SETTINGS_NAMESPACE, Config, config, {
    setSource: current => { source = current },
    // Every decision reads the current section. No registration needs rebuilding.
    onChange: () => {},
  })

  const reviewer = new ApprovalReviewer(ctx, source)
  const coordinator = new AutoReviewCoordinator(
    reviewer,
    agent => reviewerModeActive(ctx, agent, source()),
  )

  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const downstream = await next()
    return coordinator.preExecute(exec, downstream)
  }, { prepend: true })

  ctx.on('approval/request', (
    request: ApprovalRequest,
    next,
  ): Promise<ApprovalOutcome> => coordinator.approvalRequest(request, next), { prepend: true })

  ctx.on('tools/result', (exec: Readonly<ToolExecution>) => {
    coordinator.toolResult(exec)
  })
}
