import type {
  Expression,
  Statement,
  EventHandler,
  CallExpression,
  BinaryExpression,
  UnaryExpression,
  AssignmentExpression,
  CastExpression,
  MemberExpression,
  UpdateExpression,
  VectorLiteral,
  RotationLiteral,
  ListLiteral,
  IfStatement,
  WhileStatement,
  DoWhileStatement,
  ForStatement,
  BlockStatement,
  VariableDeclaration,
  FunctionDeclaration,
  Node,
  TypeName,
} from '@rezless/parser'
import type { BuiltinImpl, Run, ScriptState, Suspension } from './runtime.js'
import type { FunctionSignature, Script } from './script.js'
import { callBuiltin, specFor } from './dispatch.js'
import type { EvalResult, LslType, LslValue, Vector, Rotation } from './values/types.js'
import { defaultEvalFor, isVector, isRotation, toFloat32Value } from './values/types.js'
import { coerce } from './values/coerce.js'
import { typedList } from './values/list-types.js'
import { applyBinary, applyUnary, reduceCompound, truthy } from './values/ops.js'
import { Env } from './env.js'
import { own } from './own.js'
import { RuntimeError, StackHeapCollision, frameBytes } from './memory.js'

/** Mono can't run a function or handler that uses the value of a key print. */
class InvalidProgram extends RuntimeError {
  constructor(name: string) {
    super(`System.InvalidProgramException: Invalid IL code in LSL :${name} ()`)
    this.name = 'InvalidProgram'
  }
}

/**
 * Tree-walking interpreter for the language subset shipped in Phase 2.
 * Supports: variables (locals + globals), all binary/unary/assignment/cast/
 * update operators, vector/rotation/list literals, member access, control
 * flow (if/while/do-while/for), `return` (no-op for event handlers), and
 * dispatch into mocked / built-in / stubbed `ll*` functions.
 *
 * Out of scope (deferred to next PR): user function calls, multi-state
 * transitions, jump/labels.
 */

export interface InterpreterContext {
  readonly state: ScriptState
  readonly mocks: Readonly<Record<string, BuiltinImpl>>
  /** Globals environment shared across all event invocations. */
  readonly globals: Env
  /** User-defined functions, indexed by name (LSL has a flat function namespace). */
  readonly userFunctions: ReadonlyMap<string, FunctionDeclaration>
  /** Functions outside the LSL definitions declared through `ScriptOptions.functions`. */
  readonly functions: Readonly<Record<string, FunctionSignature>>
  /** Functions and handlers that halt the script when entered. */
  readonly invalidPrograms: ReadonlySet<Node>
  /** Owning script — passed through to builtins via dispatch. */
  readonly script: Script
  readonly prim: import('./prim.js').Prim
  readonly linkset: import('./linkset.js').Linkset
}

class ReturnSignal {
  constructor(public readonly value: EvalResult | null) {}
}

class JumpSignal {
  constructor(public readonly label: string) {}
}

export class StateChangeSignal {
  constructor(public readonly target: string) {}
}

/** A user function call, run by `trampoline` so recursion doesn't use the host stack. */
interface UserCall extends Generator<Suspension | UserCall, EvalResult, unknown> {}

type Exec<T> = Generator<Suspension | UserCall, T, unknown>

/** Calls nested deeper than this are a Stack-Heap Collision even without the memory model. */
const MAX_CALL_DEPTH = 10_000

export function execHandler(
  ctx: InterpreterContext,
  handler: EventHandler,
  args: ReadonlyArray<EvalResult> = [],
): Run<void> {
  return trampoline(runHandler(ctx, handler, args))
}

function* trampoline(root: Exec<void>): Run<void> {
  const frames: Exec<unknown>[] = [root]
  let sent: unknown
  let thrown: { error: unknown } | null = null
  try {
    for (;;) {
      const frame = frames[frames.length - 1]!
      let step: IteratorResult<Suspension | UserCall, unknown>
      try {
        step = thrown ? frame.throw(thrown.error) : frame.next(sent)
      } catch (error) {
        frames.pop()
        if (frames.length === 0) throw error
        thrown = { error }
        continue
      }
      thrown = null
      sent = undefined
      if (step.done) {
        frames.pop()
        if (frames.length === 0) return
        sent = step.value
      } else if ('until' in step.value) {
        yield step.value
      } else if (frames.length > MAX_CALL_DEPTH) {
        thrown = { error: new StackHeapCollision() }
      } else {
        frames.push(step.value)
      }
    }
  } finally {
    while (frames.length > 0) frames.pop()!.return(undefined)
  }
}

