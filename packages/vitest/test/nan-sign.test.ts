import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlList2CSV
// https://wiki.secondlife.com/wiki/LlListStatistics
// https://wiki.secondlife.com/wiki/LSL_Operators
// In-world: SLua Tideland on Aditi (2026-11-24), six probe scripts compiled for Mono in a
// 0.5 m box made with object.create. Each printed its expressions with llList2CSV through
// llOwnerSay. P is (float)"nan", N is (float)"-nan" and inf is (float)"inf", all globals, so the
// compiler can't fold anything.


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

  it('a negated integer literal is negated after the product too', async () => {
    // In-world: -2147483648 / 2 gave 1073741824, -2147483648 * 1.0 2147483648.000000,
    // -2147483648 % 3 2 and (-2147483648) / 2 -1073741824.
    const s = await loadScript({ source: 'default { state_entry() { llSay(0, llList2CSV([-2147483648 / 2, -2147483648 * 1.0, -2147483648 % 3, (-2147483648) / 2])); } }' })
    s.start()
    expect(s.chat[0]?.text).toBe('1073741824, 2147483648.000000, 2, -1073741824')
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

  it('(list) of a float keeps its sign', async () => {
    // Not measured separately: a cast to list holds the float as it is.
    expect(await csv('', 'list B; integer i; for (i = 0; i < 3; i++) B += (list)N; llSay(0, llList2CSV((list)N + B));'))
      .toBe('-nan, -nan, -nan, -nan')
  })

  it('globals keep their NaN signs when the object is taken and rezzed again', async () => {
    // In-world: after a take and a rez from inventory, on_rez printed the same line as
    // state_entry had.
    const owner = '00000000-0000-0000-0000-0000000000aa'
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    world.addAvatar({ region: 'home', key: owner, username: 'owner' })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner, prims: [{ scripts: [{ name: 'a', source: { source: `
      float G; list GL; vector GV; rotation GR; float GP;
      default {
        state_entry() { G = (float)"-nan"; GP = (float)"nan"; GL = [G, GP]; GV = <G, GP, G>; GR = <G, 0.0, GP, G>; }
        on_rez(integer p) { llOwnerSay(llList2CSV([G, GP] + GL + [GV, GR])); } }` } }] }] })
    scripts['a']!.start()
    const copy = linkset.copy({ world, region: 'home', owner })
    for (const script of copy.allScripts()) script.queueRez()
    copy.advanceTime(0)
    expect(copy.allScripts()[0]!.chat.map((c) => c.text)).toEqual([
      '-nan, nan, -nan, nan, <-nan, nan, -nan>, <-nan, 0.000000, nan, -nan>',
    ])
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

  it('MEDIAN sorts with an insertion sort, so nothing moves past a NaN', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-24): MEDIAN of [3.0, 1.0, N, 2.0, 5.0] -nan,
    // [two, P, N] nan, [2.0, P, N] nan, [one, P, N] nan, [two, N, P] -nan, [P, two, N] 2.0 and
    // [P, N, two] -nan. Every one of 332 lists (all orders of 1, 2, N; 1, P, N; 1, 2, 3, N;
    // 1, 2, P, N; 1, 2, 3, 4, N and 1, 2, 3, P, N, and lists of 7 to 25 numbers with one NaN)
    // gave the median of an insertion sort on <.
    expect(await csv([stat('MEDIAN', '3.0, 1.0, N, 2.0, 5.0'), stat('MEDIAN', 'two, P, N'), stat('MEDIAN', '2.0, P, N'), stat('MEDIAN', 'one, P, N'), stat('MEDIAN', 'two, N, P'), stat('MEDIAN', 'P, two, N'), stat('MEDIAN', 'P, N, two')].join(', ')))
      .toBe('-nan, nan, nan, nan, -nan, 2.000000, -nan')
    // In-world: [1, 4, 2, N, 3] gave 4.0 (the 2 can't move past the NaN), [2, 3, N, 1, 4] -nan,
    // [1, 3, 4, 2, N] 3.0, [1, 2, 3, N, 4] 3.0 and [4, N, 1, 2, 3] 1.0.
    expect(await csv([stat('MEDIAN', '1.0, 4.0, 2.0, N, 3.0'), stat('MEDIAN', '2.0, 3.0, N, 1.0, 4.0'), stat('MEDIAN', '1.0, 3.0, 4.0, 2.0, N'), stat('MEDIAN', '1.0, 2.0, 3.0, N, 4.0'), stat('MEDIAN', '4.0, N, 1.0, 2.0, 3.0')].join(', ')))
      .toBe('4.000000, -nan, 3.000000, 3.000000, 1.000000')
  })

  it('MEDIAN of a list longer than 16 still sorts by insertion', async () => {
    // In-world: these 17 to 21 numbers with one NaN gave 6.0, 16.0 and 10.0.
    const list = (s: string) => [...s].map((c) => (c === 'N' ? 'N' : c === 'P' ? 'P' : `${parseInt(c, 36)}.0`)).join(', ')
    expect(await csv([stat('MEDIAN', list('7aPceb123496g85df')), stat('MEDIAN', list('6d9i3ha8g7c2N5f14eb')), stat('MEDIAN', list('N24b1fjdc59ih8ke637ga'))].join(', ')))
      .toBe('6.000000, 16.000000, 10.000000')
  })
})

