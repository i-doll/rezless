import { lex } from './lexer.js'
import { EVENT_NAMES } from './generated/event-names.js'
import type { Token, TokenKind } from './lexer.js'
import type { Diagnostic, SourceLocation } from './diagnostics.js'
import type {
  Script,
  State,
  EventHandler,
  Param,
  Statement,
  BlockStatement,
  Expression,
  CallExpression,
  ExpressionStatement,
  VariableDeclaration,
  IfStatement,
  WhileStatement,
  DoWhileStatement,
  ForStatement,
  ReturnStatement,
  BinaryOp,
  AssignmentOp,
  UpdateExpression,
  GlobalVariable,
  TypeName,
  VectorLiteral,
  RotationLiteral,
  ListLiteral,
  FunctionDeclaration,
  StateChangeStatement,
  JumpStatement,
  LabelStatement,
} from './ast.js'

const TYPE_KEYWORDS = new Set<string>([
  'integer',
  'float',
  'string',
  'key',
  'vector',
  'rotation',
  'quaternion',
  'list',
])

/** The type a type keyword names. `quaternion` is another name for `rotation`. */
function typeName(t: Token): TypeName {
  return t.text === 'quaternion' ? 'rotation' : (t.text as TypeName)
}

const ASSIGN_OPS = new Set<AssignmentOp>(['=', '+=', '-=', '*=', '/=', '%='])

class Parser {
  private pos = 0
  private readonly diags: Diagnostic[] = []

  constructor(
    private readonly tokens: ReadonlyArray<Token>,
    private readonly filename: string,
  ) {}

  parseScript(): { script: Script; diagnostics: Diagnostic[] } {
    const start = this.peek().loc
    const globals: GlobalVariable[] = []
    const functions: FunctionDeclaration[] = []
    const states: State[] = []

    while (!this.isEOF()) {
      // Top level is either:
      //   * `<type> IDENT (` ...                     → typed user function
      //   * `<type> IDENT [= literal];`              → global variable
      //   * `IDENT (` ...                            → void user function
      //   * `default` / `state IDENT`                → state declaration
      const decl = this.parseTopLevel()
      if (decl) {
        if (decl.kind === 'GlobalVariable') globals.push(decl)
        else if (decl.kind === 'FunctionDeclaration') functions.push(decl)
        else states.push(decl)
      } else {
        this.recoverToTopLevel()
      }
    }
    return {
      script: { kind: 'Script', loc: start, globals, functions, states },
      diagnostics: this.diags,
    }
  }

  private parseTopLevel(): GlobalVariable | FunctionDeclaration | State | null {
    const t = this.peek()
    // typed → either function or global var
    if (t.kind === 'keyword' && TYPE_KEYWORDS.has(t.text)) {
      const next = this.tokens[this.pos + 2]
      if (next && next.kind === 'lparen') {
        return this.parseFunctionDeclaration()
      }
      return this.parseGlobalVariable()
    }
    // bare IDENT( → void function
    if (t.kind === 'identifier') {
      const next = this.tokens[this.pos + 1]
      if (next && next.kind === 'lparen') {
        return this.parseFunctionDeclaration()
      }
      this.diag(`expected state, function, or global at top level (got '${t.text}')`, t.loc)
      return null
    }
    // states
    if (t.kind === 'keyword' && (t.text === 'default' || t.text === 'state')) {
      return this.parseState()
    }
    this.diag(`expected top-level declaration (got '${t.text}')`, t.loc)
    return null
  }

