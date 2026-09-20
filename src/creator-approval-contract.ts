/** JSON-only confirmation vocabulary. No agent identity, binding, execution token or transport is accepted here. */
import { CREATOR_GRANT_OPERATIONS } from './creator-grant-types.ts'
import type { CreatorGrantOperation } from './creator-grant-types.ts'

/** A name reserved for a future supported forwarding source; exporting it does not register one. */
export const CREATOR_APPROVAL_EVENT = 'creator-approval/request'
export type CreatorApprovalLifetime = 'once' | 'task' | 'remember'
export type CreatorRememberDays = 1 | 7 | 30
export interface CreatorApprovalPrompt {
  protocol: 1
  id: string
  pluginId: string
  sourceLabel: string
  workspaceLabel: string
  currentOperation: CreatorGrantOperation
  availableOperations: CreatorGrantOperation[]
  allowTask: boolean
  allowRemember: boolean
  taskLabel: string
  reason?: string
}
export type CreatorApprovalResult =
  | { decision: 'reject' }
  | { decision: 'allow'; lifetime: 'once' | 'task'; operations: CreatorGrantOperation[] }
  | { decision: 'allow'; lifetime: 'remember'; operations: CreatorGrantOperation[]; rememberDays: CreatorRememberDays }

function invalid(): never { throw new TypeError('Invalid Creator approval confirmation') }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return invalid()
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) return invalid()
    const property = Object.getOwnPropertyDescriptor(value, key)
    if (property === undefined || !property.enumerable || !('value' in property)) return invalid()
    result[key] = property.value as unknown
  }
  return result
}
function text(value: unknown, max: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value)
    || (pattern !== undefined && !pattern.test(value))) return invalid()
  return value
}
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') return invalid(); return value }
function operation(value: unknown): CreatorGrantOperation {
  if (typeof value !== 'string' || !CREATOR_GRANT_OPERATIONS.includes(value as CreatorGrantOperation)) return invalid()
  return value as CreatorGrantOperation
}
function operations(value: unknown): CreatorGrantOperation[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length === 0 || value.length > 4
    || Reflect.ownKeys(value).length !== value.length + 1) return invalid()
  const result: CreatorGrantOperation[] = []
  for (let index = 0; index < value.length; index += 1) {
    const property = Object.getOwnPropertyDescriptor(value, String(index))
    if (property === undefined || !property.enumerable || !('value' in property)) return invalid()
    result.push(operation(property.value))
  }
  if (new Set(result).size !== result.length) return invalid()
  return CREATOR_GRANT_OPERATIONS.filter(item => result.includes(item))
}

/** Detached, strictly bounded display data. Host-generated labels are not execution bindings. */
export function parseCreatorApprovalPrompt(value: unknown): CreatorApprovalPrompt {
  const data = object(value, ['protocol', 'id', 'pluginId', 'sourceLabel', 'workspaceLabel', 'currentOperation', 'availableOperations', 'allowTask', 'allowRemember', 'taskLabel', 'reason'])
  if (data['protocol'] !== 1) return invalid()
  const currentOperation = operation(data['currentOperation'])
  const availableOperations = operations(data['availableOperations'])
  if (!availableOperations.includes(currentOperation)) return invalid()
  return {
    protocol: 1, id: text(data['id'], 128, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    pluginId: text(data['pluginId'], 64, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
    sourceLabel: text(data['sourceLabel'], 512), workspaceLabel: text(data['workspaceLabel'], 512),
    currentOperation, availableOperations, allowTask: boolean(data['allowTask']), allowRemember: boolean(data['allowRemember']),
    taskLabel: text(data['taskLabel'], 160), ...(Object.hasOwn(data, 'reason') ? { reason: text(data['reason'], 1_200) } : {}),
  }
}

/** Only explicit closed decisions are valid; native allowed-once and AI-shaped results are not this protocol. */
export function parseCreatorApprovalResult(value: unknown, prompt: CreatorApprovalPrompt): CreatorApprovalResult {
  const source = parseCreatorApprovalPrompt(prompt)
  const data = object(value, ['decision', 'lifetime', 'operations', 'rememberDays'])
  if (data['decision'] === 'reject') {
    if (Object.keys(data).length !== 1) return invalid()
    return { decision: 'reject' }
  }
  if (data['decision'] !== 'allow') return invalid()
  const selected = operations(data['operations'])
  if (!selected.includes(source.currentOperation) || selected.some(item => !source.availableOperations.includes(item))) return invalid()
  if (data['lifetime'] === 'remember') {
    if (!source.allowRemember || typeof data['rememberDays'] !== 'number' || ![1, 7, 30].includes(data['rememberDays'])) return invalid()
    return { decision: 'allow', lifetime: 'remember', operations: selected, rememberDays: data['rememberDays'] as CreatorRememberDays }
  }
  if (Object.hasOwn(data, 'rememberDays')) return invalid()
  if (data['lifetime'] === 'task') {
    if (!source.allowTask) return invalid()
    return { decision: 'allow', lifetime: 'task', operations: selected }
  }
  if (data['lifetime'] !== 'once' || selected.length !== 1 || selected[0] !== source.currentOperation) return invalid()
  return { decision: 'allow', lifetime: 'once', operations: selected }
}
