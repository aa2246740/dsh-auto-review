/** Exact request fingerprints and bounded, redacted UI metadata. */
import { createHash } from 'node:crypto'
import { redactArguments, redactText } from './redaction.ts'

function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Hash the complete arguments, not the redacted preview or a caller-supplied digest. */
export function argumentFingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

/** Bounded metadata only: neither file bodies nor full shell/JS programs enter audit storage. */
export function summarizeArguments(value: unknown): string {
  const redact = (item: unknown, depth: number): unknown => {
    if (depth > 5) return '[omitted: nested value]'
    if (Array.isArray(item)) return item.slice(0, 12).map(value => redact(value, depth + 1))
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>).slice(0, 30).map(([key, child]) => [
        key,
        /^(?:content|file_?content|text|code|script|command|cmd|input|chars|old_string|new_string|javascript)$/i.test(key)
          ? `[omitted: ${typeof child === 'string' ? String(child.length) : 'structured'} characters]`
          : redact(child, depth + 1),
      ]))
    }
    return typeof item === 'string' ? auditText(item, 300) : item
  }
  return JSON.stringify(redactArguments(redact(value, 0)))?.slice(0, 2_000) ?? 'null'
}

/** Metadata hint only; never a provenance or authorization assertion. */
export function targetPlugin(toolName: string, args: unknown): string | undefined {
  if (!toolName.startsWith('dshx_') || args === null || typeof args !== 'object') return undefined
  const name = (args as Record<string, unknown>)['name']
  return typeof name === 'string' && /^[a-z][a-z0-9-]{0,127}$/.test(name) ? name : undefined
}

/** Remove inline credentials and URL credentials from bounded explanations. */
export function auditText(value: string, limit = 600): string {
  return redactText(value).slice(0, limit)
}
