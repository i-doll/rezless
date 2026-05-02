import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { parse } from '@lslvm/parser'
import { Script } from '@lslvm/vm'
import { LslCoverageReporter } from '../src/reporter.js'

function tmpdir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function freshReport(filename = '/tmp/x.lsl') {
  const source = `
    integer doubled(integer x) { return x * 2; }
    default {
      state_entry() {
        if (1) llSay(0, "yes"); else llSay(0, "no");
        llSay(0, (string)doubled(2));
      }
    }
  `
  const { script: ast } = parse(source, filename)
  const s = new Script(ast, { filename, source, coverage: true })
  s.start()
  return s.coverage!
}

describe('LslCoverageReporter', () => {
  const dumpDir = tmpdir('lslcov-dump-')
  const outputDir = tmpdir('lslcov-out-')
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
    fs.writeFileSync(path.join(dumpDir, 'pid-1.json'), JSON.stringify([freshReport()]))

    const reporter = new LslCoverageReporter({ outputDir, disableConsole: true })
    reporter.onTestRunEnd()

    const lcov = fs.readFileSync(path.join(outputDir, 'lcov.info'), 'utf8')
    expect(lcov).toMatch(/SF:\/tmp\/x\.lsl/)
    expect(lcov).toMatch(/FNDA:1,doubled/)
    expect(lcov).toMatch(/end_of_record/)

    const istanbul = JSON.parse(
      fs.readFileSync(path.join(outputDir, 'coverage-final.json'), 'utf8'),
    )
    expect(istanbul['/tmp/x.lsl']).toBeDefined()
    expect(istanbul['/tmp/x.lsl'].path).toBe('/tmp/x.lsl')
  })

  it('merges multiple worker dumps for the same file', () => {
    fs.writeFileSync(path.join(dumpDir, 'a.json'), JSON.stringify([freshReport()]))
    fs.writeFileSync(path.join(dumpDir, 'b.json'), JSON.stringify([freshReport()]))

    const reporter = new LslCoverageReporter({ outputDir, disableConsole: true })
    reporter.onTestRunEnd()

    const lcov = fs.readFileSync(path.join(outputDir, 'lcov.info'), 'utf8')
    // Both runs hit doubled() once → merged FNDA should be 2.
    expect(lcov).toMatch(/FNDA:2,doubled/)
  })

  it('reports "no coverage" when the dump dir is empty', () => {
    const reporter = new LslCoverageReporter({
      outputDir,
      disableConsole: true,
      disableLcov: true,
      disableIstanbul: true,
    })
    expect(() => reporter.onTestRunEnd()).not.toThrow()
    expect(fs.existsSync(path.join(outputDir, 'lcov.info'))).toBe(false)
  })

  it('clears stale dumps on init', () => {
    fs.writeFileSync(path.join(dumpDir, 'old.json'), '[]')
    const reporter = new LslCoverageReporter({ outputDir })
    reporter.onInit()
    expect(fs.readdirSync(dumpDir).length).toBe(0)
  })

  it('sets process.env.LSL_COVERAGE on construction', () => {
    const before = process.env['LSL_COVERAGE']
    delete process.env['LSL_COVERAGE']
    new LslCoverageReporter({ outputDir })
    expect(process.env['LSL_COVERAGE']).toBe('1')
    if (before === undefined) delete process.env['LSL_COVERAGE']
    else process.env['LSL_COVERAGE'] = before
  })
})
