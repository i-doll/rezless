/**
 * Vitest setup file that runs in every test worker. Registers a top-level
 * `afterAll` hook so each test file drains its accumulated coverage
 * snapshots to disk before the worker finishes the file.
 *
 * Relying on `process.on('exit')` alone is not reliable under Vitest's
 * thread pool: the main process can finish reporting before the worker's
 * exit hooks fire (and thread workers may stay warm across files). This
 * setup file pulls coverage at known points in the test lifecycle, which
 * the reporter can read deterministically at end-of-run.
 *
 * The reporter wires this file in via `vitest.config.setupFiles` when it
 * activates; users don't have to import it themselves.
 */

import { afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { drainSnapshots } from './coverage-registry.js'

afterAll(() => {
  const reports = drainSnapshots()
  if (reports.length === 0) return
  try {
    const dir = process.env['LSL_COVERAGE_DIR'] ?? path.join(process.cwd(), '.lslvm-coverage')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(
      dir,
      `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
    )
    fs.writeFileSync(file, JSON.stringify(reports))
  } catch {
    // afterAll failures shouldn't break the test run; coverage is best-effort.
  }
})
