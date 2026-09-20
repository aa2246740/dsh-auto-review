/** Shared redaction for reviewer prompts and persisted summaries; never a secret-detection guarantee. */
const SECRET_KEY = /(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i
const INLINE_SECRET = /\b((?:bearer|token|password|secret|api[_-]?key|authorization)\s*[:=]\s*)([^\s,;]+)/gi

export function redactText(text: string): string {
  return text
    .replace(/(\b(?:Bearer|Basic)\s+)[^\s"'\\]+/gi, '$1[REDACTED]')
    .replace(/("(?:access[_-]?token|refresh[_-]?token|token|password|passwd|secret|api[_-]?key|authorization)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[REDACTED]"')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (whole: string, separator: string, key: string) => {
      let normalized = key
      try { normalized = decodeURIComponent(key.replace(/\+/g, ' ')) } catch { /* Malformed keys remain bounded data. */ }
      return /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|key|client[_-]?secret|secret|password|signature|code|x-amz-security-token|x-amz-credential)$/i.test(normalized)
        ? `${separator}${key}=[REDACTED]` : whole
    })
    .replace(INLINE_SECRET, '$1[REDACTED]')
}

/** Redact credential-shaped fields before data can cross providers or reach an audit file. */
export function redactArguments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactArguments)
  if (typeof value === 'string') return redactText(value)
  if (typeof value !== 'object' || value === null) return value
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redactArguments(item)
  }
  return output
}
