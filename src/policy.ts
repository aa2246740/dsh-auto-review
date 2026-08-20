/** Deterministic, provider-free first pass for approval review. */

import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ReviewDecision } from './reviewer.ts'

const SAFE_OBSERVATION_TOOLS = new Set([
  'ask_user_question',
  'cordis_inspect_list',
  'cordis_inspect_query',
  'cordis_inspect_self',
  'cua_describe',
  'cua_list_tools',
  'cua_status',
  'get_goal',
  'job_list',
  'job_output',
  'list_agents',
  'report_view',
  'schedule_list',
  'session_event_read',
  'session_event_search',
  'session_event_trace',
  'session_search',
  'session_trace',
  'skill',
  'team_task_get',
  'team_task_list',
  'terminal_list',
  'terminal_read',
  'wait_agent',
])

const SAFE_SESSION_WRITES = new Set(['create_goal', 'todo_write', 'update_goal'])
const WORKSPACE_READ_TOOLS = new Set(['glob', 'grep', 'lsp', 'read', 'read_image'])
const SHELL_LIKE_TOOLS = new Set([
  'bash', 'cordis_run', 'pwsh', 'run_code', 'terminal_open', 'terminal_send',
])
const SENSITIVE_PATH = /(?:^|[\\/])(?:\.env(?:\.|$)|\.ssh|\.aws|\.gnupg|keychains?|credentials?|secrets?)(?:[\\/]|$)/i
const BROAD_READ_ROOT = /^(?:\/|~|\$HOME|\$\{HOME\}|\/[Uu]sers\/[^/]+)\/?$/
const PARENT_PATH_SEGMENT = /(?:^|[\\/])\.\.(?:[\\/]|$)/

const SAFE_METADATA_COMMANDS = new Set([
  'df', 'du', 'file', 'ls', 'pwd', 'readlink', 'realpath', 'stat', 'wc',
])

const SAFE_FIND_ZERO_ARITY = new Set([
  '-empty', '-false', '-ls', '-nogroup', '-nouser', '-print', '-print0', '-prune', '-quit',
  '-readable', '-true',
])

const SAFE_FIND_ONE_ARITY = new Set([
  '-amin', '-anewer', '-atime', '-cmin', '-cnewer', '-ctime', '-gid', '-group', '-iname',
  '-inum', '-ipath', '-iregex', '-links', '-maxdepth', '-mindepth', '-mmin', '-mtime', '-name',
  '-newer', '-newerXY', '-newermt', '-path', '-perm', '-regex', '-samefile',
  '-size', '-type', '-uid', '-user', '-used', '-wholename',
])

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringValues)
  return []
}

function candidatePaths(args: unknown): string[] {
  const record = recordOf(args)
  if (record === undefined) return []
  return [
    ...stringValues(record['path']),
    ...stringValues(record['paths']),
    ...stringValues(record['file']),
    ...stringValues(record['filePath']),
    ...stringValues(record['file_path']),
    ...stringValues(record['cwd']),
    ...stringValues(record['root']),
    ...stringValues(record['directory']),
  ]
}

function withinWorkspace(candidate: string, cwd: string): boolean {
  if (SENSITIVE_PATH.test(candidate)) return false
  if (candidate === '~' || candidate.startsWith('~/') || /\$(?:\{HOME\}|HOME)/.test(candidate)) return false
  const normalize = (value: string): string => {
    const portable = value.replaceAll('\\', '/')
    const drive = portable.match(/^[a-z]:/i)?.[0]?.toLowerCase() ?? ''
    const absolute = drive.length > 0 || portable.startsWith('/')
    const body = drive.length > 0 ? portable.slice(drive.length) : portable
    const segments: string[] = []
    for (const segment of body.split('/')) {
      if (segment.length === 0 || segment === '.') continue
      if (segment === '..') segments.pop()
      else segments.push(segment)
    }
    return `${drive}${absolute ? '/' : ''}${segments.join('/')}`
  }
  const base = normalize(cwd)
  const absolute = /^(?:[a-z]:[\\/]|\/)/i.test(candidate)
    ? normalize(candidate)
    : normalize(`${base}/${candidate}`)
  return absolute === base || absolute.startsWith(`${base}/`)
}

