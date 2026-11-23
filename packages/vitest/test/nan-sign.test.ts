import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlList2CSV
// https://wiki.secondlife.com/wiki/LlListStatistics
// https://wiki.secondlife.com/wiki/LSL_Operators
// In-world: SLua Tideland on Aditi (2026-11-24), five probe scripts compiled for Mono in a
// 0.5 m box made with object.create. Each printed its expressions with llList2CSV through
// llOwnerSay. P is (float)"nan", N is (float)"-nan" and inf is (float)"inf", all globals, so the
// compiler can't fold anything.
//
// Not covered yet: vector * rotation, rotation * rotation, division by a rotation and the ll
// rotation functions still use plain arithmetic, so the sign of a NaN through them can differ
// from Second Life.

const GLOBALS = 'float P; float N; float inf; float one = 1.0; float two = 2.0; float zero = 0.0;'
const INIT = 'P = (float)"nan"; N = (float)"-nan"; inf = (float)"inf";'

/** The llList2CSV of `exprs`, evaluated after `setup`. */
async function csv(exprs: string, setup = '') {
  const s = await loadScript({
    source: `${GLOBALS} default { state_entry() { ${INIT} ${setup} llSay(0, llList2CSV([${exprs}])); } }`,
  })
  s.start()
  return s.chat.filter((c) => c.channel === 0).map((c) => c.text)[0]
}

