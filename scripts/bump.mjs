#!/usr/bin/env node
// Bump the version in lockstep across the root package and every
// publishable @rezless/* sub-package.
//
// Usage: pnpm bump <version>      e.g. pnpm bump 0.2.0
//
// Commit + merge to main; release.yml detects the version change,
// publishes to npm, then tags + creates the GitHub Release.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: pnpm bump <version>  (e.g. 0.2.0, 0.2.0-rc.1)')
  process.exit(1)
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targets = [
  'package.json',
  'packages/parser/package.json',
  'packages/vm/package.json',
  'packages/vitest/package.json',
]

let changed = 0
for (const rel of targets) {
  const path = resolve(repoRoot, rel)
  const raw = await readFile(path, 'utf8')
  const json = JSON.parse(raw)
  const before = json.version
  if (before === version) {
    console.log(`${rel.padEnd(40)} ${before} (unchanged)`)
    continue
  }
  json.version = version
  const trailingNewline = raw.endsWith('\n') ? '\n' : ''
  await writeFile(path, JSON.stringify(json, null, 2) + trailingNewline)
  console.log(`${rel.padEnd(40)} ${before} → ${version}`)
  changed++
}

if (changed === 0) {
  console.log(`\nAll packages already at ${version} — nothing to do.`)
  process.exit(0)
}

console.log('\nNext steps:')
console.log('  1. Review the diff and run `pnpm install` to update the lockfile.')
console.log('  2. Commit (e.g. `chore: release v' + version + '`) and open a PR.')
console.log('  3. After merge to main, release.yml publishes + tags automatically.')