  private parseFunctionDeclaration(): FunctionDeclaration | null {
    let returnType: TypeName | null = null
    let startLoc: SourceLocation
    if (this.atTypeKeyword()) {
      const t = this.advance()
      returnType = typeName(t)
      startLoc = t.loc
    } else {
      startLoc = this.peek().loc
    }
    const name = this.expectName('expected function name')
    if (!name) return null
    if (!this.expect('lparen', "expected '(' after function name")) return null
    const params: Param[] = []
    if (!this.check('rparen')) {
      while (!this.isEOF()) {
        const p = this.parseParam()
        if (!p) return null
        params.push(p)
        if (this.check('comma')) {
          this.advance()
          continue
        }
        break
      }
    }
    if (!this.expect('rparen', "expected ')' to close parameter list")) return null
    const body = this.parseBlock()
    if (!body) return null
    return {
      kind: 'FunctionDeclaration',
      loc: startLoc,
      returnType,
      name: name.text,
      params,
      body,
    }
  }

  // ---- Top level ----

  private parseGlobalVariable(): GlobalVariable | null {
    const t = this.expectKeyword(TYPE_KEYWORDS, 'expected global variable type')
    if (!t) return null
    const name = this.expectName('expected global variable name')
    if (!name) return null
    let init: Expression | null = null
    if (this.checkOp('=')) {
      this.advance()
      const e = this.parseExpression()
      if (!e) return null
      init = e
    }
    if (!this.expect('semi', "expected ';' after global variable declaration")) return null
    return {
      kind: 'GlobalVariable',
      loc: t.loc,
      typeName: typeName(t),
      name: name.text,
      init,
    }
  }

  private parseState(): State | null {
    const tok = this.peek()
    let name: string
    let nameLoc: SourceLocation
    if (tok.kind === 'keyword' && tok.text === 'default') {
      name = 'default'
      nameLoc = tok.loc
      this.advance()
    } else if (tok.kind === 'keyword' && tok.text === 'state') {
      this.advance()
      const id = this.expectName('expected state name after `state`')
      if (!id) return null
      name = id.text
      nameLoc = id.loc
    } else {
      this.diag(`expected state declaration, got '${tok.text}'`, tok.loc)
      return null
    }

    if (!this.expect('lbrace', "expected '{' to open state body")) return null

    const handlers: EventHandler[] = []
    while (!this.check('rbrace') && !this.isEOF()) {
      const h = this.parseEventHandler()
      if (h) handlers.push(h)
      else this.recoverInsideBlock()
    }
    this.expect('rbrace', "expected '}' to close state body")

    return { kind: 'State', loc: nameLoc, name, handlers }
  }

  private parseEventHandler(): EventHandler | null {
    const id = this.expect('identifier', 'expected event handler name')
    if (!id) return null
    if (!this.expect('lparen', "expected '(' after event handler name")) return null

    const params: Param[] = []
    if (!this.check('rparen')) {
      while (!this.isEOF()) {
        const p = this.parseParam()
        if (!p) return null
        params.push(p)
        if (this.check('comma')) {
          this.advance()
          continue
        }
        break
      }
    }
    if (!this.expect('rparen', "expected ')' to close parameter list")) return null
    const body = this.parseBlock()
    if (!body) return null

    return {
      kind: 'EventHandler',
      loc: id.loc,
      name: id.text,
      params,
      body,
    }
  }

  private parseParam(): Param | null {
    const t = this.peek()
    if (t.kind !== 'keyword' || !TYPE_KEYWORDS.has(t.text)) {
      this.diag(`expected parameter type, got '${t.text}'`, t.loc)
      return null
    }
    this.advance()
    const name = this.expectName('expected parameter name')
    if (!name) return null
    return { kind: 'Param', loc: t.loc, typeName: typeName(t), name: name.text }
  }

  // ---- Statements ----

  private parseBlock(): BlockStatement | null {
    const open = this.expect('lbrace', "expected '{' to open block")
    if (!open) return null
    const body: Statement[] = []
    while (!this.check('rbrace') && !this.isEOF()) {
      const s = this.parseStatement()
      if (s) body.push(s)
      else this.recoverInsideBlock()
    }
    this.expect('rbrace', "expected '}' to close block")
    return { kind: 'BlockStatement', loc: open.loc, body }
  }

