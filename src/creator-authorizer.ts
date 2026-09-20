/**
 * Host-private policy -> one-shot dispatch-gate state machine; opt-in only.
 *
 * TRUSTED CONSTRUCTION/WIRING IS REQUIRED. The two live inspectors are C/private
 * executor readers, not model callbacks, name/callId classifiers or JSON claims.
 * inspectOwner returns only a genuine, still-current C owner after independently
 * checking permissionPresets.current(session), actual sandboxPolicy.resolve,
 * effective approval policy/never, scope and task liveness. policyEpoch must be
 * a never-recycled opaque identity advanced by every relevant public transition,
 * including ABA; comparing the final preset/mode string is insufficient.
 * inspectPrepared recognizes only a real sealed, supported execution ticket and
 * rechecks its bound target/artifacts. supportedOperations is an explicit proven
 * subset, never the default four enum members. Both readers must be closed over
 * this broker generation's permanent C/executor lease: replacement brokers may
 * admit only fresh owner/preparation references, never revive old in-flight or
 * finished tickets. Persistence restores policy, not those process-local facts.
 * Prepared signal is a stable native TTL/target-registration/cancellation signal.
 * The same seal may remain readable for the original reserved/started continuation;
 * the executor must close it on completion and never start a ticket twice.
 *
 * handleNativeRequest must remain a PRIVATE official approval/request listener;
 * never expose it, its inspectors or Registry's internal delegate to HTTP/tools.
 * A matching Registry fact is not proof of a human or Creator origin. The later
 * authenticated confirmation broker must establish that independently.
 *
 * consume is required immediately before the executor's real first dispatch.
 * revalidateStarted is ONLY a check within that already-started execution, not a
 * second dispatch/capability. No cancellation/error refunds a capability. Audit
 * rows describe observed prechecks, NOT an executed/accepted business operation.
 */
import { createHash, randomUUID } from 'node:crypto'
import { isPromise } from 'node:util/types'
import { isAbsolute, resolve } from 'node:path'
import { setTimeout as schedule, clearTimeout as unschedule } from 'node:timers'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import { CreatorGrantStore } from './creator-grants.ts'
import { CREATOR_GRANT_OPERATIONS } from './creator-grant-types.ts'
import type { CreatorGrantBinding, CreatorGrantOperation, CreatorRememberedGrant } from './creator-grant-types.ts'
import { CreatorConsentRegistry } from './creator-consent.ts'
import type { CreatorConsentHandle, CreatorConsentOutcome } from './creator-consent.ts'

export interface CreatorOwnerInspection {
  exactNativeRequest: ApprovalRequest
  binding: CreatorGrantBinding
  operation: CreatorGrantOperation
  policyEpoch: object
  signal?: AbortSignal
  taskHandle?: object
  /** Required with taskHandle. The reader must additionally verify that task's identity and liveness. */
  taskSignal?: AbortSignal
}
export interface CreatorPreparedInspection {
  owner: object
  binding: CreatorGrantBinding
  operation: CreatorGrantOperation
  /** Stable, frozen opaque seal; reader must return undefined after invalidation/unsupported preparation. */
  seal: object
  /** Native ticket TTL/target-registration/cancellation signal, independent of the owner's signal. */
  signal: AbortSignal
}
export type CreatorExecutionCapability = Readonly<Record<string, never>>
export type CreatorAuthorizationSource = 'consent-once' | 'task' | 'remembered' | 'native-delegation'
/** Closed, bounded dispatch-audit DTO: no owner, preparation, request, path, view nonce or arbitrary reason. */
export interface CreatorExecutionAudit {
  protocol: 1
  id: string
  capabilityId: string
  at: number
  phase: 'dispatch-precheck' | 'continuation-precheck'
  observed: 'prechecks-passed'
  source: CreatorAuthorizationSource
  operation: CreatorGrantOperation
  bindingHash: string
  grant?: { id: string; version: number }
}
export interface CreatorAuthorizerOptions {
  approval: ApprovalService
  store: CreatorGrantStore
  consent: CreatorConsentRegistry
  isCurrentOwner: () => boolean
  inspectOwner: (owner: object) => CreatorOwnerInspection | undefined
  inspectPrepared: (preparation: object) => CreatorPreparedInspection | undefined
  supportedOperations: readonly CreatorGrantOperation[]
  /** Must synchronously return true only after accepting this bounded audit row; Promise/throw denies and burns. */
  audit: (event: Readonly<CreatorExecutionAudit>) => true
  now?: () => number
  /** Optional reductions, bounded by 64 in-flight requests and five minutes per execution capability. */
  maxPending?: number
  ttlMs?: number
}
export type CreatorAuthorizerFailure = 'invalid-options' | 'invalid-owner' | 'invalid-preparation' | 'unsupported-operation'
  | 'duplicate-owner' | 'duplicate-request' | 'duplicate-preparation' | 'capacity' | 'closed' | 'not-current-owner'
  | 'callback-invalid' | 'clock-invalid' | 'reentrant' | 'native-never' | 'native-denied' | 'native-bypass'
  | 'owner-changed' | 'preparation-changed' | 'aborted' | 'expired' | 'consent-denied' | 'store-unhealthy'
  | 'remember-save-failed' | 'task-invalid' | 'grant-invalid' | 'unknown-capability' | 'capability-used'
  | 'capability-binding' | 'not-started' | 'audit-failed' | 'internal-error'