describe('the NaN sign through float arithmetic', () => {
  it('a NaN operand passes on with its sign', async () => {
    // In-world: N + one, one + N, N - one, one - N, N * two and two * N gave -nan, and the same
    // with P gave nan; N + 1, 1 + N, N - 1, 1 - N, N * 2 and 2 * N gave -nan, P - 1 and 1 - P nan.
    expect(await csv('N + one, one + N, N - one, one - N, N * two, two * N')).toBe('-nan, -nan, -nan, -nan, -nan, -nan')
    expect(await csv('P + one, one + P, P - one, one - P, P * two, two * P')).toBe('nan, nan, nan, nan, nan, nan')
    expect(await csv('N + 1, 1 + N, N - 1, 1 - N, N * 2, 2 * N, P - 1, 1 - P')).toBe('-nan, -nan, -nan, -nan, -nan, -nan, nan, nan')
  })

  it('two NaN operands give a negative NaN only when both are negative', async () => {
    // In-world: P + N, N + P, P - N, N - P, P * N and N * P gave nan; N + N, N - N and N * N
    // gave -nan, P + P, P - P and P * P nan, and N + P + N and N * N * P nan.
    expect(await csv('P + N, N + P, P - N, N - P, P * N, N * P')).toBe('nan, nan, nan, nan, nan, nan')
    expect(await csv('N + N, P + P, N - N, P - P, N * N, P * P, N + P + N, N * N * P')).toBe('-nan, nan, -nan, nan, -nan, nan, nan, nan')
  })

  it('a NaN made from two numbers is negative', async () => {
    // In-world: each of these gave -nan (ninf is a local set to -inf).
    expect(await csv('inf + -inf, (-inf) + inf, (-inf) - (-inf), zero * inf, inf * -zero, zero * -inf, ninf * zero, zero * ninf', 'float ninf = -inf;'))
      .toBe('-nan, -nan, -nan, -nan, -nan, -nan, -nan, -nan')
  })

  it('unary minus flips the sign', async () => {
    // In-world: -P gave -nan, -N nan, and - -N * one -nan.
    expect(await csv('-P, -N, - -N * one')).toBe('-nan, nan, -nan')
  })

  it('unary minus applies to the whole product after it', async () => {
    // In-world: SL's grammar binds - looser than *: -inf * zero gave nan, (-inf) * zero -nan,
    // -(inf * zero) nan, -one * N nan, (-one) * N -nan, -N * one nan, -P * one -nan,
    // -inf * -zero nan, -zero * inf nan, -1.0 * N, -1 * N and -2.0 * N nan, -(N) * one nan,
    // -N * one * one nan, -N * P -nan, -P * N -nan, -N * N nan and -inf * zero * one nan.
    // A sum still takes the negated product: -N + one and -N * one + one gave nan.
    expect(await csv('-inf * zero, (-inf) * zero, -(inf * zero), -one * N, (-one) * N, -N * one, -P * one, -inf * -zero, -zero * inf'))
      .toBe('nan, -nan, nan, nan, -nan, nan, -nan, nan, nan')
    expect(await csv('-1.0 * N, -1 * N, -2.0 * N, -(N) * one, -N * one * one, -N * P, -P * N, -N * N, -inf * zero * one'))
      .toBe('nan, nan, nan, nan, nan, -nan, -nan, nan, nan')
    expect(await csv('-N + one, -N - one, -N * one + one, one + -N * one, -zero * inf + one')).toBe('nan, nan, nan, nan, nan')
  })

  it('unary minus applies to the whole quotient after it, which shows for -2147483648', async () => {
    // In-world: with m = 0x80000000 and two = 2, -m / two, (-m) / two, -(m / two), -m / 2,
    // -m % two, -m * two and -m / -two gave 1073741824, -1073741824, 1073741824, 1073741824, 0, 0
    // and -1073741824.
    const s = await loadScript({
      source: `integer two = 2; integer m; default { state_entry() { m = 0x80000000;
        llSay(0, llList2CSV([-m / two, (-m) / two, -(m / two), -m / 2, -m % two, -m * two, -m / -two])); } }`,
    })
    s.start()
    expect(s.chat[0]?.text).toBe('1073741824, -1073741824, 1073741824, 1073741824, 0, 0, -1073741824')
  })

  it('unary minus binds looser than *, / and % for integers too', async () => {
    // In-world, with a = 8, b = 4, c = 2, d = 3, z = 0, five = 5 and m = 0x80000000: a / -b / c
    // gave -4, 10 * -d / c -10, !-z * five 1, ~-z * five -1, -m % d 2, -m * 1.0 2147483648.000000,
    // a - -b * c 16, a * -b + c -30, -a / b * c -4, !-z 1, ~-z * 1 -1, -b * c - a -16,
    // a % -d * c 2 and (float)a * -one / 2.0 -4.000000.
    const s = await loadScript({
      source: `integer a = 8; integer b = 4; integer c = 2; integer d = 3; integer z = 0; integer five = 5; integer m; float one = 1.0;
        default { state_entry() { m = 0x80000000;
          llSay(0, llList2CSV([a / -b / c, 10 * -d / c, !-z * five, ~-z * five, -m % d, -m * 1.0, a - -b * c, a * -b + c, -a / b * c]));
          llSay(0, llList2CSV([!-z, ~-z * 1, -b * c - a, a % -d * c, (float)a * -one / 2.0])); } }`,
    })
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual([
      '-4, -10, 1, -1, 2, 2147483648.000000, 16, -30, -4',
      '1, -1, -16, 2, -4.000000',
    ])
  })

  it('a vector divided by a float keeps the sign of each NaN', async () => {
    // In-world: <N, P, 1.0> / 2.0 gave <-nan, nan, 0.500000> and -<N, P, 1.0> / 2.0 <nan, -nan, -0.500000>.
    expect(await csv('<N, P, 1.0> / 2.0, -<N, P, 1.0> / 2.0')).toBe('<-nan, nan, 0.500000>, <nan, -nan, -0.500000>')
    // In-world: <1.0, 2.0, 3.0> / N gave <-nan, -nan, -nan> and no Math Error.
    expect(await csv('<1.0, 2.0, 3.0> / N')).toBe('<-nan, -nan, -nan>')
  })

  it('compound assignments and ++ and -- keep the sign', async () => {
    // In-world: N += one, P -= N, one -= N, N *= two, N++ and P-- gave -nan, nan, -nan, -nan, -nan, nan.
    expect(await csv('f, g, h, k, m, q', 'float f = N; f += one; float g = P; g -= N; float h = one; h -= N; float k = N; k *= two; float m = N; m++; float q = P; q--;'))
      .toBe('-nan, nan, -nan, -nan, -nan, nan')
  })

  it('vectors and rotations follow the same rules per component', async () => {
    // In-world, with V = <N, P, 1.0>, W = <P, N, 1.0>, R = <N, P, 0.0, 1.0> and S = <P, N, 0.0, 1.0>.
    const setup = 'vector V = <N, P, 1.0>; vector W = <P, N, 1.0>; rotation R = <N, P, 0.0, 1.0>; rotation S = <P, N, 0.0, 1.0>;'
    expect(await csv('-V, V * two, two * V, V * P, V + W, V - W, V * W', setup))
      .toBe('<nan, -nan, -1.000000>, <-nan, nan, 2.000000>, <-nan, nan, 2.000000>, <nan, nan, nan>, <nan, nan, 2.000000>, <nan, nan, 0.000000>, nan')
    expect(await csv('V * N, W * N, P * V', setup)).toBe('<-nan, nan, -nan>, <nan, -nan, -nan>, <nan, nan, nan>')
    expect(await csv('-R, R + S, R - S', setup))
      .toBe('<nan, -nan, -0.000000, -1.000000>, <nan, nan, 0.000000, 2.000000>, <nan, nan, 0.000000, 0.000000>')
    // In-world: -<N, P, 0.0> * one gave <nan, -nan, -0.000000>, -<N, P, 0.0> * <one, one, one>
    // -nan (the dot product is nan, then negated), and -N * <one, one, one> <nan, nan, nan>.
    expect(await csv('-<N, P, 0.0> * one, -<N, P, 0.0> * <one, one, one>, -N * <one, one, one>'))
      .toBe('<nan, -nan, -0.000000>, -nan, <nan, nan, nan>')
  })
})

