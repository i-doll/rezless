import type { Expression, FunctionDeclaration, Script as Ast, Statement } from '@rezless/parser'
import type { LslType, LslValue } from './values/types.js'
import { listElementTypes } from './values/list-types.js'

/** Mono's default and largest script memory limit. */
const MAX_MEMORY = 65536

/** Memory a fresh script reports beyond its code. */
const SCRIPT_BASE = 292
const CODE_BLOCK = 512

const FRAME_BYTES = 46

const LIST_HEADER = 36

/** A fatal Stack-Heap Collision: the script ran out of memory. */
export class StackHeapCollision extends Error {
  reported = false

  constructor() {
    super('Stack-Heap Collision')
    this.name = 'StackHeapCollision'
  }
}

/**
 * A script's estimated memory use, modelled on Second Life's Mono numbers:
 * code in 512-byte blocks, globals, local strings and lists, and the deepest
 * call stack of the current event.
 */
export class Memory {
  limit = MAX_MEMORY
  used: number
  peak = 0
  profiling = false
  /** Bytes held by local variables. */
  locals = 0
  private stack = 0
  private stackHighWater = 0

  constructor(
    code: number,
    private readonly enforced: boolean,
  ) {
    this.used = SCRIPT_BASE + code
  }

  /** Take `bytes` (or give them back when negative). Throws past the limit. */
  alloc(bytes: number): void {
    const used = this.used + bytes
    if (bytes > 0 && this.enforced && used > this.limit) throw new StackHeapCollision()
    this.used = used
    if (this.profiling && used > this.peak) this.peak = used
  }

  allocLocal(bytes: number): void {
    this.alloc(bytes)
    this.locals += bytes
  }

  /** Free every local allocated since `locals` read `mark`. */
  releaseLocals(mark: number): void {
    this.alloc(mark - this.locals)
    this.locals = mark
  }

  /** Enter a call frame. Stack memory stays at its high-water mark until the next event. */
  pushFrame(bytes: number): void {
    const stack = this.stack + bytes
    if (stack > this.stackHighWater) {
      this.alloc(stack - this.stackHighWater)
      this.stackHighWater = stack
    }
    this.stack = stack
  }

  popFrame(bytes: number): void {
    this.stack -= bytes
  }

  /** Drop the last event's stack. Throws if the script is already past its limit, as code alone can be. */
  startEvent(): void {
    this.releaseStack()
    if (this.enforced && this.used > this.limit) throw new StackHeapCollision()
  }

  releaseStack(): void {
    this.alloc(-this.stackHighWater)
    this.stackHighWater = 0
  }

  /** llSetMemoryLimit: accept a limit above current use, up to 64 KiB. */
  setLimit(limit: number): boolean {
    if (limit <= this.used || limit > MAX_MEMORY) return false
    this.limit = limit
    return true
  }

  startProfiling(): void {
    this.profiling = true
    this.peak = this.used
  }
}

/**
 * Stack bytes of a call to `fn`: a fixed frame plus each parameter and local
 * at its type's size. Strings and lists are charged as values when they're
 * assigned, so they add nothing here.
 */
export function frameBytes(fn: FunctionDeclaration): number {
  let bytes = frames.get(fn)
  if (bytes === undefined) {
    bytes = fn.params.reduce((n, p) => n + slotBytes(p.typeName), FRAME_BYTES + localsIn(fn.body))
    frames.set(fn, bytes)
  }
  return bytes
}

const frames = new WeakMap<FunctionDeclaration, number>()

function slotBytes(type: string): number {
  switch (type) {
    case 'vector':
      return 12
    case 'rotation':
      return 16
    case 'string':
    case 'list':
      return 0
    default:
      return 4
  }
}

function localsIn(s: Statement): number {
  switch (s.kind) {
    case 'VariableDeclaration':
      return slotBytes(s.typeName)
    case 'BlockStatement':
      return s.body.reduce((n, b) => n + localsIn(b), 0)
    case 'IfStatement':
      return localsIn(s.consequent) + (s.alternate ? localsIn(s.alternate) : 0)
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
      return localsIn(s.body)
    default:
      return 0
  }
}