export class CreatorAuthorizerError extends Error {
  constructor(readonly code: CreatorAuthorizerFailure) { super(`Creator authorization denied: ${code}`); this.name = 'CreatorAuthorizerError' }
}
interface OwnerSnapshot extends CreatorOwnerInspection {
  bindingHash: string
  agent: ApprovalRequest['agent']
  session: ApprovalRequest['agent']['session']
  sessionId: string
  toolName: string
  callId: ApprovalRequest['callId']
  reason: ApprovalRequest['reason']
}
interface TaskRule {
  bindingHash: string
  operations: readonly CreatorGrantOperation[]
  epoch: object
  session: OwnerSnapshot['session']
  signal: AbortSignal
}
type Policy = { source: 'consent-once' | 'native-delegation' }
  | { source: 'task'; task: object; rule: TaskRule }
  | { source: 'remembered'; grant: CreatorRememberedGrant }
interface Execution {
  owner: object
  preparation: object
  snapshot: OwnerSnapshot
  seal: object
  preparedSignal: AbortSignal
  deadline: number
  steadyDeadline: number
  failed: boolean
  nativeArmed: boolean
  nativeHandled: boolean
  delegatedOutcome: ApprovalOutcome | undefined
  consent: CreatorConsentHandle | undefined
  fact: CreatorConsentOutcome | undefined
  policy: Policy | undefined
  stop: AbortController
  timer: ReturnType<typeof schedule> | undefined
}
interface Permit { id: string; execution: Execution; state: 'issued' | 'started' | 'burned' }
const TTL = 300_000
const MAX = 64
const DAY = 86_400_000
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const PROTECTED = ['dsh-creator-mode-plus', 'dsh-approve-for-me', 'dsh-external-plugin-devkit']
const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!
const addListener = EventTarget.prototype.addEventListener
const removeListener = EventTarget.prototype.removeEventListener
function fail(code: CreatorAuthorizerFailure): never { throw new CreatorAuthorizerError(code) }
function ref(value: unknown): value is object { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function plain(value: unknown): value is Record<string, unknown> {
  return ref(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
function closed(value: unknown, keys: readonly string[], code: CreatorAuthorizerFailure): void {
  if (!plain(value)) fail(code)
  if (Reflect.ownKeys(value).length > keys.length) fail(code)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) fail(code)
    const property = Object.getOwnPropertyDescriptor(value, key)
    if (property === undefined || !property.enumerable || !('value' in property)) fail(code)
  }
}
function drain(value: unknown): void {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return
  try { void Promise.prototype.then.call(value, () => {}, () => {}) }
  catch { try { void Promise.resolve(value).then(() => {}, () => {}) } catch { /* Caller closes before observing hostile returns. */ } }
}
function bounded(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max || Object.is(value, -0)) fail('invalid-options')
  return value
}
function op(value: unknown): CreatorGrantOperation {
  if (typeof value !== 'string' || !CREATOR_GRANT_OPERATIONS.includes(value as CreatorGrantOperation)) fail('unsupported-operation')
  return value as CreatorGrantOperation
}
function root(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096 || CONTROL.test(value) || !isAbsolute(value) || resolve(value) !== value) fail('invalid-owner')
  return value
}
function binding(value: CreatorGrantBinding): CreatorGrantBinding {
  closed(value, ['engine', 'harnessRoot', 'sourceRoot', 'pluginId', 'sourceDirectoryIdentity', 'workspaceRoot'], 'invalid-owner')
  if (value.engine !== 'creator-plus-v1' || typeof value.pluginId !== 'string' || value.pluginId.length > 64 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.pluginId)
    || PROTECTED.some(id => value.pluginId === id || value.pluginId.startsWith(`${id}-`))) fail('invalid-owner')
  closed(value.sourceDirectoryIdentity, ['dev', 'ino'], 'invalid-owner')
  for (const part of [value.sourceDirectoryIdentity.dev, value.sourceDirectoryIdentity.ino]) if (typeof part !== 'string' || !/^(?:0|[1-9][0-9]{0,39})$/.test(part)) fail('invalid-owner')
  return Object.freeze({ engine: 'creator-plus-v1', harnessRoot: root(value.harnessRoot), sourceRoot: root(value.sourceRoot), pluginId: value.pluginId,
    sourceDirectoryIdentity: Object.freeze({ ...value.sourceDirectoryIdentity }), workspaceRoot: root(value.workspaceRoot) })
}
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function aborted(signal: AbortSignal | undefined): boolean {
  if (signal === undefined) return false
  try { return Reflect.apply(abortedGetter, signal, []) === true } catch { return fail('invalid-owner') }
}

