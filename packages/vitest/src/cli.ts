#!/usr/bin/env node
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { CoverageReport } from '@lslvm/vm'
import { renderLcov } from './format/lcov.js'
import { renderIstanbul } from './format/istanbul.js'
import { renderConsoleSummary } from './format/console.js'
import { renderHtml } from './format/html.js'
import { renderSummary } from './format/summary.js'
import { aggregateReports } from './coverage-aggregate.js'

interface Options {
  outputDir: string
  dumpDir: string
  keepDumps: boolean
  silent: boolean
  includeFixtures: boolean
}

function parseArgs(argv: ReadonlyArray<string>): Options {
  const opts: Options = {
    outputDir: path.join(process.cwd(), 'coverage', 'lsl'),
    dumpDir: process.env['LSL_COVERAGE_DIR'] ?? path.join(process.cwd(), '.lslvm-coverage'),
    keepDumps: false,
    silent: false,
    includeFixtures: false,
  }
  const requireValue = (flag: string, i: number): string => {
    const v = argv[i + 1]
    if (v === undefined) {
      process.stderr.write(`lslvm-coverage: ${flag} requires a value\n${USAGE}`)
      process.exit(2)
    }
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--output' || a === '-o') {
      opts.outputDir = requireValue(a, i)
      i++
    } else if (a === '--dump-dir') {
      opts.dumpDir = requireValue(a, i)
      i++
    } else if (a === '--keep-dumps') opts.keepDumps = true
    else if (a === '--silent') opts.silent = true
    else if (a === '--include-fixtures' || a === '--include-inline') opts.includeFixtures = true
    else if (a === '-h' || a === '--help') {
      process.stdout.write(USAGE)
      process.exit(0)
    } else {
      process.stderr.write(`unknown argument: ${a}\n${USAGE}`)
      process.exit(2)
    }
  }
  return opts
}

const USAGE = `Usage: lslvm-coverage [options]

  Render LSL coverage artifacts from per-worker JSON dumps left behind by
  a test run that ran under LSL_COVERAGE=1.

Options:
  -o, --output <dir>      Output directory (default: coverage/lsl)
      --dump-dir <dir>    Where to look for *.json dumps
                          (default: $LSL_COVERAGE_DIR or .lslvm-coverage)
      --keep-dumps        Don't delete dumps after rendering
      --include-fixtures  Include reports for synthetic filenames
                          ("<inline>", names without a path, or paths that
                          don't exist on disk). Off by default — fixtures
                          are usually throwaway test scripts.
      --silent            Suppress the console summary
  -h, --help              Show this help

Workflow:
  LSL_COVERAGE=1 pnpm test
  pnpm exec lslvm-coverage
`

function readDumps(dumpDir: string): CoverageReport[] {
  if (!fs.existsSync(dumpDir)) return []
  const out: CoverageReport[] = []
  for (const name of fs.readdirSync(dumpDir)) {
    if (!name.endsWith('.json')) continue
    const full = path.join(dumpDir, name)
    try {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8')) as CoverageReport[]
      for (const r of parsed) out.push(r)
    } catch (e) {
      process.stderr.write(`lslvm-coverage: skipping malformed dump ${full}: ${(e as Error).message}\n`)
    }
  }
  return out
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))

  const dumps = readDumps(opts.dumpDir)
  if (dumps.length === 0) {
    process.stderr.write(
      `lslvm-coverage: no dumps found in ${opts.dumpDir}.\n` +
        '  Did you run your tests with LSL_COVERAGE=1?\n',
    )
    process.exit(1)
  }

  const merged = aggregateReports(dumps, { includeFixtures: opts.includeFixtures })
  if (merged.length === 0) {
    const hint = opts.includeFixtures
      ? '\n'
      : '\n  All collected reports look like test fixtures (no real on-disk path).\n' +
        '  Re-run with --include-fixtures to keep them.\n'
    process.stderr.write(`lslvm-coverage: no coverable scripts after filtering.${hint}`)
    process.exit(1)
  }

  fs.mkdirSync(opts.outputDir, { recursive: true })
  const lcovPath = path.join(opts.outputDir, 'lcov.info')
  const istanbulPath = path.join(opts.outputDir, 'coverage-final.json')
  const summaryPath = path.join(opts.outputDir, 'coverage-summary.json')
  const htmlDir = path.join(opts.outputDir, 'html')
  fs.writeFileSync(lcovPath, renderLcov(merged))
  fs.writeFileSync(istanbulPath, JSON.stringify(renderIstanbul(merged), null, 2))
  fs.writeFileSync(summaryPath, JSON.stringify(renderSummary(merged), null, 2))
  fs.mkdirSync(htmlDir, { recursive: true })
  for (const [name, content] of renderHtml(merged)) {
    fs.writeFileSync(path.join(htmlDir, name), content)
  }

  if (!opts.silent) {
    process.stdout.write('\n' + renderConsoleSummary(merged))
    process.stdout.write(
      `\nWrote ${lcovPath}\nWrote ${istanbulPath}\nWrote ${summaryPath}\nWrote ${path.join(htmlDir, 'index.html')}\n`,
    )
  }

  if (!opts.keepDumps) {
    for (const name of fs.readdirSync(opts.dumpDir)) {
      if (name.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(opts.dumpDir, name))
        } catch {
          /* ignore */
        }
      }
    }
  }
}

main()
