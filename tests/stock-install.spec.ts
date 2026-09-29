import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(relative: string): string {
  return readFileSync(join(root, relative), 'utf8')
}

describe('stock DSH 0.2.0-rc.2 install', () => {
  const pkg = JSON.parse(read('package.json')) as {
    name: string
    scripts?: Record<string, string>
    files?: string[]
    peerDependencies?: Record<string, string>
    dsh?: { bundle?: { patch?: string } }
  }

  it('sets the 0.2.0-rc.2 peer range on @deepseek-ai/dsh and @deepseek-ai/dsh-*', () => {
    const range = '>=0.2.0-rc.1 <0.2.1'
    const peers = pkg.peerDependencies ?? {}
    expect(peers['@deepseek-ai/dsh']).toBe(range)
    const dshPeers = Object.entries(peers).filter(([name]) => name.startsWith('@deepseek-ai/dsh'))
    expect(dshPeers.length).toBeGreaterThan(1)
    for (const [, value] of dshPeers) expect(value).toBe(range)
  })

  it('declares dsh.bundle.patch so dsh plugin add joins the profile layer', () => {
    expect(pkg.name).toBe('dsh-approve-for-me')
    expect(pkg.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(read('cordis.patch.yml')).toMatch(/name:\s*dsh-approve-for-me/)
    expect(read('cordis.patch.yml')).not.toMatch(/name:\s*'\.\/src\//)
  })

  it('ships committed lib/ so github: add does not need prepare or allowBuilds', () => {
    expect(pkg.scripts?.prepare).toBeUndefined()
    expect(pkg.files).toEqual(expect.arrayContaining([
      'lib/*.js',
      'lib/*.js.map',
      'cordis.patch.yml',
    ]))
    expect(read('lib/dsh-approve-for-me.js')).toContain('export {')
    const client = read('lib/client.js')
    expect(client).toContain('window.__ModuleLoader__.load')
    expect(client).toContain('dsh-approve-for-me')
    // The current client uses public settings slots instead of decorating permission DOM.
    expect(client).toContain('settings.section')
    expect(client).toContain('settings.plugins.tab')
  })

  it('documents the official web-profile one-liner, peer range, and pnpm', () => {
    const command = 'dsh plugin --profile web add github:aa2246740/dsh-auto-review'
    for (const relative of ['README.md', 'README.en.md']) {
      const text = read(relative)
      expect(text.indexOf('\n# ')).toBeGreaterThan(-1)
      expect(text).toContain(command)
      expect(text).toContain('>=0.2.0-rc.1 <0.2.1')
      expect(text).toContain('0.1.7-rc.2')
      expect(text).toMatch(/pnpm/i)
      expect(text).not.toMatch(/dshx check|my-plugins\/dsh-approve-for-me|DSHX_HARNESS/)
    }
  })
})
