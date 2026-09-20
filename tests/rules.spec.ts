import { describe, expect, it } from 'vitest'
import type { ApprovalRule, RuleContext } from '../src/contracts.ts'
import { matchRules, validateRule } from '../src/rules.ts'

const CREATED = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000
const FINGERPRINT = 'a'.repeat(64)
const OTHER_FINGERPRINT = 'b'.repeat(64)
const CREATOR_TOOLS = ['dshx_hot_reload', 'dshx_activate_new_client'] as const
const PROTECTED_PLUGINS = [
  'dsh-approve-for-me', 'dsh-auto-review', 'dsh-creator-mode-plus',
  'dsh-creator-mode', 'creator-mode-plus', 'dsh-external-plugin-devkit',
  'dsh-creator-bridge', 'dsh-guardian', 'dsh-user-approval', 'dshx',
  'dsh-approve-for-me-helper', 'dsh-external-plugin-devkit-next',
]

function rule(overrides: Partial<ApprovalRule> = {}): ApprovalRule {
  return {
    id: 'rule-1', version: 1, name: '精确读取', enabled: true, action: 'allow',
    scope: 'exact-arguments', sessionId: 'session-1', stage: 'pre-execute',
    toolName: 'read', argumentFingerprint: FINGERPRINT,
    createdAt: CREATED, expiresAt: CREATED + DAY,
    ...overrides,
  }
}

function creatorRule(overrides: Partial<ApprovalRule> = {}): ApprovalRule {
  const { argumentFingerprint: _fingerprint, ...base } = rule()
  return {
    ...base, scope: 'creator-plugin', toolName: 'dshx_hot_reload', pluginId: 'demo-plugin',
    ...overrides,
  }
}

function context(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    sessionId: 'session-1', stage: 'pre-execute', toolName: 'read',
    argumentFingerprint: FINGERPRINT, sourceVerified: false,
    permissionRaised: false, policyNever: false, now: CREATED + 1000,
    ...overrides,
  }
}

// Only these explicit fixtures assert externally verified provenance. Production
// callers must not turn a familiar tool name into sourceVerified:true.
function verifiedContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return context({ sourceVerified: true, ...overrides })
}

function creatorContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return context({ toolName: 'dshx_hot_reload', pluginId: 'demo-plugin', ...overrides })
}

function without(value: object, key: string): Record<string, unknown> {
  const copy = { ...value } as Record<string, unknown>
  delete copy[key]
  return copy
}