/** Bytes a global variable holding `value` takes. */
export function globalBytes(type: LslType, value: LslValue): number {
  switch (type) {
    case 'string':
      return stringBytes(value as string)
    // The wiki gives a key 102 bytes, but in-world probes found a global key's
    // content costs nothing, so a global key is only its reference.
    case 'vector':
      return 12
    case 'rotation':
      return 16
    case 'list':
      return listBytes(value as ReadonlyArray<LslValue>)
    default:
      return 4
  }
}

/** A reference to a string object: 4 + 14 + 2 bytes per UTF-16 unit. */
export function stringBytes(s: string): number {
  return 18 + 2 * s.length
}

export function listBytes(list: ReadonlyArray<LslValue>): number {
  const types = listElementTypes(list)
  let bytes = 4 + LIST_HEADER
  for (let i = 0; i < list.length; i++) {
    const v = list[i]!
    if (typeof v === 'number') bytes += 16
    else if (typeof v === 'string') bytes += types?.[i] === 'key' ? 30 + 2 * v.length : stringBytes(v)
    else bytes += 's' in v ? 28 : 24
  }
  return bytes
}

/**
 * Code size estimated from the AST, rounded up to whole 512-byte blocks.
 * The weights are calibrated against in-world llGetUsedMemory readings.
 */
export function codeBytes(ast: Ast): number {
  let bytes = 2984
  for (const g of ast.globals) bytes += 60 + (g.init ? expressionBytes(g.init) : 0)
  for (const f of ast.functions) bytes += 40 + 4 * f.params.length + statementBytes(f.body)
  for (const s of ast.states) {
    for (const h of s.handlers) bytes += 46 + 4 * h.params.length + statementBytes(h.body)
  }
  return Math.ceil(bytes / CODE_BLOCK) * CODE_BLOCK
}

function statementBytes(s: Statement): number {
  switch (s.kind) {
    case 'BlockStatement':
      return s.body.reduce((n, b) => n + statementBytes(b), 0)
    case 'VariableDeclaration':
      return 5 + (s.init ? expressionBytes(s.init) : 0)
    case 'ExpressionStatement':
      return 5 + expressionBytes(s.expression)
    case 'IfStatement':
      return 5 + expressionBytes(s.test) + statementBytes(s.consequent) + (s.alternate ? statementBytes(s.alternate) : 0)
    case 'WhileStatement':
    case 'DoWhileStatement':
      return 5 + expressionBytes(s.test) + statementBytes(s.body)
    case 'ForStatement':
      return (
        5 +
        [...s.init, ...s.update].reduce((n, e) => n + expressionBytes(e), 0) +
        (s.test ? expressionBytes(s.test) : 0) +
        statementBytes(s.body)
      )
    case 'ReturnStatement':
      return 5 + (s.argument ? expressionBytes(s.argument) : 0)
    default:
      return 5
  }
}

function expressionBytes(e: Expression): number {
  switch (e.kind) {
    case 'StringLiteral':
      return 14 + 2 * e.value.length
    case 'CallExpression':
      return e.args.reduce((n, a) => n + expressionBytes(a), 16)
    case 'IntegerLiteral':
    case 'FloatLiteral':
    case 'Identifier':
      return 1
    case 'VectorLiteral':
      return 1 + expressionBytes(e.x) + expressionBytes(e.y) + expressionBytes(e.z)
    case 'RotationLiteral':
      return 1 + expressionBytes(e.x) + expressionBytes(e.y) + expressionBytes(e.z) + expressionBytes(e.s)
    case 'ListLiteral':
      return e.elements.reduce((n, a) => n + expressionBytes(a), 1)
    case 'BinaryExpression':
      return 1 + expressionBytes(e.left) + expressionBytes(e.right)
    case 'AssignmentExpression':
      return 1 + expressionBytes(e.target) + expressionBytes(e.value)
    case 'MemberExpression':
      return 1 + expressionBytes(e.object)
    case 'UnaryExpression':
    case 'CastExpression':
    case 'UpdateExpression':
    case 'PrintExpression':
      return 1 + expressionBytes(e.argument)
  }
}
