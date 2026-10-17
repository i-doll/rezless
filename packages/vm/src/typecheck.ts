import type {
  Script as Ast,
  BinaryOp,
  BlockStatement,
  CallExpression,
  Diagnostic,
  Expression,
  Node,
  Param,
  Statement,
  TypeName,
} from '@rezless/parser'
import { BUILTIN_SPECS } from './generated/functions.js'
import type { BuiltinSpec } from './generated/functions.js'
import { EVENT_SPECS } from './generated/events.js'
import type { EventSpec } from './generated/events.js'
import { CONSTANT_TABLE } from './generated/constants_table.js'
import { own } from './own.js'

/**
 * Static type checker mirroring SL's compiler, so scripts that wouldn't
 * compile in-world fail at load time instead of passing tests.
 *
 * `unknown` is the type of a call to a function that's neither user-defined
 * nor in kwdb (tests can supply those through `script.mock`); anything that
 * touches it is left unchecked.
 */
type Ty = TypeName | 'void' | 'unknown'

export function typecheck(ast: Ast, filename: string): Diagnostic[] {
  return new Checker(ast, filename).run()
}

const CASTS: Record<TypeName, ReadonlyArray<TypeName>> = {
  integer: ['integer', 'float', 'string', 'list'],
  float: ['integer', 'float', 'string', 'list'],
  string: ['integer', 'float', 'string', 'key', 'vector', 'rotation', 'list'],
  key: ['key', 'string', 'list'],
  vector: ['vector', 'string', 'list'],
  rotation: ['rotation', 'string', 'list'],
  list: ['list', 'string'],
}

/** Implicit conversions SL allows on assignment, argument passing and return. */
function assignable(dst: Ty, src: Ty): boolean {
  if (src === 'unknown' || dst === 'unknown') return true
  if (src === 'void' || dst === 'void') return false
  return (
    dst === src ||
    (dst === 'float' && src === 'integer') ||
    (dst === 'key' && src === 'string') ||
    (dst === 'string' && src === 'key')
  )
}

const isNum = (t: Ty): boolean => t === 'integer' || t === 'float'
const isText = (t: Ty): boolean => t === 'string' || t === 'key'

/** Result type of `l op r`, or null when SL rejects the operand types. */
function binaryType(op: BinaryOp, l: Ty, r: Ty): Ty | null {
  if (l === 'unknown' || r === 'unknown') return 'unknown'
  if (l === 'void' || r === 'void') return null
  const numeric = (): Ty | null =>
    isNum(l) && isNum(r) ? (l === 'float' || r === 'float' ? 'float' : 'integer') : null
  switch (op) {
    case '+':
      if (l === 'list' || r === 'list') return 'list'
      if (l === r && (l === 'string' || l === 'vector' || l === 'rotation')) return l
      return numeric()
    case '-':
      if (l === r && (l === 'vector' || l === 'rotation')) return l
      return numeric()
    case '*':
      if (l === 'vector' && r === 'vector') return 'float'
      if ((l === 'vector' && isNum(r)) || (isNum(l) && r === 'vector')) return 'vector'
      if (l === 'vector' && r === 'rotation') return 'vector'
      if (l === 'rotation' && r === 'rotation') return 'rotation'
      return numeric()
    case '/':
      if (l === 'vector' && (isNum(r) || r === 'rotation')) return 'vector'
      if (l === 'rotation' && r === 'rotation') return 'rotation'
      return numeric()
    case '%':
      if (l === 'vector' && r === 'vector') return 'vector'
      return l === 'integer' && r === 'integer' ? 'integer' : null
    case '==':
    case '!=':
      return (isNum(l) && isNum(r)) || (isText(l) && isText(r)) || l === r ? 'integer' : null
    case '<':
    case '>':
    case '<=':
    case '>=':
      return numeric() ? 'integer' : null
    case '<<':
    case '>>':
    case '&':
    case '|':
    case '^':
    case '&&':
    case '||':
      return l === 'integer' && r === 'integer' ? 'integer' : null
  }
}