function shellText(args: unknown): string {
  const record = recordOf(args)
  if (record === undefined) return JSON.stringify(args) ?? ''
  return ['command', 'cmd', 'script', 'code', 'input', 'chars']
    .flatMap(key => stringValues(record[key]))
    .join('\n')
}

/**
 * Tokenize only the deliberately tiny shell grammar accepted by the fast path.
 * Any operator, substitution, expansion, newline, or malformed quote fails
 * closed and leaves the command to the model reviewer.
 */
function observationTokens(command: string): string[] | undefined {
  const tokens: string[] = []
  let token = ''
  let started = false
  let quote: 'single' | 'double' | undefined
  const push = (): void => {
    if (!started) return
    tokens.push(token)
    token = ''
    started = false
  }

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!
    if (quote === 'single') {
      if (character === "'") quote = undefined
      else token += character
      continue
    }
    if (quote === 'double') {
      if (character === '"') {
        quote = undefined
        continue
      }
      if (character === '$' || character === '`' || character === '\n' || character === '\r') return undefined
      if (character === '\\') {
        const next = command[index + 1]
        if (next === undefined) return undefined
        index += 1
        token += next
        continue
      }
      token += character
      continue
    }

    if (/\s/.test(character)) {
      push()
      continue
    }
    if (character === "'") {
      quote = 'single'
      started = true
      continue
    }
    if (character === '"') {
      quote = 'double'
      started = true
      continue
    }
    if (character === '\\') {
      const next = command[index + 1]
      if (next === undefined || next === '\n' || next === '\r') return undefined
      index += 1
      token += next
      started = true
      continue
    }
    if ('$`|&<>;()\n\r'.includes(character) || '*?['.includes(character)) return undefined
    token += character
    started = true
  }
  if (quote !== undefined) return undefined
  push()
  return tokens.length === 0 ? undefined : tokens
}

function safeObservationPath(path: string, cwd: string | undefined): boolean {
  if (path === '{}') return true
  if (path.length === 0 || SENSITIVE_PATH.test(path) || BROAD_READ_ROOT.test(path)
    || PARENT_PATH_SEGMENT.test(path)) return false
  if ((path === '.' || path.startsWith('./') || !path.startsWith('/')) && cwd !== undefined) {
    return !SENSITIVE_PATH.test(cwd) && !BROAD_READ_ROOT.test(cwd)
  }
  return true
}

function safeMetadataCommand(tokens: readonly string[], cwd: string | undefined): boolean {
  const command = tokens[0]
  if (command === undefined || !SAFE_METADATA_COMMANDS.has(command)) return false
  if (command === 'file' && tokens.some(token => token === '-C' || token.startsWith('--compile'))) return false
  for (const token of tokens.slice(1)) {
    if (token === '{}') continue
    if (SENSITIVE_PATH.test(token) || PARENT_PATH_SEGMENT.test(token)) return false
    if (token.startsWith('-')) continue
    if (!safeObservationPath(token, cwd)) return false
  }
  return true
}

function safeFindCommand(tokens: readonly string[], cwd: string | undefined): boolean {
  if (tokens[0] !== 'find') return false
  if (tokens.some(token => token !== '{}'
    && (SENSITIVE_PATH.test(token) || PARENT_PATH_SEGMENT.test(token)))) return false
  let index = 1
  if (tokens[index] === '--') index += 1

  let roots = 0
  while (index < tokens.length && !tokens[index]!.startsWith('-')) {
    if (!safeObservationPath(tokens[index]!, cwd)) return false
    roots += 1
    index += 1
  }
  if (roots === 0) return false

  while (index < tokens.length) {
    const token = tokens[index]!
    if (SAFE_FIND_ZERO_ARITY.has(token) || token === '-a' || token === '-and' || token === '-o' || token === '-or') {
      index += 1
      continue
    }
    if (token === '!' || token === '-not') {
      index += 1
      continue
    }
    if (SAFE_FIND_ONE_ARITY.has(token)) {
      const argument = tokens[index + 1]
      if (argument === undefined) return false
      if (['-anewer', '-cnewer', '-newer', '-samefile'].includes(token)
        && !safeObservationPath(argument, cwd)) return false
      index += 2
      continue
    }
    if (token === '-exec' || token === '-execdir') {
      const end = tokens.findIndex((candidate, candidateIndex) => (
        candidateIndex > index && (candidate === ';' || candidate === '+')
      ))
      if (end < 0 || !safeMetadataCommand(tokens.slice(index + 1, end), cwd)) return false
      index = end + 1
      continue
    }
    return false
  }
  return true
}

