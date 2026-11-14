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
  JumpStatement,
  LabelStatement,
  VariableDeclaration,
  FunctionDeclaration,
  Node,
  TypeName,
} from '@rezless/parser'
import type { BuiltinImpl, Run, ScriptState, Suspension } from './runtime.js'
import type { FunctionSignature, Script } from './script.js'
import { callBuiltin, specFor } from './dispatch.js'
import type { Journal } from './dispatch.js'
import type { EvalResult, LslType, LslValue, Vector, Rotation } from './values/types.js'
import { defaultEvalFor, isVector, isRotation, rot, toFloat32, toFloat32Value, vec } from './values/types.js'
import { coerce } from './values/coerce.js'
import { scriptList } from './values/list-types.js'
import { applyBinary, applyUnary, reduceCompound, truthy } from './values/ops.js'
import { Env, stored } from './env.js'
import { own } from './own.js'
import { CONSTANT_TABLE } from './generated/constants_table.js'
import { RuntimeError, StackHeapCollision, frameBytes } from './memory.js'
import { HaltSignal } from './builtins/object.js'

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
  /** The builtin results of this handler run. */
  readonly journal: Journal
}

class ReturnSignal {
  constructor(public readonly value: EvalResult | null) {}
}

class JumpSignal {
  constructor(public readonly label: string, public readonly target: LabelStatement | undefined) {}
}

/** Each jump's target: the last label of that name in its function or handler body, as in SLua. */
const jumpTargets = new WeakMap<JumpStatement, LabelStatement>()
const resolvedBodies = new WeakSet<BlockStatement>()

function resolveJumps(body: BlockStatement): void {
  if (resolvedBodies.has(body)) return
  resolvedBodies.add(body)
  const labels = new Map<string, LabelStatement>()
  const jumps: JumpStatement[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) visit(n)
      return
    }
    if (node === null || typeof node !== 'object') return
    const n = node as { kind?: string }
    if (n.kind === 'LabelStatement') labels.set((n as LabelStatement).name, n as LabelStatement)
    else if (n.kind === 'JumpStatement') jumps.push(n as JumpStatement)
    for (const [key, child] of Object.entries(n)) if (key !== 'loc') visit(child)
  }
  visit(body)
  for (const j of jumps) {
    const target = labels.get(j.label)
    if (target) jumpTargets.set(j, target)
  }
}

/** Why a jump that left its function or handler went nowhere. */
function jumpError(e: JumpSignal, where: string): string {
  return `jump to undefined label '${e.label}' in ${where}`
}

/**
 * How to reach a label from a statement: an index into a block, or the
 * branch or loop body to enter. Empty when the statement is the label.
 */
type JumpPath = ReadonlyArray<number | 'then' | 'else' | 'body'>

function pathIn(stmt: Statement, target: LabelStatement): JumpPath | null {
  if (stmt === target) return []
  const into = (step: 'then' | 'else' | 'body', child: Statement | null): JumpPath | null => {
    const rest = child && pathIn(child, target)
    return rest ? [step, ...rest] : null
  }
  switch (stmt.kind) {
    case 'BlockStatement':
      for (let i = 0; i < stmt.body.length; i++) {
        const rest = pathIn(stmt.body[i]!, target)
        if (rest) return [i, ...rest]
      }
      return null
    case 'IfStatement':
      return into('then', stmt.consequent) ?? into('else', stmt.alternate)
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
      return into('body', stmt.body)
    default:
      return null
  }
}

/**
 * Run `stmt` from the label `path` leads to, as when a jump lands inside it:
 * a branch carries on after the `if`, and a loop body carries on looping.
 */