/**
 * Where SL allows a state change (inside global functions) or a
 * `return voidFn();` (anywhere void). These follow LL's compiler, bugs
 * included: allowed in loop bodies, deferred in an `if` branch (an error
 * only once the `if` gets an `else`), denied directly in the body.
 */
type Mode = 'allowed' | 'deferred' | 'denied'

interface Pending {
  readonly node: Node
  readonly message: string
}

interface Signature {
  readonly returnType: Ty
  readonly params: ReadonlyArray<Ty>
}

class Checker {
  private readonly diagnostics: Diagnostic[] = []
  private readonly globals = new Map<string, Ty>()
  private readonly functions = new Map<string, Signature>()
  private readonly states: Set<string>
  private scopes: Array<Map<string, Ty>> = []
  /** Return type of the function being checked; 'void' inside event handlers. */
  private returnType: Ty = 'void'
  private inFunction = false
  /** Labels visible from the current block: its own and every enclosing block's. */
  private labelScopes: Array<Set<string>> = []
  /** Every label in the current function or handler; Mono rejects duplicates. */
  private labels = new Set<string>()

  constructor(
    private readonly ast: Ast,
    private readonly filename: string,
  ) {
    this.states = new Set(ast.states.map((s) => s.name))
    for (const f of ast.functions) {
      this.functions.set(f.name, {
        returnType: f.returnType ?? 'void',
        params: f.params.map((p) => p.typeName),
      })
    }
  }

  run(): Diagnostic[] {
    const decls = [...this.ast.globals, ...this.ast.functions]
    const states = [...this.ast.states].sort((a, b) => a.loc.offset - b.loc.offset)
    const firstState = states[0]
    if (firstState && firstState.name !== 'default') {
      this.error(firstState, 'Syntax error: the default state must come first')
    }
    for (const d of decls) {
      if (firstState && d.loc.offset > firstState.loc.offset) {
        this.error(d, `Syntax error: ${d.name} must be declared before the states`)
      }
    }
    // Globals, functions and states share one namespace with the built-in
    // functions and constants.
    const topLevel = new Set<string>()
    for (const d of [...decls, ...states].sort((a, b) => a.loc.offset - b.loc.offset)) {
      const builtin = Object.hasOwn(BUILTIN_SPECS, d.name) || Object.hasOwn(CONSTANT_TABLE, d.name)
      if (builtin || topLevel.has(d.name)) this.alreadyDeclared(d, d.name)
      topLevel.add(d.name)
    }
    for (const g of this.ast.globals) {
      if (g.init) {
        if (!isSimpleGlobalInit(g.init, true)) {
          this.error(
            g.init,
            'Syntax error: a global can only be initialised with a literal, a constant or an earlier global',
          )
        }
        this.expectAssignable(g, g.typeName, this.expr(g.init))
      }
      this.globals.set(g.name, g.typeName)
    }
    for (const f of this.ast.functions) {
      this.returnType = f.returnType ?? 'void'
      this.inFunction = true
      this.body(f.params, f.body)
      if (f.returnType && !alwaysReturns(f.body)) {
        this.error(f, `Not all code paths return a value in ${f.name}`)
      }
    }
    this.inFunction = false
    for (const s of this.ast.states) {
      if (s.handlers.length === 0) this.error(s, `Syntax error: state ${s.name} has no event handlers`)
      const events = new Set<string>()
      for (const h of s.handlers) {
        if (events.has(h.name)) this.alreadyDeclared(h, h.name)
        events.add(h.name)
        const spec = own(EVENT_SPECS as Record<string, EventSpec>, h.name)
        if (!spec) {
          this.error(h, `Unknown event '${h.name}'`)
        } else if (
          spec.params.length !== h.params.length ||
          spec.params.some((p, i) => p.type !== h.params[i]!.typeName)
        ) {
          const want = spec.params.map((p) => p.type).join(', ')
          this.error(h, `Event '${h.name}' takes (${want})`)
        }
        this.returnType = 'void'
        this.body(h.params, h.body)
      }
    }
    return this.diagnostics
  }

