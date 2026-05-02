import * as fs from 'node:fs'
import * as path from 'node:path'
import { mergeReports, type CoverageReport } from '@lslvm/vm'
import { renderLcov } from './format/lcov.js'
import { renderIstanbul } from './format/istanbul.js'
import { renderConsoleSummary } from './format/console.js'
import { readWorkerDumps, clearWorkerDumps } from './coverage-registry.js'

export interface LslCoverageReporterOptions {
  /** Output directory; defaults to `coverage/lsl`. */
  readonly outputDir?: string
  /** Skip the per-file `coverage/lsl/lcov.info` write. */
  readonly disableLcov?: boolean
  /** Skip the `coverage/lsl/coverage-final.json` write. */
  readonly disableIstanbul?: boolean
  /** Skip the end-of-run console table. */
  readonly disableConsole?: boolean
}

/**
 * Vitest custom reporter for LSL script coverage.
 *
 * Activates collection in test workers (via `LSL_COVERAGE=1`), then at
 * end-of-run reads per-worker coverage dumps, merges by filename, and
 * writes:
 *   - `<outputDir>/lcov.info`         (LCOV)
 *   - `<outputDir>/coverage-final.json` (Istanbul)
 *   - a console summary table
 *
 * Wire it up in your `vitest.config.ts`:
 *
 *   import { LslCoverageReporter } from '@lslvm/vitest/reporter'
 *   export default defineConfig({
 *     test: {
 *       reporters: ['default', new LslCoverageReporter()],
 *     },
 *   })
 */
export class LslCoverageReporter {
  private readonly outputDir: string
  private readonly opts: LslCoverageReporterOptions

  constructor(opts: LslCoverageReporterOptions = {}) {
    this.opts = opts
    this.outputDir = opts.outputDir ?? path.join(process.cwd(), 'coverage', 'lsl')
    // Set immediately so workers spawned thereafter inherit the env.
    process.env['LSL_COVERAGE'] = '1'
  }

  onInit(): void {
    // Best-effort: clear stale per-worker dumps from a previous run so we
    // don't merge old coverage into the new report.
    clearWorkerDumps()
  }

  onTestRunEnd(): void {
    const dumps = readWorkerDumps()
    if (dumps.length === 0) {
      if (!this.opts.disableConsole) {
        process.stdout.write('No LSL coverage collected.\n')
      }
      return
    }

    // Group by filename and merge.
    const byFile = new Map<string, CoverageReport[]>()
    for (const r of dumps) {
      const list = byFile.get(r.filename)
      if (list) list.push(r)
      else byFile.set(r.filename, [r])
    }
    const merged: CoverageReport[] = []
    for (const list of byFile.values()) {
      merged.push(list.length === 1 ? list[0]! : mergeReports(list))
    }
    merged.sort((a, b) => a.filename.localeCompare(b.filename))

    fs.mkdirSync(this.outputDir, { recursive: true })

    if (!this.opts.disableLcov) {
      const lcovPath = path.join(this.outputDir, 'lcov.info')
      fs.writeFileSync(lcovPath, renderLcov(merged))
    }

    if (!this.opts.disableIstanbul) {
      const istanbulPath = path.join(this.outputDir, 'coverage-final.json')
      fs.writeFileSync(istanbulPath, JSON.stringify(renderIstanbul(merged), null, 2))
    }

    if (!this.opts.disableConsole) {
      process.stdout.write('\n' + renderConsoleSummary(merged))
    }

    clearWorkerDumps()
  }
}
