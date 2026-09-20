/** Pure, fail-closed rule validation and matching. No tool execution or source discovery. */
import type { ApprovalRule, RuleContext, RuleMatch } from './contracts.ts'

const MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const MAX_TIMESTAMP = 8_640_000_000_000_000
const RULE_KEYS = new Set([
  'id', 'version', 'name', 'enabled', 'action', 'scope', 'sessionId', 'stage',
  'toolName', 'argumentFingerprint', 'pluginId', 'createdAt', 'expiresAt',
])
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const TOOL_NAME = /^[A-Za-z][A-Za-z0-9._:-]*$/
const PLUGIN_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SHA256 = /^[a-fA-F0-9]{64}$/
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/
const CREATOR_TOOLS = new Set(['dshx_hot_reload', 'dshx_activate_new_client'])

// Fingerprints hide argument contents. Consequently generic writes, shells, code
// runners, browser JS and arbitrary third-party tools cannot acquire an allow
// rule here. A tool name is only a validation restriction, NEVER source proof.
const EXACT_ALLOW_TOOLS = new Set([
  'read', 'read_image', 'glob', 'grep', 'dshx_status',
  'cua_status', 'cua_describe', 'cua_list_tools',
  ...CREATOR_TOOLS,
])
const PROTECTED_PLUGIN_ROOTS = [
  'dsh-approve-for-me', 'dsh-auto-review', 'dsh-creator-mode-plus',
  'dsh-creator-mode', 'creator-mode-plus', 'dsh-external-plugin-devkit',
  'dsh-creator-bridge', 'dsh-guardian', 'dsh-user-approval', 'dshx',
] as const
const PRIORITY = { allow: 1, ask: 2, deny: 3 } as const

function invalid(reason: string): never {
  throw new TypeError(reason)
}

function boundedString(value: unknown, limit: number, pattern?: RegExp): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= limit
    && value.trim() === value
    && !CONTROL_CHARACTERS.test(value)
    && (pattern === undefined || pattern.test(value))
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= 0 && value <= MAX_TIMESTAMP
}

function stage(value: unknown): value is ApprovalRule['stage'] {
  return value === 'pre-execute' || value === 'approval-request'
}

function protectedPlugin(pluginId: string | undefined): boolean {
  return pluginId !== undefined && PROTECTED_PLUGIN_ROOTS.some(root =>
    pluginId === root || pluginId.startsWith(`${root}-`))
}

/** Reject non-JSON objects, accessors and unknown keys without invoking getters. */
function ownRuleRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid('规则必须是普通对象')
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return invalid('规则必须是普通对象')
  const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !RULE_KEYS.has(key)) return invalid('规则包含未知字段')
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid('规则字段必须是普通数据')
    }
    record[key] = descriptor.value as unknown
  }
  return record
}

/** Return a detached, validated rule; SHA-256 hex is canonicalized to lowercase. */
export function validateRule(value: unknown): ApprovalRule {
  const rule = ownRuleRecord(value)
  if (!boundedString(rule['id'], 128, IDENTIFIER)) return invalid('规则标识不合法')
  if (!boundedString(rule['name'], 120)) return invalid('规则名称不合法')
  if (!boundedString(rule['sessionId'], 256, IDENTIFIER)) return invalid('规则必须绑定精确会话')
  if (!boundedString(rule['toolName'], 128, TOOL_NAME)) return invalid('规则必须绑定精确工具')
  if (typeof rule['version'] !== 'number' || !Number.isSafeInteger(rule['version']) || rule['version'] <= 0) {
    return invalid('规则版本必须是正整数')
  }
  if (typeof rule['enabled'] !== 'boolean') return invalid('规则启用状态不合法')
  if (rule['action'] !== 'allow' && rule['action'] !== 'ask' && rule['action'] !== 'deny') {
    return invalid('规则动作不合法')
  }
  if (rule['scope'] !== 'exact-arguments' && rule['scope'] !== 'creator-plugin') {
    return invalid('规则范围不合法')
  }
  if (!stage(rule['stage'])) return invalid('审批阶段不合法')
  if (!timestamp(rule['createdAt']) || !timestamp(rule['expiresAt'])
    || rule['expiresAt'] <= rule['createdAt']
    || rule['expiresAt'] - rule['createdAt'] > MAX_LIFETIME_MS) {
    return invalid('规则有效期必须为正且不超过三十天')
  }

  const hasFingerprint = Object.hasOwn(rule, 'argumentFingerprint')
  const hasPlugin = Object.hasOwn(rule, 'pluginId')
  if (hasFingerprint && (typeof rule['argumentFingerprint'] !== 'string' || !SHA256.test(rule['argumentFingerprint']))) {
    return invalid('参数指纹必须是完整 SHA256')
  }
  if (hasPlugin && !boundedString(rule['pluginId'], 64, PLUGIN_ID)) return invalid('插件标识必须是精确小写 kebab')
  const pluginId = hasPlugin ? rule['pluginId'] as string : undefined
  const argumentFingerprint = hasFingerprint ? (rule['argumentFingerprint'] as string).toLowerCase() : undefined

  if (rule['scope'] === 'exact-arguments' && argumentFingerprint === undefined) return invalid('精确规则缺少参数指纹')
  if (rule['scope'] === 'creator-plugin') {
    if (!CREATOR_TOOLS.has(rule['toolName']) || rule['stage'] !== 'pre-execute' || pluginId === undefined) {
      return invalid('插件规则仅支持执行前的固定 Creator 工具')
    }
    if (hasFingerprint) return invalid('参数指纹应使用精确参数范围')
  }
  // Even exact-argument Creator rules must expose the target: an opaque digest
  // cannot establish that a hot reload does not replace the approval boundary.
  if (CREATOR_TOOLS.has(rule['toolName']) && pluginId === undefined) return invalid('Creator 规则缺少精确插件目标')
  if (rule['action'] === 'allow') {
    if (protectedPlugin(pluginId)) return invalid('安全基础设施不能自动许可')
    if (!EXACT_ALLOW_TOOLS.has(rule['toolName'])) return invalid('此工具不支持自动许可规则')
  }

  return {
    id: rule['id'], version: rule['version'], name: rule['name'],
    enabled: rule['enabled'], action: rule['action'], scope: rule['scope'],
    sessionId: rule['sessionId'], stage: rule['stage'], toolName: rule['toolName'],
    createdAt: rule['createdAt'], expiresAt: rule['expiresAt'],
    ...(argumentFingerprint === undefined ? {} : { argumentFingerprint }),
    ...(pluginId === undefined ? {} : { pluginId }),
  }
}

