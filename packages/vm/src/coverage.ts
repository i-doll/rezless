import type { Script as Ast, Statement, SourceLocation } from '@rezless/parser'

export type StatementKind = Statement['kind']

export interface StatementInfo {
  readonly id: number
  readonly line: number
  readonly col: number
  readonly kind: StatementKind
}

export type BranchKind = 'if' | 'while' | 'do-while' | 'for'

export interface BranchInfo {
  readonly id: number
  readonly line: number
  readonly col: number
  readonly kind: BranchKind
  /** False when the AST has no `else` arm — the implicit-else outcome still
   *  counts toward branch coverage when the test ever evaluates false. */
  readonly hasElse: boolean
}

export type FunctionKind = 'function' | 'event'

export interface FunctionInfo {
  readonly id: number
  readonly name: string
  readonly line: number
  readonly col: number
  readonly kind: FunctionKind
  /** State name for events; undefined for free functions. */
  readonly state?: string
}

export interface StateInfo {
  readonly id: number
  readonly name: string
  readonly line: number
  readonly col: number
}

export interface CoveragePlan {
  readonly filename: string
  readonly source: string
  readonly statements: ReadonlyArray<StatementInfo>
  readonly branches: ReadonlyArray<BranchInfo>
  readonly functions: ReadonlyArray<FunctionInfo>
  readonly states: ReadonlyArray<StateInfo>
}

export interface StatementHit extends StatementInfo {
  readonly hits: number
}

export interface BranchHit extends BranchInfo {
  /**
   * `[trueHits, falseHits]` — count of times the conditional expression
   * evaluated truthy / falsy, respectively. For `if`, true means consequent
   * taken, false means alternate (or implicit-else) taken. For `while` /
   * `for`, true means another iteration started, false means the loop
   * exited. **For `do-while`, the body always runs at least once before
   * the test is evaluated**, so a single-pass do-while produces `[0, 1]`
   * (zero true outcomes, one false outcome that ended the loop) even
   * though the body executed once — body-entered counts live in statement
   * coverage on the body, not branch coverage on the loop.
   */
  readonly hits: readonly [number, number]
}

export interface FunctionHit extends FunctionInfo {
  readonly hits: number
}

export interface StateHit extends StateInfo {
  readonly hits: number
}

export interface CoverageReport {
  readonly filename: string
  readonly source: string
  readonly statements: ReadonlyArray<StatementHit>
  readonly branches: ReadonlyArray<BranchHit>
  readonly functions: ReadonlyArray<FunctionHit>
  readonly states: ReadonlyArray<StateHit>
}

/**
 * Walks an AST and enumerates every coverable item.
 * Coverage IDs are `loc.offset` — stable across the lifetime of a single
 * parse, unique within a file, and cheap to use as Map keys.
 */
export function buildCoveragePlan(
  ast: Ast,
  filename: string,
  source: string,
): CoveragePlan {
  const statements: StatementInfo[] = []
  const branches: BranchInfo[] = []
  const functions: FunctionInfo[] = []
  const states: StateInfo[] = []

  const walkStatement = (s: Statement): void => {
    statements.push({
      id: s.loc.offset,
      line: s.loc.line,
      col: s.loc.col,
      kind: s.kind,
    })
    switch (s.kind) {
      case 'BlockStatement':
        for (const inner of s.body) walkStatement(inner)
        return
      case 'IfStatement':
        branches.push({
          id: s.loc.offset,
          line: s.loc.line,
          col: s.loc.col,
          kind: 'if',
          hasElse: s.alternate !== null,
        })
        walkStatement(s.consequent)
        if (s.alternate) walkStatement(s.alternate)
        return
      case 'WhileStatement':
        branches.push({
          id: s.loc.offset,
          line: s.loc.line,
          col: s.loc.col,
          kind: 'while',
          hasElse: false,
        })
        walkStatement(s.body)
        return
      case 'DoWhileStatement':
        branches.push({
          id: s.loc.offset,
          line: s.loc.line,
          col: s.loc.col,
          kind: 'do-while',
          hasElse: false,
        })
        walkStatement(s.body)
        return
      case 'ForStatement':
        branches.push({
          id: s.loc.offset,
          line: s.loc.line,
          col: s.loc.col,
          kind: 'for',
          hasElse: false,
        })
        walkStatement(s.body)
        return
      default:
        return
    }
  }

  for (const fn of ast.functions) {
    functions.push({
      id: fn.loc.offset,
      name: fn.name,
      line: fn.loc.line,
      col: fn.loc.col,
      kind: 'function',
    })
    walkStatement(fn.body)
  }

  for (const state of ast.states) {
    states.push({
      id: state.loc.offset,
      name: state.name,
      line: state.loc.line,
      col: state.loc.col,
    })
    for (const handler of state.handlers) {
      functions.push({
        id: handler.loc.offset,
        name: handler.name,
        line: handler.loc.line,
        col: handler.loc.col,
        kind: 'event',
        state: state.name,
      })
      walkStatement(handler.body)
    }
  }

  return { filename, source, statements, branches, functions, states }
}