describe('validateRule: strict JSON contracts', () => {
  it('returns a detached exact rule without mutating its input', () => {
    const input = Object.freeze(rule())
    const result = validateRule(input)
    expect(result).toEqual(input)
    expect(result).not.toBe(input)
    result.name = '副本'
    expect(input.name).toBe('精确读取')
  })

  it('accepts null-prototype JSON records', () => {
    expect(validateRule(Object.assign(Object.create(null), rule()))).toEqual(rule())
  })

  it('canonicalizes only SHA256 hexadecimal case', () => {
    const input = rule({ argumentFingerprint: FINGERPRINT.toUpperCase() })
    expect(validateRule(input).argumentFingerprint).toBe(FINGERPRINT)
    expect(input.argumentFingerprint).toBe(FINGERPRINT.toUpperCase())
  })

  it.each(['allow', 'ask', 'deny'] as const)('accepts exact action %s', action => {
    expect(validateRule(rule({ action })).action).toBe(action)
  })

  it.each(['pre-execute', 'approval-request'] as const)('accepts exact stage %s', stage => {
    expect(validateRule(rule({ stage })).stage).toBe(stage)
  })

  it.each(CREATOR_TOOLS)('accepts bounded Creator tool %s', toolName => {
    expect(validateRule(creatorRule({ toolName }))).toEqual(creatorRule({ toolName }))
  })

  it('accepts optional plugin binding on an exact fingerprint rule', () => {
    expect(validateRule(rule({ pluginId: 'demo-plugin' })).pluginId).toBe('demo-plugin')
  })

  it('accepts a full thirty-day window, safe positive version and bounded strings', () => {
    const input = rule({
      id: 'r'.repeat(128), name: '名'.repeat(120), sessionId: 's'.repeat(256),
      toolName: 't'.repeat(128), action: 'deny', pluginId: 'p'.repeat(64),
      version: Number.MAX_SAFE_INTEGER, expiresAt: CREATED + 30 * DAY,
    })
    expect(validateRule(input)).toEqual(input)
  })

  it.each([
    null, undefined, [], 'rule', 42, true, new Date(), new Map(),
  ])('rejects non-record input %#', value => {
    expect(() => validateRule(value)).toThrow(TypeError)
  })

  it('rejects inherited rule fields', () => {
    expect(() => validateRule(Object.create(rule()))).toThrow('普通对象')
  })

  it('rejects getters without executing them', () => {
    let invoked = false
    const input = { ...rule() }
    Object.defineProperty(input, 'name', { enumerable: true, get: () => { invoked = true; return 'getter' } })
    expect(() => validateRule(input)).toThrow('普通数据')
    expect(invoked).toBe(false)
  })

  it('rejects non-enumerable rule fields', () => {
    const input = rule()
    Object.defineProperty(input, 'id', { value: 'hidden', enumerable: false })
    expect(() => validateRule(input)).toThrow('普通数据')
  })

  it('rejects symbol keys', () => {
    expect(() => validateRule({ ...rule(), [Symbol('extra')]: true })).toThrow('未知字段')
  })

  it.each(['unknown', 'allowAll', 'pattern', 'arguments', 'sourceVerified', 'capabilityBlocked', '__proto__', 'constructor'])('rejects unknown key %s', key => {
    expect(() => validateRule({ ...rule(), [key]: true })).toThrow('未知字段')
  })

  it.each([
    'id', 'version', 'name', 'enabled', 'action', 'scope', 'sessionId', 'stage',
    'toolName', 'createdAt', 'expiresAt', 'argumentFingerprint',
  ])('rejects missing required exact field %s', key => {
    expect(() => validateRule(without(rule(), key))).toThrow(TypeError)
  })

  it.each([
    ['id', ''], ['id', '*'], ['id', 'r'.repeat(129)], ['id', ' rule-1'], ['id', 'rule/1'],
    ['name', ''], ['name', ' '], ['name', '名'.repeat(121)], ['name', '带\n换行'], ['name', '控制\u007f'],
    ['sessionId', ''], ['sessionId', '*'], ['sessionId', 'session-*'], ['sessionId', '/session-.*/'],
    ['sessionId', ['session-1']], ['sessionId', 's'.repeat(257)], ['sessionId', 'session-1 '],
    ['toolName', ''], ['toolName', '*'], ['toolName', 'read*'], ['toolName', 'read|write'],
    ['toolName', '/read/'], ['toolName', 'read write'], ['toolName', 't'.repeat(129)],
    ['toolName', ['read']], ['toolName', 'read\u0000'], ['toolName', 'read '],
    ['version', 0], ['version', -1], ['version', 1.5], ['version', '1'], ['version', Infinity],
    ['version', NaN], ['version', Number.MAX_SAFE_INTEGER + 1],
    ['enabled', 'true'], ['enabled', 1], ['enabled', null],
    ['action', 'always-allow'], ['action', '*'], ['action', true],
    ['scope', 'tool'], ['scope', '*'], ['scope', null],
    ['stage', 'after-execute'], ['stage', '*'], ['stage', null],
    ['argumentFingerprint', ''], ['argumentFingerprint', 'a'.repeat(63)],
    ['argumentFingerprint', 'a'.repeat(65)], ['argumentFingerprint', 'g'.repeat(64)],
    ['argumentFingerprint', '*'], ['argumentFingerprint', null], ['argumentFingerprint', undefined],
    ['pluginId', 'Demo-plugin'], ['pluginId', 'demo_plugin'], ['pluginId', '../demo-plugin'],
    ['pluginId', 'demo--plugin'], ['pluginId', '-demo'], ['pluginId', 'demo-'],
    ['pluginId', 'demo-*'], ['pluginId', 'demo/plugin'], ['pluginId', 'p'.repeat(65)],
    ['pluginId', null], ['pluginId', undefined],
  ])('rejects invalid %s (%#)', (key, value) => {
    expect(() => validateRule({ ...rule(), [key]: value })).toThrow(TypeError)
  })

  it.each([
    { createdAt: -1 }, { createdAt: NaN }, { createdAt: Infinity }, { createdAt: 0.5 },
    { createdAt: '2026-09-13' }, { expiresAt: CREATED }, { expiresAt: CREATED - 1 },
    { expiresAt: CREATED + 30 * DAY + 1 }, { expiresAt: Infinity },
    { expiresAt: Number.MAX_SAFE_INTEGER + 1 }, { expiresAt: 8_640_000_000_000_001 },
    { expiresAt: 'later' },
  ])('rejects invalid validity window %#', overrides => {
    expect(() => validateRule({ ...rule(), ...overrides })).toThrow('有效期')
  })
})