function* runHandler(
  ctx: InterpreterContext,
  handler: EventHandler,
  args: ReadonlyArray<EvalResult>,
): Exec<void> {
  if (ctx.invalidPrograms.has(handler)) throw new InvalidProgram(handler.name)
  if (ctx.state.coverage) {
    ctx.state.coverage.hitFunction(handler.loc)
    // execBlock bypasses execStatement for the outermost body, so credit
    // the body BlockStatement here.
    ctx.state.coverage.hitStatement(handler.body.loc)
  }
  const locals = ctx.state.memory.locals
  const env = ctx.globals.push()
  try {
    // Bind handler params (each carries declared LSL type).
    handler.params.forEach((p, i) => {
      const a = args[i] ?? defaultEvalFor(p.typeName as LslType)
      env.declare(p.name, p.typeName as LslType, a)
    })
    yield* execBlock(ctx, env, handler.body)
  } catch (e) {
    if (e instanceof ReturnSignal) return
    throw e
  } finally {
    ctx.state.memory.releaseLocals(locals)
  }
}

/**
 * Invoke a user-defined function. Pushes a fresh env (no closures —
 * functions see globals only), binds args to params, runs the body,
 * and unwraps a ReturnSignal into the function's return value.
 */
function* callUserFunction(
  ctx: InterpreterContext,
  fn: FunctionDeclaration,
  args: ReadonlyArray<EvalResult>,
): UserCall {
  if (ctx.invalidPrograms.has(fn)) throw new InvalidProgram(fn.name)
  if (ctx.state.coverage) {
    ctx.state.coverage.hitFunction(fn.loc)
    ctx.state.coverage.hitStatement(fn.body.loc)
  }
  const memory = ctx.state.memory
  const frame = frameBytes(fn)
  const locals = memory.locals
  memory.pushFrame(frame)
  const env = ctx.globals.push()
  try {
    fn.params.forEach((p, i) => {
      const a = args[i] ?? defaultEvalFor(p.typeName as LslType)
      env.declare(p.name, p.typeName as LslType, a)
    })
    yield* execBlock(ctx, env, fn.body)
  } catch (e) {
    if (e instanceof ReturnSignal) {
      if (fn.returnType === null) return { type: 'void', value: 0 }
      return e.value ? coerce(e.value, fn.returnType as LslType) : defaultEvalFor(fn.returnType as LslType)
    }
    if (e instanceof JumpSignal) {
      // A jump that escaped the function body means the label is undefined
      // within the function. Without this catch the signal would bubble into
      // the calling handler and could land on an unrelated same-named label.
      throw new Error(
        `jump to undefined label '${e.label}' in function '${fn.name}'`,
      )
    }
    // The host ran out of stack before the memory model did.
    if (e instanceof RangeError) throw new StackHeapCollision()
    throw e
  } finally {
    memory.releaseLocals(locals)
    memory.popFrame(frame)
  }
  // Fell off end without explicit return.
  return fn.returnType ? defaultEvalFor(fn.returnType as LslType) : { type: 'void', value: 0 }
}

function* execBlock(ctx: InterpreterContext, env: Env, block: BlockStatement): Exec<void> {
  const child = env.push()
  // Pre-scan: collect label positions and detect duplicate variable names.
  // Duplicate-decl detection has to run upfront because we use
  // declareOrReset below — that quietly tolerates re-running a declaration
  // (which is what backward `jump` does), but a real source-level duplicate
  // like `integer x; integer x;` should still error.
  let labels: Map<string, number> | null = null
  const declaredNames = new Set<string>()
  for (let i = 0; i < block.body.length; i++) {
    const s = block.body[i]!
    if (s.kind === 'LabelStatement') {
      if (!labels) labels = new Map()
      labels.set(s.name, i)
    } else if (s.kind === 'VariableDeclaration') {
      if (declaredNames.has(s.name)) {
        throw new Error(`duplicate declaration of '${s.name}' in block`)
      }
      declaredNames.add(s.name)
    }
  }
  let i = 0
  try {
    while (i < block.body.length) {
      const stmt = block.body[i]!
      try {
        yield* execStatement(ctx, child, stmt)
        i++
      } catch (e) {
        if (e instanceof JumpSignal && labels && labels.has(e.label)) {
          // Resume execution at the label.
          i = labels.get(e.label)! + 1
          continue
        }
        throw e
      }
    }
  } finally {
    child.clear()
  }
}

