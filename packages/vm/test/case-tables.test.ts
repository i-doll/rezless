import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCaseTables, INC_PATH, renderInc, renderTs, TS_PATH, UCD_PATH } from '../../../scripts/gen-case-tables.js'

const tables = buildCaseTables(readFileSync(UCD_PATH, 'utf8'))

describe('case tables generated from Unicode 2.1.5', () => {
  it('are what the generator writes, for the VM and for slua.wasm', () => {
    expect(readFileSync(TS_PATH, 'utf8')).toBe(renderTs(tables))
    expect(readFileSync(INC_PATH, 'utf8')).toBe(renderInc(tables))
  })

  it('cover the ranges SLua looks code points up in', () => {
    expect(tables.lowerLow).toHaveLength(0x24d0)
    expect(tables.upperLow).toHaveLength(0x24ea)
    expect(tables.lowerHigh).toHaveLength(0x10000 - 0xff21)
    expect(tables.upperHigh).toHaveLength(0x10000 - 0xff21)
  })

  it('leave the code points Mono does not map unchanged', () => {
    // Unicode 2.1.5 maps each of these; Mono's invariant culture does not.
    expect(tables.lowerLow[0x130]).toBe(0x130)
    expect(tables.upperLow[0x131]).toBe(0x131)
    expect(tables.upperLow[0x17f]).toBe(0x17f)
    expect(tables.lowerLow[0x1c5]).toBe(0x1c5)
    expect(tables.upperLow[0x1c5]).toBe(0x1c5)
    expect(tables.upperLow[0x3d0]).toBe(0x3d0)
    expect(tables.lowerLow[0x1f88]).toBe(0x1f88)
    expect(tables.upperLow[0x1f80]).toBe(0x1f80)
    expect(tables.lowerLow[0x1ffc]).toBe(0x1ffc)
    // Their neighbours keep Unicode's mappings.
    expect(tables.lowerLow[0x49]).toBe(0x69)
    expect(tables.lowerLow[0x1c4]).toBe(0x1c6)
    expect(tables.upperLow[0x1c6]).toBe(0x1c4)
    expect(tables.upperLow[0x3c2]).toBe(0x3a3)
    expect(tables.lowerLow[0x10a0]).toBe(0x10d0)
    expect(tables.lowerHigh[0xff21 - 0xff21]).toBe(0xff41)
  })
})
