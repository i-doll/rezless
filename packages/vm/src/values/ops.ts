import type { EvalResult, LslType, LslValue, Vector, Rotation } from './types.js'
import { isVector, isRotation, toInt32, toFloat32, vec, rot, NULL_KEY } from './types.js'
import { coerce, stringify } from './coerce.js'
import { concatLists, scriptList } from './list-types.js'
import { RuntimeError } from '../memory.js'
import { NEGATIVE_NAN, POSITIVE_NAN, addFloat, boxedOf, isNegativeNaN, mulFloat, negateFloat, signedNaN, subFloat } from './nan.js'

/**
 * Implementations of LSL binary and unary operators with the language's
 * (often surprising) typing rules. Notable LSL quirks:
 *   - `+` on lists concatenates / appends / prepends.
 *   - `*` and `/` between vectors and rotations do real geometry.
 *   - `&&` and `||` are NOT short-circuit (both sides are always evaluated).
 *     The interpreter accordingly evaluates both operands before calling here.
 *   - Integer arithmetic wraps at 32 bits.
 *   - Mixed-type arithmetic promotes int → float when the other side is float.
 */

export function applyUnary(op: '-' | '!' | '~', arg: EvalResult): EvalResult {
  switch (op) {
    case '-':
      if (arg.type === 'integer')
        return { type: 'integer', value: toInt32(-(arg.value as number)) }
      if (arg.type === 'float') return { type: 'float', value: negateFloat(arg.value as number) }
      if (isVector(arg.value)) {
        const v = arg.value
        return { type: 'vector', value: vec(negateFloat(v.x), negateFloat(v.y), negateFloat(v.z)) }
      }
      if (isRotation(arg.value)) {
        const r = arg.value
        return { type: 'rotation', value: rot(negateFloat(r.x), negateFloat(r.y), negateFloat(r.z), negateFloat(r.s)) }
      }
      throw new Error(`unary '-' not defined for ${arg.type}`)
    case '!':
      // Logical NOT — integer only; SL's compiler rejects `!key`, `!float`, etc.
      if (arg.type === 'integer') return { type: 'integer', value: arg.value === 0 ? 1 : 0 }
      throw new Error(`Type mismatch: unary '!' not defined for ${arg.type}`)
    case '~':
      // Bitwise NOT — integer only.
      if (arg.type === 'integer')
        return { type: 'integer', value: toInt32(~(arg.value as number)) }
      throw new Error(`unary '~' not defined for ${arg.type}`)
  }
}

export function truthy(r: EvalResult): boolean {
  switch (r.type) {
    case 'integer':
    case 'float':
      return (r.value as number) !== 0
    case 'string':
      return (r.value as string).length > 0
    case 'key':
      return isKeyTruthy(r.value as string)
    case 'vector':
      return !isVectorZero(r.value as Vector)
    case 'rotation': {
      // `if (rot)` per LSL: true if the rotation is non-identity.
      const q = r.value as Rotation
      return q.x !== 0 || q.y !== 0 || q.z !== 0 || q.s !== 1
    }
    case 'list':
      return (r.value as ReadonlyArray<LslValue>).length > 0
    case 'void':
      return false
  }
}

function isVectorZero(v: Vector): boolean {
  return v.x === 0 && v.y === 0 && v.z === 0
}

// ---- Binary ----

export function applyBinary(
  op:
    | '+'
    | '-'
    | '*'
    | '/'
    | '%'
    | '<<'
    | '>>'
    | '<'
    | '>'
    | '<='
    | '>='
    | '=='
    | '!='
    | '&'
    | '^'
    | '|'
    | '&&'
    | '||',
  left: EvalResult,
  right: EvalResult,
): EvalResult {
  switch (op) {
    case '+':
      return opAdd(left, right)
    case '-':
      return opSub(left, right)
    case '*':
      return opMul(left, right)
    case '/':
      return opDiv(left, right)
    case '%':
      return opMod(left, right)
    case '<<':
      return intBinary(left, right, shiftLeft)
    case '>>':
      return intBinary(left, right, shiftRight)
    case '&':
      return intBinary(left, right, (a, b) => toInt32(a & b))
    case '^':
      return intBinary(left, right, (a, b) => toInt32(a ^ b))
    case '|':
      return intBinary(left, right, (a, b) => toInt32(a | b))
    case '&&':
      // NOT short-circuit per LSL — caller has already evaluated both.
      return { type: 'integer', value: truthy(left) && truthy(right) ? 1 : 0 }
    case '||':
      return { type: 'integer', value: truthy(left) || truthy(right) ? 1 : 0 }
    case '<':
    case '>':
    case '<=':
    case '>=':
      return numericCompare(op, left, right)
    case '==':
      return { type: 'integer', value: lslEquals(left, right) ? 1 : 0 }
    case '!=':
      if (left.type === 'list' && right.type === 'list') {
        return { type: 'integer', value: toInt32(listLength(left) - listLength(right)) }
      }
      return { type: 'integer', value: lslEquals(left, right) ? 0 : 1 }
  }
}