describe('validateRule: narrowed scope and protected operations', () => {
  it.each(['read', 'bash', 'dshx_remove_plugin', 'dshx_hot_reload_extra', 'functions.dshx_hot_reload'])('rejects Creator scope tool %s', toolName => {
    expect(() => validateRule(creatorRule({ toolName, action: 'deny' }))).toThrow('固定 Creator 工具')
  })

  it('rejects Creator scope at approval-request, even for deny', () => {
    expect(() => validateRule(creatorRule({ stage: 'approval-request', action: 'deny' }))).toThrow('固定 Creator 工具')
  })

  it('rejects a Creator rule without plugin target', () => {
    expect(() => validateRule(without(creatorRule(), 'pluginId'))).toThrow('固定 Creator 工具')
  })

  it('rejects a fingerprint in Creator scope instead of silently ignoring it', () => {
    expect(() => validateRule(creatorRule({ argumentFingerprint: FINGERPRINT }))).toThrow('精确参数范围')
  })

  it.each(CREATOR_TOOLS)('requires a visible target even for exact %s', toolName => {
    expect(() => validateRule(rule({ toolName }))).toThrow('精确插件目标')
    expect(validateRule(rule({ toolName, pluginId: 'demo-plugin' })).pluginId).toBe('demo-plugin')
  })

  it.each([
    'bash', 'shell', 'sh', 'zsh', 'pwsh', 'functions.bash', 'cordis_run', 'run_code',
    'terminal_open', 'terminal_send', 'execute_javascript', 'cua_page', 'cua_call',
    'workflow', 'write', 'edit', 'set_value', 'dshx_remove_plugin', 'dshx_scaffold',
    'save_rule', 'dsh_approve_for_me', 'unknown_mcp_tool',
  ])('rejects shell, arbitrary execution, self-modification or unproved allow tool %s', toolName => {
    expect(() => validateRule(rule({ toolName }))).toThrow('不支持自动许可')
  })

  it.each(['ask', 'deny'] as const)('permits exact %s restriction on a shell without permitting execution', action => {
    expect(validateRule(rule({ action, toolName: 'bash' })).action).toBe(action)
  })

  it.each(PROTECTED_PLUGINS)('rejects automatic Creator permission for protected target %s', pluginId => {
    expect(() => validateRule(creatorRule({ pluginId }))).toThrow('安全基础设施')
    expect(() => validateRule(rule({ toolName: 'dshx_hot_reload', pluginId }))).toThrow('安全基础设施')
  })

  it('rejects protected target allow even when disabled', () => {
    expect(() => validateRule(creatorRule({ pluginId: 'dsh-approve-for-me', enabled: false }))).toThrow('安全基础设施')
  })

  it.each(['ask', 'deny'] as const)('permits protected target %s rules', action => {
    expect(validateRule(creatorRule({ action, pluginId: 'dsh-approve-for-me' })).action).toBe(action)
  })
})