function* execStatement(ctx: InterpreterContext, env: Env, stmt: Statement): Exec<void> {
  if (ctx.state.coverage) ctx.state.coverage.hitStatement(stmt.loc)
  switch (stmt.kind) {
    case 'BlockStatement':
      yield* execBlock(ctx, env, stmt)
      return
    case 'EmptyStatement':
      return
    case 'VariableDeclaration':
      yield* execVariableDeclaration(ctx, env, stmt)
      return
    case 'ExpressionStatement':
      yield* evalExpression(
        ctx,
        env,
        stmt.expression.kind === 'PrintExpression' ? stmt.expression.argument : stmt.expression,
      )
      return
    case 'IfStatement':
      yield* execIf(ctx, env, stmt)
      return
    case 'WhileStatement':
      yield* execWhile(ctx, env, stmt)
      return
    case 'DoWhileStatement':
      yield* execDoWhile(ctx, env, stmt)
      return
    case 'ForStatement':
      yield* execFor(ctx, env, stmt)
      return
    case 'ReturnStatement': {
      const value = stmt.argument ? (yield* evalExpression(ctx, env, stmt.argument)) : null
      throw new ReturnSignal(value)
    }
    case 'StateChangeStatement':
      throw new StateChangeSignal(stmt.target)
    case 'JumpStatement':
      throw new JumpSignal(stmt.label)
    case 'LabelStatement':
      // No-op at execution time; labels are landing pads for `jump`.
      return
  }
}

function* execVariableDeclaration(
  ctx: InterpreterContext,
  env: Env,
  stmt: VariableDeclaration,
): Exec<void> {
  const init = stmt.init ? (yield* evalExpression(ctx, env, stmt.init)) : undefined
  // declareOrReset lets a backward `jump` re-execute a VariableDeclaration —
  // the second pass updates the existing slot's value rather than throwing
  // "already declared". The duplicate-source guard runs upfront in execBlock.
  env.declareOrReset(stmt.name, stmt.typeName as LslType, init)
}

function* execIf(ctx: InterpreterContext, env: Env, stmt: IfStatement): Exec<void> {
  const cov = ctx.state.coverage
  if (truthy(yield* evalExpression(ctx, env, stmt.test))) {
    if (cov) cov.hitBranch(stmt.loc, true)
    yield* execStatement(ctx, env, stmt.consequent)
  } else {
    if (cov) cov.hitBranch(stmt.loc, false)
    if (stmt.alternate) yield* execStatement(ctx, env, stmt.alternate)
  }
}

function* execWhile(ctx: InterpreterContext, env: Env, stmt: WhileStatement): Exec<void> {
  const cov = ctx.state.coverage
  while (true) {
    const t = truthy(yield* evalExpression(ctx, env, stmt.test))
    if (cov) cov.hitBranch(stmt.loc, t)
    if (!t) break
    yield* execStatement(ctx, env, stmt.body)
  }
}

function* execDoWhile(ctx: InterpreterContext, env: Env, stmt: DoWhileStatement): Exec<void> {
  const cov = ctx.state.coverage
  while (true) {
    yield* execStatement(ctx, env, stmt.body)
    const t = truthy(yield* evalExpression(ctx, env, stmt.test))
    if (cov) cov.hitBranch(stmt.loc, t)
    if (!t) break
  }
}

function* execFor(ctx: InterpreterContext, env: Env, stmt: ForStatement): Exec<void> {
  const child = env.push()
  const cov = ctx.state.coverage
  for (const e of stmt.init) yield* evalExpression(ctx, child, e)
  while (true) {
    if (stmt.test) {
      const t = truthy(yield* evalExpression(ctx, child, stmt.test))
      if (cov) cov.hitBranch(stmt.loc, t)
      if (!t) break
    } else if (cov) {
      // Infinite loop: still useful to record "body entered".
      cov.hitBranch(stmt.loc, true)
    }
    yield* execStatement(ctx, child, stmt.body)
    for (const e of stmt.update) yield* evalExpression(ctx, child, e)
  }
}

