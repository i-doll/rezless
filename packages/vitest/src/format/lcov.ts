import type { CoverageReport } from '@rezless/vm'

/**
 * Render an LCOV `lcov.info` file body for one or more coverage reports.
 *
 * LCOV record reference: https://manpages.debian.org/unstable/lcov/geninfo.1.en.html
 *
 * Per file we emit:
 *   SF:<path>
 *   FN:<line>,<name>      — one per function/event
 *   FNDA:<hits>,<name>
 *   FNF:<total>           FNH:<hit>
 *   DA:<line>,<count>     — one per source line that has at least one statement
 *   BRDA:<line>,<block>,<branch>,<taken>   — one per (if/loop) outcome
 *   BRF:<total>           BRH:<hit>
 *   LF:<lines>            LH:<lines hit>
 *   end_of_record
 */
export function renderLcov(reports: ReadonlyArray<CoverageReport>): string {
  const out: string[] = []
  for (const r of reports) {
    out.push(`SF:${r.filename}`)

    let fnTotal = 0
    let fnHit = 0
    for (const fn of r.functions) {
      const label = fn.kind === 'event' ? `${fn.state ?? ''}::${fn.name}` : fn.name
      out.push(`FN:${fn.line},${label}`)
      fnTotal++
      if (fn.hits > 0) fnHit++
    }
    for (const fn of r.functions) {
      const label = fn.kind === 'event' ? `${fn.state ?? ''}::${fn.name}` : fn.name
      out.push(`FNDA:${fn.hits},${label}`)
    }
    out.push(`FNF:${fnTotal}`)
    out.push(`FNH:${fnHit}`)

    // Aggregate statement hits per line: a line is "hit" if any statement on
    // it was hit; the count is the max hit count on the line (preserves
    // tool semantics of "executed at least once"). Lines that only ever
    // see hits=0 are still recorded so they appear as `DA:<line>,0`.
    const lineHits = new Map<number, number>()
    for (const s of r.statements) {
      const prev = lineHits.get(s.line) ?? 0
      lineHits.set(s.line, Math.max(prev, s.hits))
    }
    let lf = 0
    let lh = 0
    const lines = [...lineHits.entries()].sort((a, b) => a[0] - b[0])
    for (const [line, hits] of lines) {
      out.push(`DA:${line},${hits}`)
      lf++
      if (hits > 0) lh++
    }

    let brTotal = 0
    let brHit = 0
    for (const b of r.branches) {
      const [t, f] = b.hits
      out.push(`BRDA:${b.line},${b.id},0,${t}`)
      out.push(`BRDA:${b.line},${b.id},1,${f}`)
      brTotal += 2
      if (t > 0) brHit++
      if (f > 0) brHit++
    }
    out.push(`BRF:${brTotal}`)
    out.push(`BRH:${brHit}`)

    out.push(`LF:${lf}`)
    out.push(`LH:${lh}`)
    out.push('end_of_record')
  }
  return out.join('\n') + '\n'
}