  private parseStatement(): Statement | null {
    const t = this.peek()

    // Variable declaration: `type IDENT [= expr] ;`
    if (this.atTypeKeyword()) {
      return this.parseVariableDeclaration()
    }

    // Block
    if (t.kind === 'lbrace') return this.parseBlock()

    if (t.kind === 'semi') {
      this.advance()
      return { kind: 'EmptyStatement', loc: t.loc }
    }

    if (t.kind === 'keyword') {
      switch (t.text) {
        case 'if':
          return this.parseIf()
        case 'while':
          return this.parseWhile()
        case 'do':
          return this.parseDoWhile()
        case 'for':
          return this.parseFor()
        case 'return':
          return this.parseReturn()
        case 'state':
          return this.parseStateChange()
        case 'jump':
          return this.parseJump()
      }
    }

    if (t.kind === 'at') return this.parseLabel()

    // Expression statement
    const expr = this.parseExpression()
    if (!expr) return null
    if (!this.expect('semi', "expected ';' after expression statement")) return null
    const stmt: ExpressionStatement = {
      kind: 'ExpressionStatement',
      loc: expr.loc,
      expression: expr,
    }
    return stmt
  }

  /** The body of an if, else or loop, which can't be a bare declaration. */
  private parseBody(): Statement | null {
    if (this.atTypeKeyword()) this.diag('Declaration requires a new scope -- use { and }', this.peek().loc)
    return this.parseStatement()
  }

  private parseVariableDeclaration(): VariableDeclaration | null {
    const t = this.advance() // type keyword
    const name = this.expectName('expected variable name')
    if (!name) return null
    let init: Expression | null = null
    if (this.checkOp('=')) {
      this.advance()
      const e = this.parseExpression()
      if (!e) return null
      init = e
    }
    if (!this.expect('semi', "expected ';' after variable declaration")) return null
    return {
      kind: 'VariableDeclaration',
      loc: t.loc,
      typeName: typeName(t),
      name: name.text,
      init,
    }
  }

  private parseIf(): IfStatement | null {
    const start = this.advance() // 'if'
    if (!this.expect('lparen', "expected '(' after 'if'")) return null
    const test = this.parseExpression()
    if (!test) return null
    if (!this.expect('rparen', "expected ')' after if condition")) return null
    const consequent = this.parseBody()
    if (!consequent) return null
    let alternate: Statement | null = null
    if (this.peek().kind === 'keyword' && this.peek().text === 'else') {
      this.advance()
      alternate = this.parseBody()
      if (!alternate) return null
    }
    return { kind: 'IfStatement', loc: start.loc, test, consequent, alternate }
  }

  private parseWhile(): WhileStatement | null {
    const start = this.advance() // 'while'
    if (!this.expect('lparen', "expected '(' after 'while'")) return null
    const test = this.parseExpression()
    if (!test) return null
    if (!this.expect('rparen', "expected ')' after while condition")) return null
    const body = this.parseBody()
    if (!body) return null
    return { kind: 'WhileStatement', loc: start.loc, test, body }
  }

  private parseDoWhile(): DoWhileStatement | null {
    const start = this.advance() // 'do'
    const body = this.parseBody()
    if (!body) return null
    if (!(this.peek().kind === 'keyword' && this.peek().text === 'while')) {
      this.diag(`expected 'while' after 'do' body`, this.peek().loc)
      return null
    }
    this.advance()
    if (!this.expect('lparen', "expected '(' after 'while'")) return null
    const test = this.parseExpression()
    if (!test) return null
    if (!this.expect('rparen', "expected ')' after while condition")) return null
    if (!this.expect('semi', "expected ';' after do-while statement")) return null
    return { kind: 'DoWhileStatement', loc: start.loc, body, test }
  }

