import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

async function evalFloat(expr: string): Promise<number> {
  const s = await run(`float out = 0; default { state_entry() { out = ${expr}; } }`)
  return s.global('out') as number
}

async function evalInt(expr: string): Promise<number> {
  const s = await run(`integer out = 0; default { state_entry() { out = ${expr}; } }`)
  return s.global('out') as number
}

describe('llListStatistics', () => {
  // In-world: llListStatistics(LIST_STAT_SUM, [1, 2.5, "3", "x"]) = 3.5
  it('sums numbers and ignores strings', async () => {
    expect(await evalFloat('llListStatistics(LIST_STAT_SUM, [1, 2.5, "3", "x"])')).toBe(3.5)
  })

  // In-world: llListStatistics(LIST_STAT_MEDIAN, [3,1,2,4]) = 2.5
  it('median of an even-length list is the mean of the middle pair', async () => {
    expect(await evalFloat('llListStatistics(LIST_STAT_MEDIAN, [3,1,2,4])')).toBe(2.5)
  })

  // In-world: llListStatistics(LIST_STAT_NUM_COUNT, [1, "2", 3.0]) = 2.0
  it('counts only numeric elements', async () => {
    expect(await evalFloat('llListStatistics(LIST_STAT_NUM_COUNT, [1, "2", 3.0])')).toBe(2)
  })

  // Unmeasured: the remaining operations over [5, 1, 2, 7].
  it.each([
    ['LIST_STAT_RANGE', 6],
    ['LIST_STAT_MIN', 1],
    ['LIST_STAT_MAX', 7],
    ['LIST_STAT_MEAN', 3.75],
    ['LIST_STAT_MEDIAN', 3.5],
    ['LIST_STAT_SUM_SQUARES', 79],
    ['LIST_STAT_GEOMETRIC_MEAN', Math.pow(1 * 2 * 5 * 7, 1 / 4)],
  ])('%s', async (op, expected) => {
    expect(await evalFloat(`llListStatistics(${op}, [5, 1, 2, 7])`)).toBeCloseTo(expected, 5)
  })

  // In-world: L = [1, 2.0, 3, 4, "x", 9.5] gives RANGE 8.5, MIN 1, MAX 9.5, MEAN 3.9, STD_DEV 3.324154,
  // SUM_SQUARES 120.25, GEOMETRIC_MEAN 2.962013
  it('mixed list with a string', async () => {
    const L = '[1, 2.0, 3, 4, "x", 9.5]'
    for (const [op, want] of [
      ['RANGE', 8.5],
      ['MIN', 1],
      ['MAX', 9.5],
      ['MEAN', 3.9],
      ['STD_DEV', 3.324154],
      ['SUM_SQUARES', 120.25],
      ['GEOMETRIC_MEAN', 2.962013],
    ] as const) {
      expect(await evalFloat(`llListStatistics(LIST_STAT_${op}, ${L})`)).toBeCloseTo(want, 5)
    }
    expect(await evalFloat('llListStatistics(LIST_STAT_MEDIAN, [5,1,3])')).toBe(3)
  })

  // In-world: llListStatistics(LIST_STAT_GEOMETRIC_MEAN, [2, -8]) = 0, [0, 4] = 0
  it('geometric mean is 0 when a number is negative or zero', async () => {
    expect(await evalFloat('llListStatistics(LIST_STAT_GEOMETRIC_MEAN, [2, -8])')).toBe(0)
    expect(await evalFloat('llListStatistics(LIST_STAT_GEOMETRIC_MEAN, [0, 4])')).toBe(0)
  })

  // In-world: STD_DEV is the sample deviation (3.324154 for the mixed list above).
  // Unmeasured: these inputs, and 0 for fewer than two numbers.
  it('sample standard deviation, and 0 for fewer than two numbers', async () => {
    expect(await evalFloat('llListStatistics(LIST_STAT_STD_DEV, [2, 4, 4, 4, 5, 5, 7, 9])')).toBeCloseTo(
      Math.sqrt(32 / 7),
      5,
    )
    expect(await evalFloat('llListStatistics(LIST_STAT_STD_DEV, [2])')).toBe(0)
  })

  // Unmeasured
  it('a non-numeric list gives 0', async () => {
    expect(await evalFloat('llListStatistics(LIST_STAT_MEAN, ["a"])')).toBe(0)
  })

  // In-world: empty lists and an unknown operation give 0.
  it('an empty list gives 0, as does an unknown operation', async () => {
    expect(await evalFloat('llListStatistics(LIST_STAT_MAX, [])')).toBe(0)
    expect(await evalFloat('llListStatistics(99, [1, 2])')).toBe(0)
  })
})

describe('llListFindListNext', () => {
  // In-world: llListFindListNext([1,2,1,2], [1], 1) = 2
  it('returns the instance-th match, counting from 0', async () => {
    expect(await evalInt('llListFindListNext([1,2,1,2], [1], 1)')).toBe(2)
  })

  // In-world values, F = [1,2,1,2,1]; a search that runs past the last match returns length(src).
  it.each([
    ['F, [1], -1', 4],
    ['F, [1], -2', 2],
    ['F, [1], -3', 0],
    ['F, [1], -4', 5],
    ['F, [1], -5', 5],
    ['F, [1], 3', 5],
    ['F, [1], 4', 5],
    ['F, [1], 5', 5],
    ['F, [1], 10', 5],
    ['[1,2,1], [1], 5', 3],
    ['F, [2], 2', -1],
    ['F, [1,2], 1', 2],
    ['[7,8], [1], 0', -1],
    ['[7,8], [1], 3', -1],
    ['[7,8,9], [1], -1', -1],
    ['F, [], 0', 0],
    ['F, [], 1', 1],
    ['F, [], 5', 5],
    ['F, [], 6', 5],
    ['F, [], -1', 4],
    ['[], [], 0', -1],
  ])('llListFindListNext(%s) is %d', async (args, want) => {
    const s = await run(`integer out = 0; default { state_entry() { list F = [1,2,1,2,1]; out = llListFindListNext(${args}); } }`)
    expect(s.global('out')).toBe(want)
  })

  // Unmeasured
  it('does not match across element types', async () => {
    expect(await evalInt('llListFindListNext([1, "1", 1], ["1"], 0)')).toBe(1)
  })
})

describe('llListFindStrided', () => {
  // In-world: llListFindStrided([0,1,0,1], [1], 0, -1, 2) = -1
  it('only matches starting at start + k * stride', async () => {
    expect(await evalInt('llListFindStrided([0,1,0,1], [1], 0, -1, 2)')).toBe(-1)
  })

  // Unmeasured
  it('finds the first match on a stride boundary', async () => {
    expect(await evalInt('llListFindStrided([0,1,0,1], [1], 1, -1, 2)')).toBe(1)
    expect(await evalInt('llListFindStrided([5,1,5,1,5], [5], 2, -1, 2)')).toBe(2)
  })

  // Unmeasured
  it('stops at end_index', async () => {
    expect(await evalInt('llListFindStrided([0,0,0,1], [1], 0, 2, 1)')).toBe(-1)
    expect(await evalInt('llListFindStrided([0,0,0,1], [1], 0, 3, 1)')).toBe(3)
  })

  // Unmeasured
  it('a stride below 1 acts as 1', async () => {
    expect(await evalInt('llListFindStrided([0,0,1], [1], 0, -1, 0)')).toBe(2)
  })
})