function listLength(r: EvalResult): number {
  return (r.value as ReadonlyArray<LslValue>).length
}

function intBinary(
  left: EvalResult,
  right: EvalResult,
  fn: (a: number, b: number) => number,
): EvalResult {
  const a = coerce(left, 'integer').value as number
  const b = coerce(right, 'integer').value as number
  return { type: 'integer', value: fn(a, b) }
}

function numericCompare(
  op: '<' | '>' | '<=' | '>=',
  left: EvalResult,
  right: EvalResult,
): EvalResult {
  const promoted = promoteNumeric(left, right)
  if (!promoted) throw new Error(`cannot compare ${left.type} and ${right.type}`)
  const [a, b] = promoted
  let result: boolean
  switch (op) {
    case '<':
      result = (a.value as number) < (b.value as number)
      break
    case '>':
      result = (a.value as number) > (b.value as number)
      break
    case '<=':
      result = (a.value as number) <= (b.value as number)
      break
    case '>=':
      result = (a.value as number) >= (b.value as number)
      break
  }
  return { type: 'integer', value: result ? 1 : 0 }
}

function promoteNumeric(a: EvalResult, b: EvalResult): [EvalResult, EvalResult] | null {
  const aN = a.type === 'integer' || a.type === 'float'
  const bN = b.type === 'integer' || b.type === 'float'
  if (!aN || !bN) return null
  if (a.type === 'float' || b.type === 'float') {
    return [coerce(a, 'float'), coerce(b, 'float')]
  }
  return [a, b]
}

/** Strict structural equality with LSL nuances: vectors/rotations compare componentwise; key↔string equate. */
function lslEquals(a: EvalResult, b: EvalResult): boolean {
  // String/key cross-equality.
  if ((a.type === 'string' || a.type === 'key') && (b.type === 'string' || b.type === 'key')) {
    return a.value === b.value
  }
  const numeric = promoteNumeric(a, b)
  if (numeric) return numeric[0].value === numeric[1].value
  if (isVector(a.value) && isVector(b.value)) {
    return a.value.x === b.value.x && a.value.y === b.value.y && a.value.z === b.value.z
  }
  if (isRotation(a.value) && isRotation(b.value)) {
    return (
      a.value.x === b.value.x &&
      a.value.y === b.value.y &&
      a.value.z === b.value.z &&
      a.value.s === b.value.s
    )
  }
  if (a.type === 'list' && b.type === 'list') {
    // LSL: list == list compares LENGTHS, not contents.
    return listLength(a) === listLength(b)
  }
  return false
}

// ---- + ----
function opAdd(a: EvalResult, b: EvalResult): EvalResult {
  // String concat
  if (a.type === 'string' && b.type === 'string') {
    return { type: 'string', value: (a.value as string) + (b.value as string) }
  }
  // List concat / append / prepend
  if (a.type === 'list' || b.type === 'list') {
    const left = a.type === 'list' ? (a.value as ReadonlyArray<LslValue>) : scriptList(boxedOf(a.value), [a.type])
    const right = b.type === 'list' ? (b.value as ReadonlyArray<LslValue>) : scriptList(boxedOf(b.value), [b.type])
    return { type: 'list', value: concatLists(left, right) }
  }
  // Vector / rotation
  if (isVector(a.value) && isVector(b.value)) {
    return {
      type: 'vector',
      value: vec(addFloat(a.value.x, b.value.x), addFloat(a.value.y, b.value.y), addFloat(a.value.z, b.value.z)),
    }
  }
  if (isRotation(a.value) && isRotation(b.value)) {
    return {
      type: 'rotation',
      value: rot(
        addFloat(a.value.x, b.value.x),
        addFloat(a.value.y, b.value.y),
        addFloat(a.value.z, b.value.z),
        addFloat(a.value.s, b.value.s),
      ),
    }
  }
  // Numeric
  const p = promoteNumeric(a, b)
  if (p) {
    const [x, y] = p
    if (x.type === 'integer')
      return { type: 'integer', value: toInt32((x.value as number) + (y.value as number)) }
    return { type: 'float', value: addFloat(x.value as number, y.value as number) }
  }
  throw new Error(`cannot add ${a.type} and ${b.type}`)
}