// ---- Expressions ----

function* evalExpression(ctx: InterpreterContext, env: Env, expr: Expression): Exec<EvalResult> {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return { type: 'integer', value: expr.value | 0 }
    case 'FloatLiteral':
      return { type: 'float', value: expr.value }
    case 'StringLiteral':
      return { type: 'string', value: expr.value }
    case 'VectorLiteral':
      return yield* evalVectorLiteral(ctx, env, expr)
    case 'RotationLiteral':
      return yield* evalRotationLiteral(ctx, env, expr)
    case 'ListLiteral':
      return yield* evalListLiteral(ctx, env, expr)
    case 'Identifier':
      return env.get(expr.name)
    case 'CallExpression':
      return yield* evalCall(ctx, env, expr)
    case 'UnaryExpression':
      return applyUnary(expr.operator, yield* evalExpression(ctx, env, expr.argument))
    case 'BinaryExpression':
      return yield* evalBinary(ctx, env, expr)
    case 'AssignmentExpression':
      return yield* evalAssignment(ctx, env, expr)
    case 'CastExpression':
      return coerce(yield* evalExpression(ctx, env, expr.argument), expr.targetType as LslType)
    case 'MemberExpression':
      return yield* evalMember(ctx, env, expr)
    case 'UpdateExpression':
      return yield* evalUpdate(ctx, env, expr)
    case 'PrintExpression':
      return defaultEvalFor((yield* evalExpression(ctx, env, expr.argument)).type)
  }
}

function* evalVectorLiteral(ctx: InterpreterContext, env: Env, e: VectorLiteral): Exec<EvalResult> {
  const x = coerce(yield* evalExpression(ctx, env, e.x), 'float').value as number
  const y = coerce(yield* evalExpression(ctx, env, e.y), 'float').value as number
  const z = coerce(yield* evalExpression(ctx, env, e.z), 'float').value as number
  return { type: 'vector', value: { x, y, z } }
}

function* evalRotationLiteral(ctx: InterpreterContext, env: Env, e: RotationLiteral): Exec<EvalResult> {
  const x = coerce(yield* evalExpression(ctx, env, e.x), 'float').value as number
  const y = coerce(yield* evalExpression(ctx, env, e.y), 'float').value as number
  const z = coerce(yield* evalExpression(ctx, env, e.z), 'float').value as number
  const s = coerce(yield* evalExpression(ctx, env, e.s), 'float').value as number
  return { type: 'rotation', value: { x, y, z, s } }
}

function* evalListLiteral(ctx: InterpreterContext, env: Env, e: ListLiteral): Exec<EvalResult> {
  const elements: EvalResult[] = []
  for (const el of e.elements) elements.push(yield* evalExpression(ctx, env, el))
  return {
    type: 'list',
    value: typedList(
      elements.map((r) => r.value),
      elements.map((r) => r.type),
    ),
  }
}

function* evalBinary(ctx: InterpreterContext, env: Env, e: BinaryExpression): Exec<EvalResult> {
  // LSL: && and || are NOT short-circuit, and the right operand runs first.
  const right = yield* evalExpression(ctx, env, e.right)
  const left = yield* evalExpression(ctx, env, e.left)
  return applyBinary(e.operator, left, right)
}

function* evalAssignment(
  ctx: InterpreterContext,
  env: Env,
  e: AssignmentExpression,
): Exec<EvalResult> {
  const newValue = yield* evalExpression(ctx, env, e.value)
  return assignTo(ctx, env, e.target, e.operator, newValue)
}

function assignTo(
  ctx: InterpreterContext,
  env: Env,
  target: Expression,
  op: '=' | '+=' | '-=' | '*=' | '/=' | '%=',
  rhs: EvalResult,
): EvalResult {
  if (target.kind === 'Identifier') {
    if (op === '=') return env.set(target.name, rhs)
    const current = env.get(target.name)
    return env.set(target.name, reduceCompound(op, current, rhs))
  }
  if (target.kind === 'MemberExpression') {
    return assignToMember(ctx, env, target, op, rhs)
  }
  throw new Error(`invalid assignment target: ${target.kind}`)
}