/**
 * Per-script hit counter. Lives on `ScriptState.coverage` when coverage is
 * enabled; otherwise the field is null and hooks short-circuit.
 *
 * Counts are kept in plain Maps keyed by `loc.offset`. State coverage is
 * keyed by state name — state changes name targets, not offsets.
 */
export class CoverageCollector {
  readonly plan: CoveragePlan
  private readonly statementHits = new Map<number, number>()
  private readonly branchHits = new Map<number, [number, number]>()
  private readonly functionHits = new Map<number, number>()
  private readonly stateHits = new Map<string, number>()

  constructor(plan: CoveragePlan) {
    this.plan = plan
    for (const b of plan.branches) {
      this.branchHits.set(b.id, [0, 0])
    }
  }

  hitStatement(loc: SourceLocation): void {
    const id = loc.offset
    this.statementHits.set(id, (this.statementHits.get(id) ?? 0) + 1)
  }

  hitBranch(loc: SourceLocation, taken: boolean): void {
    const pair = this.branchHits.get(loc.offset)
    if (!pair) return
    if (taken) pair[0]++
    else pair[1]++
  }

  hitFunction(loc: SourceLocation): void {
    const id = loc.offset
    this.functionHits.set(id, (this.functionHits.get(id) ?? 0) + 1)
  }

  hitState(name: string): void {
    this.stateHits.set(name, (this.stateHits.get(name) ?? 0) + 1)
  }

  /** Frozen snapshot suitable for serialization or assertions. */
  snapshot(): CoverageReport {
    const statements = this.plan.statements.map((s) => ({
      ...s,
      hits: this.statementHits.get(s.id) ?? 0,
    }))
    const branches = this.plan.branches.map((b) => {
      const pair = this.branchHits.get(b.id) ?? [0, 0]
      return { ...b, hits: [pair[0], pair[1]] as readonly [number, number] }
    })
    const functions = this.plan.functions.map((f) => ({
      ...f,
      hits: this.functionHits.get(f.id) ?? 0,
    }))
    const states = this.plan.states.map((s) => ({
      ...s,
      hits: this.stateHits.get(s.name) ?? 0,
    }))
    return {
      filename: this.plan.filename,
      source: this.plan.source,
      statements,
      branches,
      functions,
      states,
    }
  }
}

/**
 * Merge multiple reports for the same filename into one. Used by the Vitest
 * reporter when the same script is loaded across multiple tests in a run:
 * planes match, hit counts union (sum).
 *
 * Throws if reports disagree on filename or plan shape — that signals a
 * source change mid-run, which should fail loudly rather than be glossed.
 */
export function mergeReports(reports: ReadonlyArray<CoverageReport>): CoverageReport {
  if (reports.length === 0) {
    throw new Error('mergeReports: empty input')
  }
  const head = reports[0]!
  for (const r of reports) {
    if (r.filename !== head.filename) {
      throw new Error(`mergeReports: filename mismatch ${head.filename} vs ${r.filename}`)
    }
    if (
      r.statements.length !== head.statements.length ||
      r.branches.length !== head.branches.length ||
      r.functions.length !== head.functions.length ||
      r.states.length !== head.states.length
    ) {
      throw new Error(`mergeReports: plan size mismatch for ${head.filename}`)
    }
  }
  const statements = head.statements.map((s, i) => ({
    ...s,
    hits: reports.reduce((acc, r) => acc + r.statements[i]!.hits, 0),
  }))
  const branches = head.branches.map((b, i) => {
    let t = 0
    let f = 0
    for (const r of reports) {
      t += r.branches[i]!.hits[0]
      f += r.branches[i]!.hits[1]
    }
    return { ...b, hits: [t, f] as readonly [number, number] }
  })
  const functions = head.functions.map((fn, i) => ({
    ...fn,
    hits: reports.reduce((acc, r) => acc + r.functions[i]!.hits, 0),
  }))
  const states = head.states.map((s, i) => ({
    ...s,
    hits: reports.reduce((acc, r) => acc + r.states[i]!.hits, 0),
  }))
  return {
    filename: head.filename,
    source: head.source,
    statements,
    branches,
    functions,
    states,
  }
}