describe('the NaN sign through casts and lists', () => {
  it('a string keeps the sign of its NaN', async () => {
    // In-world: these gave -nan, -nan, -nan, -nan, nan, -nan, nan and -inf.
    expect(await csv('(float)"-NaN", (float)" -nan", (float)"-nanx", (float)"-nan(12)", (float)"+nan", (float)"-Nan", (float)((string)N), (float)"-infinity"'))
      .toBe('-nan, -nan, -nan, -nan, nan, -nan, nan, -inf')
    // In-world: -nan, -nan, -nan, nan.
    expect(await csv('llList2Float(["-nan"], 0), llList2Float(["-NaN"], 0), llList2Float([N], 0), llList2Float(["nan"], 0)'))
      .toBe('-nan, -nan, -nan, nan')
    // In-world: <-nan, nan, -nan> and <-nan, nan, 0.000000, -nan>.
    expect(await csv('(vector)"<-nan, nan, -NaN>", (rotation)"<-nan, nan, 0, -nan>"'))
      .toBe('<-nan, nan, -nan>, <-nan, nan, 0.000000, -nan>')
    expect(await csv('v', 'vector v; integer i; for (i = 0; i < 3000; i++) v = (vector)"<-nan, -nan, -nan>";'))
      .toBe('<-nan, -nan, -nan>')
  })

  it('list functions keep the sign of the NaNs they copy', async () => {
    // In-world, with L = [N, P, one, N], the list below printed as these 24 values.
    expect(await csv('', 'list L = [N, P, one, N]; llSay(0, llList2CSV(llListSort(L, 1, TRUE) + llListSort(L, 1, FALSE) + llList2List(L, 0, 1) + llListReplaceList(L, [N], 1, 1) + llDeleteSubList(L, 0, 0) + llListInsertList(L, [N], 1) + llList2ListStrided(L, 0, -1, 2)));'))
      .toBe('-nan, 1.000000, nan, -nan, -nan, nan, 1.000000, -nan, -nan, nan, -nan, -nan, 1.000000, -nan, nan, 1.000000, -nan, -nan, -nan, nan, 1.000000, -nan, -nan, 1.000000')
    // In-world: llListSort([P, N]) gave [-nan, nan], llListSort([N, P]) [nan, -nan] and
    // llListSort([one, N, two]) [2.000000, -nan, 1.000000].
    expect(await csv('', 'llSay(0, llList2CSV(llListSort([P, N], 1, TRUE) + llListSort([N, P], 1, TRUE) + llListSort([one, N, two], 1, TRUE)));'))
      .toBe('-nan, nan, nan, -nan, 2.000000, -nan, 1.000000')
    // In-world: llList2Json(JSON_ARRAY, [N, P, <N, P, 0>]) and llList2Json(JSON_OBJECT, ["a", N]).
    expect(await csv('llList2Json(JSON_ARRAY, [N, P, <N, P, 0>]), llList2Json(JSON_OBJECT, ["a", N])'))
      .toBe('[-nan,nan,"<-nan, nan, 0.000000>"], {"a":-nan}')
  })

  it('a NaN keeps its sign through many list operations', async () => {
    // Not a measurement: this runs long enough for the JavaScript engine to optimise the list
    // code, which must not lose the sign either.
    const s = await loadScript({
      source: `${GLOBALS} default { state_entry() { ${INIT} list L; integer i; vector v; float f;
        for (i = 0; i < 3000; i++) {
          L = [N, one, N] + [N]; L = llListReplaceList(L, [N], 1, 1); L += N; L = llList2List(L, 1, -1);
          L = llListSort(L, 1, TRUE); L = llDeleteSubList(L, 0, 0); L = llListInsertList(L, [N, two], 0);
          v = <N, N, N> + <one, one, one>; f = llList2Float(L, 0) + one;
          L = L + [v, f] + llList2ListStrided(L, 0, -1, 1);
        }
        llSay(0, llList2CSV(L)); } }`,
    })
    s.start()
    expect(s.chat[0]?.text).toBe('-nan, 2.000000, -nan, -nan, -nan, <-nan, -nan, -nan>, -nan, -nan, 2.000000, -nan, -nan, -nan')
  })
})

