import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { ApprovalReviewer, type ReviewDecision } from './reviewer.ts'
import { deterministicDecision } from './policy.ts'
import { SessionApprovalRuleStore } from './approval-rules.ts'

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

/** Permission-preset key that delegates questions to this reviewer. */
export const APPROVE_FOR_ME_PRESET = 'approve-for-me'

/** Durable settings namespace shared with the browser half. */
export const APPROVE_FOR_ME_SETTINGS_NAMESPACE = settingsNamespace('dsh-approve-for-me')

/** User-owned reviewer settings. */
export interface ReviewerSettings {
  /** Whether the reviewer participates in tool and approval waterfalls. */
  enabled?: boolean
  /** Follow the current agent route, or use one explicit registered DSH route. */
  modelMode?: 'follow-agent' | 'fixed'
  /** JSON tuple `[provider, model]`, written atomically by the browser. */
  reviewerRoute?: string
  /** Lowest advertised effort by default; provider-default is an explicit opt-out. */
  thinkingMode?: 'lowest' | 'provider-default'
  /** Reviewer model deadline. */
  timeoutMs?: number
  /** Retry ceiling for provider-classified transport truncations. */
  transportRetries?: number
  /** Reviewer response ceiling. */
  maxOutputTokens?: number
  /** Maximum framed authorization context sent to the reviewer. */
  maxInputChars?: number
  /** Reuse a reviewer-approved exact action only under the same direct user request. */
  repeatApprovalMode?: 'same-request-exact' | 'off'
}

export type Config = ReviewerSettings

/** Composition and durable settings schema. */
export const Config: z<ReviewerSettings> = z.object({
  enabled: z.boolean().default(true),
  modelMode: z.union(['follow-agent', 'fixed'] as const).default('follow-agent'),
  reviewerRoute: z.string().default(''),
  thinkingMode: z.union(['lowest', 'provider-default'] as const).default('lowest'),
  timeoutMs: z.number().step(1).min(1_000).max(120_000).default(30_000),
  transportRetries: z.number().step(1).min(0).max(2).default(1),
  maxOutputTokens: z.number().step(1).min(128).max(4_096).default(256),
  maxInputChars: z.number().step(1).min(2_000).max(100_000).default(8_000),
  repeatApprovalMode: z.union(['same-request-exact', 'off'] as const).default('same-request-exact'),
})

interface PendingReview {
  /** True only when the pre-execute reviewer deliberately handed ownership to a human. */
  readonly humanRequired: boolean
  readonly decision: ReviewDecision
}

function preDecision(decision: ReviewDecision): PreToolDecision {
  if (decision.decision === 'allow') return { kind: 'allow' }
  if (decision.decision === 'deny') return { kind: 'deny', reason: decision.reason }
  return { kind: 'ask', reason: decision.reason }
}

function outcome(decision: ReviewDecision): ApprovalOutcome | undefined {
  if (decision.decision === 'allow') return 'allowed-once'
  if (decision.decision === 'deny') return 'rejected'
  return undefined
}

/** True only for the explicit preset and an enabled reviewer kill switch. */
export function reviewerModeActive(
  ctx: Context,
  agent: Agent,
  settings: ReviewerSettings,
): boolean {
  return settings.enabled !== false
    && ctx.permissionPresets.current(agent.session.events) === APPROVE_FOR_ME_PRESET
}

/** Install the two-stage reviewer without changing DSH core policy or tool definitions. */
export function apply(ctx: Context, config: Config): void {
  console.log('[my-plugins/dsh-approve-for-me] loaded')
  let source: () => ReviewerSettings = () => config
  installSettingsSection(ctx, APPROVE_FOR_ME_SETTINGS_NAMESPACE, Config, config, {
    setSource: current => { source = current },
    // Every decision reads the current section. No registration needs rebuilding.
    onChange: () => {},
  })

  const reviewer = new ApprovalReviewer(ctx, source)
  const rules = new SessionApprovalRuleStore()
  const pending = new Map<string, PendingReview>()

  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const downstream = await next()
    if (exec.agent === undefined
      || !reviewerModeActive(ctx, exec.agent, source())
      || downstream.kind === 'deny') {
      return downstream
    }

    const subject = reviewer.subject(exec, downstream)
    const deterministic = deterministicDecision(exec)
    const remembered = deterministic === undefined && source().repeatApprovalMode !== 'off'
      ? rules.match(exec)
      : undefined
    const decision = deterministic ?? remembered ?? await reviewer.review(subject, exec.signal)
    if (deterministic === undefined
      && remembered === undefined
      && source().repeatApprovalMode !== 'off') {
      rules.remember(exec, decision)
    }
    pending.set(String(exec.callId), {
      decision,
      humanRequired: decision.decision === 'ask',
    })
    reviewer.log('pre-execute', exec.name, decision)
    return preDecision(decision)
  }, { prepend: true })

  // Sandbox escalations happen inside an already admitted tool body. Their
  // ApprovalRequest carries no arguments, so correlate it with pre-execute.
  ctx.on('approval/request', async (request: ApprovalRequest, next): Promise<ApprovalOutcome> => {
    if (!reviewerModeActive(ctx, request.agent, source()) || request.callId === undefined) return next()
    const record = pending.get(String(request.callId))
    if (record === undefined || record.humanRequired) return next()
    if (request.signal?.aborted === true) return 'cancelled'
    reviewer.log('approval-request', request.toolName, record.decision)
    return outcome(record.decision) ?? next()
  }, { prepend: true })

  ctx.on('tools/result', (exec: Readonly<ToolExecution>) => {
    pending.delete(String(exec.callId))
  })
}