describe('matchRules: exact identity, scope and lifecycle', () => {
  it('allows an exact match only with an explicitly verified fixture', () => {
    expect(matchRules([rule()], verifiedContext())).toEqual({
      matched: true, action: 'allow', ruleId: 'rule-1', reason: '命中许可规则',
    })
  })

  it('matches uppercase digest encodings of the same fingerprint', () => {
    expect(matchRules([rule({ argumentFingerprint: FINGERPRINT.toUpperCase() })], verifiedContext()).action).toBe('allow')
    expect(matchRules([rule()], verifiedContext({ argumentFingerprint: FINGERPRINT.toUpperCase() })).action).toBe('allow')
  })

  it.each(CREATOR_TOOLS)('matches bounded Creator tool %s without requiring a fingerprint', toolName => {
    const target = without(creatorContext({ sourceVerified: true, toolName }), 'argumentFingerprint') as unknown as RuleContext
    expect(matchRules([creatorRule({ toolName })], target)).toMatchObject({ matched: true, action: 'allow' })
  })

  it('still compares a Creator exact-arguments fingerprint', () => {
    const exact = rule({ toolName: 'dshx_hot_reload', pluginId: 'demo-plugin' })
    expect(matchRules([exact], creatorContext({ sourceVerified: true })).action).toBe('allow')
    expect(matchRules([exact], creatorContext({ sourceVerified: true, argumentFingerprint: OTHER_FINGERPRINT })).action).toBe('none')
  })

  it.each([
    { sessionId: 'session-2' }, { sessionId: 'session-10' }, { sessionId: 'SESSION-1' },
    { stage: 'approval-request' as const }, { toolName: 'write' }, { toolName: 'read_image' },
    { toolName: 'Read' }, { toolName: 'functions.read' }, { argumentFingerprint: OTHER_FINGERPRINT },
    { argumentFingerprint: undefined },
  ])('does not match a different or incomplete exact identity %#', overrides => {
    expect(matchRules([rule()], verifiedContext(overrides))).toMatchObject({ matched: false, action: 'none' })
  })

  it.each([
    { pluginId: 'other-plugin' }, { pluginId: 'demo-plugin-extra' }, { pluginId: undefined },
    { toolName: 'dshx_activate_new_client' }, { stage: 'approval-request' as const },
    { sessionId: 'session-2' },
  ])('does not match a different Creator target %#', overrides => {
    expect(matchRules([creatorRule()], creatorContext({ sourceVerified: true, ...overrides }))).toMatchObject({ matched: false, action: 'none' })
  })

  it.each(['other-plugin', undefined])('honors exact optional plugin binding: %s', pluginId => {
    expect(matchRules([rule({ pluginId: 'demo-plugin' })], verifiedContext({ pluginId })).action).toBe('none')
  })

  it('matches exact optional plugin binding when the target agrees', () => {
    expect(matchRules([rule({ pluginId: 'demo-plugin' })], verifiedContext({ pluginId: 'demo-plugin' })).action).toBe('allow')
  })

  it.each([
    { enabled: false }, { expiresAt: CREATED + 1000 }, { expiresAt: CREATED + 999 },
    { createdAt: CREATED + 1001 },
  ])('skips disabled, expired or future rules %#', overrides => {
    expect(matchRules([rule(overrides)], verifiedContext())).toMatchObject({ matched: false, action: 'none' })
  })

  it('matches at creation and just before expiry, but not at expiry', () => {
    const input = rule()
    expect(matchRules([input], verifiedContext({ now: input.createdAt })).action).toBe('allow')
    expect(matchRules([input], verifiedContext({ now: input.expiresAt - 1 })).action).toBe('allow')
    expect(matchRules([input], verifiedContext({ now: input.expiresAt })).action).toBe('none')
  })

  it('returns none for an empty rule collection', () => {
    expect(matchRules([], verifiedContext())).toEqual({ matched: false, action: 'none', reason: '没有匹配规则' })
  })

  it('does not mutate frozen rules, their order or the context', () => {
    const first = Object.freeze(rule())
    const second = Object.freeze(rule({ id: 'deny', action: 'deny' }))
    const input = Object.freeze([first, second])
    const current = Object.freeze(verifiedContext())
    expect(matchRules(input, current).action).toBe('deny')
    expect(input).toEqual([first, second])
  })

  it('skips invalid persisted rules instead of trusting type assertions', () => {
    const invalid = [
      without(rule(), 'argumentFingerprint'), { ...rule(), unknown: true },
      { ...rule(), scope: 'all' }, null,
    ] as unknown as ApprovalRule[]
    expect(matchRules(invalid, verifiedContext())).toMatchObject({ matched: false, action: 'none' })
  })

  it.each([
    'sessionId', 'stage', 'toolName', 'sourceVerified', 'permissionRaised', 'policyNever', 'now',
  ])('does not reuse a rule with missing context field %s', key => {
    const current = without(verifiedContext(), key) as unknown as RuleContext
    expect(matchRules([rule()], current)).toMatchObject({ matched: false, action: 'none' })
  })

  it.each([
    { sessionId: '*' }, { toolName: 'read*' }, { stage: 'unknown' }, { now: NaN },
    { now: Infinity }, { now: -1 }, { sourceVerified: 'true' }, { permissionRaised: 0 },
    { policyNever: 'false' }, { argumentFingerprint: 'short' }, { pluginId: 'Demo-plugin' },
  ])('does not reuse a rule with malformed context %#', overrides => {
    expect(matchRules([rule()], { ...verifiedContext(), ...overrides } as unknown as RuleContext)).toMatchObject({ matched: false, action: 'none' })
  })
})