  private error(node: Node, message: string): void {
    this.diagnostics.push({ severity: 'error', message, filename: this.filename, loc: node.loc })
  }

  private alreadyDeclared(node: Node, name: string): void {
    this.error(node, `Name previously declared within scope: ${name}`)
  }

  /** Check a function or handler body against its parameters. */
  private body(params: ReadonlyArray<Param>, body: BlockStatement): void {
    const scope = new Map<string, Ty>()
    for (const p of params) {
      this.declare(scope, p, p.name, p.typeName)
    }
    this.scopes = [scope]
    this.labelScopes = []
    this.labels = new Set()
    this.block(body, 'denied')
  }

  private declare(scope: Map<string, Ty>, node: Node, name: string, type: Ty): void {
    if (Object.hasOwn(CONSTANT_TABLE, name)) this.error(node, `Syntax error: ${name} is a constant`)
    else if (scope.has(name)) this.alreadyDeclared(node, name)
    scope.set(name, type)
  }

  private mismatch(node: Node, detail: string): void {
    this.error(node, `Type mismatch: ${detail}`)
  }

  private expectAssignable(node: Node, dst: Ty, src: Ty): void {
    if (!assignable(dst, src)) this.mismatch(node, `cannot assign ${src} to ${dst}`)
  }

  // ---- Statements ----

  private block(b: BlockStatement, mode: Mode): Pending[] {
    this.scopes.push(new Map())
    this.labelScopes.push(labelsIn(b.body))
    const pending = b.body.flatMap((s) => this.stmt(s, mode))
    this.labelScopes.pop()
    this.scopes.pop()
    return pending
  }

  /** Returns deferred errors that only count if an enclosing `if` gets an `else`. */
  private restricted(node: Node, message: string, mode: Mode): Pending[] {
    if (mode === 'denied') this.error(node, message)
    return mode === 'deferred' ? [{ node, message }] : []
  }

  private stmt(s: Statement, mode: Mode): Pending[] {
    switch (s.kind) {
      case 'BlockStatement':
        return this.block(s, mode)
      case 'VariableDeclaration':
        if (s.init) this.expectAssignable(s, s.typeName, this.expr(s.init))
        this.declare(this.scopes[this.scopes.length - 1]!, s, s.name, s.typeName)
        return []
      case 'ExpressionStatement':
        this.expr(s.expression)
        return []
      case 'IfStatement': {
        this.condition(s.test)
        const then = this.stmt(s.consequent, 'deferred')
        if (!s.alternate) return []
        if (mode === 'denied') for (const p of then) this.error(p.node, p.message)
        const otherwise = this.stmt(s.alternate, mode)
        return mode === 'deferred' ? [...then, ...otherwise] : []
      }
      case 'WhileStatement':
        this.condition(s.test)
        this.stmt(s.body, 'allowed')
        return []
      case 'DoWhileStatement':
        this.stmt(s.body, 'allowed')
        this.condition(s.test)
        return []
      case 'ForStatement':
        for (const e of s.init) this.expr(e)
        if (s.test) this.condition(s.test)
        for (const e of s.update) this.expr(e)
        this.stmt(s.body, 'allowed')
        return []
      case 'ReturnStatement': {
        const got: Ty = s.argument ? this.expr(s.argument) : 'void'
        if (got === 'void' && this.returnType !== 'void') {
          this.error(s, "Function returns a value but return statement doesn't")
          return []
        }
        const message = `Return statement type doesn't match function return type (${got} vs ${this.returnType})`
        if (this.returnType === 'void') {
          if (got === 'unknown') return []
          if (got !== 'void') this.error(s, message)
          // `return voidFn();` compiles in some positions (an LL compiler quirk).
          else if (s.argument) return this.restricted(s, message, mode)
        } else if (!assignable(this.returnType, got)) {
          this.error(s, message)
        }
        return []
      }
      case 'StateChangeStatement':
        if (!this.states.has(s.target)) this.error(s, `Name not defined within scope: state ${s.target}`)
        return this.inFunction ? this.restricted(s, "Global functions can't change state", mode) : []
      case 'JumpStatement':
        if (!this.labelScopes.some((scope) => scope.has(s.label))) {
          this.error(s, `Name not defined within scope: label ${s.label}`)
        }
        return []
      case 'LabelStatement':
        if (this.labels.has(s.name)) this.error(s, `Duplicate label name: ${s.name}`)
        this.labels.add(s.name)
        return []
    }
  }

