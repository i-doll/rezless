import type { EvalResult, LslType, LslValue, Vector, Rotation } from './types.js'
import { isVector, isRotation, toInt32, vec, rot, NULL_KEY } from './types.js'
import { coerce, stringify } from './coerce.js'

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

export function applyUnary(op: '+' | '-' | '!' | '~', arg: EvalResult): EvalResult {
  switch (op) {
    case '+':
      if (arg.type === 'integer' || arg.type === 'float') return arg
      if (isVector(arg.value) || isRotation(arg.value)) return arg
      throw new Error(`unary '+' not defined for ${arg.type}`)
    case '-':
      if (arg.type === 'integer')
        return { type: 'integer', value: toInt32(-(arg.value as number)) }
      if (arg.type === 'float') return { type: 'float', value: -(arg.value as number) }
      if (isVector(arg.value)) {
        const v = arg.value
        return { type: 'vector', value: vec(-v.x, -v.y, -v.z) }
      }
      if (isRotation(arg.value)) {
        const r = arg.value
        return { type: 'rotation', value: rot(-r.x, -r.y, -r.z, -r.s) }
      }
      throw new Error(`unary '-' not defined for ${arg.type}`)
    case '!':
      // LSL: logical not — only valid on integers per the wiki, treat float/key likewise as truthy.
      return { type: 'integer', value: truthy(arg) ? 0 : 1 }
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
      // In LSL, a key is "true" if it is a valid UUID and not NULL_KEY.
      return isValidUuid(r.value as string)
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

function isValidUuid(k: string): boolean {
  return (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(k) &&
    k !== NULL_KEY
  )
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
      return intBinary(left, right, (a, b) => toInt32(a << (b & 31)))
    case '>>':
      return intBinary(left, right, (a, b) => toInt32(a >> (b & 31)))
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
      return { type: 'integer', value: lslEquals(left, right) ? 0 : 1 }
  }
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
  if ((a.type === 'integer' || a.type === 'float') && (b.type === 'integer' || b.type === 'float')) {
    return (a.value as number) === (b.value as number)
  }
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
    return (
      (a.value as ReadonlyArray<LslValue>).length ===
      (b.value as ReadonlyArray<LslValue>).length
    )
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
    const left = a.type === 'list' ? (a.value as ReadonlyArray<LslValue>) : [a.value]
    const right = b.type === 'list' ? (b.value as ReadonlyArray<LslValue>) : [b.value]
    return { type: 'list', value: [...left, ...right] }
  }
  // Vector / rotation
  if (isVector(a.value) && isVector(b.value)) {
    return {
      type: 'vector',
      value: vec(a.value.x + b.value.x, a.value.y + b.value.y, a.value.z + b.value.z),
    }
  }
  if (isRotation(a.value) && isRotation(b.value)) {
    return {
      type: 'rotation',
      value: rot(
        a.value.x + b.value.x,
        a.value.y + b.value.y,
        a.value.z + b.value.z,
        a.value.s + b.value.s,
      ),
    }
  }
  // Numeric
  const p = promoteNumeric(a, b)
  if (p) {
    const [x, y] = p
    if (x.type === 'integer')
      return { type: 'integer', value: toInt32((x.value as number) + (y.value as number)) }
    return { type: 'float', value: (x.value as number) + (y.value as number) }
  }
  throw new Error(`cannot add ${a.type} and ${b.type}`)
}

function opSub(a: EvalResult, b: EvalResult): EvalResult {
  if (isVector(a.value) && isVector(b.value)) {
    return {
      type: 'vector',
      value: vec(a.value.x - b.value.x, a.value.y - b.value.y, a.value.z - b.value.z),
    }
  }
  if (isRotation(a.value) && isRotation(b.value)) {
    return {
      type: 'rotation',
      value: rot(
        a.value.x - b.value.x,
        a.value.y - b.value.y,
        a.value.z - b.value.z,
        a.value.s - b.value.s,
      ),
    }
  }
  const p = promoteNumeric(a, b)
  if (p) {
    const [x, y] = p
    if (x.type === 'integer')
      return { type: 'integer', value: toInt32((x.value as number) - (y.value as number)) }
    return { type: 'float', value: (x.value as number) - (y.value as number) }
  }
  throw new Error(`cannot subtract ${b.type} from ${a.type}`)
}