function opSub(a: EvalResult, b: EvalResult): EvalResult {
  if (isVector(a.value) && isVector(b.value)) {
    return {
      type: 'vector',
      value: vec(subFloat(a.value.x, b.value.x), subFloat(a.value.y, b.value.y), subFloat(a.value.z, b.value.z)),
    }
  }
  if (isRotation(a.value) && isRotation(b.value)) {
    return {
      type: 'rotation',
      value: rot(
        subFloat(a.value.x, b.value.x),
        subFloat(a.value.y, b.value.y),
        subFloat(a.value.z, b.value.z),
        subFloat(a.value.s, b.value.s),
      ),
    }
  }
  const p = promoteNumeric(a, b)
  if (p) {
    const [x, y] = p
    if (x.type === 'integer')
      return { type: 'integer', value: toInt32((x.value as number) - (y.value as number)) }
    return { type: 'float', value: subFloat(x.value as number, y.value as number) }
  }
  throw new Error(`cannot subtract ${b.type} from ${a.type}`)
}

function opMul(a: EvalResult, b: EvalResult): EvalResult {
  // vector * vector → dot product (float)
  if (isVector(a.value) && isVector(b.value)) {
    return {
      type: 'float',
      value: toFloat32(addFloat(addFloat(mulFloat(a.value.x, b.value.x), mulFloat(a.value.y, b.value.y)), mulFloat(a.value.z, b.value.z))),
    }
  }
  // vector * float / float * vector → scale
  if (isVector(a.value) && (b.type === 'integer' || b.type === 'float')) {
    const k = toFloat32(b.value as number)
    return { type: 'vector', value: vec(mulFloat(a.value.x, k), mulFloat(a.value.y, k), mulFloat(a.value.z, k)) }
  }
  if ((a.type === 'integer' || a.type === 'float') && isVector(b.value)) {
    const k = toFloat32(a.value as number)
    return { type: 'vector', value: vec(mulFloat(b.value.x, k), mulFloat(b.value.y, k), mulFloat(b.value.z, k)) }
  }
  // vector * rotation → rotate vector
  if (isVector(a.value) && isRotation(b.value)) {
    return { type: 'vector', value: rotateVector(a.value, b.value) }
  }
  // rotation * rotation → quaternion multiply
  if (isRotation(a.value) && isRotation(b.value)) {
    return { type: 'rotation', value: mulRotation(a.value, b.value) }
  }
  // numeric
  const p = promoteNumeric(a, b)
  if (p) {
    const [x, y] = p
    if (x.type === 'integer')
      return { type: 'integer', value: toInt32(Math.imul(x.value as number, y.value as number)) }
    return { type: 'float', value: mulFloat(x.value as number, y.value as number) }
  }
  throw new Error(`cannot multiply ${a.type} and ${b.type}`)
}