export class CreatorAuthorizer {
  readonly #approval: ApprovalService
  readonly #store: CreatorGrantStore
  readonly #consent: CreatorConsentRegistry
  readonly #lease: () => boolean
  readonly #ownerReader: CreatorAuthorizerOptions['inspectOwner']
  readonly #preparedReader: CreatorAuthorizerOptions['inspectPrepared']
  readonly #audit: CreatorAuthorizerOptions['audit']
  readonly #now: () => number
  readonly #operations: readonly CreatorGrantOperation[]
  readonly #max: number
  readonly #ttl: number
  readonly #owners = new WeakSet<object>()
  readonly #preparations = new WeakSet<object>()
  readonly #native = new WeakMap<ApprovalRequest, Execution>()
  readonly #caps = new WeakMap<object, Permit>()
  readonly #tasks = new WeakMap<object, Map<string, TaskRule>>()
  readonly #active = new Set<Execution>()
  #closed: CreatorAuthorizerFailure | undefined
  #clock: number | undefined
  #steadyClock: number | undefined
  #busy = false

  constructor(options: CreatorAuthorizerOptions) {
    closed(options, ['approval', 'store', 'consent', 'isCurrentOwner', 'inspectOwner', 'inspectPrepared', 'supportedOperations', 'audit', 'now', 'maxPending', 'ttlMs'], 'invalid-options')
    if (!(options.approval instanceof ApprovalService) || !(options.store instanceof CreatorGrantStore) || !(options.consent instanceof CreatorConsentRegistry)
      || typeof options.isCurrentOwner !== 'function' || typeof options.inspectOwner !== 'function' || typeof options.inspectPrepared !== 'function'
      || typeof options.audit !== 'function' || (Object.hasOwn(options, 'now') && typeof options.now !== 'function')) fail('invalid-options')
    const operations = options.supportedOperations
    if (!Array.isArray(operations) || Object.getPrototypeOf(operations) !== Array.prototype || operations.length === 0 || operations.length > 4
      || Reflect.ownKeys(operations).length !== operations.length + 1) fail('invalid-options')
    const supported: CreatorGrantOperation[] = []
    for (let index = 0; index < operations.length; index += 1) {
      const property = Object.getOwnPropertyDescriptor(operations, String(index))
      if (property === undefined || !('value' in property)) fail('invalid-options')
      supported.push(op(property.value))
    }
    if (new Set(supported).size !== supported.length) fail('invalid-options')
    this.#operations = Object.freeze(supported.sort())
    this.#max = bounded(Object.hasOwn(options, 'maxPending') ? options.maxPending! : MAX, 1, MAX)
    this.#ttl = bounded(Object.hasOwn(options, 'ttlMs') ? options.ttlMs! : TTL, 1, TTL)
    this.#approval = options.approval; this.#store = options.store; this.#consent = options.consent
    this.#lease = options.isCurrentOwner; this.#ownerReader = options.inspectOwner; this.#preparedReader = options.inspectPrepared; this.#audit = options.audit
    this.#now = options.now ?? Date.now
  }

