/** Exact, task-scoped approval reuse above RC8's one-shot approval seam. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ReviewDecision } from './reviewer.ts'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

interface ExactRule {
  readonly authorizationEpoch: number
}

export interface RememberedApproval {
  readonly decision: 'allow'
  readonly scope: 'same-request-exact'
  readonly reason: string
}

const MAX_RULES_PER_AGENT = 64
const MAX_ACTION_KEY_CHARS = 20_000
const SHELL_LIKE_TOOLS = new Set([
  'bash', 'cordis_run', 'pwsh', 'run_code', 'terminal_open', 'terminal_send',
])
const NON_REUSABLE_TOOL_NAME = /(?:browser|computer|credential|cua|delete|deploy|kill|oauth|purchase|publish|push|remove|secret|send)/i
const SECRET_KEY = /(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i
const INLINE_SECRET = /\b(?:bearer|token|password|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/i

function normalizeJson(value: unknown, seen: WeakSet<object>): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined
    seen.add(value)
    const output: JsonValue[] = []
    for (const item of value) {
      const normalized = normalizeJson(item, seen)
      if (normalized === undefined) return undefined
      output.push(normalized)
    }
    seen.delete(value)
    return output
  }
  if (typeof value !== 'object') return undefined
  if (seen.has(value)) return undefined
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return undefined
  seen.add(value)
  const output: { [key: string]: JsonValue } = {}
  for (const [key, item] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const normalized = normalizeJson(item, seen)
    if (normalized === undefined) return undefined
    output[key] = normalized
  }
  seen.delete(value)
  return output
}

function containsSensitiveMaterial(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === 'string') return INLINE_SECRET.test(value)
  if (Array.isArray(value)) {
    if (seen.has(value)) return true
    seen.add(value)
    const sensitive = value.some(item => containsSensitiveMaterial(item, seen))
    seen.delete(value)
    return sensitive
  }
  if (typeof value !== 'object' || value === null) return false
  if (seen.has(value)) return true
  seen.add(value)
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key) || containsSensitiveMaterial(item, seen)) return true
  }
  seen.delete(value)
  return false
}

function latestDirectUserRequestEpoch(agent: Agent): number | undefined {
  for (let index = agent.session.events.length - 1; index >= 0; index -= 1) {
    const event = agent.session.events[index]!
    if (event.type === 'user/message' && event.data.source.kind === 'user') return index
  }
  return undefined
}

function exactActionKey(exec: ToolExecution): string | undefined {
  if (exec.agent === undefined
    || SHELL_LIKE_TOOLS.has(exec.name)
    || NON_REUSABLE_TOOL_NAME.test(exec.name)
    || containsSensitiveMaterial(exec.arguments)) return undefined
  const args = normalizeJson(exec.arguments, new WeakSet<object>())
  if (args === undefined) return undefined
  const key = JSON.stringify({
    toolName: exec.name,
    cwd: exec.agent.session.header.cwd ?? null,
    arguments: args,
  })
  return key.length <= MAX_ACTION_KEY_CHARS ? key : undefined
}

/**
 * A process-local grant store keyed by Agent identity. A rule survives tool
 * results but not a new direct user request, a new session, or a Host restart.
 */
export class SessionApprovalRuleStore {
  private readonly rules = new WeakMap<Agent, Map<string, ExactRule>>()

  match(exec: ToolExecution): RememberedApproval | undefined {
    const agent = exec.agent
    if (agent === undefined) return undefined
    const actionKey = exactActionKey(exec)
    const authorizationEpoch = latestDirectUserRequestEpoch(agent)
    if (actionKey === undefined || authorizationEpoch === undefined) return undefined
    const rule = this.rules.get(agent)?.get(actionKey)
    if (rule === undefined || rule.authorizationEpoch !== authorizationEpoch) return undefined
    return {
      decision: 'allow',
      scope: 'same-request-exact',
      reason: '命中本次用户任务内已审查的完全相同操作。',
    }
  }

  remember(exec: ToolExecution, decision: ReviewDecision): boolean {
    if (decision.decision !== 'allow' || decision.scope !== 'same-request-exact') return false
    const agent = exec.agent
    if (agent === undefined) return false
    const actionKey = exactActionKey(exec)
    const authorizationEpoch = latestDirectUserRequestEpoch(agent)
    if (actionKey === undefined || authorizationEpoch === undefined) return false
    let agentRules = this.rules.get(agent)
    if (agentRules === undefined) {
      agentRules = new Map<string, ExactRule>()
      this.rules.set(agent, agentRules)
    }
    if (!agentRules.has(actionKey) && agentRules.size >= MAX_RULES_PER_AGENT) {
      const oldest = agentRules.keys().next().value
      if (typeof oldest === 'string') agentRules.delete(oldest)
    }
    agentRules.set(actionKey, { authorizationEpoch })
    return true
  }
}