function* execResumed(ctx: InterpreterContext, env: Env, stmt: Statement, path: JumpPath): Exec<void> {
  if (path.length === 0) return
  switch (stmt.kind) {
    case 'BlockStatement':
      return yield* execBlock(ctx, env, stmt, path)
    case 'IfStatement':
      return yield* execResumed(ctx, env, path[0] === 'then' ? stmt.consequent : stmt.alternate!, path.slice(1))
    case 'WhileStatement':
      return yield* execWhile(ctx, env, stmt, path.slice(1))
    case 'DoWhileStatement':
      return yield* execDoWhile(ctx, env, stmt, path.slice(1))
    case 'ForStatement':
      return yield* execFor(ctx, env, stmt, path.slice(1))
    /* istanbul ignore next -- pathIn only builds paths through blocks, ifs and loops */
    default:
      return
  }
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
      env.declare(p.name, p.typeName as LslType, a, true)
    })
    resolveJumps(handler.body)
    yield* execBlock(ctx, env, handler.body)
  } catch (e) {
    if (e instanceof ReturnSignal) return
    if (e instanceof JumpSignal) throw new Error(jumpError(e, `event handler '${handler.name}'`))
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
      env.declare(p.name, p.typeName as LslType, a, true)
    })
    resolveJumps(fn.body)
    yield* execBlock(ctx, env, fn.body)
  } catch (e) {
    if (e instanceof ReturnSignal) {
      if (fn.returnType === null) return { type: 'void', value: 0 }
      return e.value ? stored(coerce(e.value, fn.returnType as LslType)) : defaultEvalFor(fn.returnType as LslType)
    }
    if (e instanceof JumpSignal) {
      // A jump that escaped the function body means the label is undefined
      // within the function. Without this catch the signal would bubble into
      // the calling handler and could land on an unrelated same-named label.
      throw new Error(jumpError(e, `function '${fn.name}'`))
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

/**
 * Run a block. `resume` starts it at a label instead, as when a jump lands
 * inside: its first step is an index into this block.
 */
function* execBlock(
  ctx: InterpreterContext,
  env: Env,
  block: BlockStatement,
  resume: JumpPath | null = null,
): Exec<void> {
  const child = env.push()
  // Duplicate-decl detection has to run upfront because we use
  // declareOrReset below — that quietly tolerates re-running a declaration
  // (which is what backward `jump` does), but a real source-level duplicate
  // like `integer x; integer x;` should still error.
  const declaredNames = new Set<string>()
  for (const s of block.body) {
    if (s.kind !== 'VariableDeclaration') continue
    if (declaredNames.has(s.name)) throw new Error(`duplicate declaration of '${s.name}' in block`)
    declaredNames.add(s.name)
  }
  let i = 0
  let nested: JumpPath | null = null
  // Land on `path`. SLua keeps each local in one register for the whole call,
  // so a declaration the jump skips leaves the value the local last had (or
  // its default, if it never had one).
  const land = (path: JumpPath): void => {
    i = path[0] as number
    for (let j = 0; j < i; j++) {
      const s = block.body[j]!
      if (s.kind === 'VariableDeclaration' && !child.hasOwn(s.name)) {
        child.declare(s.name, s.typeName as LslType, child.lastValue(s))
      }
    }
    if (path.length > 1) nested = path.slice(1)
    else i++
  }
  if (resume) land(resume)
  try {
    while (i < block.body.length) {
      const stmt = block.body[i]!
      try {
        if (nested) {
          const path = nested
          nested = null
          yield* execResumed(ctx, child, stmt, path)
        } else yield* execStatement(ctx, child, stmt)
        i++
      } catch (e) {
        const path = e instanceof JumpSignal && e.target ? pathIn(block, e.target) : null
        if (path) {
          if ((path[0] as number) <= i) iterate(ctx)
          land(path)
          continue
        }
        throw e
      }
    }
  } finally {
    // Remember each local's value for a later jump that skips its declaration.
    for (const s of block.body) {
      if (s.kind === 'VariableDeclaration' && child.hasOwn(s.name)) child.saveLastValue(s, s.name)
    }
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
      yield* evalDiscarded(
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
      throw new JumpSignal(stmt.label, jumpTargets.get(stmt))
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

/** `resume`, if given, is the path to a label in the body that a jump landed on. */
function* execWhile(ctx: InterpreterContext, env: Env, stmt: WhileStatement, resume: JumpPath | null = null): Exec<void> {
  const cov = ctx.state.coverage
  while (true) {
    if (resume) {
      yield* execResumed(ctx, env, stmt.body, resume)
      resume = null
    } else {
      const t = truthy(yield* evalExpression(ctx, env, stmt.test))
      if (cov) cov.hitBranch(stmt.loc, t)
      if (!t) break
      yield* execStatement(ctx, env, stmt.body)
    }
    iterate(ctx)
  }
}

function* execDoWhile(ctx: InterpreterContext, env: Env, stmt: DoWhileStatement, resume: JumpPath | null = null): Exec<void> {
  const cov = ctx.state.coverage
  while (true) {
    if (resume) {
      yield* execResumed(ctx, env, stmt.body, resume)
      resume = null
    } else yield* execStatement(ctx, env, stmt.body)
    const t = truthy(yield* evalExpression(ctx, env, stmt.test))
    if (cov) cov.hitBranch(stmt.loc, t)
    if (!t) break
    iterate(ctx)
  }
}

function* execFor(ctx: InterpreterContext, env: Env, stmt: ForStatement, resume: JumpPath | null = null): Exec<void> {
  const child = env.push()
  const cov = ctx.state.coverage
  if (!resume) for (const e of stmt.init) yield* evalDiscarded(ctx, child, e)
  while (true) {
    if (resume) {
      // A jump landed in the body: finish it, then update and test as usual.
      yield* execResumed(ctx, child, stmt.body, resume)
      resume = null
    } else {
      // The parser requires a condition (`for (;;)` is a syntax error in SL);
      // a hand-built AST without one loops until a jump or state change.
      const t = stmt.test ? truthy(yield* evalExpression(ctx, child, stmt.test)) : true
      if (cov) cov.hitBranch(stmt.loc, t)
      if (!t) break
      yield* execStatement(ctx, child, stmt.body)
    }
    for (const e of stmt.update) yield* evalDiscarded(ctx, child, e)
    iterate(ctx)
  }
}

/** A loop's back-edge, where a script that called llDie or removed itself halts. */
function iterate(ctx: InterpreterContext): void {
  if (ctx.state.lifecycle.dying || ctx.state.lifecycle.removed) throw new HaltSignal()
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
    case 'CastExpression': {
      const value = yield* evalExpression(ctx, env, expr.argument)
      // SLua folds an integer <-> float cast of a constant at compile time,
      // through float32; at run time int -> float is exact and float -> int
      // truncates the double.
      if (isFoldedConstant(expr.argument, true)) {
        if (expr.targetType === 'integer' && value.type === 'float') return coerce(toFloatConstant(value), 'integer')
        if (expr.targetType === 'float' && value.type === 'integer') return toFloatConstant(value)
      }
      return coerce(value, expr.targetType as LslType)
    }
    case 'MemberExpression':
      return yield* evalMember(ctx, env, expr)
    case 'UpdateExpression':
      return yield* evalUpdate(ctx, env, expr)
    case 'PrintExpression':
      return defaultEvalFor((yield* evalExpression(ctx, env, expr.argument)).type)
  }
}

/**
 * Whether SLua's compiler turns `e` into a constant when converting it
 * between integer and float: a number literal (negative ones included), an
 * LSL constant, or such a cast of one. It folds no other operators, and not
 * through parentheses, except the one pair a cast's grammar absorbs
 * (`(float)(1)`). A negated LSL constant only folds where `negatedConstant`
 * allows it (on the left of * / %, which SLua parses as `-(K * x)`).
 */
function isFoldedConstant(e: Expression, castOperand: boolean, negatedConstant = false): boolean {
  if ((e.parens ?? 0) > (castOperand ? 1 : 0)) return false
  switch (e.kind) {
    case 'IntegerLiteral':
    case 'FloatLiteral':
      return true
    case 'Identifier':
      return own(CONSTANT_TABLE, e.name) !== undefined
    case 'UnaryExpression':
      if (e.operator !== '-' || e.argument.parens) return false
      return e.argument.kind === 'IntegerLiteral' || e.argument.kind === 'FloatLiteral' ||
        (negatedConstant && e.argument.kind === 'Identifier' && own(CONSTANT_TABLE, e.argument.name) !== undefined)
    case 'CastExpression':
      return (e.targetType === 'integer' || e.targetType === 'float') && isFoldedConstant(e.argument, true)
    default:
      return false
  }
}

function* evalVectorLiteral(ctx: InterpreterContext, env: Env, e: VectorLiteral): Exec<EvalResult> {
  const x = coerce(yield* evalExpression(ctx, env, e.x), 'float').value as number
  const y = coerce(yield* evalExpression(ctx, env, e.y), 'float').value as number
  const z = coerce(yield* evalExpression(ctx, env, e.z), 'float').value as number
  return { type: 'vector', value: vec(x, y, z) }
}

function* evalRotationLiteral(ctx: InterpreterContext, env: Env, e: RotationLiteral): Exec<EvalResult> {
  const x = coerce(yield* evalExpression(ctx, env, e.x), 'float').value as number
  const y = coerce(yield* evalExpression(ctx, env, e.y), 'float').value as number
  const z = coerce(yield* evalExpression(ctx, env, e.z), 'float').value as number
  const s = coerce(yield* evalExpression(ctx, env, e.s), 'float').value as number
  return { type: 'rotation', value: rot(x, y, z, s) }
}

function* evalListLiteral(ctx: InterpreterContext, env: Env, e: ListLiteral): Exec<EvalResult> {
  const elements: EvalResult[] = []
  for (const el of e.elements) elements.push(yield* evalExpression(ctx, env, el))
  return {
    type: 'list',
    value: scriptList(
      elements.map((r) => r.value),
      elements.map((r) => r.type),
    ),
  }
}

function* evalBinary(ctx: InterpreterContext, env: Env, e: BinaryExpression): Exec<EvalResult> {
  // LSL: && and || are NOT short-circuit, and the right operand runs first.
  let right = yield* evalExpression(ctx, env, e.right)
  let left = yield* evalExpression(ctx, env, e.left)
  const name = inPlaceName(e.right)
  if (name !== undefined && readsInPlace(e.operator, env.scopeOf(name), left, right)) {
    const current = env.get(name)
    // A cast is only dropped when it is to the variable's own type.
    if (e.right.kind !== 'CastExpression' || current.type === right.type) right = current
  }
  // An integer constant that meets a float is converted at compile time, to float32.
  // SLua parses `-K * x` as `-(K * x)`, so a negated LSL constant on the left
  // of * / % still meets the float as a constant.
  const negatedOk = e.operator === '*' || e.operator === '/' || e.operator === '%'
  if (left.type === 'integer' && right.type === 'float' && isFoldedConstant(e.left, false, negatedOk)) left = toFloatConstant(left)
  if (right.type === 'integer' && left.type === 'float' && isFoldedConstant(e.right, false)) right = toFloatConstant(right)
  return applyBinary(e.operator, left, right)
}

/**
 * The variable a right operand reads straight from its register in SLua: an
 * unparenthesized identifier, or a cast of one to its own type, which SLua's
 * compiler drops. Undefined for anything else.
 */
function inPlaceName(e: Expression): string | undefined {
  if (e.parens) return undefined
  if (e.kind === 'Identifier') return e.name
  if (e.kind === 'CastExpression' && !e.argument.parens && e.argument.kind === 'Identifier') return e.argument.name
  return undefined
}

/**
 * Whether SLua reads the right operand's variable after the left side runs,
 * rather than copying it first, so `(x = 4) == x` is 1. A comparison never
 * copies a local or parameter, except a local list; the other operators copy
 * a local but read a parameter in place. Strings, bitwise operators and list
 * concatenation always copy, as does a conversion of the right operand.
 */
function readsInPlace(op: string, scope: string | undefined, left: EvalResult, right: EvalResult): boolean {
  if (scope !== 'local' && scope !== 'param') return false
  // A cast in the source to the variable's own type is fine; an implicit conversion copies.
  const converted = (right.type === 'integer' && left.type === 'float') || (right.type === 'key' && left.type === 'string')
  if (converted) return false
  if (COMPARISONS.has(op)) return right.type !== 'list' || scope === 'param'
  if (scope !== 'param') return false
  if (op === '&&' || op === '||') return true
  return ARITHMETIC.has(op) && right.type !== 'string' && right.type !== 'list' && left.type !== 'list'
}

const COMPARISONS: ReadonlySet<string> = new Set(['==', '!=', '<', '>', '<=', '>='])
const ARITHMETIC: ReadonlySet<string> = new Set(['+', '-', '*', '/', '%'])

function toFloatConstant(r: EvalResult): EvalResult {
  return { type: 'float', value: toFloat32(r.value as number) }
}

/** Whether assigning to `target` stores a float: a float variable or a vector/rotation component. */
function assignsFloat(env: Env, target: Expression): boolean {
  if (target.kind === 'MemberExpression') return true
  return target.kind === 'Identifier' && env.get(target.name).type === 'float'
}

/** Evaluate an expression whose value nothing uses: a statement, or a `for` init or update. */
function* evalDiscarded(ctx: InterpreterContext, env: Env, e: Expression): Exec<void> {
  if (e.kind === 'AssignmentExpression') yield* evalAssignment(ctx, env, e, false)
  else yield* evalExpression(ctx, env, e)
}

function* evalAssignment(
  ctx: InterpreterContext,
  env: Env,
  e: AssignmentExpression,
  used = true,
): Exec<EvalResult> {
  let newValue = yield* evalExpression(ctx, env, e.value)
  // An integer constant assigned to a float (`f = 1`, `f += 1`, `v.x = 1`) is
  // converted at compile time, to float32.
  if (newValue.type === 'integer' && isFoldedConstant(e.value, false) && assignsFloat(env, e.target)) {
    newValue = toFloatConstant(newValue)
  }
  const result = assignTo(ctx, env, e.target, e.operator, newValue)
  // `integer *= float` stores its result, but Mono can't produce it as a value.
  if (used && e.operator === '*=' && result.type === 'integer' && newValue.type === 'float') {
    throw new RuntimeError('cannot take result of integer *= float')
  }
  return result
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
    ? { type: 'rotation', value: rot(updated.x!, updated.y!, updated.z!, updated.s!) }
    : { type: 'vector', value: vec(updated.x!, updated.y!, updated.z!) }
  env.set(target.object.name, wrapped)
  // The assignment's value is the component as stored, in float32.
  return stored(newField)
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
  // Write back; a prefix update's value is the assignment's.
  const assigned = assignTo(ctx, env, e.argument, '=', updated)
  return e.prefix ? assigned : current
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
  // A number passed for a float parameter becomes a 32-bit float before the call.
  const rawArgs: LslValue[] = evalArgs.map((r, i) =>
    (r.type === 'integer' || r.type === 'float') && (spec?.params[i]?.type ?? declared?.params?.[i]) === 'float'
      ? toFloat32(r.value as number)
      : r.value,
  )
  const result = yield* callBuiltin({ state: ctx.state, mocks: ctx.mocks, script: ctx.script }, call.callee, rawArgs, ctx.journal)
  const returnType = (spec?.returnType ?? declared?.returns ?? 'void') as LslType
  if (returnType === 'void') return { type: 'void', value: 0 }
  // Builtins and mocks compute in doubles and return float32, except
  // llList2Float, which casts an integer element to an exact double (SLua).
  const value = result ?? defaultEvalFor(returnType).value
  if (call.callee === 'llList2Float') return { type: returnType, value }
  return { type: returnType, value: toFloat32Value(value, returnType) }
}