describe('the NaN sign through the math functions', () => {
  it('llFabs and llSqrt', async () => {
    // In-world: llFabs(N) -nan, llFabs(P) nan, llSqrt(N) -nan, llSqrt(P) nan, llSqrt(-inf) -nan, llSqrt(-two) -nan.
    expect(await csv('llFabs(N), llFabs(P), llSqrt(N), llSqrt(P), llSqrt(-inf), llSqrt(-two)')).toBe('-nan, nan, -nan, nan, -nan, -nan')
  })

  it('llPow', async () => {
    // In-world: a NaN argument gives nan, even llPow(N, zero) and llPow(one, N); llPow(-two, 0.5) and
    // llPow(-8.0, one / 3.0) give -nan; llPow(one, inf) and llPow(-one, inf) nan; llPow(N, N) and
    // llPow(-two, N) nan.
    expect(await csv('llPow(N, two), llPow(P, two), llPow(two, N), llPow(two, P), llPow(N, zero), llPow(one, N), llPow(-two, 0.5), llPow(one, inf), llPow(-one, inf), llPow(-8.0, one / 3.0), llPow(N, N), llPow(-two, N)'))
      .toBe('nan, nan, nan, nan, nan, nan, -nan, nan, nan, -nan, nan, nan')
  })

  it('llSin, llCos and llTan pass a NaN on and give -nan for an infinity', async () => {
    // In-world: -nan, nan, -nan, nan, -nan, then -nan for each infinity.
    expect(await csv('llSin(N), llSin(P), llCos(N), llCos(P), llTan(N), llCos(inf), llCos(-inf), llSin(-inf), llTan(-inf)'))
      .toBe('-nan, nan, -nan, nan, -nan, -nan, -nan, -nan, -nan')
  })

  it('llAsin passes a NaN on; llAcos never does; out of range is nan', async () => {
    // In-world: llAsin(N) -nan, llAsin(P) nan, llAcos(N) nan, llAcos(P) nan, and nan for ±2.0.
    expect(await csv('llAsin(N), llAsin(P), llAcos(N), llAcos(P), llAsin(-two), llAcos(-two), llAsin(two), llAcos(two)'))
      .toBe('-nan, nan, nan, nan, nan, nan, nan, nan')
  })

  it('llAtan2', async () => {
    // In-world: llAtan2(N, one) -nan, (P, one) nan, (one, N) -nan, (one, P) nan, two infinities
    // nan, and (N, P) nan, (P, N) nan, (N, N) -nan.
    expect(await csv('llAtan2(N, one), llAtan2(P, one), llAtan2(one, N), llAtan2(one, P), llAtan2(inf, inf), llAtan2(-inf, inf), llAtan2(inf, -inf), llAtan2(-inf, -inf)'))
      .toBe('-nan, nan, -nan, nan, nan, nan, nan, nan')
    expect(await csv('llAtan2(N, P), llAtan2(P, N), llAtan2(N, N)')).toBe('nan, nan, -nan')
  })

  it('llLog, llLog10 and llFrand', async () => {
    // In-world: llLog(N) and llLog10(N) 0.000000; llFrand(N) -nan and llFrand(P) nan.
    expect(await csv('llLog(N), llLog10(N), llFrand(N), llFrand(P)')).toBe('0.000000, 0.000000, -nan, nan')
  })

  it('llVecMag, llVecNorm and llVecDist', async () => {
    // In-world: -nan, nan, two zero vectors, -nan, nan.
    expect(await csv('llVecMag(<N, 0, 0>), llVecMag(<P, 0, 0>), llVecNorm(<N, 0, 0>), llVecNorm(<P, 0, 0>), llVecDist(<N, 0, 0>, ZERO_VECTOR), llVecDist(<P, 0, 0>, ZERO_VECTOR)'))
      .toBe('-nan, nan, <0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, -nan, nan')
    // In-world: two NaNs follow the arithmetic rule: llVecMag(<P, N, 0>) nan, (<N, P, 0>) nan,
    // (<N, N, 0>) -nan, llVecDist(<P, 0, 0>, <N, 0, 0>) nan and the other way round nan;
    // llVecDist(<inf, 0, 0>, <inf, 0, 0>) -nan, llVecMag(<inf, 0, 0>) inf and
    // llVecNorm(<inf, 0, 0>) <-nan, 0.000000, 0.000000>.
    expect(await csv('llVecMag(<P, N, 0>), llVecMag(<N, P, 0>), llVecMag(<N, N, 0>), llVecDist(<P, 0, 0>, <N, 0, 0>), llVecDist(<N, 0, 0>, <P, 0, 0>), llVecDist(<inf, 0, 0>, <inf, 0, 0>), llVecMag(<inf, 0, 0>), llVecNorm(<inf, 0, 0>)'))
      .toBe('nan, nan, -nan, nan, nan, -nan, inf, <-nan, 0.000000, 0.000000>')
  })
})