  private parseFor(): ForStatement | null {
    const start = this.advance() // 'for'
    if (!this.expect('lparen', "expected '(' after 'for'")) return null
    const init = this.parseExpressionList('semi')
    if (!this.expect('semi', "expected ';' after for-init")) return null
    let test: Expression | null = null
    if (!this.check('semi')) {
      test = this.parseExpression()
      if (!test) return null
    }
    if (!this.expect('semi', "expected ';' after for-test")) return null
    const update = this.parseExpressionList('rparen')
    if (!this.expect('rparen', "expected ')' to close for-header")) return null
    const body = this.parseBody()
    if (!body) return null
    return { kind: 'ForStatement', loc: start.loc, init, test, update, body }
  }

  private parseReturn(): ReturnStatement | null {
    const start = this.advance() // 'return'
    let argument: Expression | null = null
    if (!this.check('semi')) {
      argument = this.parseExpression()
      if (!argument) return null
    }
    if (!this.expect('semi', "expected ';' after return statement")) return null
    return { kind: 'ReturnStatement', loc: start.loc, argument }
  }

  private parseStateChange(): StateChangeStatement | null {
    const start = this.advance() // 'state'
    // Target may be an identifier (user state) or the keyword `default`.
    const t = this.peek()
    let target: string
    if (t.kind === 'identifier') {
      if (!this.expectName("expected state name after 'state'")) return null
      target = t.text
    } else if (t.kind === 'keyword' && t.text === 'default') {
      this.advance()
      target = 'default'
    } else {
      this.diag(`expected state name after 'state' (got '${t.text}')`, t.loc)
      return null
    }
    if (!this.expect('semi', "expected ';' after state change")) return null
    return { kind: 'StateChangeStatement', loc: start.loc, target }
  }

  private parseJump(): JumpStatement | null {
    const start = this.advance() // 'jump'
    const id = this.expectName("expected label name after 'jump'")
    if (!id) return null
    if (!this.expect('semi', "expected ';' after jump statement")) return null
    return { kind: 'JumpStatement', loc: start.loc, label: id.text }
  }

  private parseLabel(): LabelStatement | null {
    const start = this.advance() // '@'
    const id = this.expectName("expected label name after '@'")
    if (!id) return null
    if (!this.expect('semi', "expected ';' after label declaration")) return null
    return { kind: 'LabelStatement', loc: start.loc, name: id.text }
  }

  /** Parse 0+ comma-separated expressions, stopping (without consuming) at `terminator`. */
  private parseExpressionList(terminator: TokenKind): Expression[] {
    const out: Expression[] = []
    if (this.check(terminator)) return out
    while (!this.isEOF()) {
      const e = this.parseExpression()
      if (!e) return out
      out.push(e)
      if (this.check('comma')) {
        this.advance()
        continue
      }
      break
    }
    return out
  }

  // ---- Expressions (precedence climbing) ----
  // Lowest precedence at top, highest at bottom.

  private parseExpression(): Expression | null {
    return this.parseAssignment()
  }

  private parseAssignment(): Expression | null {
    const left = this.parseLogicalOr()
    if (!left) return null
    if (this.peek().kind === 'op' && ASSIGN_OPS.has(this.peek().text as AssignmentOp)) {
      const op = this.advance()
      const value = this.parseAssignment()
      if (!value) return null
      return {
        kind: 'AssignmentExpression',
        loc: left.loc,
        operator: op.text as AssignmentOp,
        target: left,
        value,
      }
    }
    return left
  }