  private condition(e: Expression): void {
    if (this.expr(e) === 'void') this.mismatch(e, 'condition has no value')
  }

  // ---- Expressions ----

  private isVariable(name: string): boolean {
    return this.scopes.some((scope) => scope.has(name)) || this.globals.has(name)
  }

  private lookup(name: string): Ty | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const t = this.scopes[i]!.get(name)
      if (t) return t
    }
    return this.globals.get(name) ?? (own(CONSTANT_TABLE, name)?.type as TypeName | undefined)
  }

  private expr(e: Expression): Ty {
    switch (e.kind) {
      case 'IntegerLiteral':
        return 'integer'
      case 'FloatLiteral':
        return 'float'
      case 'StringLiteral':
        return 'string'
      case 'VectorLiteral':
        for (const c of [e.x, e.y, e.z]) this.component(c)
        return 'vector'
      case 'RotationLiteral':
        for (const c of [e.x, e.y, e.z, e.s]) this.component(c)
        return 'rotation'
      case 'ListLiteral':
        // SL compiles any element type; a list or void element only fails at runtime.
        for (const el of e.elements) this.expr(el)
        return 'list'
      case 'Identifier': {
        const t = this.lookup(e.name)
        if (t) return t
        this.error(e, `Name not defined within scope: ${e.name}`)
        return 'unknown'
      }
      case 'CallExpression':
        return this.call(e)
      case 'UnaryExpression': {
        const t = this.expr(e.argument)
        if (t === 'unknown') return t
        const ok =
          e.operator === '-' || e.operator === '+'
            ? isNum(t) || t === 'vector' || t === 'rotation'
            : t === 'integer'
        if (ok) return t
        this.mismatch(e, `'${e.operator}' not defined for ${t}`)
        return 'unknown'
      }
      case 'BinaryExpression': {
        const l = this.expr(e.left)
        const r = this.expr(e.right)
        const t = binaryType(e.operator, l, r)
        if (t) return t
        this.mismatch(e, `'${e.operator}' not defined for ${l} and ${r}`)
        return 'unknown'
      }
      case 'AssignmentExpression': {
        const target = this.lvalue(e.target)
        const value = this.expr(e.value)
        if (e.operator === '=') {
          this.expectAssignable(e, target, value)
          return target
        }
        // `integer *= float` is a documented SL quirk; every other compound
        // assignment must produce a value assignable back to the target.
        if (e.operator === '*=' && target === 'integer' && value === 'float') return target
        const t = binaryType(e.operator[0] as BinaryOp, target, value)
        if (!t || !assignable(target, t)) {
          this.mismatch(e, `'${e.operator}' not defined for ${target} and ${value}`)
        }
        return target
      }
      case 'CastExpression': {
        const t = this.expr(e.argument)
        if (t === 'unknown') return e.targetType
        if (t === 'void' || !CASTS[t].includes(e.targetType)) {
          this.mismatch(e, `cannot cast ${t} to ${e.targetType}`)
        }
        return e.targetType
      }
      case 'MemberExpression':
        return this.member(e)
      case 'UpdateExpression': {
        const t = this.lvalue(e.argument)
        if (t !== 'unknown' && !isNum(t)) this.mismatch(e, `'${e.operator}' not defined for ${t}`)
        return t
      }
    }
  }

  private component(e: Expression): void {
    const t = this.expr(e)
    if (!assignable('float', t)) this.mismatch(e, `vector/rotation component must be a number, got ${t}`)
  }

  private member(e: Expression & { kind: 'MemberExpression' }): Ty {
    if (e.object.kind !== 'Identifier') {
      this.error(e, `Syntax error: .${e.property} only works on a variable`)
    }
    const t = this.expr(e.object)
    if (t === 'unknown') return 'float'
    const ok =
      (t === 'vector' && ['x', 'y', 'z'].includes(e.property)) ||
      (t === 'rotation' && ['x', 'y', 'z', 's'].includes(e.property))
    if (!ok) this.error(e, `Use of vector or quaternion method on incorrect type: ${t}.${e.property}`)
    return 'float'
  }

  private lvalue(e: Expression): Ty {
    const base = e.kind === 'MemberExpression' ? e.object : e
    if (base.kind === 'Identifier' && !this.isVariable(base.name) && own(CONSTANT_TABLE, base.name)) {
      this.error(e, `Syntax error: can't assign to constant ${base.name}`)
      return this.expr(e)
    }
    if (e.kind === 'Identifier' || e.kind === 'MemberExpression') return this.expr(e)
    this.expr(e)
    this.error(e, 'Assignment target must be a variable')
    return 'unknown'
  }

  private call(e: CallExpression): Ty {
    const args = e.args.map((a) => this.expr(a))
    const builtin = own(BUILTIN_SPECS as Record<string, BuiltinSpec>, e.callee)
    const sig: Signature | undefined =
      this.functions.get(e.callee) ??
      (builtin && { returnType: builtin.returnType, params: builtin.params.map((p) => p.type) })
    if (!sig) return 'unknown'
    if (sig.params.length !== args.length || sig.params.some((p, i) => !assignable(p, args[i]!))) {
      const want = sig.params.join(', ')
      this.error(e, `Function call mismatches type or number of arguments: ${e.callee}(${want})`)
    }
    return sig.returnType
  }
}

