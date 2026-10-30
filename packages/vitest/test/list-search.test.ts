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

  // Unmeasured: the remaining operations follow the wiki definitions.
  it.each([
    ['LIST_STAT_RANGE', 6],
    ['LIST_STAT_MIN', 1],
    ['LIST_STAT_MAX', 7],
    ['LIST_STAT_MEAN', 3.75],
    ['LIST_STAT_MEDIAN', 3.5],
    ['LIST_STAT_SUM_SQUARES', 79],
    ['LIST_STAT_GEOMETRIC_MEAN', Math.pow(1 * 2 * 5 * 7, 1 / 4)],
  ])('%s (unmeasured)', async (op, expected) => {
    expect(await evalFloat(`llListStatistics(${op}, [5, 1, 2, 7])`)).toBeCloseTo(expected, 5)
  })

  // Unmeasured
  it('sample standard deviation, and 0 for fewer than two numbers', async () => {
    expect(await evalFloat('llListStatistics(LIST_STAT_STD_DEV, [2, 4, 4, 4, 5, 5, 7, 9])')).toBeCloseTo(
      Math.sqrt(32 / 7),
      5,
    )
    expect(await evalFloat('llListStatistics(LIST_STAT_STD_DEV, [2])')).toBe(0)
  })

  // Unmeasured
  it('an empty or non-numeric list gives 0, as does an unknown operation', async () => {
    expect(await evalFloat('llListStatistics(LIST_STAT_MEAN, ["a"])')).toBe(0)
    expect(await evalFloat('llListStatistics(LIST_STAT_MAX, [])')).toBe(0)
    expect(await evalFloat('llListStatistics(99, [1, 2])')).toBe(0)
  })
})

describe('llListFindListNext', () => {
  // In-world: llListFindListNext([1,2,1,2], [1], 1) = 2
  it('returns the instance-th match, counting from 0', async () => {
    expect(await evalInt('llListFindListNext([1,2,1,2], [1], 1)')).toBe(2)
  })

  // Unmeasured
  it('returns -1 when there is no such instance', async () => {
    expect(await evalInt('llListFindListNext([1,2,1,2], [1], 2)')).toBe(-1)
  })

  // Unmeasured
  it('a negative instance counts from the last match', async () => {
    expect(await evalInt('llListFindListNext([1,2,1,2], [1], -1)')).toBe(2)
    expect(await evalInt('llListFindListNext([1,2,1,2], [1], -3)')).toBe(-1)
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
