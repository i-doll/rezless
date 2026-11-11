/**
 * The LSL conformance suite from secondlife/slua (tests/conformance/*.lsl,
 * checked by tests/LSL.test.cpp), ported to rezless. The scripts are vendored
 * unchanged under ./slua-conformance/fixtures; the expected values below are
 * the ones SLua's own harness checks.
 */
import { describe, it, expect } from 'vitest'
import { runConformance, runSource } from './slua-conformance/harness.js'
import type { Printed } from './slua-conformance/harness.js'

const int = (value: number): Printed => ({ type: 'integer', value })
const float = (value: number): Printed => ({ type: 'float', value })
const str = (value: string): Printed => ({ type: 'string', value })
const key = (value: string): Printed => ({ type: 'key', value })

/** Run `name` and require it to finish cleanly, printing exactly `expected`. */
function expectPrints(name: string, expected: ReadonlyArray<Printed>): void {
  const run = runConformance(name)
  expect(run.error).toBeNull()
  expect(run.printed).toEqual(expected)
}

/** Run a self-checking script: it crashes (and says FAILED) when a check fails. */
function expectPasses(name: string): void {
  const run = runConformance(name)
  expect(run.ownerSays.filter((s) => /FAILED/.test(s))).toEqual([])
  expect(run.error).toBeNull()
}

