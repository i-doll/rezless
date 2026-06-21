import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { parse } from '@rezless/parser'
import { Script } from '@rezless/vm'
import { LslCoverageReporter } from '../src/reporter.js'

function tmpdir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

const SAMPLE = `
  integer doubled(integer x) { return x * 2; }
  default {
    state_entry() {
      if (1) llSay(0, "yes"); else llSay(0, "no");
      llSay(0, (string)doubled(2));
    }
  }
`

let sampleFile: string

function freshReport(filename = sampleFile) {
  const { script: ast } = parse(SAMPLE, filename)
  const s = new Script(ast, { filename, source: SAMPLE, coverage: true })
  s.start()
  return s.coverage!
}

describe('LslCoverageReporter', () => {
  const dumpDir = tmpdir('lslcov-dump-')
  const outputDir = tmpdir('lslcov-out-')
  const sampleDir = tmpdir('lslcov-sample-')
  sampleFile = path.join(sampleDir, 'x.lsl')
  fs.writeFileSync(sampleFile, SAMPLE)
  const previousDumpEnv = process.env['LSL_COVERAGE_DIR']

  beforeEach(() => {
    process.env['LSL_COVERAGE_DIR'] = dumpDir
    fs.rmSync(dumpDir, { recursive: true, force: true })
    fs.rmSync(outputDir, { recursive: true, force: true })
    fs.mkdirSync(dumpDir, { recursive: true })
  })

  afterEach(() => {
    if (previousDumpEnv === undefined) delete process.env['LSL_COVERAGE_DIR']
    else process.env['LSL_COVERAGE_DIR'] = previousDumpEnv
  })

  it('reads worker dumps, writes lcov + istanbul, prints summary', () => {
    const reporter = new LslCoverageReporter({ mode: 'always', outputDir, disableConsole: true })
    reporter.onInit()
    fs.writeFileSync(path.join(dumpDir, 'pid-1.json'), JSON.stringify([freshReport()]))
    reporter.onTestRunEnd()

    const lcov = fs.readFileSync(path.join(outputDir, 'lcov.info'), 'utf8')
    // The reporter renders absolute filenames relative to cwd as POSIX paths.
    const relSample = path.relative(process.cwd(), sampleFile).split(path.sep).join('/')
    expect(lcov).toContain(`SF:${relSample}`)
    expect(lcov).toMatch(/FNDA:1,doubled/)
    expect(lcov).toMatch(/end_of_record/)

    const istanbul = JSON.parse(
      fs.readFileSync(path.join(outputDir, 'coverage-final.json'), 'utf8'),
    )
    expect(istanbul[sampleFile]).toBeDefined()
    expect(istanbul[sampleFile].path).toBe(sampleFile)
  })

  it('merges multiple worker dumps for the same file', () => {
    const reporter = new LslCoverageReporter({ mode: 'always', outputDir, disableConsole: true })
    reporter.onInit()
    fs.writeFileSync(path.join(dumpDir, 'a.json'), JSON.stringify([freshReport()]))
    fs.writeFileSync(path.join(dumpDir, 'b.json'), JSON.stringify([freshReport()]))
    reporter.onTestRunEnd()

    const lcov = fs.readFileSync(path.join(outputDir, 'lcov.info'), 'utf8')
    expect(lcov).toMatch(/FNDA:2,doubled/)
  })

  it('reports "no coverage" when the dump dir is empty', () => {
    const reporter = new LslCoverageReporter({
      mode: 'always',
      outputDir,
      disableConsole: true,
      disableLcov: true,
      disableIstanbul: true,
    })
    reporter.onInit()
    expect(() => reporter.onTestRunEnd()).not.toThrow()
    expect(fs.existsSync(path.join(outputDir, 'lcov.info'))).toBe(false)
  })

  it('clears stale dumps on init when active', () => {
    fs.writeFileSync(path.join(dumpDir, 'old.json'), '[]')
    const reporter = new LslCoverageReporter({ mode: 'always', outputDir })
    reporter.onInit()
    expect(fs.readdirSync(dumpDir).length).toBe(0)
  })

  it('sets LSL_COVERAGE on init only when activated', () => {
    const before = process.env['LSL_COVERAGE']
    delete process.env['LSL_COVERAGE']

    // mode: 'never' stays dormant.
    const dormant = new LslCoverageReporter({ mode: 'never', outputDir })
    dormant.onInit()
    expect(process.env['LSL_COVERAGE']).toBeUndefined()

    // mode: 'always' flips it on.
    const active = new LslCoverageReporter({ mode: 'always', outputDir })
    active.onInit()
    expect(process.env['LSL_COVERAGE']).toBe('1')

    if (before === undefined) delete process.env['LSL_COVERAGE']
    else process.env['LSL_COVERAGE'] = before
  })

  it('auto mode activates from vitest.config.coverage.enabled', () => {
    const before = process.env['LSL_COVERAGE']
    delete process.env['LSL_COVERAGE']

    const off = new LslCoverageReporter({ outputDir })
    off.onInit({ config: { coverage: { enabled: false } } })
    expect(process.env['LSL_COVERAGE']).toBeUndefined()

    const on = new LslCoverageReporter({ outputDir })
    on.onInit({ config: { coverage: { enabled: true } } })
    expect(process.env['LSL_COVERAGE']).toBe('1')

    if (before === undefined) delete process.env['LSL_COVERAGE']
    else process.env['LSL_COVERAGE'] = before
  })

  it('auto mode also activates from LSL_COVERAGE=1 when vitest coverage is off', () => {
    const before = process.env['LSL_COVERAGE']
    process.env['LSL_COVERAGE'] = '1'

    const r = new LslCoverageReporter({ outputDir, disableConsole: true })
    r.onInit({ config: { coverage: { enabled: false } } })
    fs.writeFileSync(path.join(dumpDir, 'd.json'), JSON.stringify([freshReport()]))
    r.onTestRunEnd()
    expect(fs.existsSync(path.join(outputDir, 'lcov.info'))).toBe(true)

    if (before === undefined) delete process.env['LSL_COVERAGE']
    else process.env['LSL_COVERAGE'] = before
  })
})