function deterministicShellObservation(exec: ToolExecution): ReviewDecision | undefined {
  if (exec.name !== 'bash') return undefined
  const args = recordOf(exec.arguments)
  if (args === undefined || typeof args['command'] !== 'string' || args['run_in_background'] === true) {
    return undefined
  }
  const cwd = typeof args['workdir'] === 'string'
    ? args['workdir']
    : exec.agent?.session.header.cwd
  const tokens = observationTokens(args['command'])
  if (tokens === undefined) return undefined
  if (!safeMetadataCommand(tokens, cwd) && !safeFindCommand(tokens, cwd)) return undefined
  return { decision: 'allow', reason: '命令仅执行无副作用的本地观察。' }
}

/** Match only catastrophic machine-wide operations, not ordinary exact-target cleanup. */
export function catastrophicReason(exec: Pick<ToolExecution, 'name' | 'arguments'>): string | undefined {
  if (!SHELL_LIKE_TOOLS.has(exec.name)) return undefined
  const text = shellText(exec.arguments)
  if (/\brm\s+(?:-[a-z]*r[a-z]*f[a-z]*|--recursive\s+--force|--force\s+--recursive)\s+(?:--\s+)?(?:['"]?(?:\/|~|\$HOME|\$\{HOME\})['"]?)(?:\s*(?:;|&&|\|\||$))/i.test(text)) {
    return '拒绝自动执行：命令试图递归删除根目录或整个用户目录。'
  }
  if (/\b(?:diskutil\s+erase(?:Disk|Volume)|mkfs(?:\.[a-z0-9]+)?\s|find\s+\/\s+-delete\b)/i.test(text)) {
    return '拒绝自动执行：命令包含整盘格式化或根目录批量删除。'
  }
  if (/\bdd\b[^\n]*\bof=\/dev\/(?:r?disk|sd[a-z]|nvme)/i.test(text)) {
    return '拒绝自动执行：命令试图直接覆写块设备。'
  }
  if (/:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;\s*:/i.test(text)) {
    return '拒绝自动执行：命令包含 fork bomb。'
  }
  return undefined
}

/**
 * Return a decision only when it is safe without model judgment. Undefined
 * means the OAuth reviewer must compare the call with the user's request.
 */
export function deterministicDecision(exec: ToolExecution): ReviewDecision | undefined {
  const catastrophic = catastrophicReason(exec)
  if (catastrophic !== undefined) return { decision: 'deny', reason: catastrophic }
  const shellObservation = deterministicShellObservation(exec)
  if (shellObservation !== undefined) return shellObservation
  if (SAFE_OBSERVATION_TOOLS.has(exec.name)) {
    return { decision: 'allow', reason: '只读或询问型 DSH 操作。' }
  }
  if (SAFE_SESSION_WRITES.has(exec.name)) {
    return { decision: 'allow', reason: '仅更新当前 DSH 会话内的计划状态。' }
  }
  if (!WORKSPACE_READ_TOOLS.has(exec.name)) return undefined

  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined) return undefined
  const paths = candidatePaths(exec.arguments)
  // glob/grep/lsp default to the session cwd when no explicit root is supplied.
  if (paths.length === 0 && exec.name !== 'read' && exec.name !== 'read_image') {
    return { decision: 'allow', reason: '在当前工作区内执行只读查询。' }
  }
  if (paths.length > 0 && paths.every(path => withinWorkspace(path, cwd))) {
    return { decision: 'allow', reason: '读取目标位于当前工作区且不命中敏感路径。' }
  }
  return undefined
}