describe('the NaN sign through llListStatistics', () => {
  const stat = (op: string, list: string) => `llListStatistics(LIST_STAT_${op}, [${list}])`

  it('sums take the sign of the first NaN', async () => {
    // In-world: SUM of [N, one], [one, N], [P, N], [N, P], [one, P, N] and [N, N, P] gave -nan,
    // -nan, nan, -nan, nan, -nan; MEAN of [N], [P, N] and [N, P] -nan, nan, -nan; SUM_SQUARES of
    // [N], [P, N] and [N, P] -nan, nan, -nan.
    expect(await csv([stat('SUM', 'N, one'), stat('SUM', 'one, N'), stat('SUM', 'P, N'), stat('SUM', 'N, P'), stat('SUM', 'one, P, N'), stat('SUM', 'N, N, P')].join(', ')))
      .toBe('-nan, -nan, nan, -nan, nan, -nan')
    expect(await csv([stat('MEAN', 'N'), stat('MEAN', 'P, N'), stat('MEAN', 'N, P'), stat('SUM_SQUARES', 'N'), stat('SUM_SQUARES', 'P, N'), stat('SUM_SQUARES', 'N, P')].join(', ')))
      .toBe('-nan, nan, -nan, -nan, nan, -nan')
  })

  it('standard deviation and geometric mean take the sign of the first NaN', async () => {
    // In-world: STD_DEV of [N, one], [P, one] and [one, N] gave -nan, nan, -nan; GEOMETRIC_MEAN of
    // [N], [P] and [one, N] -nan, nan, -nan.
    expect(await csv([stat('STD_DEV', 'N, one'), stat('STD_DEV', 'P, one'), stat('STD_DEV', 'one, N'), stat('GEOMETRIC_MEAN', 'N'), stat('GEOMETRIC_MEAN', 'P'), stat('GEOMETRIC_MEAN', 'one, N')].join(', ')))
      .toBe('-nan, nan, -nan, -nan, nan, -nan')
  })

  it('MIN and MAX keep a NaN that comes first and skip one that comes later', async () => {
    // In-world: MIN of [N, one] -nan, [one, N] 1.0, [one, N, zero] 0.0, [P, N] nan, [N, P] -nan;
    // MAX of [N, one] -nan, [one, N] 1.0, [P, N] nan, [N, P] -nan, [N, one, two] -nan.
    expect(await csv([stat('MIN', 'N, one'), stat('MIN', 'one, N'), stat('MIN', 'one, N, zero'), stat('MIN', 'P, N'), stat('MIN', 'N, P')].join(', ')))
      .toBe('-nan, 1.000000, 0.000000, nan, -nan')
    expect(await csv([stat('MAX', 'N, one'), stat('MAX', 'one, N'), stat('MAX', 'P, N'), stat('MAX', 'N, P'), stat('MAX', 'N, one, two')].join(', ')))
      .toBe('-nan, 1.000000, nan, -nan, -nan')
  })

  it('RANGE is MAX - MIN', async () => {
    // In-world: RANGE of [N] -nan, [N, one] -nan, [one, N] 0.0, [P, N] nan.
    expect(await csv([stat('RANGE', 'N'), stat('RANGE', 'N, one'), stat('RANGE', 'one, N'), stat('RANGE', 'P, N')].join(', ')))
      .toBe('-nan, -nan, 0.000000, nan')
  })

  it('MIN, MAX and RANGE of the two zeros take the first of equals', async () => {
    // In-world: RANGE of [zf, -zf] and [-zf, zf] 0.000000, MIN -0.000000 only for [-zf, zf], MAX
    // -0.000000 only for [-zf, zf] (zf = 0.0).
    expect(await csv(['RANGE', 'MIN', 'MAX'].flatMap((op) => [stat(op, 'zero, -zero'), stat(op, '-zero, zero')]).join(', ')))
      .toBe('0.000000, 0.000000, 0.000000, -0.000000, 0.000000, -0.000000')
  })

  it('a NaN made from two numbers is negative', async () => {
    // In-world: SUM of [inf, -inf] and [-inf, inf] -nan, MEAN of [inf, -inf] -nan, STD_DEV of
    // [inf, one] -nan, RANGE of [inf, -inf] inf.
    expect(await csv([stat('SUM', 'inf, -inf'), stat('SUM', '-inf, inf'), stat('MEAN', 'inf, -inf'), stat('STD_DEV', 'inf, one'), stat('RANGE', 'inf, -inf')].join(', ')))
      .toBe('-nan, -nan, -nan, -nan, inf')
  })

  it('MEDIAN', async () => {
    // In-world: MEDIAN of [N] -nan, [N, one, two] 1.0, [one, N, two] -nan, [P, N] -nan, [N, P] nan,
    // [3.0, N, 1.0, 2.0] -nan and [N, 3.0, 1.0, 2.0, 5.0] 2.0.
    expect(await csv([stat('MEDIAN', 'N'), stat('MEDIAN', 'N, one, two'), stat('MEDIAN', 'one, N, two'), stat('MEDIAN', 'P, N'), stat('MEDIAN', 'N, P'), stat('MEDIAN', '3.0, N, 1.0, 2.0'), stat('MEDIAN', 'N, 3.0, 1.0, 2.0, 5.0')].join(', ')))
      .toBe('-nan, 1.000000, -nan, -nan, nan, -nan, 2.000000')
  })

  // In-world: MEDIAN of [3.0, 1.0, N, 2.0, 5.0] gave -nan and of [2.0, P, N] -nan. The VM sorts
  // a list holding a NaN in another order than the simulator, so it picks 3.0 and nan.
  it.fails('MEDIAN of a longer list holding a NaN picks the element Second Life does', async () => {
    expect(await csv([stat('MEDIAN', '3.0, 1.0, N, 2.0, 5.0'), stat('MEDIAN', 'two, P, N')].join(', '))).toBe('-nan, -nan')
  })
})
