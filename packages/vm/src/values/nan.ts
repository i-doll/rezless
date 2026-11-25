/**
 * A float NaN in Second Life keeps a sign bit: llList2CSV and llList2Json
 * print it as "nan" or "-nan". The VM keeps that sign in the sign bit of
 * the JavaScript NaN. JavaScript doesn't promise to keep it, so the
 * operations measured in-world set the sign themselves.
 */

const view = new DataView(new ArrayBuffer(8))

/**
 * The positive and negative quiet NaN. V8's optimising compilers turn a NaN
 * they know at compile time, such as a constant's, into their own positive
 * NaN, so the NaNs are loaded from a typed array, which they can't fold.
 */
const NANS = new Float64Array(2)
view.setUint32(4, 0)
view.setUint32(0, 0x7ff80000)
NANS[0] = view.getFloat64(0)
view.setUint32(0, 0xfff80000)
NANS[1] = view.getFloat64(0)

export function isNegativeNaN(n: number) {
  if (n === n) return false
  view.setFloat64(0, n)
  return view.getUint8(0) >= 0x80
}

/** The quiet NaN with this sign. */
export function signedNaN(negative: boolean) {
  return NANS[negative ? 1 : 0]!
}

export function negateFloat(n: number) {
  return n === n ? -n : signedNaN(!isNegativeNaN(n))
}

/**
 * The NaN a script's float `+`, `-` or `*` gives when `r` is NaN, as Mono
 * does: a NaN operand passes on with its sign, two NaN operands give a
 * negative NaN only when both are negative, and a NaN made from two numbers
 * (inf - inf, 0 * inf) is negative.
 */
export function nanResult(a: number, b: number, r: number) {
  if (r === r) return r
  if (a !== a && b !== b) return signedNaN(isNegativeNaN(a) && isNegativeNaN(b))
  if (a !== a) return signedNaN(isNegativeNaN(a))
  if (b !== b) return signedNaN(isNegativeNaN(b))
  return signedNaN(true)
}

export const addFloat = (a: number, b: number) => nanResult(a, b, a + b)
export const subFloat = (a: number, b: number) => nanResult(a, b, a - b)
export const mulFloat = (a: number, b: number) => nanResult(a, b, a * b)

/**
 * An empty array that holds its numbers boxed. V8 keeps the numbers of an
 * all-number array unboxed, and storing a NaN there can lose its sign; an
 * array that once held something else never goes back.
 */
export function boxedArray<T>(): T[] {
  const out: unknown[] = [null]
  out.length = 0
  return out as T[]
}

/** A boxed array holding just `item`. */
export function boxedOf<T>(item: T): T[] {
  const out = boxedArray<T>()
  out.push(item)
  return out
}

/** `items.map(f)` into a boxed array. */
export function boxedMap<T, U>(items: ReadonlyArray<T>, f: (item: T, index: number) => U): U[] {
  const out = boxedArray<U>()
  for (let i = 0; i < items.length; i++) out.push(f(items[i]!, i))
  return out
}