function opMul(a: EvalResult, b: EvalResult): EvalResult {
  // vector * vector → dot product (float)
  if (isVector(a.value) && isVector(b.value)) {
    return {
      type: 'float',
      value: a.value.x * b.value.x + a.value.y * b.value.y + a.value.z * b.value.z,
    }
  }
  // vector * float / float * vector → scale
  if (isVector(a.value) && (b.type === 'integer' || b.type === 'float')) {
    const k = b.value as number
    return { type: 'vector', value: vec(a.value.x * k, a.value.y * k, a.value.z * k) }
  }
  if ((a.type === 'integer' || a.type === 'float') && isVector(b.value)) {
    const k = a.value as number
    return { type: 'vector', value: vec(b.value.x * k, b.value.y * k, b.value.z * k) }
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
    return { type: 'float', value: (x.value as number) * (y.value as number) }
  }
  throw new Error(`cannot multiply ${a.type} and ${b.type}`)
}

function opDiv(a: EvalResult, b: EvalResult): EvalResult {
  // vector / float
  if (isVector(a.value) && (b.type === 'integer' || b.type === 'float')) {
    const k = b.value as number
    if (k === 0) throw new Error('Math Error: divide by zero')
    return { type: 'vector', value: vec(a.value.x / k, a.value.y / k, a.value.z / k) }
  }
  // vector / rotation → rotate by inverse
  if (isVector(a.value) && isRotation(b.value)) {
    return { type: 'vector', value: rotateVector(a.value, conjugate(b.value)) }
  }
  // rotation / rotation → multiply by inverse
  if (isRotation(a.value) && isRotation(b.value)) {
    return { type: 'rotation', value: mulRotation(a.value, conjugate(b.value)) }
  }
  // numeric
  const p = promoteNumeric(a, b)
  if (p) {
    const [x, y] = p
    if (x.type === 'integer') {
      if ((y.value as number) === 0) throw new Error('Math Error: divide by zero')
      return {
        type: 'integer',
        value: toInt32(Math.trunc((x.value as number) / (y.value as number))),
      }
    }
    if ((y.value as number) === 0) throw new Error('Math Error: divide by zero')
    return { type: 'float', value: (x.value as number) / (y.value as number) }
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
      value: vec(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x),
    }
  }
  // numeric (integer modulo only in LSL)
  if (
    (a.type === 'integer' || a.type === 'float') &&
    (b.type === 'integer' || b.type === 'float')
  ) {
    const x = coerce(a, 'integer').value as number
    const y = coerce(b, 'integer').value as number
    if (y === 0) throw new Error('Math Error: modulo by zero')
    return { type: 'integer', value: toInt32(x % y) }
  }
  throw new Error(`cannot modulo ${a.type} and ${b.type}`)
}

// ---- Quaternion math ----

function mulRotation(a: Rotation, b: Rotation): Rotation {
  // Hamilton product (LSL convention).
  return rot(
    a.s * b.x + a.x * b.s + a.y * b.z - a.z * b.y,
    a.s * b.y - a.x * b.z + a.y * b.s + a.z * b.x,
    a.s * b.z + a.x * b.y - a.y * b.x + a.z * b.s,
    a.s * b.s - a.x * b.x - a.y * b.y - a.z * b.z,
  )
}

function conjugate(q: Rotation): Rotation {
  return rot(-q.x, -q.y, -q.z, q.s)
}

function rotateVector(v: Vector, q: Rotation): Vector {
  // v' = q * v * q⁻¹
  const qv: Rotation = rot(v.x, v.y, v.z, 0)
  const r = mulRotation(mulRotation(q, qv), conjugate(q))
  return vec(r.x, r.y, r.z)
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