function opDiv(a: EvalResult, b: EvalResult): EvalResult {
  // vector / float
  if (isVector(a.value) && (b.type === 'integer' || b.type === 'float')) {
    const k = toFloat32(b.value as number)
    if (k === 0) throw new RuntimeError('Math Error')
    // Mono multiplies by the float reciprocal rather than dividing.
    const m = k === k ? toFloat32(1 / k) : k
    return { type: 'vector', value: vec(mulFloat(a.value.x, m), mulFloat(a.value.y, m), mulFloat(a.value.z, m)) }
  }
  // vector / rotation → rotate by inverse
  if (isVector(a.value) && isRotation(b.value)) {
    return { type: 'vector', value: divideVector(a.value, b.value) }
  }
  // rotation / rotation → multiply by inverse
  if (isRotation(a.value) && isRotation(b.value)) {
    return { type: 'rotation', value: divideRotation(a.value, b.value) }
  }
  // numeric
  const p = promoteNumeric(a, b)
  if (p) {
    const [x, y] = p
    if (x.type === 'integer') {
      if ((y.value as number) === 0) throw new RuntimeError('Math Error')
      return {
        type: 'integer',
        value: toInt32(Math.trunc((x.value as number) / (y.value as number))),
      }
    }
    const q = (x.value as number) / (y.value as number)
    // Mono halts on a zero divisor, and on a NaN quotient such as inf / inf.
    if ((y.value as number) === 0 || Number.isNaN(q)) throw new RuntimeError('Math Error')
    return { type: 'float', value: q }
  }
  throw new Error(`cannot divide ${a.type} by ${b.type}`)
}

function opMod(a: EvalResult, b: EvalResult): EvalResult {
  // vector % vector → cross product
  if (isVector(a.value) && isVector(b.value)) {
    const u = a.value
    const v = b.value
    return {
      type: 'vector',
      value: vec(
        subFloat(mulFloat(u.y, v.z), mulFloat(u.z, v.y)),
        subFloat(mulFloat(u.z, v.x), mulFloat(u.x, v.z)),
        subFloat(mulFloat(u.x, v.y), mulFloat(u.y, v.x)),
      ),
    }
  }
  // numeric (integer modulo only in LSL)
  if (
    (a.type === 'integer' || a.type === 'float') &&
    (b.type === 'integer' || b.type === 'float')
  ) {
    const x = coerce(a, 'integer').value as number
    const y = coerce(b, 'integer').value as number
    if (y === 0) throw new RuntimeError('Math Error')
    return { type: 'integer', value: toInt32(x % y) }
  }
  throw new Error(`cannot modulo ${a.type} and ${b.type}`)
}

// ---- Quaternion math ----

/** LSL `a * b`: rotate by a, then by b. */
export function mulRotation(a: Rotation, b: Rotation): Rotation {
  return hamilton(b, a)
}

/** `a * b` in single precision, each product and sum rounded to a float, as a prim's rotation is turned by its root's. */
export function mulRotationF32(a: Rotation, b: Rotation): Rotation {
  const f = Math.fround
  const p = (x: number, y: number) => f(f(x) * f(y))
  return rot(
    f(f(f(p(b.s, a.x) + p(b.x, a.s)) + p(b.y, a.z)) - p(b.z, a.y)),
    f(f(f(p(b.s, a.y) - p(b.x, a.z)) + p(b.y, a.s)) + p(b.z, a.x)),
    f(f(f(p(b.s, a.z) + p(b.x, a.y)) - p(b.y, a.x)) + p(b.z, a.s)),
    f(f(f(p(b.s, a.s) - p(b.x, a.x)) - p(b.y, a.y)) - p(b.z, a.z)),
  )
}

/** The Hamilton product, with the NaN signs Mono gives. */
function hamilton(a: Rotation, b: Rotation): Rotation {
  const r = rot(
    a.s * b.x + a.x * b.s + a.y * b.z - a.z * b.y,
    a.s * b.y - a.x * b.z + a.y * b.s + a.z * b.x,
    a.s * b.z + a.x * b.y - a.y * b.x + a.z * b.s,
    a.s * b.s - a.x * b.x - a.y * b.y - a.z * b.z,
  )
  if (r.x === r.x && r.y === r.y && r.z === r.z && r.s === r.s) return r
  // Every part of the result uses every part of a and b.
  const nan = productNaN(positiveNaN(a.x) || positiveNaN(a.y) || positiveNaN(a.z) || positiveNaN(a.s) || positiveNaN(b.x) || positiveNaN(b.y) || positiveNaN(b.z) || positiveNaN(b.s))
  return rot(r.x === r.x ? r.x : nan, r.y === r.y ? r.y : nan, r.z === r.z ? r.z : nan, r.s === r.s ? r.s : nan)
}

const positiveNaN = (n: number) => n !== n && !isNegativeNaN(n)

/**
 * The NaN a product of rotations or a rotated vector gives, as Mono does:
 * negative unless one of the parts it was made from is a positive NaN.
 */
