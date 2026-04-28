import { describe, it, expect } from 'vitest'
import { coerce, stringify } from '../src/values/coerce.js'
import {
  formatFloat,
  formatVector,
  formatRotation,
  formatList,
  formatListElement,
} from '../src/values/format.js'
import { ZERO_VECTOR, ZERO_ROTATION, vec, rot } from '../src/values/types.js'
import type { EvalResult } from '../src/values/types.js'

const I = (value: number): EvalResult => ({ type: 'integer', value })
const F = (value: number): EvalResult => ({ type: 'float', value })
const S = (value: string): EvalResult => ({ type: 'string', value })
const K = (value: string): EvalResult => ({ type: 'key', value })
const V = (x: number, y: number, z: number): EvalResult => ({ type: 'vector', value: vec(x, y, z) })
const R = (x: number, y: number, z: number, s: number): EvalResult => ({
  type: 'rotation',
  value: rot(x, y, z, s),
})
const L = (value: ReadonlyArray<unknown>): EvalResult => ({
  type: 'list',
  value: value as EvalResult['value'],
})

describe('coerce — string → integer', () => {
  it('parses signed decimals and trims leading whitespace', () => {
    expect(coerce(S('  -42abc'), 'integer').value).toBe(-42)
    expect(coerce(S('+7'), 'integer').value).toBe(7)
    expect(coerce(S('   '), 'integer').value).toBe(0)
    expect(coerce(S(''), 'integer').value).toBe(0)
  })

  it('parses hex with the 0x / 0X prefix', () => {
    expect(coerce(S('0xFF'), 'integer').value).toBe(255)
    expect(coerce(S('-0x10'), 'integer').value).toBe(-16)
    // Bare prefix with no hex digits → 0.
    expect(coerce(S('0x'), 'integer').value).toBe(0)
  })

  it('truncates floats toward zero and clamps non-finite to 0', () => {
    expect(coerce(F(3.9), 'integer').value).toBe(3)
    expect(coerce(F(-3.9), 'integer').value).toBe(-3)
    expect(coerce(F(Number.POSITIVE_INFINITY), 'integer').value).toBe(0)
    expect(coerce(F(Number.NaN), 'integer').value).toBe(0)
  })
})

describe('coerce — string → float', () => {
  it('parses decimals, signs, and exponents', () => {
    expect(coerce(S('  -1.5e2 trailing'), 'float').value).toBe(-150)
    expect(coerce(S('+.25'), 'float').value).toBe(0.25)
    expect(coerce(S('not a number'), 'float').value).toBe(0)
  })
})

describe('coerce — string → vector / rotation', () => {
  it('parses well-formed <x,y,z> and falls back to ZERO_VECTOR on garbage', () => {
    expect(coerce(S('<1, 2, 3>'), 'vector').value).toEqual({ x: 1, y: 2, z: 3 })
    expect(coerce(S('not a vector'), 'vector').value).toBe(ZERO_VECTOR)
  })

  it('parses well-formed <x,y,z,s> and falls back to ZERO_ROTATION on garbage', () => {
    expect(coerce(S('<0, 0, 0, 1>'), 'rotation').value).toEqual({ x: 0, y: 0, z: 0, s: 1 })
    expect(coerce(S('<bad>'), 'rotation').value).toBe(ZERO_ROTATION)
  })
})

describe('coerce — list and key', () => {
  it('wraps single values into a one-element list', () => {
    expect(coerce(I(42), 'list').value).toEqual([42])
    expect(coerce(S('hi'), 'list').value).toEqual(['hi'])
  })

  it('list → list is identity', () => {
    const list = L([1, 2, 3])
    const result = coerce(list, 'list')
    expect(result.value).toBe(list.value)
  })

  it('string ↔ key', () => {
    expect(coerce(S('uuid-here'), 'key').value).toBe('uuid-here')
    expect(coerce(K('uuid-here'), 'string').value).toBe('uuid-here')
  })

  it('rejects illegal coercions', () => {
    expect(() => coerce(V(0, 0, 0), 'integer')).toThrow(/cannot coerce vector to integer/)
    expect(() => coerce(L([]), 'float')).toThrow(/cannot coerce list to float/)
    expect(() => coerce(I(0), 'void')).toThrow(/cannot coerce to void/)
  })
})

describe('stringify — every LSL type', () => {
  it('formats each LSL type the way (string)x would', () => {
    expect(stringify(I(42))).toBe('42')
    expect(stringify(F(1.5))).toBe('1.500000')
    expect(stringify(S('hi'))).toBe('hi')
    expect(stringify(K('a-uuid'))).toBe('a-uuid')
    expect(stringify(V(1, 2, 3))).toBe('<1.000000, 2.000000, 3.000000>')
    expect(stringify(R(0, 0, 0, 1))).toBe('<0.000000, 0.000000, 0.000000, 1.000000>')
    expect(stringify(L([1, 'a', vec(1, 2, 3)]))).toBe('1a<1.000000, 2.000000, 3.000000>')
    expect(stringify({ type: 'void', value: undefined } as unknown as EvalResult)).toBe('')
  })
})

describe('format — float, vector, rotation, list', () => {
  it('formatFloat renders nan / inf / -inf and fixes 6 decimals', () => {
    expect(formatFloat(Number.NaN)).toBe('nan')
    expect(formatFloat(Number.POSITIVE_INFINITY)).toBe('inf')
    expect(formatFloat(Number.NEGATIVE_INFINITY)).toBe('-inf')
    expect(formatFloat(0)).toBe('0.000000')
    expect(formatFloat(-1.25)).toBe('-1.250000')
  })

  it('formatVector / formatRotation use formatFloat for components', () => {
    expect(formatVector(vec(1, 2, 3))).toBe('<1.000000, 2.000000, 3.000000>')
    expect(formatRotation(rot(0, 0, 0, 1))).toBe('<0.000000, 0.000000, 0.000000, 1.000000>')
  })

  it('formatListElement handles strings, ints, floats, vectors, rotations, and nested lists', () => {
    expect(formatListElement('hi')).toBe('hi')
    expect(formatListElement(7)).toBe('7')
    expect(formatListElement(1.5)).toBe('1.500000')
    expect(formatListElement(vec(0, 1, 2))).toBe('<0.000000, 1.000000, 2.000000>')
    expect(formatListElement(rot(0, 0, 0, 1))).toBe('<0.000000, 0.000000, 0.000000, 1.000000>')
    // Nested list: elements concat with no separator (LSL behaviour).
    expect(formatListElement([1, 'x'])).toBe('1x')
  })

  it('formatList concatenates with no separator', () => {
    expect(formatList([])).toBe('')
    expect(formatList([1, 'a', 2.5])).toBe('1a2.500000')
  })
})