  private parseLogicalOr(): Expression | null {
    return this.parseBinaryLeft(['||'], () => this.parseLogicalAnd())
  }
  private parseLogicalAnd(): Expression | null {
    return this.parseBinaryLeft(['&&'], () => this.parseBitwiseOr())
  }
  private parseBitwiseOr(): Expression | null {
    return this.parseBinaryLeft(['|'], () => this.parseBitwiseXor())
  }
  private parseBitwiseXor(): Expression | null {
    return this.parseBinaryLeft(['^'], () => this.parseBitwiseAnd())
  }
  private parseBitwiseAnd(): Expression | null {
    return this.parseBinaryLeft(['&'], () => this.parseEquality())
  }
  private parseEquality(): Expression | null {
    return this.parseBinaryLeft(['==', '!='], () => this.parseRelational())
  }
  private parseRelational(): Expression | null {
    return this.parseBinaryLeft(['<', '>', '<=', '>='], () => this.parseShift())
  }
  private parseShift(): Expression | null {
    return this.parseBinaryLeft(['<<', '>>'], () => this.parseAdditive())
  }
  private parseAdditive(): Expression | null {
    return this.parseBinaryLeft(['+', '-'], () => this.parseMultiplicative())
  }
  private parseMultiplicative(): Expression | null {
    return this.parseBinaryLeft(['*', '/', '%'], () => this.parseCast())
  }

  private parseBinaryLeft(
    ops: ReadonlyArray<BinaryOp>,
    next: () => Expression | null,
  ): Expression | null {
    let left = next()
    if (!left) return null
    while (this.peek().kind === 'op' && (ops as ReadonlyArray<string>).includes(this.peek().text)) {
      const op = this.advance()
      const right = next()
      if (!right) return null
      left = {
        kind: 'BinaryExpression',
        loc: left.loc,
        operator: op.text as BinaryOp,
        left,
        right,
      }
    }
    return left
  }

  private parseCast(): Expression | null {
    if (this.atCast()) {
      const start = this.advance() // (
      const ty = this.advance() // type
      this.advance() // )
      const arg = this.parseCastOperand()
      if (!arg) return null
      return {
        kind: 'CastExpression',
        loc: start.loc,
        targetType: typeName(ty),
        argument: arg,
      }
    }
    return this.parseUnary()
  }

  /** Cast vs paren-expr: `(type) expr` is a cast; otherwise it's a paren-expr. */
  private atCast(): boolean {
    const next = this.tokens[this.pos + 1]
    return (
      this.check('lparen') &&
      next?.kind === 'keyword' &&
      TYPE_KEYWORDS.has(next.text) &&
      this.tokens[this.pos + 2]?.kind === 'rparen'
    )
  }

  /**
   * SL casts a postfix expression or a negative number literal. Any other
   * unary operand, including another cast, needs parentheses: `(string)(-x)`.
   */
  private parseCastOperand(): Expression | null {
    const t = this.peek()
    const next = this.tokens[this.pos + 1]
    if (t.kind === 'op' && t.text === '-' && next && (next.kind === 'integer' || next.kind === 'float')) {
      this.advance()
      const arg = this.parsePrimary()
      if (!arg) return null
      return { kind: 'UnaryExpression', loc: t.loc, operator: '-', argument: arg }
    }
    const isUnaryOp = t.kind === 'op' && ['-', '+', '!', '~', '++', '--'].includes(t.text)
    if (isUnaryOp || this.atCast()) {
      this.diag('put parentheses around the expression being cast', t.loc)
      return null
    }
    return this.parsePostfix()
  }

  private parseUnary(): Expression | null {
    const t = this.peek()
    if (t.kind === 'op') {
      if (t.text === '-' || t.text === '!' || t.text === '~') {
        this.advance()
        // Operand may be a cast: `!(integer)s`, `-(float)x`.
        const arg = this.parseCast()
        if (!arg) return null
        return {
          kind: 'UnaryExpression',
          loc: t.loc,
          operator: t.text,
          argument: arg,
        }
      }
      if (t.text === '++' || t.text === '--') {
        this.advance()
        const arg = this.parseUnary()
        if (!arg) return null
        const upd: UpdateExpression = {
          kind: 'UpdateExpression',
          loc: t.loc,
          operator: t.text,
          prefix: true,
          argument: arg,
        }
        return upd
      }
    }
    return this.parsePostfix()
  }