describe('matchRules: conflict precedence', () => {
  const permutations = [
    ['allow', 'ask', 'deny'], ['allow', 'deny', 'ask'], ['ask', 'allow', 'deny'],
    ['ask', 'deny', 'allow'], ['deny', 'allow', 'ask'], ['deny', 'ask', 'allow'],
  ] as const

  it.each(permutations)('deny wins in order %s / %s / %s', (...actions) => {
    const input = actions.map(action => rule({ id: action, action }))
    expect(matchRules(input, verifiedContext())).toMatchObject({ matched: true, action: 'deny', ruleId: 'deny' })
  })

  it.each([['ask', 'allow'], ['allow', 'ask']] as const)('ask wins in order %s / %s', (...actions) => {
    expect(matchRules(actions.map(action => rule({ id: action, action })), verifiedContext())).toMatchObject({ action: 'ask', ruleId: 'ask' })
  })

  it('uses the first rule for deterministic equal-priority ties', () => {
    expect(matchRules([rule({ id: 'first', action: 'ask' }), rule({ id: 'second', action: 'ask' })], verifiedContext()).ruleId).toBe('first')
  })

  it('does not let an expired deny override a live allow', () => {
    expect(matchRules([rule({ id: 'expired', action: 'deny', expiresAt: CREATED + 1000 }), rule()], verifiedContext()).action).toBe('allow')
  })

  it('does not let a deny for a different target override the matching allow', () => {
    expect(matchRules([
      creatorRule({ id: 'other-deny', action: 'deny', pluginId: 'other-plugin' }), creatorRule(),
    ], creatorContext({ sourceVerified: true })).action).toBe('allow')
  })

  it('prioritizes exact deny over matching Creator-scope allow', () => {
    const deny = rule({ id: 'exact-deny', action: 'deny', toolName: 'dshx_hot_reload', pluginId: 'demo-plugin' })
    expect(matchRules([creatorRule(), deny], creatorContext({ sourceVerified: true }))).toMatchObject({ action: 'deny', ruleId: 'exact-deny' })
  })
})

