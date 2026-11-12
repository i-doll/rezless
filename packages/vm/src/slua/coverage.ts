import { CoverageCollector } from '../coverage.js'
import type { BranchKind, CoveragePlan, CoverageReport, StatementKind } from '../coverage.js'
import type { SluaEngine, SluaPlanEntry } from './engine.js'

/**
 * Coverage for an SLua script. The VM counts statements, branch outcomes and
 * function entries through the instrumentation its compiler step adds; this
 * collector sums those counts over every VM instance the script has had
 * (each llResetScript starts a new one, and copies share their original's
 * collector).
 */
export class SluaCoverage extends CoverageCollector {
  private engines: SluaEngine[] = []
  private readonly retired = { statements: [] as number[], branches: [] as number[], functions: [] as number[] }

  constructor(entries: ReadonlyArray<SluaPlanEntry>, filename: string, source: string) {
    super(planFrom(entries, filename, source))
  }

  /** Count `engine`'s hits from now on. */
  attach(engine: SluaEngine): void {
    this.engines.push(engine)
  }

  /** Stop following `engine`, keeping the hits it has counted. */
  retire(engine: SluaEngine): void {
    this.engines = this.engines.filter((e) => e !== engine)
    const h = engine.hits()
    add(this.retired.statements, h.statements)
    add(this.retired.branches, h.branches)
    add(this.retired.functions, h.functions)
  }

  override snapshot(): CoverageReport {
    const statements = [...this.retired.statements]
    const branches = [...this.retired.branches]
    const functions = [...this.retired.functions]
    for (const e of this.engines) {
      const h = e.hits()
      add(statements, h.statements)
      add(branches, h.branches)
      add(functions, h.functions)
    }
    const { plan } = this
    return Object.freeze({
      filename: plan.filename,
      source: plan.source,
      statements: plan.statements.map((s) => ({ ...s, hits: statements[s.id] ?? 0 })),
      branches: plan.branches.map((b) => ({
        ...b,
        hits: [branches[b.id * 2] ?? 0, branches[b.id * 2 + 1] ?? 0] as const,
      })),
      functions: plan.functions.map((f) => ({ ...f, hits: functions[f.id] ?? 0 })),
      states: [],
    })
  }
}

function add(into: number[], from: ArrayLike<number>): void {
  for (let i = 0; i < from.length; i++) into[i] = (into[i] ?? 0) + from[i]!
}

function planFrom(entries: ReadonlyArray<SluaPlanEntry>, filename: string, source: string): CoveragePlan {
  const at = (e: SluaPlanEntry) => ({ id: e.id, line: e.line, col: e.col })
  return {
    filename,
    source,
    statements: entries.filter((e) => e.t === 's').map((e) => ({ ...at(e), kind: e.kind as StatementKind })),
    branches: entries
      .filter((e) => e.t === 'b')
      .map((e) => ({ ...at(e), kind: e.kind as BranchKind, hasElse: e.else ?? false })),
    functions: entries
      .filter((e) => e.t === 'f')
      .map((e) => ({
        ...at(e),
        name: e.name ?? '(anonymous)',
        kind: e.kind === 'event' ? ('event' as const) : ('function' as const),
        ...(e.kind === 'event' ? { state: 'LLEvents' } : {}),
      })),
    states: [],
  }
}