  private parsePostfix(): Expression | null {
    let expr = this.parsePrimary()
    if (!expr) return null
    // Postfix: ++ / -- / .x / .y / .z / .s
    while (true) {
      const t = this.peek()
      if (t.kind === 'op' && (t.text === '++' || t.text === '--')) {
        this.advance()
        const upd: UpdateExpression = {
          kind: 'UpdateExpression',
          loc: t.loc,
          operator: t.text,
          prefix: false,
          argument: expr,
        }
        expr = upd
        continue
      }
      if (t.kind === 'dot') {
        this.advance()
        const id = this.expect('identifier', "expected member name after '.'")
        if (!id) return null
        expr = {
          kind: 'MemberExpression',
          loc: t.loc,
          object: expr,
          property: id.text,
        }
        continue
      }
      break
    }
    return expr
  }

  private parsePrimary(): Expression | null {
    const t = this.peek()
    if (t.kind === 'integer') {
      this.advance()
      return { kind: 'IntegerLiteral', loc: t.loc, value: t.value as number }
    }
    if (t.kind === 'float') {
      this.advance()
      return { kind: 'FloatLiteral', loc: t.loc, value: t.value as number }
    }
    if (t.kind === 'string') {
      this.advance()
      return { kind: 'StringLiteral', loc: t.loc, value: t.value as string }
    }
    if (t.kind === 'identifier') {
      if (!this.expectName('expected name')) return null
      if (this.check('lparen')) {
        this.advance()
        const args: Expression[] = this.parseExpressionList('rparen')
        if (!this.expect('rparen', "expected ')' to close call argument list")) return null
        const call: CallExpression = {
          kind: 'CallExpression',
          loc: t.loc,
          callee: t.text,
          args,
        }
        return call
      }
      return { kind: 'Identifier', loc: t.loc, name: t.text }
    }
    if (t.kind === 'lparen') {
      this.advance()
      const inner = this.parseExpression()
      if (!inner) return null
      if (!this.expect('rparen', "expected ')'")) return null
      return inner
    }
    if (t.kind === 'lbracket') {
      return this.parseListLiteral()
    }
    if (t.kind === 'op' && t.text === '<') {
      return this.parseVectorOrRotationLiteral()
    }
    this.diag(`unexpected token '${t.text}' in expression`, t.loc)
    return null
  }

  private parseListLiteral(): ListLiteral | null {
    const start = this.advance() // [
    const elements: Expression[] = this.parseExpressionList('rbracket')
    if (!this.expect('rbracket', "expected ']' to close list literal")) return null
    return { kind: 'ListLiteral', loc: start.loc, elements }
  }

  /**
   * Vector `<x, y, z>` or rotation `<x, y, z, s>`. As in SL, a component
   * followed by a comma is a full expression, and the last component is a
   * comparison chain closed by the first `>` that no operand follows.
   */
  private parseVectorOrRotationLiteral(): VectorLiteral | RotationLiteral | null {
    const start = this.advance() // <
    const x = this.parseExpression()
    if (!x) return null
    if (!this.expect('comma', "expected ',' in vector/rotation literal")) return null
    const y = this.parseExpression()
    if (!y) return null
    if (!this.expect('comma', "expected ',' in vector/rotation literal")) return null
    const zStart = this.pos
    const last = this.parseLastComponent()
    if (!last) return null
    if (last.closed) return { kind: 'VectorLiteral', loc: start.loc, x, y, z: last.value }
    // Not closed, so this is a rotation's z, which may be a full expression.
    this.pos = zStart
    const z = this.parseExpression()
    if (!z) return null
    if (!this.expect('comma', "expected '>' to close vector literal")) return null
    const s = this.parseLastComponent()
    if (!s) return null
    if (!s.closed) {
      this.diag(`expected '>' to close rotation literal (got '${this.peek().text}')`, this.peek().loc)
      return null
    }
    return { kind: 'RotationLiteral', loc: start.loc, x, y, z, s: s.value }
  }

