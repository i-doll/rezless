import type { SourceLocation } from './diagnostics.js'

export interface Node {
  readonly loc: SourceLocation
}

// ---- Top level ----

export interface Script extends Node {
  readonly kind: 'Script'
  readonly globals: ReadonlyArray<GlobalVariable>
  readonly functions: ReadonlyArray<FunctionDeclaration>
  readonly states: ReadonlyArray<State>
}

export interface FunctionDeclaration extends Node {
  readonly kind: 'FunctionDeclaration'
  /** Declared return type, or null for void-returning functions. */
  readonly returnType: TypeName | null
  readonly name: string
  readonly params: ReadonlyArray<Param>
  readonly body: BlockStatement
}

export interface GlobalVariable extends Node {
  readonly kind: 'GlobalVariable'
  readonly typeName: TypeName
  readonly name: string
  readonly init: Expression | null
}

export interface State extends Node {
  readonly kind: 'State'
  /** "default" for the default state, otherwise the user-defined name. */
  readonly name: string
  readonly handlers: ReadonlyArray<EventHandler>
}

export interface EventHandler extends Node {
  readonly kind: 'EventHandler'
  readonly name: string
  readonly params: ReadonlyArray<Param>
  readonly body: BlockStatement
}

export interface Param extends Node {
  readonly kind: 'Param'
  readonly typeName: TypeName
  readonly name: string
}

export type TypeName =
  | 'integer'
  | 'float'
  | 'string'
  | 'key'
  | 'vector'
  | 'rotation'
  | 'list'

// ---- Statements ----

export type Statement =
  | BlockStatement
  | EmptyStatement
  | VariableDeclaration
  | ExpressionStatement
  | IfStatement
  | WhileStatement
  | DoWhileStatement
  | ForStatement
  | ReturnStatement
  | StateChangeStatement
  | JumpStatement
  | LabelStatement

export interface BlockStatement extends Node {
  readonly kind: 'BlockStatement'
  readonly body: ReadonlyArray<Statement>
}

/** A lone `;`. */
export interface EmptyStatement extends Node {
  readonly kind: 'EmptyStatement'
}

export interface VariableDeclaration extends Node {
  readonly kind: 'VariableDeclaration'
  readonly typeName: TypeName
  readonly name: string
  readonly init: Expression | null
}

export interface ExpressionStatement extends Node {
  readonly kind: 'ExpressionStatement'
  readonly expression: Expression
}

export interface IfStatement extends Node {
  readonly kind: 'IfStatement'
  readonly test: Expression
  readonly consequent: Statement
  readonly alternate: Statement | null
}

export interface WhileStatement extends Node {
  readonly kind: 'WhileStatement'
  readonly test: Expression
  readonly body: Statement
}

export interface DoWhileStatement extends Node {
  readonly kind: 'DoWhileStatement'
  readonly body: Statement
  readonly test: Expression
}

export interface ForStatement extends Node {
  readonly kind: 'ForStatement'
  readonly init: ReadonlyArray<Expression> // comma-separated; may be empty
  readonly test: Expression | null
  readonly update: ReadonlyArray<Expression>
  readonly body: Statement
}

export interface ReturnStatement extends Node {
  readonly kind: 'ReturnStatement'
  readonly argument: Expression | null
}

export interface StateChangeStatement extends Node {
  readonly kind: 'StateChangeStatement'
  /** Target state name (`default` or any user state). */
  readonly target: string
}

export interface JumpStatement extends Node {
  readonly kind: 'JumpStatement'
  readonly label: string
}

export interface LabelStatement extends Node {
  readonly kind: 'LabelStatement'
  readonly name: string
}

// ---- Expressions ----

export type Expression =
  | IntegerLiteral
  | FloatLiteral
  | StringLiteral
  | VectorLiteral
  | RotationLiteral
  | ListLiteral
  | Identifier
  | CallExpression
  | UnaryExpression
  | BinaryExpression
  | AssignmentExpression
  | CastExpression
  | MemberExpression
  | UpdateExpression
  | PrintExpression

export interface IntegerLiteral extends Node {
  readonly kind: 'IntegerLiteral'
  readonly value: number
}

export interface FloatLiteral extends Node {
  readonly kind: 'FloatLiteral'
  readonly value: number
}

export interface StringLiteral extends Node {
  readonly kind: 'StringLiteral'
  readonly value: string
}

export interface VectorLiteral extends Node {
  readonly kind: 'VectorLiteral'
  readonly x: Expression
  readonly y: Expression
  readonly z: Expression
}

export interface RotationLiteral extends Node {
  readonly kind: 'RotationLiteral'
  readonly x: Expression
  readonly y: Expression
  readonly z: Expression
  readonly s: Expression
}

export interface ListLiteral extends Node {
  readonly kind: 'ListLiteral'
  readonly elements: ReadonlyArray<Expression>
}

export interface Identifier extends Node {
  readonly kind: 'Identifier'
  readonly name: string
}

export interface CallExpression extends Node {
  readonly kind: 'CallExpression'
  readonly callee: string
  readonly args: ReadonlyArray<Expression>
}

export type UnaryOp = '-' | '!' | '~'

export interface UnaryExpression extends Node {
  readonly kind: 'UnaryExpression'
  readonly operator: UnaryOp
  readonly argument: Expression
}

export type BinaryOp =
  | '*'
  | '/'
  | '%'
  | '+'
  | '-'
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
  | '||'

export interface BinaryExpression extends Node {
  readonly kind: 'BinaryExpression'
  readonly operator: BinaryOp
  readonly left: Expression
  readonly right: Expression
}

export type AssignmentOp = '=' | '+=' | '-=' | '*=' | '/=' | '%='

export interface AssignmentExpression extends Node {
  readonly kind: 'AssignmentExpression'
  readonly operator: AssignmentOp
  /** Target — must be an Identifier or MemberExpression in valid LSL. */
  readonly target: Expression
  readonly value: Expression
}

export interface CastExpression extends Node {
  readonly kind: 'CastExpression'
  readonly targetType: TypeName
  readonly argument: Expression
}

export interface MemberExpression extends Node {
  readonly kind: 'MemberExpression'
  readonly object: Expression
  /** Restricted to "x" | "y" | "z" | "s" in LSL (vector/rotation accessors). */
  readonly property: string
}

export type UpdateOp = '++' | '--'

export interface UpdateExpression extends Node {
  readonly kind: 'UpdateExpression'
  readonly operator: UpdateOp
  readonly prefix: boolean
  readonly argument: Expression
}

/** `print(expr)`: evaluates `expr` and takes its value. */
export interface PrintExpression extends Node {
  readonly kind: 'PrintExpression'
  readonly argument: Expression
}
