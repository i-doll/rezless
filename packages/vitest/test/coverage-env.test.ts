import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { CoverageReport } from '@rezless/vm'

const project = fileURLToPath(new URL('./fixtures/coverage-env', import.meta.url))
const vitestBin = path.join(path.dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs')

/** Run the fixture project's tests in their own Vitest, and return the dumps it left. */
function runProject(env: Record<string, string>): CoverageReport[] {
  const dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rezless-env-dumps-'))
  const run = spawnSync(process.execPath, [vitestBin, 'run', '--root', project], {
    env: { ...process.env, LSL_COVERAGE_DIR: dumpDir, ...env },
    encoding: 'utf8',
    timeout: 50_000,
  })
  try {
    expect(run.status, run.stdout + run.stderr).toBe(0)
    return fs
      .readdirSync(dumpDir)
      .flatMap((name) => JSON.parse(fs.readFileSync(path.join(dumpDir, name), 'utf8')) as CoverageReport[])
  } finally {
    fs.rmSync(dumpDir, { recursive: true, force: true })
  }
}

describe('LSL_COVERAGE=1 without the reporter', { timeout: 60_000 }, () => {
  it('dumps the reports of a test file when coverage-setup is in setupFiles', () => {
    const dumps = runProject({ LSL_COVERAGE: '1' })
    expect(dumps.map((r) => path.basename(r.filename))).toEqual(['hello.lsl', 'hello.lsl'])
    for (const r of dumps) expect(r.statements.every((s) => s.hits > 0)).toBe(true)
  })

  it('writes nothing when LSL_COVERAGE is off, even for a script loaded with coverage: true', () => {
    expect(runProject({ LSL_COVERAGE: '0' })).toEqual([])
  })
})
