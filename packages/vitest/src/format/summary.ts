import type { CoverageReport } from '@lslvm/vm'

export interface MetricSummary {
  readonly total: number
  readonly covered: number
  readonly skipped: 0
  readonly pct: number
}

export interface FileSummary {
  readonly statements: MetricSummary
  readonly branches: MetricSummary
  readonly functions: MetricSummary
  readonly states: MetricSummary
}

export interface CoverageSummary {
  readonly total: FileSummary
  readonly [filename: string]: FileSummary
}

function metric(covered: number, total: number): MetricSummary {
  const pct = total === 0 ? 100 : (covered / total) * 100
  return { total, covered, skipped: 0, pct: Number(pct.toFixed(2)) }
}

function summarize(r: CoverageReport): FileSummary {
  return {
    statements: metric(
      r.statements.filter((s) => s.hits > 0).length,
      r.statements.length,
    ),
    branches: metric(
      r.branches.reduce((a, b) => a + (b.hits[0] > 0 ? 1 : 0) + (b.hits[1] > 0 ? 1 : 0), 0),
      r.branches.length * 2,
    ),
    functions: metric(
      r.functions.filter((f) => f.hits > 0).length,
      r.functions.length,
    ),
    states: metric(r.states.filter((s) => s.hits > 0).length, r.states.length),
  }
}

/**
 * Render an Istanbul-style coverage-summary.json for LSL coverage. The
 * shape mirrors `@vitest/coverage-v8`'s summary so CI tooling can read
 * either with the same parser, with `states` added as the LSL-specific
 * fourth metric.
 */
export function renderSummary(reports: ReadonlyArray<CoverageReport>): CoverageSummary {
  const out: { [filename: string]: FileSummary } = {}
  let stmtT = 0,
    stmtC = 0,
    brT = 0,
    brC = 0,
    fnT = 0,
    fnC = 0,
    stT = 0,
    stC = 0
  for (const r of reports) {
    const s = summarize(r)
    out[r.filename] = s
    stmtT += s.statements.total
    stmtC += s.statements.covered
    brT += s.branches.total
    brC += s.branches.covered
    fnT += s.functions.total
    fnC += s.functions.covered
    stT += s.states.total
    stC += s.states.covered
  }
  return {
    total: {
      statements: metric(stmtC, stmtT),
      branches: metric(brC, brT),
      functions: metric(fnC, fnT),
      states: metric(stC, stT),
    },
    ...out,
  }
}
