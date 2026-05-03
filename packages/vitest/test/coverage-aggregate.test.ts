import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { parse } from '@rezless/parser'
import { Script } from '@rezless/vm'
import { aggregateReports } from '../src/coverage-aggregate.js'

function reportFor(source: string, filename: string) {
  const { script: ast } = parse(source, filename)
  const s = new Script(ast, { filename, source, coverage: true })
  s.start()
  return s.coverage!
}

/** Materialize a real .lsl file on disk so the existence check passes. */
function materialize(name: string, body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lslcov-agg-'))
  const full = path.join(dir, name)
  fs.writeFileSync(full, body)
  return full
}

describe('aggregateReports', () => {
  it('merges identical sources at the same on-disk filename', () => {
    const src = 'default { state_entry() { llSay(0, "hi"); } }'
    const file = materialize('x.lsl', src)
    const a = reportFor(src, file)
    const b = reportFor(src, file)
    const out = aggregateReports([a, b])
    expect(out).toHaveLength(1)
    expect(out[0]!.functions.find((f) => f.name === 'state_entry')!.hits).toBe(2)
  })

  it('keeps distinct sources at the same path as separate entries', () => {
    const fileA = materialize('x.lsl', 'default { state_entry() { llSay(0, "a"); } }')
    const fileB = materialize('x.lsl', 'default { state_entry() { llSay(0, "b"); } }')
    const a = reportFor('default { state_entry() { llSay(0, "a"); } }', fileA)
    const b = reportFor('default { state_entry() { llSay(0, "b"); } }', fileB)
    const out = aggregateReports([a, b])
    expect(out).toHaveLength(2)
  })

  it('filters synthetic filenames by default', () => {
    const inline = reportFor('default { state_entry() {} }', '<inline>')
    const noPath = reportFor('default { state_entry() {} }', 'a.lsl')
    const missing = reportFor('default { state_entry() {} }', '/nope/missing.lsl')
    const realFile = materialize('r.lsl', 'default { state_entry() {} }')
    const real = reportFor('default { state_entry() {} }', realFile)
    const out = aggregateReports([inline, noPath, missing, real])
    expect(out.map((r) => r.filename)).toEqual([realFile])
  })

  it('keeps fixtures when includeFixtures is set', () => {
    const a = reportFor('default { state_entry() {} }', '<inline>')
    const b = reportFor('default { state_entry() {} }', 'a.lsl')
    const out = aggregateReports([a, b], { includeFixtures: true })
    expect(out.map((r) => r.filename).sort()).toEqual(['<inline>', 'a.lsl'])
  })

  it('returns sorted output', () => {
    // Use one shared dir so a.lsl < b.lsl in the resulting paths.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lslcov-sort-'))
    const fa = path.join(dir, 'a.lsl')
    const fb = path.join(dir, 'b.lsl')
    fs.writeFileSync(fa, 'default { state_entry() {} }')
    fs.writeFileSync(fb, 'default { state_entry() {} }')
    const a = reportFor('default { state_entry() {} }', fb)
    const b = reportFor('default { state_entry() {} }', fa)
    const out = aggregateReports([a, b])
    expect(out.map((r) => r.filename)).toEqual([fa, fb])
  })

  it('accepts an empty input', () => {
    expect(aggregateReports([])).toEqual([])
  })
})
