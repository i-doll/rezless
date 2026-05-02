import { describe, it, expect } from 'vitest'
import { parse } from '@lslvm/parser'
import { Script } from '@lslvm/vm'
import { renderLcov } from '../src/format/lcov.js'
import { renderIstanbul } from '../src/format/istanbul.js'
import { renderConsoleSummary } from '../src/format/console.js'

function load(source: string, filename = '/tmp/x.lsl'): Script {
  const { script: ast } = parse(source, filename)
  return new Script(ast, { filename, source, coverage: true })
}

const SAMPLE = `
integer doubled(integer x) { return x * 2; }
integer untouched(integer x) { return x + 1; }
default {
  state_entry() {
    if (1) llSay(0, "yes");
    else llSay(0, "no");
    llSay(0, (string)doubled(2));
  }
}
state idle {
  state_entry() {}
}
`

function fixtureReport() {
  const s = load(SAMPLE)
  s.start()
  return s.coverage!
}

describe('LCOV writer', () => {
  it('emits SF / FN / FNDA / DA / BRDA / end_of_record records', () => {
    const lcov = renderLcov([fixtureReport()])
    expect(lcov).toMatch(/^SF:\/tmp\/x\.lsl/m)
    expect(lcov).toMatch(/FN:\d+,doubled/)
    expect(lcov).toMatch(/FNDA:1,doubled/)
    expect(lcov).toMatch(/FNDA:0,untouched/)
    expect(lcov).toMatch(/^DA:\d+,\d+/m)
    expect(lcov).toMatch(/^BRDA:\d+,\d+,0,/m)
    expect(lcov).toMatch(/^BRDA:\d+,\d+,1,/m)
    expect(lcov).toMatch(/^FNF:\d+/m)
    expect(lcov).toMatch(/^FNH:\d+/m)
    expect(lcov).toMatch(/^LF:\d+/m)
    expect(lcov).toMatch(/^LH:\d+/m)
    expect(lcov).toMatch(/^end_of_record/m)
  })

  it('counts the if-true branch as taken and false as missed', () => {
    const lcov = renderLcov([fixtureReport()])
    // The fixture has a single `if (1) ...`, so the true branch is taken
    // (count > 0) and the false branch is missed (count = 0).
    const brda = lcov.split('\n').filter((l) => l.startsWith('BRDA:'))
    const taken = brda.filter((l) => /,0,[1-9]/.test(l))
    const missed = brda.filter((l) => /,1,0$/.test(l))
    expect(taken.length).toBeGreaterThan(0)
    expect(missed.length).toBeGreaterThan(0)
  })

  it('event handlers get state-qualified names', () => {
    const lcov = renderLcov([fixtureReport()])
    expect(lcov).toMatch(/FN:\d+,default::state_entry/)
    expect(lcov).toMatch(/FN:\d+,idle::state_entry/)
  })
})

describe('Istanbul writer', () => {
  it('produces a well-formed coverage object per file', () => {
    const out = renderIstanbul([fixtureReport()])
    const file = out['/tmp/x.lsl']!
    expect(file.path).toBe('/tmp/x.lsl')
    expect(Object.keys(file.statementMap).length).toBeGreaterThan(0)
    expect(Object.keys(file.fnMap).length).toBeGreaterThan(0)
    expect(Object.keys(file.branchMap).length).toBe(1) // one if
    // every entry in s/f/b matches an entry in *Map
    for (const k of Object.keys(file.s)) expect(file.statementMap[k]).toBeDefined()
    for (const k of Object.keys(file.f)) expect(file.fnMap[k]).toBeDefined()
    for (const k of Object.keys(file.b)) {
      expect(file.branchMap[k]).toBeDefined()
      expect(file.b[k]!.length).toBe(2)
    }
  })

  it('marks the untouched function with hits=0', () => {
    const out = renderIstanbul([fixtureReport()])
    const file = out['/tmp/x.lsl']!
    const untouched = Object.entries(file.fnMap).find(([, v]) => v.name === 'untouched')!
    const hits = file.f[untouched[0]]!
    expect(hits).toBe(0)
  })
})

describe('Console summary writer', () => {
  it('lists each file plus an "all files" total row', () => {
    const r = fixtureReport()
    const text = renderConsoleSummary([r])
    expect(text).toContain('LSL coverage')
    expect(text).toContain('/tmp/x.lsl')
    expect(text).toContain('all files')
    expect(text).toContain('Stmts')
    expect(text).toContain('Branch')
    expect(text).toContain('Fns')
    expect(text).toContain('States')
  })

  it('handles the empty case', () => {
    expect(renderConsoleSummary([])).toContain('No LSL coverage')
  })
})