describe('SLua LSL conformance', () => {
  it('Cast', () => {
    expectPrints('cast.lsl', [
      str('5.000000hello!'),
      // Mono turns infinities and NaN into INT_MIN.
      str('-2147483648'),
      str('-2147483648'),
      str('-2147483648'),
    ])
  })

  it('PostPreIncrDecr', () => expectPasses('incr_decr.lsl'))

  it('LValue Assignment', () => {
    expectPrints('lval_to_lval.lsl', [2, 4, 4, 6, 2, 6, 2, 10, 10].map(float))
    expectPasses('lval_to_lval.lsl')
  })

  it('Builtin function calls', () => {
    expectPrints('builtin.lsl', [str('foobarbaz')])
  })

  it('Addition', () => {
    expectPrints('add.lsl', [float(3), str('foobar')])
  })

  it('List Compare', () => {
    expectPrints('list_compare.lsl', [2, -2, 3, 0, 1, 2].map(int))
  })

  it('Boolean And Or', () => {
    expectPrints('boolean_and_or.lsl', [0, 0, 0, 1, 1, 1].map(int))
  })

  it('List Concat', () => {
    expectPrints('list_concat.lsl', [str('123456'), str('123foobar'), str('foobar123')])
  })

  it('Vector Cast', () => {
    expectPrints('vector_cast.lsl', [
      str('<1.00000, 2.00000, 3.00000>'),
      // A vector in a list casts to string with six decimals.
      str('<1.000000, 2.000000, 3.000000>'),
    ])
  })

  it('Bitwise', () => {
    expectPrints('bitwise.lsl', [2, 0xffaaaaaa | 0, 0xf0, 2, 3, 6, 0xf].map(int))
  })

  it('Comparison Operators', () => {
    expectPrints('comparison.lsl', [1, 0, 1, 1, 0, 0, 1, 1, 1].map(int))
  })

  it('Self Assign Comparison', () => expectPasses('self_assign_comparison.lsl'))

  it('If Statement', () => {
    expectPrints('if.lsl', [str('yes'), str('no'), str('yes')])
  })

  it('For statement', () => {
    expectPrints('for.lsl', [0, 1, 2].map(int))
  })

  it('Do while statement', () => {
    expectPrints('do_while.lsl', [0, 1, 2].map(int))
  })

  it('While statement', () => {
    expectPrints('while.lsl', [1, 2].map(int))
  })

  it('Mandelbrot bench', () => {
    expectPrints('mandelbrot.lsl', [
      str('P4'),
      str('10 10'),
      str('0x00000100078007C03FC0FF803FC007C007800100'),
    ])
  })

  it('Jumps', () => {
    expectPrints('jump.lsl', [str('yay!'), str('2')])
  })

  it('Vectors', () => {
    expectPrints('vectors.lsl', [str('<1.00000, 2.00000, 3.00000>')])
  })

  it('Quaternions', () => {
    expectPrints('quaternions.lsl', [
      str('<1.00000, 2.00000, 3.00000, 4.00000>'),
      str('<1.00000, 2.00000, 3.00000, 4.00000>'),
      // Rotation math as Mono does it: float inputs, double intermediates,
      // one rounding to float per component.
      str('<1142.99400, -673.36550, 16626.49000>'),
      str('<8310.14800, 90363.16000, 43793.37000>'),
      str('<-222272.60000, 354210.60000, -293349.60000>'),
      str('<-655386.60000, 306964.60000, -699282.70000, -293248.40000>'),
      str('<-9382.83300, -9259.14200, -493.94460, 617.16670>'),
    ])
  })

  it('Accessors', () => {
    expectPrints('accessors.lsl', [str('3.000000'), str('4.000000')])
  })

  it('Mutate Accessors', () => {
    expectPrints('mutate_accessors.lsl', [
      str('5.000000'),
      str('<5.00000, 2.00000, 3.00000>'),
      str('8.000000'),
      str('<1.00000, 2.00000, 3.00000, 8.00000>'),
    ])
  })

  it('Accessor incr / decr', () => {
    expectPrints('coord_incr.lsl', [
      str('2.000000'),
      str('3.000000'),
      str('<2.00000, 2.00000, 4.00000>'),
      str('2.000000'),
      str('3.000000'),
      str('<2.00000, 2.00000, 4.00000>'),
    ])
  })

  it('Float precision', () => expectPasses('float_precision.lsl'))

  it('List operations', () => expectPasses('list_operations.lsl'))

  it('String operations', () => expectPasses('string_operations.lsl'))

  it('Unicode', () => expectPasses('unicode.lsl'))

  it('CheckSLHelpers', () => {
    expectPrints('check_sl_helpers.lsl', [
      int(2),
      str('str_as_key'),
      key('key_as_key'),
      { type: 'rotation', value: { x: 1, y: 2, z: 3, s: 4 } },
      int(1),
      int(0),
      int(1),
      int(0),
      int(1),
      int(0),
      key('00000000-0000-0000-0000-000000000001'),
      str('00000000-0000-0000-0000-000000000001'),
    ])
  })

  it('Conformance Test 1', () => {
    expectPrints('conformance1.lsl', [str('All tests passed')])
  })

  it('Constant Arithmetic Optimization', () => {
    expectPrints('constant_arithmetic.lsl', [
      // RHS constant: float operations
      float(7), float(2), float(20), float(2.5),
      // RHS constant: integer operations
      int(13), int(6), int(20), int(3), int(1),
      // LHS constant: float operations
      float(5), float(4),
      // LHS constant: integer operations
      int(10), int(3),
    ])
  })

  it('Conformance Test 2', () => {
    const run = runConformance('conformance2.lsl')
    expect(run.ownerSays.filter((s) => /FAILED/.test(s))).toEqual([])
    expect(run.error).toBeNull()
    expect(run.printed).toEqual([str('Test succeeded')])
    // default's state_entry moves straight to StateTest, which runs the tests.
    expect(run.script.currentState).toBe('StateTest')
  })

  // SLua's "Ares" tests serialize the script state at every print("yield")
  // and resume from the copy. rezless has no serialization to exercise, but
  // the scripts must still run to their success marker.
  describe.each(['simple_ares.lsl', 'ares_type.lsl', 'conformance2_yield.lsl'])('Ares: %s', (name) => {
    it('reaches "Test succeeded"', () => {
      const run = runConformance(name)
      expect(run.error).toBeNull()
      const said = run.printed.map((p) => p.value)
      expect(said.filter((v) => v !== 'yield' && v !== 'Test succeeded')).toEqual([])
      expect(said).toContain('Test succeeded')
    })
  })

  it('RK optimization issues', () => expectPasses('rk_issues.lsl'))

  it('Long lists', () => expectPasses('longlist.lsl'))

  it('Integer MulAssign Float Result Error', () => {
    const run = runConformance('mul_assign_error.lsl')
    expect(run.printed).toEqual([])
    expect(run.error).toMatch(/cannot take result of integer \*= float/)
  })

  it('Integer MulAssign Float Valid Contexts', () => expectPasses('mul_assign_valid.lsl'))

  it.each([
    'div_by_zero.lsl',
    'float_div_by_zero_var.lsl',
    'float_div_by_zero_k.lsl',
    'float_div_by_zero_k_rev.lsl',
    'vector_div_by_zero_k.lsl',
    'vector_div_by_zero_var.lsl',
    'zero_vector_div_by_zero.lsl',
    'inf_div_inf.lsl',
  ])('Division By Zero Error: %s', (name) => {
    const run = runConformance(name)
    expect(run.printed).toEqual([])
    expect(run.error).toMatch(/Math error/i)
  })

  // SLua's "Mono Strings" case checks its C++ case mapping directly; these
  // are the cases a JS string can carry (no truncated UTF-8 or NULs).
  it.each([
    ['\uffed', '\uffed', '\uffed'], // top of the BMP, no case
    ['\u{1034a}', '\u{1034a}', '\u{1034a}'], // four-byte UTF-8, no case
    ['Ü', 'ü', 'Ü'],
    ['ü', 'ü', 'Ü'],
    ['\uff21', '\uff41', '\uff21'], // fullwidth A
    ['\uff41', '\uff41', '\uff21'], // fullwidth a
  ])('Mono Strings: %j lowers to %j and uppers to %j', (input, lower, upper) => {
    const run = runSource(`default { state_entry() {
      print(llToLower(${JSON.stringify(input)}));
      print(llToUpper(${JSON.stringify(input)}));
    } }`)
    expect(run.error).toBeNull()
    expect(run.printed).toEqual([str(lower), str(upper)])
  })

  it.each(['nothing.lsl', 'many_strings_in_list.lsl'])('runs %s', (name) => {
    expect(runConformance(name).error).toBeNull()
  })
})
