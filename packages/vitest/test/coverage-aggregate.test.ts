import { describe, it, expect } from 'vitest'
import { parse } from '@lslvm/parser'
import { Script } from '@lslvm/vm'
import { aggregateReports } from '../src/coverage-aggregate.js'

function reportFor(source: string, filename: string) {
  const { script: ast } = parse(source, filename)
  const s = new Script(ast, { filename, source, coverage: true })
  s.start()
  return s.coverage!
}

describe('aggregateReports', () => {
  it('merges identical sources sharing a filename', () => {
    const src = 'default { state_entry() { llSay(0, "hi"); } }'
    const a = reportFor(src, '/x.lsl')
    const b = reportFor(src, '/x.lsl')
    const out = aggregateReports([a, b])
    expect(out).toHaveLength(1)
    expect(out[0]!.functions.find((f) => f.name === 'state_entry')!.hits).toBe(2)
  })

  it('keeps distinct sources separate even when filename matches', () => {
    const a = reportFor('default { state_entry() { llSay(0, "a"); } }', '<inline>')
    const b = reportFor('default { state_entry() { llSay(0, "b"); } }', '<inline>')
    // Includes inline so both survive; otherwise default filter skips them.
    const out = aggregateReports([a, b], { includeInline: true })
    expect(out).toHaveLength(2)
    // First keeps the original filename; second gets a #1 suffix.
    expect(out[0]!.filename).toBe('<inline>')
    expect(out[1]!.filename).toBe('<inline>#1')
  })

  it('filters <inline> by default', () => {
    const inline = reportFor('default { state_entry() {} }', '<inline>')
    const real = reportFor('default { state_entry() {} }', '/r.lsl')
    const out = aggregateReports([inline, real])
    expect(out.map((r) => r.filename)).toEqual(['/r.lsl'])
  })

  it('returns sorted output', () => {
    const a = reportFor('default { state_entry() {} }', '/b.lsl')
    const b = reportFor('default { state_entry() {} }', '/a.lsl')
    const out = aggregateReports([a, b])
    expect(out.map((r) => r.filename)).toEqual(['/a.lsl', '/b.lsl'])
  })

  it('accepts an empty input', () => {
    expect(aggregateReports([])).toEqual([])
  })
})