  /** Comparison chain that ends at a `>` with no operand after it, consuming that `>`. */
  private parseLastComponent(): { value: Expression; closed: boolean } | null {
    let left = this.parseShift()
    if (!left) return null
    while (this.peek().kind === 'op' && ['<', '>', '<=', '>='].includes(this.peek().text)) {
      const op = this.advance()
      if (op.text === '>' && !this.atComparisonOperand()) return { value: left, closed: true }
      const right = this.parseShift()
      if (!right) return null
      left = { kind: 'BinaryExpression', loc: left.loc, operator: op.text as BinaryOp, left, right }
    }
    return { value: left, closed: false }
  }

  /** Tokens SL's grammar reads as the right operand of `>` rather than the end of a literal. */
  private atComparisonOperand(): boolean {
    const t = this.peek()
    if (t.kind === 'op') return ['++', '--', '!', '~'].includes(t.text)
    return ['identifier', 'integer', 'float', 'string', 'lparen', 'lbracket'].includes(t.kind)
  }

  // ---- token helpers ----

  private peek(): Token {
    return this.tokens[this.pos]!
  }

  private advance(): Token {
    const t = this.tokens[this.pos]!
    if (t.kind !== 'eof') this.pos++
    return t
  }

  private isEOF(): boolean {
    return this.peek().kind === 'eof'
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind
  }

  private checkOp(text: string): boolean {
    const t = this.peek()
    return t.kind === 'op' && t.text === text
  }

  private atTypeKeyword(): boolean {
    const t = this.peek()
    return t.kind === 'keyword' && TYPE_KEYWORDS.has(t.text)
  }

  private expect(kind: TokenKind, message: string): Token | null {
    const t = this.peek()
    if (t.kind === kind) {
      return this.advance()
    }
    this.diag(`${message} (got '${t.text}')`, t.loc)
    return null
  }

  /** Expect an identifier used as a name. LSL reserves event names, so they are rejected. */
  private expectName(message: string): Token | null {
    const t = this.expect('identifier', message)
    if (t && EVENT_NAMES.has(t.text)) {
      this.diag(`'${t.text}' is an event name and cannot be used as a name`, t.loc)
      return null
    }
    return t
  }

  private expectOp(text: string, message: string): Token | null {
    const t = this.peek()
    if (t.kind === 'op' && t.text === text) return this.advance()
    this.diag(`${message} (got '${t.text}')`, t.loc)
    return null
  }

  private expectKeyword(allowed: ReadonlySet<string>, message: string): Token | null {
    const t = this.peek()
    if (t.kind === 'keyword' && allowed.has(t.text)) return this.advance()
    this.diag(`${message} (got '${t.text}')`, t.loc)
    return null
  }

  private diag(message: string, loc: SourceLocation): void {
    this.diags.push({ severity: 'error', message, filename: this.filename, loc })
  }

  // ---- recovery ----

  private recoverToTopLevel(): void {
    while (!this.isEOF()) {
      const t = this.peek()
      if (
        t.kind === 'keyword' &&
        (t.text === 'default' || t.text === 'state' || TYPE_KEYWORDS.has(t.text))
      )
        return
      this.advance()
    }
  }

  private recoverInsideBlock(): void {
    let depth = 0
    while (!this.isEOF()) {
      const t = this.peek()
      if (t.kind === 'lbrace') depth++
      else if (t.kind === 'rbrace') {
        if (depth === 0) return
        depth--
      } else if (t.kind === 'semi' && depth === 0) {
        this.advance()
        return
      }
      this.advance()
    }
  }
}

export interface ParseResult {
  readonly script: Script
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

export function parse(source: string, filename: string): ParseResult {
  const lexed = lex(source, filename)
  const parser = new Parser(lexed.tokens, filename)
  const { script, diagnostics } = parser.parseScript()
  return {
    script,
    diagnostics: [...lexed.diagnostics, ...diagnostics],
  }
}
