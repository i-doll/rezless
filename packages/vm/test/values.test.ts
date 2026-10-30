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
import { typedList } from '../src/values/list-types.js'
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
    // In-world: a sign before hex is not accepted
    expect(coerce(S('-0x10'), 'integer').value).toBe(0)
    expect(coerce(S('0x10'), 'integer').value).toBe(16)
    expect(coerce(S('0X1a'), 'integer').value).toBe(26)
    // Bare prefix with no hex digits → 0.
    expect(coerce(S('0x'), 'integer').value).toBe(0)
  })

  it('saturates string-to-integer like strtoul into 32 bits', () => {
    // In-world: magnitudes over 4294967295 saturate; a leading '-' negates mod 2^32
    expect(coerce(S('99999999999'), 'integer').value).toBe(-1)
    expect(coerce(S('0x100000000'), 'integer').value).toBe(-1)
    expect(coerce(S('0xFFFFFFFF'), 'integer').value).toBe(-1)
    expect(coerce(S('2147483648'), 'integer').value).toBe(-2147483648)
    expect(coerce(S('-2147483649'), 'integer').value).toBe(2147483647)
    expect(coerce(S('3000000000'), 'integer').value).toBe(-1294967296)
    expect(coerce(S('  12abc'), 'integer').value).toBe(12)
  })

  it('saturates a negative magnitude over 4294967295 to -1', () => {
    // In-world: (integer)"-4294967296" = -1, (integer)"-3000000000" = 1294967296, (integer)"-0" = 0
    expect(coerce(S('-4294967296'), 'integer').value).toBe(-1)
    expect(coerce(S('-99999999999'), 'integer').value).toBe(-1)
    expect(coerce(S('-4294967295'), 'integer').value).toBe(1)
    expect(coerce(S('-3000000000'), 'integer').value).toBe(1294967296)
    expect(coerce(S('-0'), 'integer').value).toBe(0)
    expect(coerce(S(' -5'), 'integer').value).toBe(-5)
  })

  it('truncates floats toward zero; out of range and non-finite give -2147483648', () => {
    expect(coerce(F(3.9), 'integer').value).toBe(3)
    expect(coerce(F(-3.9), 'integer').value).toBe(-3)
    expect(coerce(F(2147483647), 'integer').value).toBe(2147483647)
    expect(coerce(F(1e10), 'integer').value).toBe(-2147483648)
    expect(coerce(F(Number.POSITIVE_INFINITY), 'integer').value).toBe(-2147483648)
    expect(coerce(F(Number.NaN), 'integer').value).toBe(-2147483648)
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
    expect(stringify(V(1, 2, 3))).toBe('<1.00000, 2.00000, 3.00000>')
    expect(stringify(R(0, 0, 0, 1))).toBe('<0.00000, 0.00000, 0.00000, 1.00000>')
    expect(stringify(L([1, 'a', vec(1, 2, 3)]))).toBe('1a<1.000000, 2.000000, 3.000000>')
    expect(stringify({ type: 'void', value: undefined } as unknown as EvalResult)).toBe('')
  })
})

describe('format — float, vector, rotation, list', () => {
  it('formatFloat renders NaN / Infinity / -Infinity and fixes 6 decimals', () => {
    expect(formatFloat(Number.NaN)).toBe('NaN')
    expect(formatFloat(Number.POSITIVE_INFINITY)).toBe('Infinity')
    expect(formatFloat(Number.NEGATIVE_INFINITY)).toBe('-Infinity')
    expect(formatFloat(0)).toBe('0.000000')
    expect(formatFloat(-1.25)).toBe('-1.250000')
  })

  it('formatVector / formatRotation use formatFloat for components', () => {
    expect(formatVector(vec(1, 2, 3))).toBe('<1.00000, 2.00000, 3.00000>')
    expect(formatRotation(rot(0, 0, 0, 1))).toBe('<0.00000, 0.00000, 0.00000, 1.00000>')
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

describe('format — 7 significant digits (measured in SL)', () => {
  it('rounds to 7 significant digits before fixing the decimals', () => {
    expect(formatFloat(Math.fround(123456789))).toBe('123456800.000000')
    expect(formatFloat(Math.fround(1e30))).toBe('1000000000000000000000000000000.000000')
    expect(formatFloat(Math.fround(-1e30))).toBe('-1000000000000000000000000000000.000000')
    expect(formatFloat(Math.fround(0.1))).toBe('0.100000')
  })

  it('keeps the sign of a negative zero', () => {
    expect(formatFloat(-0)).toBe('-0.000000')
    expect(formatVector(vec(-0, 0, 0))).toBe('<-0.00000, 0.00000, 0.00000>')
  })

  it('formatList uses recorded element types', () => {
    expect(formatList(typedList([2, 1, 2.5], ['float', 'integer', 'float']))).toBe('2.00000012.500000')
  })
})

describe('coerce — strtod-style string → float and vector', () => {
  it('reads hex floats, inf and nan, and an empty 0x prefix as 0', () => {
    expect(coerce(S('0x1p4'), 'float').value).toBe(16)
    expect(coerce(S('0X1.8P1'), 'float').value).toBe(3)
    expect(coerce(S('-Infinity'), 'float').value).toBe(-Infinity)
    expect(coerce(S('NaN'), 'float').value).toBeNaN()
    expect(coerce(S('0x'), 'float').value).toBe(0)
  })

  it('needs a < at the very start and ignores what follows the last component', () => {
    expect(coerce(S('<1, 2, 3>'), 'vector').value).toEqual({ x: 1, y: 2, z: 3 })
    expect(coerce(S('<1,2,3>junk'), 'vector').value).toEqual({ x: 1, y: 2, z: 3 })
    expect(coerce(S(' <1,2,3>'), 'vector').value).toBe(ZERO_VECTOR)
    expect(coerce(S('<1,x,3>'), 'vector').value).toBe(ZERO_VECTOR)
    expect(coerce(S('<1,2>'), 'vector').value).toBe(ZERO_VECTOR)
  })
})
