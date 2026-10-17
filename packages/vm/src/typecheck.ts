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
    // Globals and functions share one namespace.
    const topLevel = new Set<string>()
    for (const d of [...this.ast.globals, ...this.ast.functions].sort(
      (a, b) => a.loc.offset - b.loc.offset,
    )) {
      if (topLevel.has(d.name)) this.alreadyDeclared(d, d.name)
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
      this.scopes = [this.paramScope(f.params)]
      this.block(f.body)
      if (f.returnType && !alwaysReturns(f.body)) {
        this.error(f, `Not all code paths return a value in ${f.name}`)
      }
    }
    for (const s of this.ast.states) {
      for (const h of s.handlers) {
        const spec = (EVENT_SPECS as Record<string, EventSpec>)[h.name]
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
        this.scopes = [this.paramScope(h.params)]
        this.block(h.body)
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

  private paramScope(params: ReadonlyArray<Param>): Map<string, Ty> {
    const scope = new Map<string, Ty>()
    for (const p of params) {
      if (scope.has(p.name)) this.alreadyDeclared(p, p.name)
      scope.set(p.name, p.typeName)
    }
    return scope
  }

  private mismatch(node: Node, detail: string): void {
    this.error(node, `Type mismatch: ${detail}`)
  }

  private expectAssignable(node: Node, dst: Ty, src: Ty): void {
    if (!assignable(dst, src)) this.mismatch(node, `cannot assign ${src} to ${dst}`)
  }

  // ---- Statements ----

  private block(b: BlockStatement): void {
    this.scopes.push(new Map())
    for (const s of b.body) this.stmt(s)
    this.scopes.pop()
  }

  private stmt(s: Statement): void {
    switch (s.kind) {
      case 'BlockStatement':
        return this.block(s)
      case 'VariableDeclaration': {
        if (s.init) this.expectAssignable(s, s.typeName, this.expr(s.init))
        const scope = this.scopes[this.scopes.length - 1]!
        if (scope.has(s.name)) this.alreadyDeclared(s, s.name)
        scope.set(s.name, s.typeName)
        return
      }
      case 'ExpressionStatement':
        this.expr(s.expression)
        return
      case 'IfStatement':
        this.condition(s.test)
        this.stmt(s.consequent)
        if (s.alternate) this.stmt(s.alternate)
        return
      case 'WhileStatement':
        this.condition(s.test)
        return this.stmt(s.body)
      case 'DoWhileStatement':
        this.stmt(s.body)
        return this.condition(s.test)
      case 'ForStatement':
        for (const e of s.init) this.expr(e)
        if (s.test) this.condition(s.test)
        for (const e of s.update) this.expr(e)
        return this.stmt(s.body)
      case 'ReturnStatement': {
        const got: Ty = s.argument ? this.expr(s.argument) : 'void'
        if (got === 'void' && this.returnType !== 'void') {
          this.error(s, "Function returns a value but return statement doesn't")
          return
        }
        const ok = this.returnType === 'void' ? got === 'void' : assignable(this.returnType, got)
        if (!ok) {
          this.error(
            s,
            `Return statement type doesn't match function return type (${got} vs ${this.returnType})`,
          )
        }
        return
      }
      case 'StateChangeStatement':
        if (!this.states.has(s.target)) this.error(s, `Name not defined within scope: state ${s.target}`)
        return
      case 'JumpStatement':
      case 'LabelStatement':
        return
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
    return this.globals.get(name) ?? (CONSTANT_TABLE[name]?.type as TypeName | undefined)
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
    if (base.kind === 'Identifier' && !this.isVariable(base.name) && CONSTANT_TABLE[base.name]) {
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
    const builtin = (BUILTIN_SPECS as Record<string, BuiltinSpec>)[e.callee]
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