  /** One new C owner + one new sealed preparation. No retry/memoized capability issuance. */
  async authorize(owner: object, preparation: object): Promise<CreatorExecutionCapability> {
    let execution: Execution | undefined
    try {
      execution = this.#guard(() => this.#begin(owner, preparation))
      if (execution.policy === undefined) {
        // Invoke the actual service with the very same request, never a clone or lookup by name/callId.
        const native = this.#approval.request(execution.snapshot.exactNativeRequest)
        const outcome = await this.#waitNative(execution, native)
        this.#guard(() => this.#acceptNative(execution!, outcome))
      }
      return this.#guard(() => {
        this.#validate(execution!)
        const capability = Object.freeze(Object.create(null)) as CreatorExecutionCapability
        this.#caps.set(capability, { id: randomUUID(), execution: execution!, state: 'issued' })
        return capability
      })
    } catch (error) {
      if (execution !== undefined) execution.failed = true
      throw error instanceof CreatorAuthorizerError ? error : new CreatorAuthorizerError('internal-error')
    } finally {
      if (execution !== undefined) {
        execution.nativeArmed = false; this.#active.delete(execution)
        if (execution.timer !== undefined) unschedule(execution.timer)
        if (execution.failed && execution.consent !== undefined) { try { this.#consent.cancel(execution.consent.id) } catch { /* Already gone/closed. */ } }
      }
    }
  }

  /** Private listener only. Unknown exact objects delegate unchanged; known repeats never reopen a question. */
  async handleNativeRequest(request: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome> {
    const execution = this.#native.get(request)
    if (execution === undefined) return next()
    if (!execution.nativeArmed || execution.nativeHandled) {
      execution.failed = true
      if (execution.consent !== undefined) { try { this.#consent.cancel(execution.consent.id) } catch { /* Closed. */ } }
      return 'rejected'
    }
    try {
      const handle = this.#guard(() => {
        execution.nativeHandled = true
        this.#validate(execution)
        const facts = execution.snapshot
        const prompt = { protocol: 1 as const, pluginId: facts.binding.pluginId, sourceLabel: facts.binding.sourceRoot.slice(0, 512), workspaceLabel: facts.binding.workspaceRoot.slice(0, 512),
          currentOperation: facts.operation, availableOperations: [...this.#operations], allowTask: facts.taskHandle !== undefined,
          allowRemember: true, taskLabel: facts.taskHandle === undefined ? 'Current request' : 'Current Host task' }
        const opened = this.#consent.open(execution.owner, prompt, execution.stop.signal)
        execution.consent = opened
        return opened
      })
      const fact = await handle.result
      this.#guard(() => { this.#validate(execution); execution.fact = fact })
      if (fact.kind === 'cancelled') { execution.failed = true; return 'cancelled' }
      if (fact.kind === 'consent') return fact.answer.decision === 'allow' ? 'allowed-once' : 'rejected'
      // Only this exact private Registry delegation can enter native fallback.
      const outcome = await this.#untilStopped(execution, next)
      this.#guard(() => { this.#validate(execution); execution.delegatedOutcome = outcome })
      return outcome
    } catch { execution.failed = true; return 'cancelled' }
  }

  /** Burn before every check/sink. Failure, wrong owner/preparation, cancellation and exceptions never refund. */
  consume(capability: object, owner: object, preparation: object): true {
    return this.#guard(() => {
      const permit = this.#caps.get(capability)
      if (permit === undefined) fail('unknown-capability')
      const previous = permit.state; permit.state = 'burned'
      if (previous !== 'issued') fail('capability-used')
      if (permit.execution.owner !== owner || permit.execution.preparation !== preparation) fail('capability-binding')
      this.#validate(permit.execution)
      this.#emitAudit(permit, 'dispatch-precheck')
      this.#validate(permit.execution) // Sink/health reads may not leave a stale gate behind.
      permit.state = 'started'
      return true as const
    })
  }
  /** Post-await continuation check only. This never consumes twice or authorizes another dispatch. */
  revalidateStarted(capability: object, owner: object, preparation: object): true {
    return this.#guard(() => {
      const permit = this.#caps.get(capability)
      if (permit === undefined) fail('unknown-capability')
      const previous = permit.state; permit.state = 'burned'
      if (previous !== 'started') fail('not-started')
      if (permit.execution.owner !== owner || permit.execution.preparation !== preparation) fail('capability-binding')
      this.#validate(permit.execution)
      this.#emitAudit(permit, 'continuation-precheck')
      this.#validate(permit.execution)
      permit.state = 'started'
      return true as const
    })
  }
  /** Revokes current in-memory rules/caps; a fresh owner can only reacquire one via a new explicit confirmation. */
  revokeTask(task: object): void { this.#guard(() => { if (!ref(task)) fail('task-invalid'); this.#tasks.delete(task) }) }
  health(): { ok: boolean; pending: number; reason?: CreatorAuthorizerFailure } {
    if (this.#closed !== undefined) return { ok: false, pending: this.#active.size, reason: this.#closed }
    try { this.#guard(() => { this.#base() }); return { ok: true, pending: this.#active.size } }
    catch (error) { return { ok: false, pending: this.#active.size, reason: error instanceof CreatorAuthorizerError ? error.code : 'internal-error' } }
  }
  dispose(): void { this.#close('closed') }

  #begin(owner: object, preparation: object): Execution {
    this.#base()
    if (!ref(owner)) fail('invalid-owner')
    if (this.#owners.has(owner)) fail('duplicate-owner')
    this.#owners.add(owner)
    if (!ref(preparation)) fail('invalid-preparation')
    if (this.#preparations.has(preparation)) fail('duplicate-preparation')
    this.#preparations.add(preparation)
    if (this.#active.size >= this.#max) fail('capacity')
    const snapshot = this.#readOwner(owner)
    const prepared = this.#readPrepared(preparation, owner, snapshot)
    if (this.#native.has(snapshot.exactNativeRequest)) fail('duplicate-request')
    const deadline = this.#time() + this.#ttl
    if (!Number.isSafeInteger(deadline)) fail('clock-invalid')
    const execution: Execution = { owner, preparation, snapshot, seal: prepared.seal, preparedSignal: prepared.signal, deadline, steadyDeadline: this.#steady() + this.#ttl, failed: false, nativeArmed: false, nativeHandled: false,
      delegatedOutcome: undefined, consent: undefined, fact: undefined, policy: undefined, stop: new AbortController(), timer: undefined }
    this.#native.set(snapshot.exactNativeRequest, execution)
    const task = snapshot.taskHandle === undefined ? undefined : this.#tasks.get(snapshot.taskHandle)?.get(snapshot.bindingHash)
    if (task !== undefined && this.#taskMatches(task, snapshot)) execution.policy = { source: 'task', task: snapshot.taskHandle!, rule: task }
    else {
      const grant = this.#store.findMatch(snapshot.binding, snapshot.operation)
      this.#healthy()
      if (grant !== undefined) execution.policy = { source: 'remembered', grant }
    }
    execution.nativeArmed = execution.policy === undefined
    if (this.#closed !== undefined) { execution.failed = true; fail(this.#closed) }
    this.#active.add(execution)
    return execution
  }
  #acceptNative(execution: Execution, outcome: ApprovalOutcome): void {
    this.#validate(execution)
    if (outcome !== 'allowed-once') fail('native-denied')
    if (!execution.nativeHandled || execution.fact === undefined) fail('native-bypass')
    const fact = execution.fact
    if (fact.kind === 'delegated') {
      if (execution.delegatedOutcome !== 'allowed-once') fail('native-bypass')
      execution.policy = { source: 'native-delegation' }; return
    }
    if (fact.kind !== 'consent' || fact.answer.decision !== 'allow') fail('consent-denied')
    const answer = fact.answer
    if (answer.lifetime === 'once') { execution.policy = { source: 'consent-once' }; return }
    const snapshot = execution.snapshot
    if (answer.lifetime === 'task') {
      if (snapshot.taskHandle === undefined || snapshot.taskSignal === undefined || aborted(snapshot.taskSignal)) fail('task-invalid')
      let rules = this.#tasks.get(snapshot.taskHandle)
      if (rules === undefined) { rules = new Map(); this.#tasks.set(snapshot.taskHandle, rules) }
      if (rules.size >= MAX && !rules.has(snapshot.bindingHash)) fail('capacity')
      const rule: TaskRule = Object.freeze({ bindingHash: snapshot.bindingHash, operations: Object.freeze([...answer.operations]), epoch: snapshot.policyEpoch, session: snapshot.session, signal: snapshot.taskSignal })
      rules.set(snapshot.bindingHash, rule)
      execution.policy = { source: 'task', task: snapshot.taskHandle, rule }; return
    }
    if (answer.lifetime !== 'remember') fail('consent-denied')
    const expiresAt = this.#time() + answer.rememberDays * DAY
    if (!Number.isSafeInteger(expiresAt)) fail('clock-invalid')
    try {
      const revision = this.#store.health().revision
      const grant = this.#store.createRemembered({ binding: snapshot.binding, operations: [...answer.operations], expiresAt,
        confirmationId: fact.id, futureVersions: true, enabled: true }, revision)
      execution.policy = { source: 'remembered', grant }
    } catch { fail('remember-save-failed') } // Never silently downgrade to once/task/native fallback.
  }
  #validate(execution: Execution): void {
    this.#base()
    if (execution.failed) fail('owner-changed')
    if (this.#time() >= execution.deadline || this.#steady() >= execution.steadyDeadline || (execution.consent !== undefined && this.#time() >= execution.consent.expiresAt)) fail('expired')
    const current = this.#readOwner(execution.owner), expected = execution.snapshot
    if (current.exactNativeRequest !== expected.exactNativeRequest || current.bindingHash !== expected.bindingHash || current.operation !== expected.operation
      || current.policyEpoch !== expected.policyEpoch || current.agent !== expected.agent || current.session !== expected.session || current.sessionId !== expected.sessionId
      || current.signal !== expected.signal || current.taskHandle !== expected.taskHandle || current.taskSignal !== expected.taskSignal
      || current.toolName !== expected.toolName || current.callId !== expected.callId || current.reason !== expected.reason) { execution.failed = true; fail('owner-changed') }
    const prepared = this.#readPrepared(execution.preparation, execution.owner, current)
    if (prepared.seal !== execution.seal || prepared.signal !== execution.preparedSignal) { execution.failed = true; fail('preparation-changed') }
    const policy = execution.policy
    if (policy?.source === 'task') {
      if (current.taskHandle !== policy.task || this.#tasks.get(policy.task)?.get(current.bindingHash) !== policy.rule || !this.#taskMatches(policy.rule, current)) fail('task-invalid')
    } else if (policy?.source === 'remembered') {
      const match = this.#store.findMatch(current.binding, current.operation)
      this.#healthy()
      if (match === undefined || match.id !== policy.grant.id || match.version !== policy.grant.version || match.expiresAt !== policy.grant.expiresAt
        || match.expiresAt <= this.#time() || hash(binding(match.binding)) !== current.bindingHash) fail('grant-invalid')
    }
    // Mandatory pure inspectors are sampled again after mutable store reads.
    const finalOwner = this.#readOwner(execution.owner)
    const finalPrepared = this.#readPrepared(execution.preparation, execution.owner, finalOwner)
    if (finalOwner.policyEpoch !== expected.policyEpoch || finalOwner.exactNativeRequest !== expected.exactNativeRequest || finalOwner.bindingHash !== expected.bindingHash
      || finalOwner.operation !== expected.operation || finalOwner.signal !== expected.signal || finalOwner.taskHandle !== expected.taskHandle || finalOwner.taskSignal !== expected.taskSignal
      || finalOwner.agent !== expected.agent || finalOwner.session !== expected.session || finalOwner.sessionId !== expected.sessionId
      || finalOwner.toolName !== expected.toolName || finalOwner.callId !== expected.callId || finalOwner.reason !== expected.reason || finalPrepared.seal !== execution.seal || finalPrepared.signal !== execution.preparedSignal) { execution.failed = true; fail('owner-changed') }
    if (this.#time() >= execution.deadline || this.#steady() >= execution.steadyDeadline || aborted(expected.signal) || aborted(expected.taskSignal) || aborted(execution.preparedSignal)) fail('expired')
    this.#current()
  }
  #readOwner(owner: object): OwnerSnapshot {
    const value = this.#callback(() => this.#ownerReader(owner), item => item === undefined || plain(item))
    if (value === undefined) fail('invalid-owner')
    closed(value, ['exactNativeRequest', 'binding', 'operation', 'policyEpoch', 'signal', 'taskHandle', 'taskSignal'], 'invalid-owner')
    if (!ref(value.policyEpoch) || !Object.isFrozen(value.policyEpoch)) fail('invalid-owner')
    const currentOperation = op(value.operation)
    if (!this.#operations.includes(currentOperation)) fail('unsupported-operation')
    const currentBinding = binding(value.binding)
    const native = value.exactNativeRequest
    closed(native, ['agent', 'toolName', 'callId', 'reason', 'signal'], 'invalid-owner')
    if (!ref(native.agent) || typeof native.toolName !== 'string' || native.toolName.length === 0 || native.toolName.length > 256
      || (native.callId !== undefined && (typeof native.callId !== 'string' || native.callId.length > 256))
      || (native.reason !== undefined && (typeof native.reason !== 'string' || native.reason.length > 4_096)) || native.signal !== value.signal) fail('invalid-owner')
    const session = native.agent.session
    if (!ref(session) || typeof session.id !== 'string' || session.id.length === 0 || session.id.length > 256 || /[\u0000-\u0020\u007f-\u009f]/.test(session.id)) fail('invalid-owner')
    if (value.taskHandle !== undefined && (!ref(value.taskHandle) || value.taskSignal === undefined)) fail('task-invalid')
    if (value.taskHandle === undefined && value.taskSignal !== undefined) fail('task-invalid')
    if (aborted(value.signal) || aborted(value.taskSignal)) fail('aborted')
    // Independent defence on remembered/task matches too; they do not call request().
    if ((this.#approval.overrideOf(session) ?? this.#approval.config.policy ?? 'ask') !== 'ask') fail('native-never')
    return { ...value, binding: currentBinding, operation: currentOperation, bindingHash: hash(currentBinding), agent: native.agent, session, sessionId: session.id,
      toolName: native.toolName, callId: native.callId, reason: native.reason }
  }
  #readPrepared(preparation: object, owner: object, snapshot: OwnerSnapshot): CreatorPreparedInspection {
    const value = this.#callback(() => this.#preparedReader(preparation), item => item === undefined || plain(item))
    if (value === undefined) fail('invalid-preparation')
    closed(value, ['owner', 'binding', 'operation', 'seal', 'signal'], 'invalid-preparation')
    if (value.owner !== owner || !ref(value.seal) || !Object.isFrozen(value.seal) || value.signal === undefined || aborted(value.signal)
      || op(value.operation) !== snapshot.operation || hash(binding(value.binding)) !== snapshot.bindingHash) fail('invalid-preparation')
    return value
  }
  #taskMatches(rule: TaskRule, snapshot: OwnerSnapshot): boolean {
    return rule.bindingHash === snapshot.bindingHash && rule.epoch === snapshot.policyEpoch && rule.session === snapshot.session
      && rule.signal === snapshot.taskSignal && !aborted(rule.signal) && rule.operations.includes(snapshot.operation)
  }
  #emitAudit(permit: Permit, phase: CreatorExecutionAudit['phase']): void {
    const policy = permit.execution.policy
    if (policy === undefined) fail('internal-error')
    const dto: CreatorExecutionAudit = Object.freeze({ protocol: 1, id: randomUUID(), capabilityId: permit.id, at: this.#time(), phase, observed: 'prechecks-passed',
      source: policy.source, operation: permit.execution.snapshot.operation, bindingHash: permit.execution.snapshot.bindingHash,
      ...(policy.source === 'remembered' ? { grant: Object.freeze({ id: policy.grant.id, version: policy.grant.version }) } : {}) })
    this.#callback(() => this.#audit(dto), value => value === true, 'audit-failed')
  }
  #callback<T>(run: () => T, valid: (value: unknown) => boolean, code: CreatorAuthorizerFailure = 'callback-invalid'): T {
    let value: T
    try { value = run() } catch { this.#close(code); return fail(code) }
    let okay = false
    try { okay = !isPromise(value) && valid(value) } catch { /* Malformed/hostile return. */ }
    if (!okay) { this.#close(code); drain(value); return fail(code) }
    if (this.#closed !== undefined) fail(this.#closed)
    return value
  }
  #current(): void { if (!this.#callback(this.#lease, value => typeof value === 'boolean')) { this.#close('not-current-owner'); fail('not-current-owner') } }
  #steady(): number {
    const value = performance.now()
    if (!Number.isFinite(value) || value < 0 || (this.#steadyClock !== undefined && value < this.#steadyClock)) { this.#close('clock-invalid'); fail('clock-invalid') }
    this.#steadyClock = value
    return value
  }
  #time(): number {
    const now = this.#callback(this.#now, value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000 && !Object.is(value, -0), 'clock-invalid')
    if (this.#clock !== undefined && now < this.#clock) { this.#close('clock-invalid'); fail('clock-invalid') }
    this.#clock = now; return now
  }
  #healthy(): void { const health = this.#store.health(); if (!health.ok || !health.durableRevocationGuaranteed) { this.#close('store-unhealthy'); fail('store-unhealthy') } }
  #base(): void { this.#current(); this.#time(); this.#healthy() }
  #guard<T>(run: () => T): T {
    if (this.#closed !== undefined) fail(this.#closed)
    if (this.#busy) { this.#close('reentrant'); fail('reentrant') }
    this.#busy = true
    try { const result = run(); if (this.#closed !== undefined) fail(this.#closed); return result }
    catch (error) { if (error instanceof CreatorAuthorizerError) throw error; this.#close('internal-error'); throw new CreatorAuthorizerError('internal-error') }
    finally { this.#busy = false }
  }
  async #untilStopped<T>(execution: Execution, run: () => Promise<T>): Promise<T> {
    if (execution.stop.signal.aborted) fail('aborted')
    let reject!: (reason: unknown) => void
    const cancelled = new Promise<never>((_resolve, failed) => { reject = failed })
    void cancelled.catch(() => {}) // A next() that aborts then throws must not strand a rejected race input.
    const abort = (): void => { reject(new CreatorAuthorizerError('aborted')) }
    Reflect.apply(addListener, execution.stop.signal, ['abort', abort, { once: true }])
    try { return await Promise.race([run(), cancelled]) }
    finally { Reflect.apply(removeListener, execution.stop.signal, ['abort', abort]) }
  }
  async #waitNative(execution: Execution, value: Promise<ApprovalOutcome>): Promise<ApprovalOutcome> {
    let reject!: (reason: unknown) => void
    const cancelled = new Promise<never>((_resolve, failed) => { reject = failed })
    const abort = (): void => { reject(new CreatorAuthorizerError('aborted')); if (!execution.stop.signal.aborted) execution.stop.abort() }
    Reflect.apply(addListener, execution.stop.signal, ['abort', abort, { once: true }])
    const signals = [...new Set([execution.snapshot.signal, execution.snapshot.taskSignal, execution.preparedSignal].filter((signal): signal is AbortSignal => signal !== undefined))]
    for (const signal of signals) Reflect.apply(addListener, signal, ['abort', abort, { once: true }])
    if (execution.stop.signal.aborted || signals.some(aborted)) abort()
    execution.timer = schedule(() => { execution.failed = true; reject(new CreatorAuthorizerError('expired')); execution.stop.abort() }, this.#ttl)
    execution.timer.unref()
    try { return await Promise.race([value, cancelled]) }
    finally {
      Reflect.apply(removeListener, execution.stop.signal, ['abort', abort])
      for (const signal of signals) Reflect.apply(removeListener, signal, ['abort', abort])
      if (execution.timer !== undefined) unschedule(execution.timer)
    }
  }
  #close(reason: CreatorAuthorizerFailure): void {
    if (this.#closed !== undefined) return
    this.#closed = reason
    for (const execution of this.#active) {
      execution.failed = true; execution.stop.abort()
      if (execution.timer !== undefined) unschedule(execution.timer)
      if (execution.consent !== undefined) { try { this.#consent.cancel(execution.consent.id) } catch { /* A closed registry remains closed. */ } }
    }
  }
}
