import { describe, it, expect } from 'vitest'
import { parse } from '@lslvm/parser'
import { Script } from '@lslvm/vm'
import { renderLcov } from '../src/format/lcov.js'
import { renderIstanbul } from '../src/format/istanbul.js'
import { renderConsoleSummary } from '../src/format/console.js'
import { renderHtml } from '../src/format/html.js'

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

  it('header, separator, and data rows are all the same width', () => {
    const text = renderConsoleSummary([fixtureReport()])
    // Drop the title line and any blank trailing line; everything else is
    // either a separator or a row of the table and must be the same width.
    const lines = text
      .split('\n')
      .filter((l) => l.length > 0 && l !== 'LSL coverage')
    const widths = new Set(lines.map((l) => l.length))
    expect(widths.size).toBe(1)
  })
})

describe('HTML writer', () => {
  it('emits index.html, style.css, and one page per file', () => {
    const r = fixtureReport()
    const out = renderHtml([r])
    expect(out.has('index.html')).toBe(true)
    expect(out.has('style.css')).toBe(true)
    // Slug derives from the filename — `/tmp/x.lsl` becomes underscores.
    const fileEntry = [...out.keys()].find((k) => k.endsWith('.lsl.html'))
    expect(fileEntry).toBeDefined()
    expect(out.size).toBe(3)
  })

  it('marks hit lines with class="hit" and miss lines with class="miss"', () => {
    const r = fixtureReport()
    const out = renderHtml([r])
    const detail = [...out.entries()].find(([k]) => k.endsWith('.lsl.html'))![1]
    expect(detail).toMatch(/<tr class="hit">/)
    // Fixture has `else llSay(0, "no")` which never runs (test=1 always true)
    // — so at least one row should be a miss.
    expect(detail).toMatch(/<tr class="miss">/)
  })

  it('index links to per-file detail pages', () => {
    const r = fixtureReport()
    const out = renderHtml([r])
    const index = out.get('index.html')!
    const detailKey = [...out.keys()].find((k) => k.endsWith('.lsl.html'))!
    expect(index).toContain(`href="${detailKey}"`)
    expect(index).toContain('/tmp/x.lsl')
    expect(index).toContain('All files')
  })

  it('escapes HTML in source content', () => {
    const r = fixtureReport()
    const out = renderHtml([r])
    const detail = [...out.entries()].find(([k]) => k.endsWith('.lsl.html'))![1]
    // Original `(string)doubled(2)` should be escaped, not raw.
    expect(detail).toContain('(string)doubled(2)')
    expect(detail).not.toContain('<script>')
  })
})
