/**
 * Vitest setup file that runs in every test worker. Registers a top-level
 * `afterAll` hook so each test file drains its accumulated coverage
 * snapshots to disk before the worker finishes the file.
 *
 * `process.on('exit')` can't do this job: Vitest stops its workers by
 * terminating the thread or signalling the fork, so exit hooks never fire
 * in them. This setup file pulls coverage at a known point in the test
 * lifecycle, which the reporter and the CLI read after the run.
 *
 * The reporter wires this file in via `vitest.config.setupFiles` when it
 * activates. A project that runs `LSL_COVERAGE=1` without the reporter
 * lists `@rezless/vitest/coverage-setup` in `setupFiles` itself.
 *
 * Vitest re-runs setup files before every test file, including with
 * `isolate: false`, so this `afterAll` registers once per file and each
 * file's coverage is drained under every pool.
 */

import { afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { drainSnapshots } from './coverage-registry.js'
import { isCoverageEnabled } from './coverage-config.js'

afterAll(() => {
  const reports = drainSnapshots()
  // A script loaded with `coverage: true` registers in any run. Only a
  // coverage run keeps its report, so ordinary test runs leave no dumps.
  if (reports.length === 0 || !isCoverageEnabled()) return
  try {
    const dir = process.env['LSL_COVERAGE_DIR'] ?? path.join(process.cwd(), '.rezless-coverage')
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