const productNaN = (anyPositive: boolean) => (anyPositive ? POSITIVE_NAN : NEGATIVE_NAN)

/**
 * Second Life's quaternion normalise, in single precision: it leaves a
 * rotation within 1e-6 of unit length as it is, and turns one of length 1e-7
 * or less into ZERO_ROTATION.
 */
export function normalizeRotation(q: Rotation): Rotation {
  const f32 = Math.fround
  const m = f32(Math.sqrt(f32(f32(f32(f32(q.x * q.x) + f32(q.y * q.y)) + f32(q.z * q.z)) + f32(q.s * q.s))))
  if (!(m > f32(1e-7))) return rot(0, 0, 0, 1)
  if (Math.abs(f32(1 - m)) <= 1e-6) return q
  const k = f32(1 / m)
  return rot(f32(mulFloat(q.x, k)), f32(mulFloat(q.y, k)), f32(mulFloat(q.z, k)), f32(mulFloat(q.s, k)))
}

export function conjugate(q: Rotation): Rotation {
  return rot(negateFloat(q.x), negateFloat(q.y), negateFloat(q.z), q.s)
}

/**
 * A float in a division by a rotation. A NaN is kept as its sign, which a
 * JavaScript NaN can lose on the way through the steps.
 */
type Part = number | { negative: boolean }
const NEGATIVE_PART = { negative: true }
const POSITIVE_PART = { negative: false }
const part = (n: number): Part => (n === n ? n : isNegativeNaN(n) ? NEGATIVE_PART : POSITIVE_PART)
const fromPart = (p: Part) => (typeof p === 'number' ? p : signedNaN(p.negative))
const negatePart = (p: Part): Part => (typeof p === 'number' ? -p : p.negative ? POSITIVE_PART : NEGATIVE_PART)
/** A NaN made from two numbers (inf - inf, 0 * inf) is negative. */
const made = (r: number): Part => (r === r ? Math.fround(r) : NEGATIVE_PART)

// Each step is single precision, and a NaN operand passes on with its sign, the left one first.
const pAdd = (a: Part, b: Part) => (typeof a !== 'number' ? a : typeof b !== 'number' ? b : made(a + b))
const pSub = (a: Part, b: Part) => (typeof a !== 'number' ? a : typeof b !== 'number' ? b : made(a - b))
const pMul = (a: Part, b: Part) => (typeof a !== 'number' ? a : typeof b !== 'number' ? b : made(a * b))

/** The parts of b's conjugate. */
function inverseParts(b: Rotation) {
  return { ix: negatePart(part(b.x)), iy: negatePart(part(b.y)), iz: negatePart(part(b.z)), is: part(b.s) }
}

/**
 * LSL `a / b` for two rotations: a times b's conjugate, every step in single
 * precision with the terms summed in Mono's order.
 */
function divideRotation(a: Rotation, b: Rotation): Rotation {
  const ax = part(a.x), ay = part(a.y), az = part(a.z), as = part(a.s)
  const { ix, iy, iz, is } = inverseParts(b)
  return rot(
    fromPart(pSub(pAdd(pAdd(pMul(ix, as), pMul(is, ax)), pMul(iy, az)), pMul(ay, iz))),
    fromPart(pSub(pAdd(pMul(ax, iz), pAdd(pMul(ay, is), pMul(as, iy))), pMul(az, ix))),
    fromPart(pSub(pAdd(pAdd(pMul(as, iz), pMul(is, az)), pMul(ix, ay)), pMul(ax, iy))),
    fromPart(pSub(pSub(pSub(pMul(is, as), pMul(ax, ix)), pMul(iy, ay)), pMul(az, iz))),
  )
}

/**
 * LSL `v / q`: v turned by q's conjugate i, as i * (v * q) in two quaternion
 * products, every step in single precision with the terms summed in Mono's
 * order.
 */
