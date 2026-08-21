/**
 * Stamp the built asset list into the service worker.
 *
 * Vite hashes the bundle names, so the precache list cannot be written by hand
 * without going stale the first time anything changes — and a stale precache
 * list is the worst kind of offline bug: the app appears to install, then
 * fails to launch on a train. Reading `dist/` after the build is the only
 * source of truth about what the shell actually consists of.
 *
 * Runs automatically as part of `npm run build`.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(dist)
  .map((f) => './' + relative(dist, f).split(sep).join('/'))
  // The worker must not precache itself, and the icons are fetched by the OS
  // rather than by the page — leaving them to the runtime cache is fine.
  .filter((f) => f !== './sw.js' && !f.endsWith('.map'))

const precache = ['./', ...files.filter((f) => f !== './index.html'), './index.html']

const swPath = join(dist, 'sw.js')
const source = readFileSync(swPath, 'utf8')

// Version by content: the worker changes exactly when the shell does, which is
// what makes the activate step drop old caches at the right moment.
const version = createHash('sha256')
  .update(precache.join('|'))
  .update(readFileSync(join(dist, 'index.html')))
  .digest('hex')
  .slice(0, 12)

const stamped = source
  .replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`)
  .replace(/const PRECACHE = \[[^\]]*\]/, `const PRECACHE = ${JSON.stringify(precache)}`)

if (stamped === source) throw new Error('build-sw: nothing was stamped — the worker template changed shape')

writeFileSync(swPath, stamped)
console.log(`build-sw: ${precache.length} files precached, version ${version}`)
