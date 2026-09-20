import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// DSHX's virtual CSS module IDs include the build machine's checkout path.
// Remove that prefix from comments and source-map identities before publication.
const root = `${resolve('.').replaceAll('\\', '/')}/`
const clientPath = 'lib/client.js'
const client = await readFile(clientPath, 'utf8')
await writeFile(clientPath, client.replaceAll(`dshx-css-module:${root}`, 'dshx-css-module:'))
const mapPath = `${clientPath}.map`
const map = JSON.parse(await readFile(mapPath, 'utf8'))
map.sources = map.sources.map(source => source.replaceAll(root, ''))
await writeFile(mapPath, `${JSON.stringify(map)}\n`)