function assignToMember(
  ctx: InterpreterContext,
  env: Env,
  target: MemberExpression,
  op: '=' | '+=' | '-=' | '*=' | '/=' | '%=',
  rhs: EvalResult,
): EvalResult {
  if (target.object.kind !== 'Identifier') {
    throw new Error('member assignment supported only on identifier targets')
  }
  const current = env.get(target.object.name)
  if (!isVector(current.value) && !isRotation(current.value)) {
    throw new Error(`cannot access member on ${current.type}`)
  }
  const obj = current.value as Vector | Rotation
  const member = target.property
  if (!['x', 'y', 'z', 's'].includes(member)) {
    throw new Error(`unknown member '${member}' (expected x|y|z|s)`)
  }
  if (member === 's' && !isRotation(obj)) {
    throw new Error(`vector has no '.s' component`)
  }
  const oldField: EvalResult = {
    type: 'float',
    value: (obj as unknown as Record<string, number>)[member]!,
  }
  const newField =
    op === '='
      ? coerce(rhs, 'float')
      : reduceCompound(op, oldField, rhs)
  const updated: Record<string, number> = { ...obj, [member]: newField.value as number }
  const wrapped: EvalResult = isRotation(obj)
    ? {
        type: 'rotation',
        value: {
          x: updated.x!,
          y: updated.y!,
          z: updated.z!,
          s: updated.s!,
        },
      }
    : {
        type: 'vector',
        value: { x: updated.x!, y: updated.y!, z: updated.z! },
      }
  env.set(target.object.name, wrapped)
  return newField
}

function* evalMember(ctx: InterpreterContext, env: Env, e: MemberExpression): Exec<EvalResult> {
  const obj = yield* evalExpression(ctx, env, e.object)
  if (!isVector(obj.value) && !isRotation(obj.value)) {
    throw new Error(`cannot access member on ${obj.type}`)
  }
  const v = obj.value as Vector | Rotation
  const member = e.property
  if (member === 's' && !isRotation(v)) {
    throw new Error(`vector has no '.s' component`)
  }
  if (!['x', 'y', 'z', 's'].includes(member)) {
    throw new Error(`unknown member '${member}' (expected x|y|z|s)`)
  }
  return { type: 'float', value: (v as unknown as Record<string, number>)[member]! }
}

function* evalUpdate(ctx: InterpreterContext, env: Env, e: UpdateExpression): Exec<EvalResult> {
  if (e.argument.kind !== 'Identifier' && e.argument.kind !== 'MemberExpression') {
    throw new Error('++/-- only valid on identifiers or member expressions')
  }
  // Get current value
  const current = yield* evalExpression(ctx, env, e.argument)
  const delta: EvalResult = { type: 'integer', value: e.operator === '++' ? 1 : -1 }
  const updated = reduceCompound('+=', current, delta)
  // Write back
  assignTo(ctx, env, e.argument, '=', updated)
  return e.prefix ? updated : current
}

function* evalCall(ctx: InterpreterContext, env: Env, call: CallExpression): Exec<EvalResult> {
  // Evaluate args eagerly (matches LSL semantics).
  const evalArgs: EvalResult[] = []
  for (const a of call.args) evalArgs.push(yield* evalExpression(ctx, env, a))
  // User-defined function?
  const userFn = ctx.userFunctions.get(call.callee)
  if (userFn) {
    return (yield callUserFunction(ctx, userFn, evalArgs)) as EvalResult
  }
  // Builtin (real, generated stub, or user-mocked).
  const spec = specFor(call.callee)
  const declared = own(ctx.functions, call.callee)
  // An integer passed for a float parameter becomes a 32-bit float before the call.
  const rawArgs: LslValue[] = evalArgs.map((r, i) =>
    r.type === 'integer' && (spec?.params[i]?.type ?? declared?.params?.[i]) === 'float'
      ? coerce(r, 'float').value
      : r.value,
  )
  const result = yield* callBuiltin({ state: ctx.state, mocks: ctx.mocks, script: ctx.script }, call.callee, rawArgs)
  const returnType = (spec?.returnType ?? declared?.returns ?? 'void') as LslType
  if (returnType === 'void') return { type: 'void', value: 0 }
  // Builtins and mocks compute in doubles.
  return { type: returnType, value: toFloat32Value(result ?? defaultEvalFor(returnType).value, returnType) }
}