function divideVector(v: Vector, q: Rotation): Vector {
  const vx = part(v.x), vy = part(v.y), vz = part(v.z)
  const { ix, iy, iz, is } = inverseParts(q)
  const tx = pSub(pAdd(pMul(iy, vz), pMul(vx, is)), pMul(vy, iz))
  const ty = pSub(pAdd(pMul(vx, iz), pMul(vy, is)), pMul(ix, vz))
  const tz = pSub(pAdd(pMul(vz, is), pMul(ix, vy)), pMul(vx, iy))
  const ts = pSub(pSub(negatePart(pMul(vx, ix)), pMul(vy, iy)), pMul(vz, iz))
  return vec(
    fromPart(pAdd(pMul(iy, tz), pSub(pSub(pMul(is, tx), pMul(ix, ts)), pMul(iz, ty)))),
    fromPart(pAdd(pMul(iz, tx), pSub(pSub(pMul(is, ty), pMul(iy, ts)), pMul(ix, tz)))),
    fromPart(pAdd(pMul(ty, ix), pSub(pSub(pMul(is, tz), pMul(iz, ts)), pMul(iy, tx)))),
  )
}

/**
 * `v * q`, as Mono runs ScriptTypes.cs `Rotate`: the float inputs are
 * widened to double, the expanded product is summed in this order, and each
 * component is rounded to float once at the end.
 */
export function rotateVector(v: Vector, q: Rotation): Vector {
  const { x, y, z, s } = q
  const { x: vx, y: vy, z: vz } = v
  const r = vec(
    s * s * vx + 2 * y * s * vz - 2 * z * s * vy + x * x * vx + 2 * y * x * vy + 2 * z * x * vz - z * z * vx - y * y * vx,
    2 * x * y * vx + y * y * vy + 2 * z * y * vz + 2 * s * z * vx - z * z * vy + s * s * vy - 2 * x * s * vz - x * x * vy,
    2 * x * z * vx + 2 * y * z * vy + z * z * vz - 2 * s * y * vx - y * y * vz + 2 * s * x * vy - x * x * vz + s * s * vz,
  )
  if (r.x === r.x && r.y === r.y && r.z === r.z) return r
  // Every part of the result uses every part of v and q.
  const nan = productNaN(positiveNaN(x) || positiveNaN(y) || positiveNaN(z) || positiveNaN(s) || positiveNaN(vx) || positiveNaN(vy) || positiveNaN(vz))
  return vec(r.x === r.x ? r.x : nan, r.y === r.y ? r.y : nan, r.z === r.z ? r.z : nan)
}

/** For interpreter compound-assignment helpers. */
export function reduceCompound(
  op: '+=' | '-=' | '*=' | '/=' | '%=',
  left: EvalResult,
  right: EvalResult,
): EvalResult {
  const binOp = op.slice(0, -1) as '+' | '-' | '*' | '/' | '%'
  const result = applyBinary(binOp, left, right)
  // Preserve the target's declared type by coercing back.
  return coerce(result, left.type as LslType)
}

export { coerce, stringify }

/**
 * `a << b` as SLua runs it (Luau's bit32.lshift): a count of 32 or more
 * gives 0, and a negative count shifts right (logically) instead.
 */
function shiftLeft(a: number, b: number): number {
  const r = a >>> 0
  if (b < 0) return -b >= 32 ? 0 : (r >>> -b) | 0
  return b >= 32 ? 0 : (r << b) | 0
}

/**
 * `a >> b` as SLua runs it (Luau's bit32.arshift): arithmetic, so a negative
 * `a` shifted by 32 or more gives -1 and a non-negative one 0; a negative
 * count shifts left instead.
 */
function shiftRight(a: number, b: number): number {
  if (b < 0 || a >= 0) return shiftLeft(a, -b)
  return b >= 32 ? -1 : a >> b
}

/**
 * A key is true when it reads as a non-null UUID, by the simulator's lenient
 * parser (SLua's validate_uuid_str): 32 hex digits, either case, in the
 * 36-character layout or the old 35-character one missing its last dash.
 * The separator characters themselves are not checked.
 */
function isKeyTruthy(key: string): boolean {
  const bytes = new TextEncoder().encode(key)
  const broken = bytes.length === 35
  if (bytes.length !== 36 && !broken) return false
  let pos = 0
  let allZero = true
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || (i === 10 && !broken)) pos++
    for (let j = 0; j < 2; j++, pos++) {
      const c = bytes[pos]!
      const hex = (c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x66) || (c >= 0x41 && c <= 0x46)
      if (!hex) return false
      if (c !== 0x30) allZero = false
    }
  }
  return !allZero
}
