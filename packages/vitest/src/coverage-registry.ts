import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Script, CoverageReport } from '@rezless/vm'

/**
 * Process-wide registry of every coverage-enabled Script created during a
 * test run. The Vitest reporter walks it at end-of-run to assemble the
 * aggregate report.
 *
 * Workers run in a separate context from the reporter, so we have two
 * independent paths that drain snapshots to disk:
 *
 *   1. **Primary**: `coverage-setup.ts` registers a Vitest `afterAll` hook
 *      in every worker. Fires after each test file completes — works
 *      reliably under both `pool: 'threads'` (where this is the only
 *      pre-`onTestRunEnd` opportunity to flush, since worker threads
 *      share `process` with main and `process.on('exit')` only fires when
 *      main exits) and `pool: 'forks'` (where the worker process exits
 *      between files, but afterAll still runs first).
 *
 *   2. **Fallback**: `process.on('exit')` below. Catches any reports that
 *      slip past afterAll — e.g. if the setup file failed to load or the
 *      reporter wasn't installed at all (LSL_COVERAGE=1 + CLI render flow).
 *
 * `drainSnapshots()` clears the registry, so whichever path runs first
 * wins; the other becomes a no-op.
 */

const liveScripts = new Set<Script>()
let exitHookInstalled = false

function dumpDir(): string {
  return process.env['LSL_COVERAGE_DIR'] ?? path.join(process.cwd(), '.rezless-coverage')
}

function installExitHook(): void {
  if (exitHookInstalled) return
  exitHookInstalled = true
  process.on('exit', () => {
    const reports = drainSnapshots()
    if (reports.length === 0) return
    try {
      const dir = dumpDir()
      fs.mkdirSync(dir, { recursive: true })
      // Filename includes pid + a counter to avoid collisions when multiple
      // workers in the same pid (thread pool) flush via different timings.
      const file = path.join(dir, `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`)
      fs.writeFileSync(file, JSON.stringify(reports))
    } catch {
      // exit handlers must not throw — silently swallow IO failure.
    }
  })
}

export function registerScript(script: Script): void {
  installExitHook()
  liveScripts.add(script)
}

/**
 * Pull a coverage snapshot from every registered Script and clear the
 * registry. Snapshots from scripts whose coverage is disabled are skipped.
 */
export function drainSnapshots(): CoverageReport[] {
  const out: CoverageReport[] = []
  for (const s of liveScripts) {
    const r = s.coverage
    if (r) out.push(r)
  }
  liveScripts.clear()
  return out
}

/** Test-only: drop everything without producing a report. */
export function clearRegistry(): void {
  liveScripts.clear()
}

/** Read every per-worker dump file written this run, deserialize, and clear. */
export function readWorkerDumps(): CoverageReport[] {
  const dir = dumpDir()
  if (!fs.existsSync(dir)) return []
  const out: CoverageReport[] = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const full = path.join(dir, name)
    try {
      const raw = fs.readFileSync(full, 'utf8')
      const parsed = JSON.parse(raw) as CoverageReport[]
      for (const r of parsed) out.push(r)
    } catch {
      // Skip malformed dumps rather than fail the whole report.
    }
  }
  return out
}

export function clearWorkerDumps(): void {
  const dir = dumpDir()
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.json')) {
      try {
        fs.unlinkSync(path.join(dir, name))
      } catch {
        /* ignore */
      }
    }
  }
}