describe('the NaN sign through rotations', () => {
  // In-world (Aditi, SLua Tideland, 2026-11-24), Mono. RN = <N, 0, 0, 1>, RP = <P, 0, 0, 1>,
  // RSN = <0, 0, 0, N>, RSP = <0, 0, 0, P>, RNP = <N, P, 0, 1>, RPN = <P, N, 0, 1>, RNN and RPP
  // all N or all P, Q = <0.1, 0.2, 0.3, 0.9>, V = <1, 2, 3>, VN = <N, 0, 0>, VP = <P, 0, 0>,
  // VNP = <N, P, 0>.
  const ROTS = `rotation RN = <N, 0.0, 0.0, 1.0>; rotation RP = <P, 0.0, 0.0, 1.0>;
    rotation RSN = <0.0, 0.0, 0.0, N>; rotation RSP = <0.0, 0.0, 0.0, P>;
    rotation RNP = <N, P, 0.0, 1.0>; rotation RPN = <P, N, 0.0, 1.0>;
    rotation RNN = <N, N, N, N>; rotation RPP = <P, P, P, P>; rotation Q = <0.1, 0.2, 0.3, 0.9>;
    vector V = <1.0, 2.0, 3.0>; vector VN = <N, 0.0, 0.0>; vector VP = <P, 0.0, 0.0>; vector VNP = <N, P, 0.0>;
    rotation RI = <inf, 0.0, 0.0, 1.0>; vector VI = <inf, 0.0, 0.0>;`
  const all = (sign: string, n: number) => `<${Array(n).fill(sign).join(', ')}>`

  it('a vector times a rotation follows the float rules in every term', async () => {
    // In-world: V * RN, V * RSN, VN * Q and VN * RN gave -nan in every part, V * RP, V * RSP, VP * Q
    // and VP * RP nan, and V * RNP, V * RPN, VNP * Q, VP * RN and VN * RP nan: two NaNs give -nan
    // only when both are negative.
    expect(await csv('V * RN, V * RP, V * RSN, V * RSP, V * RNP, V * RPN, VN * Q, VP * Q, VNP * Q, VN * ZERO_ROTATION, VP * RN, VN * RP, VN * RN, VP * RP', ROTS))
      .toBe([all('-nan', 3), all('nan', 3), all('-nan', 3), all('nan', 3), all('nan', 3), all('nan', 3), all('-nan', 3), all('nan', 3), all('nan', 3), all('-nan', 3), all('nan', 3), all('nan', 3), all('-nan', 3), all('nan', 3)].join(', '))
  })

  it('a rotation times a rotation follows the float rules in every term', async () => {
    // In-world: RN * Q, Q * RN, RSN * Q, Q * RSN and RN * RN gave -nan in every part; RP * Q, Q * RP,
    // RN * RP, RP * RN, RNP * RPN, RNN * RPP, RPP * RNN and RSN * RSP nan.
    expect(await csv('RN * Q, Q * RN, RP * Q, Q * RP, RSN * Q, Q * RSN, RN * RP, RP * RN, RN * RN, RNP * RPN, RNN * RPP, RPP * RNN, RSN * RSP', ROTS))
      .toBe([all('-nan', 4), all('-nan', 4), all('nan', 4), all('nan', 4), all('-nan', 4), all('-nan', 4), all('nan', 4), all('nan', 4), all('-nan', 4), all('nan', 4), all('nan', 4), all('nan', 4), all('nan', 4)].join(', '))
  })

  it('a division by a rotation inverts the divisor, then passes on the first NaN it meets', async () => {
    // In-world: dividing turns the divisor's x, y and z NaNs over, and each part of the result
    // takes the first NaN in an order of its own (the pair-by-pair table covers every order).
    // V / RN, V / RP, V / RSN, V / RSP, V / RNP, V / RPN:
    expect(await csv('V / RN, V / RP, V / RSN, V / RSP, V / RNP, V / RPN', ROTS))
      .toBe('<nan, nan, nan>, <-nan, -nan, -nan>, <-nan, -nan, -nan>, <nan, nan, nan>, <-nan, -nan, nan>, <nan, nan, -nan>')
    // VN / Q, VP / Q, VNP / Q, VP / RN, VN / RP, VN / RN:
    expect(await csv('VN / Q, VP / Q, VNP / Q, VP / RN, VN / RP, VN / RN', ROTS))
      .toBe('<-nan, -nan, -nan>, <nan, nan, nan>, <nan, -nan, -nan>, <nan, nan, nan>, <-nan, -nan, -nan>, <nan, -nan, -nan>')
    // RN / Q, Q / RN, RP / Q, Q / RP, RSN / Q, Q / RSN:
    expect(await csv('RN / Q, Q / RN, RP / Q, Q / RP, RSN / Q, Q / RSN', ROTS))
      .toBe([all('-nan', 4), all('nan', 4), all('nan', 4), all('-nan', 4), all('-nan', 4), all('-nan', 4)].join(', '))
    // RN / RP, RP / RN, RN / RN, RNP / RPN, RNN / RPP:
    expect(await csv('RN / RP, RP / RN, RN / RN, RNP / RPN, RNN / RPP', ROTS))
      .toBe('<-nan, -nan, -nan, -nan>, <nan, nan, nan, nan>, <nan, -nan, nan, -nan>, <-nan, -nan, -nan, -nan>, <-nan, -nan, -nan, nan>')
  })

  it('an infinity makes a negative NaN where it meets a zero', async () => {
    // In-world: V * RI, VI * Q, RI * Q, Q * RI, V / RI, Q / RI, VI * ZERO_ROTATION and VI / ZERO_ROTATION.
    expect(await csv('V * RI, VI * Q, RI * Q, Q * RI, V / RI, Q / RI, VI * ZERO_ROTATION, VI / ZERO_ROTATION', ROTS))
      .toBe('<-nan, -nan, -nan>, <-nan, inf, -nan>, <inf, inf, -inf, -inf>, <inf, -inf, inf, -inf>, <-nan, -nan, -nan>, <-inf, inf, -inf, inf>, <-nan, -nan, -nan>, <-nan, -nan, -nan>')
  })

  it('llRot2Fwd, llRot2Left and llRot2Up of a NaN rotation are the unturned axes', async () => {
    // In-world: llRot2Fwd(RN), llRot2Fwd(RP), llRot2Left(RN), llRot2Up(RN), llRot2Fwd(RSN) and
    // llRot2Fwd(RPP) gave the axes themselves; llRot2Fwd(RI) gave <1.000000, -nan, -nan>.
    expect(await csv('llRot2Fwd(RN), llRot2Fwd(RP), llRot2Left(RN), llRot2Up(RN), llRot2Fwd(RSN), llRot2Fwd(RPP), llRot2Fwd(RI)', ROTS))
      .toBe('<1.000000, 0.000000, 0.000000>, <1.000000, 0.000000, 0.000000>, <0.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 1.000000>, <1.000000, 0.000000, 0.000000>, <1.000000, 0.000000, 0.000000>, <1.000000, -nan, -nan>')
  })

  it('the other ll rotation functions read a NaN as no rotation', async () => {
    // In-world: every llRot2Euler below gave ZERO_VECTOR; llRot2Axis and llRot2Angle ZERO_VECTOR
    // and 0.0, except llRot2Angle(RI) PI; llAxisAngle2Rot, llRotBetween and llAxes2Rot
    // ZERO_ROTATION; llAngleBetween 0.0.
    const zv = '<0.000000, 0.000000, 0.000000>'
    const zr = '<0.000000, 0.000000, 0.000000, 1.000000>'
    expect(await csv('llRot2Euler(RN), llRot2Euler(RP), llRot2Euler(RSN), llRot2Euler(RNN), llRot2Euler(RPP), llRot2Euler(RI)', ROTS)).toBe(Array(6).fill(zv).join(', '))
    expect(await csv('llRot2Axis(RN), llRot2Axis(RP), llRot2Angle(RN), llRot2Angle(RP), llRot2Angle(RSN), llRot2Axis(RSN), llRot2Angle(RI)', ROTS))
      .toBe(`${zv}, ${zv}, 0.000000, 0.000000, 0.000000, ${zv}, 3.141593`)
    expect(await csv('llAxisAngle2Rot(<1.0, 0.0, 0.0>, N), llAxisAngle2Rot(<1.0, 0.0, 0.0>, P), llAxisAngle2Rot(VN, one), llAxisAngle2Rot(VP, one), llAxisAngle2Rot(<1.0, 0.0, 0.0>, inf)', ROTS))
      .toBe(Array(5).fill(zr).join(', '))
    expect(await csv('llRotBetween(VN, <1.0, 0.0, 0.0>), llRotBetween(<1.0, 0.0, 0.0>, VP), llRotBetween(VN, VP), llAngleBetween(RN, ZERO_ROTATION), llAngleBetween(ZERO_ROTATION, RP), llAngleBetween(RN, RP)', ROTS))
      .toBe(`${zr}, ${zr}, ${zr}, 0.000000, 0.000000, 0.000000`)
    expect(await csv('llAxes2Rot(VN, <0.0, 1.0, 0.0>, <0.0, 0.0, 1.0>), llAxes2Rot(VP, <0.0, 1.0, 0.0>, <0.0, 0.0, 1.0>), llAxes2Rot(<1.0, 0.0, 0.0>, <0.0, 1.0, 0.0>, <0.0, 0.0, N>)', ROTS))
      .toBe(Array(3).fill(zr).join(', '))
  })

  it('llEuler2Rot turns a NaN angle by the lowest step count', async () => {
    // In-world: llEuler2Rot(VN), (VP), (VNP), (<0, N, 0>) and (VI).
    expect(await csv('llEuler2Rot(VN), llEuler2Rot(VP), llEuler2Rot(VNP), llEuler2Rot(<0.0, N, 0.0>), llEuler2Rot(VI)', ROTS))
      .toBe('<0.217045, 0.000000, 0.000000, 0.976162>, <0.217045, 0.000000, 0.000000, 0.976162>, <0.211871, 0.211871, 0.047109, 0.952891>, <0.000000, 0.217045, 0.000000, 0.976162>, <0.217045, 0.000000, 0.000000, 0.976162>')
  })
})

