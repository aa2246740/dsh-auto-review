/** Bounded durable precheck journal. It never claims payload execution. */
import { constants, openSync, closeSync, fstatSync, lstatSync, writeSync, fsyncSync } from 'node:fs'
import { join } from 'node:path'
import { userInfo } from 'node:os'
import type { CreatorExecutionAudit } from './creator-authorizer.ts'

export function creatorExecutionAudit(directory: string): (event: Readonly<CreatorExecutionAudit>) => true {
  const path = join(directory, 'creator-execution-checks.jsonl')
  const uid = BigInt(userInfo().uid)
  return event => {
    let fd: number | undefined
    try {
      const parent = lstatSync(directory, { bigint: true })
      if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== uid || (parent.mode & 0o777n) !== 0o700n) throw new Error()
      const bytes = Buffer.from(JSON.stringify(event) + '\n', 'utf8')
      if (bytes.length > 4096) throw new Error()
      fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
      const before = fstatSync(fd, { bigint: true })
      if (!before.isFile() || before.uid !== uid || before.nlink !== 1n || (before.mode & 0o777n) !== 0o600n
        || before.size + BigInt(bytes.length) > 2n * 1024n * 1024n) throw new Error()
      if (writeSync(fd, bytes) !== bytes.length) throw new Error()
      fsyncSync(fd)
      const after = lstatSync(path, { bigint: true }), stillParent = lstatSync(directory, { bigint: true })
      if (after.dev !== before.dev || after.ino !== before.ino || after.isSymbolicLink()
        || stillParent.dev !== parent.dev || stillParent.ino !== parent.ino) throw new Error()
      const directoryFd = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW)
      try { fsyncSync(directoryFd) } finally { closeSync(directoryFd) }
      return true
    } catch { throw new Error('授权审计无法持久保存，未授予执行许可。') }
    finally { if (fd !== undefined) closeSync(fd) }
  }
}
