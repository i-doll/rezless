#!/usr/bin/env node
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { CoverageReport } from '@lslvm/vm'
import { renderLcov } from './format/lcov.js'
import { renderIstanbul } from './format/istanbul.js'
import { renderConsoleSummary } from './format/console.js'
import { aggregateReports } from './coverage-aggregate.js'

interface Options {
  outputDir: string
  dumpDir: string
  keepDumps: boolean
  silent: boolean
  includeInline: boolean
}

function parseArgs(argv: ReadonlyArray<string>): Options {
  const opts: Options = {
    outputDir: path.join(process.cwd(), 'coverage', 'lsl'),
    dumpDir: process.env['LSL_COVERAGE_DIR'] ?? path.join(process.cwd(), '.lslvm-coverage'),
    keepDumps: false,
    silent: false,
    includeInline: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--output' || a === '-o') opts.outputDir = argv[++i]!
    else if (a === '--dump-dir') opts.dumpDir = argv[++i]!
    else if (a === '--keep-dumps') opts.keepDumps = true
    else if (a === '--silent') opts.silent = true
    else if (a === '--include-inline') opts.includeInline = true
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
      --include-inline    Include reports for inline-source scripts
                          (filename "<inline>"); off by default since these
                          are usually throwaway test fixtures
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

  const merged = aggregateReports(dumps, { includeInline: opts.includeInline })
  if (merged.length === 0) {
    const hint = opts.includeInline
      ? '\n'
      : '\n  All collected reports were inline-source fixtures.\n' +
        '  Re-run with --include-inline to keep them.\n'
    process.stderr.write(`lslvm-coverage: no coverable scripts after filtering.${hint}`)
    process.exit(1)
  }

  fs.mkdirSync(opts.outputDir, { recursive: true })
  const lcovPath = path.join(opts.outputDir, 'lcov.info')
  const istanbulPath = path.join(opts.outputDir, 'coverage-final.json')
  fs.writeFileSync(lcovPath, renderLcov(merged))
  fs.writeFileSync(istanbulPath, JSON.stringify(renderIstanbul(merged), null, 2))

  if (!opts.silent) {
    process.stdout.write('\n' + renderConsoleSummary(merged))
    process.stdout.write(`\nWrote ${lcovPath}\nWrote ${istanbulPath}\n`)
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