function completeContext(context: RuleContext): boolean {
  return typeof context === 'object' && context !== null
    && boundedString(context.sessionId, 256, IDENTIFIER)
    && boundedString(context.toolName, 128, TOOL_NAME)
    && stage(context.stage)
    && timestamp(context.now)
    && typeof context.sourceVerified === 'boolean'
    && typeof context.permissionRaised === 'boolean'
    && typeof context.policyNever === 'boolean'
    && (context.argumentFingerprint === undefined || (typeof context.argumentFingerprint === 'string' && SHA256.test(context.argumentFingerprint)))
    && (context.pluginId === undefined || boundedString(context.pluginId, 64, PLUGIN_ID))
}

function applies(rule: ApprovalRule, context: RuleContext): boolean {
  return rule.enabled
    && rule.createdAt <= context.now && context.now < rule.expiresAt
    && rule.sessionId === context.sessionId
    && rule.stage === context.stage
    && rule.toolName === context.toolName
    && (rule.pluginId === undefined || rule.pluginId === context.pluginId)
    && (rule.scope === 'creator-plugin'
      || rule.argumentFingerprint === context.argumentFingerprint?.toLowerCase())
}

/**
 * Never infers sourceVerified from a tool name. Callers own execution-bound
 * provenance; unsupported public bindings MUST pass false. Policy denial also
 * returns action:'deny' when matched:false, and must not be discarded by callers.
 */
export function matchRules(rules: readonly ApprovalRule[], context: RuleContext): RuleMatch {
  const policyNever = context?.policyNever === true
  if (!completeContext(context) || !Array.isArray(rules)) {
    return { matched: false, action: policyNever ? 'deny' : 'none', reason: policyNever ? '审批策略禁止许可' : '审批上下文不完整' }
  }

  let winner: ApprovalRule | undefined
  for (const candidate of rules) {
    let rule: ApprovalRule
    try {
      // Do not trust persisted JSON or a TypeScript assertion as validation.
      rule = validateRule(candidate)
    } catch {
      continue
    }
    if (applies(rule, context) && (winner === undefined || PRIORITY[rule.action] > PRIORITY[winner.action])) winner = rule
  }
  const identity = winner === undefined ? {} : { ruleId: winner.id }
  if (policyNever) return { matched: winner !== undefined, action: 'deny', reason: '审批策略禁止许可', ...identity }
  if (winner === undefined) return { matched: false, action: 'none', reason: '没有匹配规则' }
  if (winner.action === 'deny') return { matched: true, action: 'deny', reason: '命中拒绝规则', ...identity }
  if (winner.action === 'ask') return { matched: true, action: 'ask', reason: '命中人工确认规则', ...identity }
  if (protectedPlugin(context.pluginId)) {
    return { matched: true, action: 'ask', reason: '安全基础设施需人工确认', capabilityBlocked: true, ...identity }
  }
  if (context.permissionRaised) {
    return { matched: true, action: 'ask', reason: '权限已变化，需重新确认', capabilityBlocked: true, ...identity }
  }
  if (!context.sourceVerified) {
    return { matched: true, action: 'ask', reason: '工具来源未验证，需人工确认', capabilityBlocked: true, ...identity }
  }
  return { matched: true, action: 'allow', reason: '命中许可规则', ...identity }
}
