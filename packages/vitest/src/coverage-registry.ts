import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Script, CoverageReport } from '@rezless/vm'

/**
 * Process-wide registry of every coverage-enabled Script created during a
 * test run. The Vitest reporter walks it at end-of-run to assemble the
 * aggregate report.
 *
 * Workers run in a separate context from the reporter, so snapshots reach
 * it as dump files on disk. Two paths drain them:
 *
 *   1. `coverage-setup.ts` registers a Vitest `afterAll` hook in every
 *      worker, which fires after each test file. This is the only path that
 *      works inside a Vitest run: Vitest stops its workers by terminating
 *      the thread or signalling the fork, so `process.on('exit')` never
 *      fires in them. The reporter adds the setup file itself; a project
 *      that uses `LSL_COVERAGE=1` with the CLI and no reporter has to list
 *      it in `setupFiles`.
 *
 *   2. `process.on('exit')` below, for a process that exits by itself, such
 *      as a plain Node script that calls `loadScript`.
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