/**
 * SL only allows literals, constants and earlier globals in a global
 * initialiser, optionally negated (numbers) or wrapped in a vector, rotation
 * or (one level of) list literal.
 */
function isSimpleGlobalInit(e: Expression, allowList: boolean): boolean {
  switch (e.kind) {
    case 'IntegerLiteral':
    case 'FloatLiteral':
    case 'StringLiteral':
    case 'Identifier':
      return true
    case 'UnaryExpression':
      return (
        e.operator === '-' &&
        (e.argument.kind === 'IntegerLiteral' || e.argument.kind === 'FloatLiteral')
      )
    case 'VectorLiteral':
      return [e.x, e.y, e.z].every((c) => isSimpleGlobalInit(c, false))
    case 'RotationLiteral':
      return [e.x, e.y, e.z, e.s].every((c) => isSimpleGlobalInit(c, false))
    case 'ListLiteral':
      return allowList && e.elements.every((el) => isSimpleGlobalInit(el, false))
    default:
      return false
  }
}

/**
 * SL's return-path rule: a block returns if its last statement does, and an
 * `if` returns only when both branches do. Loops never count.
 */
function alwaysReturns(s: Statement): boolean {
  switch (s.kind) {
    case 'ReturnStatement':
      return true
    case 'BlockStatement': {
      const last = s.body[s.body.length - 1]
      return last !== undefined && alwaysReturns(last)
    }
    case 'IfStatement':
      return s.alternate !== null && alwaysReturns(s.consequent) && alwaysReturns(s.alternate)
    default:
      return false
  }
}

/**
 * Labels declared in a block, including inside unbraced if/loop bodies,
 * which share the block's scope. Jumps can reach these from the block and
 * anything nested in it, before or after the label.
 */
function labelsIn(stmts: ReadonlyArray<Statement>): Set<string> {
  const out = new Set<string>()
  const visit = (s: Statement): void => {
    switch (s.kind) {
      case 'LabelStatement':
        out.add(s.name)
        return
      case 'IfStatement':
        visit(s.consequent)
        if (s.alternate) visit(s.alternate)
        return
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'ForStatement':
        visit(s.body)
        return
      default:
        return
    }
  }
  stmts.forEach(visit)
  return out
}
