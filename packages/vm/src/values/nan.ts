/**
 * A float NaN in Second Life keeps a sign bit: llList2CSV and llList2Json
 * print it as "nan" or "-nan". The VM keeps that sign in the sign bit of
 * the JavaScript NaN. JavaScript doesn't promise to keep it, so every
 * operation that makes or passes on a NaN sets the sign itself.
 */

const view = new DataView(new ArrayBuffer(8))

function nanWithBits(high: number): number {
  view.setUint32(0, high)
  view.setUint32(4, 0)
  return view.getFloat64(0)
}

export const POSITIVE_NAN = nanWithBits(0x7ff80000)
export const NEGATIVE_NAN = nanWithBits(0xfff80000)

export function isNegativeNaN(n: number) {
  if (n === n) return false
  view.setFloat64(0, n)
  return view.getUint8(0) >= 0x80
}

/** The quiet NaN with this sign. */
export function signedNaN(negative: boolean) {
  return negative ? NEGATIVE_NAN : POSITIVE_NAN
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
  return NEGATIVE_NAN
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

/** `items.map(f)` into a boxed array. */
export function boxedMap<T, U>(items: ReadonlyArray<T>, f: (item: T, index: number) => U): U[] {
  const out = boxedArray<U>()
  for (let i = 0; i < items.length; i++) out.push(f(items[i]!, i))
  return out
}