describe('matchRules: immutable approval and capability boundaries', () => {
  it('downgrades an unverified exact allow to ask', () => {
    expect(matchRules([rule()], context())).toEqual({
      matched: true, action: 'ask', ruleId: 'rule-1',
      reason: '工具来源未验证，需人工确认', capabilityBlocked: true,
    })
  })

  it.each(CREATOR_TOOLS)('does not treat familiar tool name %s as provenance', toolName => {
    expect(matchRules([creatorRule({ toolName })], creatorContext({ toolName }))).toMatchObject({
      matched: true, action: 'ask', capabilityBlocked: true,
    })
  })

  it('never downgrades a deny when source is unverified', () => {
    expect(matchRules([rule({ action: 'deny' })], context())).toMatchObject({ matched: true, action: 'deny' })
  })

  it('leaves an explicit ask as ask without pretending to block an allow capability', () => {
    expect(matchRules([rule({ action: 'ask' })], context())).toMatchObject({ matched: true, action: 'ask' })
    expect(matchRules([rule({ action: 'ask' })], context()).capabilityBlocked).toBeUndefined()
  })

  it.each([false, true])('does not reuse an allow after permission changes, verified=%s', sourceVerified => {
    expect(matchRules([rule()], context({ sourceVerified, permissionRaised: true }))).toMatchObject({
      matched: true, action: 'ask', capabilityBlocked: true, reason: '权限已变化，需重新确认',
    })
  })

  it('does not reuse a Creator allow after permission changes', () => {
    expect(matchRules([creatorRule()], creatorContext({ sourceVerified: true, permissionRaised: true }))).toMatchObject({ action: 'ask', capabilityBlocked: true })
  })

  it('keeps a deny after permission changes', () => {
    expect(matchRules([rule({ action: 'deny' })], verifiedContext({ permissionRaised: true })).action).toBe('deny')
  })

  it.each(['allow', 'ask', 'deny'] as const)('never policy retains denial over %s', action => {
    expect(matchRules([rule({ action })], verifiedContext({ policyNever: true }))).toMatchObject({ matched: true, action: 'deny', ruleId: 'rule-1' })
  })

  it('never policy denies even with no matching rule', () => {
    expect(matchRules([], verifiedContext({ policyNever: true }))).toEqual({ matched: false, action: 'deny', reason: '审批策略禁止许可' })
  })

  it('never policy is not transformed to ask by missing provenance or raised permissions', () => {
    expect(matchRules([rule()], context({ policyNever: true, permissionRaised: true })).action).toBe('deny')
  })

  it('never policy remains a denial with incomplete context', () => {
    const incomplete = without(context({ policyNever: true }), 'permissionRaised') as unknown as RuleContext
    expect(matchRules([rule()], incomplete)).toMatchObject({ matched: false, action: 'deny' })
  })

  it.each(PROTECTED_PLUGINS)('cannot grant a persisted protected/self-modifying allow for %s', pluginId => {
    expect(matchRules([creatorRule({ pluginId })], creatorContext({ sourceVerified: true, pluginId })).action).not.toBe('allow')
    expect(matchRules([rule({ toolName: 'dshx_hot_reload', pluginId })], creatorContext({ sourceVerified: true, pluginId })).action).not.toBe('allow')
  })

  it('blocks protected context even if an observation rule omitted plugin binding', () => {
    expect(matchRules([rule()], verifiedContext({ pluginId: 'dsh-approve-for-me' }))).toMatchObject({ matched: true, action: 'ask', capabilityBlocked: true })
  })

  it('matches an explicit protected-target deny without requiring source proof', () => {
    expect(matchRules([creatorRule({ action: 'deny', pluginId: 'dsh-approve-for-me' })], creatorContext({ pluginId: 'dsh-approve-for-me' })).action).toBe('deny')
  })

  it.each(['bash', 'run_code', 'cua_page', 'write', 'edit', 'save_rule'])('cannot load a forged persisted %s allow', toolName => {
    expect(matchRules([rule({ toolName })], verifiedContext({ toolName }))).toMatchObject({ matched: false, action: 'none' })
  })
})