describe('the NaN sign in SLua', () => {
  // In-world (Aditi, SLua Tideland, 2026-11-24): one SLua script printed each table with
  // ll.List2CSV through ll.OwnerSay. P is math.abs(0/0), N is -P and inf is math.huge.
  async function slua(exprs: string, setup = '') {
    const s = await loadScript({
      language: 'slua',
      source: `local P = math.abs(0/0)\nlocal N = -P\nlocal inf = math.huge\n${setup}\nll.OwnerSay(ll.List2CSV({${exprs}}))`,
    })
    s.start()
    return s.chat[0]?.text
  }

  it('Luau arithmetic passes on the first NaN', async () => {
    // In-world: P, N, tostring(P), tostring(N), 0/0, tostring(0/0), -(0/0) and P + N, N + P,
    // N + N, P * N, N * P, N * N, N + 1, 1 - N, inf - inf, 0 * inf, -inf + inf.
    expect(await slua('P, N, tostring(P), tostring(N), 0/0, tostring(0/0), -(0/0)')).toBe('nan, -nan, nan, nan, -nan, nan, nan')
    expect(await slua('P + N, N + P, N + N, P * N, N * P, N * N, N + 1, 1 - N, inf - inf, 0 * inf, -inf + inf'))
      .toBe('nan, -nan, -nan, nan, -nan, -nan, -nan, -nan, -nan, -nan, -nan')
  })

  it('the math functions give the same signs as Mono, except llSqrt of a negative number', async () => {
    // In-world: ll.Sqrt(-inf) and ll.Sqrt(-2) gave nan, where Mono gives -nan.
    expect(await slua('ll.Fabs(N), ll.Fabs(P), ll.Sqrt(N), ll.Sqrt(P), ll.Sqrt(-inf), ll.Sqrt(-2)')).toBe('-nan, nan, -nan, nan, nan, nan')
    expect(await slua('ll.Pow(N, 2), ll.Pow(P, 2), ll.Pow(2, N), ll.Pow(2, P), ll.Pow(N, 0), ll.Pow(1, N), ll.Pow(-2, 0.5), ll.Pow(1, inf), ll.Pow(-1, inf), ll.Pow(-8, 1/3), ll.Pow(N, N), ll.Pow(-2, N)'))
      .toBe('nan, nan, nan, nan, nan, nan, -nan, nan, nan, -nan, nan, nan')
    expect(await slua('ll.Sin(N), ll.Sin(P), ll.Cos(N), ll.Cos(P), ll.Tan(N), ll.Tan(P), ll.Cos(inf), ll.Cos(-inf), ll.Sin(-inf), ll.Tan(-inf)'))
      .toBe('-nan, nan, -nan, nan, -nan, nan, -nan, -nan, -nan, -nan')
    expect(await slua('ll.Atan2(N, 1), ll.Atan2(P, 1), ll.Atan2(1, N), ll.Atan2(1, P), ll.Atan2(inf, inf), ll.Atan2(-inf, inf), ll.Atan2(inf, -inf), ll.Atan2(-inf, -inf), ll.Atan2(N, P), ll.Atan2(P, N), ll.Atan2(N, N)'))
      .toBe('-nan, nan, -nan, nan, nan, nan, nan, nan, nan, nan, -nan')
    expect(await slua('ll.Log(N), ll.Log10(N), ll.Log(P), ll.Frand(N), ll.Frand(P)')).toBe('0, 0, 0, -nan, nan')
  })

  it('ll.Acos of a NaN is a positive NaN, as in Mono', async () => {
    // In-world: ll.Asin(N) -nan, ll.Asin(P) nan, ll.Acos(N) nan, ll.Acos(P) nan, and nan for ±2.
    expect(await slua('ll.Asin(N), ll.Asin(P), ll.Acos(N), ll.Acos(P), ll.Asin(-2), ll.Acos(-2), ll.Asin(2), ll.Acos(2)'))
      .toBe('-nan, nan, nan, nan, nan, nan, nan, nan')
  })

  it('the vector functions', async () => {
    // In-world: these two lines.
    expect(await slua('ll.VecMag(vector(N, 0, 0)), ll.VecMag(vector(P, 0, 0)), ll.VecNorm(vector(N, 0, 0)), ll.VecNorm(vector(P, 0, 0)), ll.VecDist(vector(N, 0, 0), vector(0, 0, 0)), ll.VecDist(vector(P, 0, 0), vector(0, 0, 0))'))
      .toBe('-nan, nan, <0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, -nan, nan')
    expect(await slua('ll.VecMag(vector(P, N, 0)), ll.VecMag(vector(N, P, 0)), ll.VecMag(vector(N, N, 0)), ll.VecDist(vector(P, 0, 0), vector(N, 0, 0)), ll.VecDist(vector(N, 0, 0), vector(P, 0, 0)), ll.VecDist(vector(inf, 0, 0), vector(inf, 0, 0)), ll.VecMag(vector(inf, 0, 0)), ll.VecNorm(vector(inf, 0, 0))'))
      .toBe('-nan, nan, -nan, nan, -nan, -nan, inf, <-nan, 0.000000, 0.000000>')
    // In-world: -V, V * 2, 2 * V, V + W, V - W, V * W and vector(1, 2, 3) / N with V = vector(N, P, 1), W = vector(P, N, 1).
    expect(await slua('-V, V * 2, 2 * V, V + W, V - W, V * W, vector(1, 2, 3) / N', 'local V = vector(N, P, 1)\nlocal W = vector(P, N, 1)'))
      .toBe('<nan, -nan, -1.000000>, <-nan, nan, 2.000000>, <-nan, nan, 2.000000>, <-nan, nan, 2.000000>, <-nan, nan, 0.000000>, <-nan, nan, 1.000000>, <-nan, -nan, -nan>')
  })

  it('llListStatistics, llListSort and llList2Json as in Mono', async () => {
    const st = (op: string, l: string) => `ll.ListStatistics(LIST_STAT_${op}, {${l}})`
    // In-world: these lines.
    expect(await slua([st('SUM', 'N, 1'), st('SUM', '1, N'), st('SUM', 'P, N'), st('SUM', 'N, P'), st('SUM', '1, P, N'), st('SUM', 'N, N, P')].join(', '))).toBe('-nan, -nan, nan, -nan, nan, -nan')
    expect(await slua([st('MEAN', 'N'), st('MEAN', 'P, N'), st('MEAN', 'N, P'), st('SUM_SQUARES', 'N'), st('SUM_SQUARES', 'P, N'), st('SUM_SQUARES', 'N, P')].join(', '))).toBe('-nan, nan, -nan, -nan, nan, -nan')
    expect(await slua([st('STD_DEV', 'N, 1'), st('STD_DEV', 'P, 1'), st('STD_DEV', '1, N'), st('GEOMETRIC_MEAN', 'N'), st('GEOMETRIC_MEAN', 'P'), st('GEOMETRIC_MEAN', '1, N')].join(', '))).toBe('-nan, nan, -nan, -nan, nan, -nan')
    expect(await slua([st('MIN', 'N, 1'), st('MIN', '1, N'), st('MIN', '1, N, 0'), st('MIN', 'P, N'), st('MIN', 'N, P'), st('MAX', 'N, 1'), st('MAX', '1, N'), st('MAX', 'P, N'), st('MAX', 'N, P')].join(', '))).toBe('-nan, 1, 0, nan, -nan, -nan, 1, nan, -nan')
    expect(await slua([st('RANGE', 'N'), st('RANGE', 'N, 1'), st('RANGE', '1, N'), st('RANGE', 'P, N'), st('SUM', 'inf, -inf'), st('MEAN', 'inf, -inf'), st('STD_DEV', 'inf, 1'), st('RANGE', 'inf, -inf')].join(', '))).toBe('-nan, -nan, 0, nan, -nan, -nan, -nan, inf')
    expect(await slua([st('MEDIAN', 'N'), st('MEDIAN', 'N, 1, 2'), st('MEDIAN', '1, N, 2'), st('MEDIAN', 'P, N'), st('MEDIAN', 'N, P'), st('MEDIAN', '3, N, 1, 2'), st('MEDIAN', 'N, 3, 1, 2, 5'), st('MEDIAN', '3, 1, N, 2, 5'), st('MEDIAN', '2, P, N')].join(', ')))
      .toBe('-nan, 1, -nan, -nan, nan, -nan, 2, -nan, nan')
    // In-world: ll.ListSort of {P, N}, {N, P}, {1, N, 2} and {N, P, 1, N}, one after the other, and
    // ll.List2Json(JSON_ARRAY, {N, P, vector(N, P, 0)}).
    const cat = 'local function cat(...) local r = {} for _, l in {...} do for _, v in l do table.insert(r, v) end end return table.unpack(r) end'
    expect(await slua('cat(ll.ListSort({P, N}, 1, 1), ll.ListSort({N, P}, 1, 1), ll.ListSort({1, N, 2}, 1, 1), ll.ListSort({N, P, 1, N}, 1, 1))', cat))
      .toBe('-nan, nan, nan, -nan, 2, -nan, 1, -nan, 1, nan, -nan')
    expect(await slua('ll.List2Json(JSON_ARRAY, {N, P, vector(N, P, 0)})')).toBe('[-nan,nan,"<-nan, nan, 0.000000>"]')
  })

  it('rotations and the ll rotation functions', async () => {
    // In-world, with RN = quaternion(N, 0, 0, 1), RP = quaternion(P, 0, 0, 1), RNP = quaternion(N, P, 0, 1),
    // Q = quaternion(0.1, 0.2, 0.3, 0.9) and V = vector(1, 2, 3): these lines.
    const setup = 'local RN = quaternion(N, 0, 0, 1)\nlocal RP = quaternion(P, 0, 0, 1)\nlocal RNP = quaternion(N, P, 0, 1)\nlocal Q = quaternion(0.1, 0.2, 0.3, 0.9)\nlocal V = vector(1, 2, 3)'
    expect(await slua('V * RN, V * RP, V * RNP, V / RN, V / RP', setup))
      .toBe('<-nan, -nan, -nan>, <nan, nan, nan>, <-nan, nan, -nan>, <nan, nan, nan>, <-nan, -nan, -nan>')
    expect(await slua('RN * Q, Q * RN, RP * Q, RN * RP, RP * RN, RN / Q, -RN', setup))
      .toBe('<-nan, -nan, -nan, -nan>, <-nan, -nan, -nan, -nan>, <nan, nan, nan, nan>, <-nan, -nan, nan, nan>, <nan, nan, -nan, -nan>, <-nan, -nan, -nan, -nan>, <nan, -0.000000, -0.000000, -1.000000>')
    expect(await slua('ll.Rot2Euler(RN), ll.Rot2Euler(RP), ll.Euler2Rot(vector(N, 0, 0)), ll.Euler2Rot(vector(P, 0, 0)), ll.Rot2Fwd(RN), ll.Rot2Fwd(RP), ll.Rot2Angle(RN), ll.Rot2Axis(RN)', setup))
      .toBe('<0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, <0.217045, 0.000000, 0.000000, 0.976162>, <0.217045, 0.000000, 0.000000, 0.976162>, <1.000000, 0.000000, 0.000000>, <1.000000, 0.000000, 0.000000>, 0, <0.000000, 0.000000, 0.000000>')
    const zr = '<0.000000, 0.000000, 0.000000, 1.000000>'
    expect(await slua('ll.AxisAngle2Rot(vector(1, 0, 0), N), ll.AxisAngle2Rot(vector(1, 0, 0), P), ll.AxisAngle2Rot(vector(N, 0, 0), 1), ll.RotBetween(vector(N, 0, 0), vector(1, 0, 0)), ll.AngleBetween(RN, quaternion(0, 0, 0, 1)), ll.AngleBetween(quaternion(0, 0, 0, 1), RP), ll.Axes2Rot(vector(N, 0, 0), vector(0, 1, 0), vector(0, 0, 1))', setup))
      .toBe(`${zr}, ${zr}, ${zr}, ${zr}, 0, 0, ${zr}`)
  })

  // In-world: ll.List2Float({"-nan"}, 1) and ll.List2Float({"-NaN"}, 1) gave -nan, Q / RN gave
  // -nan in every part and RN + RP <nan, 0.000000, 0.000000, 2.000000>. SLua's own list
  // function and quaternion operators give nan, nan, <nan, nan, nan, nan> and
  // <-nan, 0.000000, 0.000000, 2.000000> here.
  it.fails('ll.List2Float of "-nan" and the quaternion / and + give the signs Second Life does', async () => {
    const setup = 'local RN = quaternion(N, 0, 0, 1)\nlocal RP = quaternion(P, 0, 0, 1)\nlocal Q = quaternion(0.1, 0.2, 0.3, 0.9)'
    expect(await slua('ll.List2Float({"-nan"}, 1), ll.List2Float({"-NaN"}, 1), Q / RN, RN + RP', setup))
      .toBe('-nan, -nan, <-nan, -nan, -nan, -nan>, <nan, 0.000000, 0.000000, 2.000000>')
  })
})
