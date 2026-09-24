import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const vendored = fileURLToPath(new URL('./tools/client-build.js', import.meta.url))

function resolveHarnessAdapter(): string {
  const configured = process.env.DSHX_HARNESS?.trim()
  const harness = configured ? resolve(configured) : undefined
  const configPath = join(homedir(), '.config/dshx/harness')
  const recorded = existsSync(configPath) ? readFileSync(configPath, 'utf8').trim() : undefined
  const root = harness ?? (recorded ? resolve(recorded) : undefined)
  if (!root) {
    throw new Error('dshx client build requires a Harness root from DSHX_HARNESS or ~/.config/dshx/harness')
  }
  // The official adapter may itself be symlinked outside runtime; forward the resolved target explicitly.
  process.env.DSHX_HARNESS = root
  return join(root, 'tools/dshx/src/client-build.js')
}

const adapter = existsSync(vendored) ? vendored : resolveHarnessAdapter()
if (!existsSync(adapter)) throw new Error('DSHX externalClientBundle adapter is missing.')
const { externalClientBundle } = await import(pathToFileURL(adapter).href)

export default externalClientBundle('dsh-approve-for-me', ['lib/types/dsh-approve-for-me.js'], {
  clientEntry: 'src/client/index.tsx',
})
