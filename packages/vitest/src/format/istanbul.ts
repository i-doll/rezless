import type { CoverageReport } from '@rezless/vm'

/**
 * Render an Istanbul `coverage-final.json` document.
 *
 * Shape per file:
 *   { path, statementMap, fnMap, branchMap, s, f, b }
 *
 * Our `SourceLocation` carries only line/col/offset, no end position. We
 * mirror start to end so renderers that expect both keep working.
 */
export interface IstanbulFileCoverage {
  path: string
  statementMap: Record<string, { start: Pos; end: Pos }>
  fnMap: Record<
    string,
    { name: string; decl: { start: Pos; end: Pos }; loc: { start: Pos; end: Pos }; line: number }
  >
  branchMap: Record<
    string,
    { line: number; type: string; locations: Array<{ start: Pos; end: Pos }> }
  >
  s: Record<string, number>
  f: Record<string, number>
  b: Record<string, [number, number]>
}

interface Pos {
  line: number
  column: number
}

export function renderIstanbul(
  reports: ReadonlyArray<CoverageReport>,
): Record<string, IstanbulFileCoverage> {
  const out: Record<string, IstanbulFileCoverage> = {}
  for (const r of reports) {
    const statementMap: IstanbulFileCoverage['statementMap'] = {}
    const s: Record<string, number> = {}
    r.statements.forEach((stmt, i) => {
      const pos = { line: stmt.line, column: Math.max(0, stmt.col - 1) }
      statementMap[String(i)] = { start: pos, end: pos }
      s[String(i)] = stmt.hits
    })

    const fnMap: IstanbulFileCoverage['fnMap'] = {}
    const f: Record<string, number> = {}
    r.functions.forEach((fn, i) => {
      const pos = { line: fn.line, column: Math.max(0, fn.col - 1) }
      const label = fn.kind === 'event' ? `${fn.state ?? ''}::${fn.name}` : fn.name
      fnMap[String(i)] = {
        name: label,
        decl: { start: pos, end: pos },
        loc: { start: pos, end: pos },
        line: fn.line,
      }
      f[String(i)] = fn.hits
    })

    const branchMap: IstanbulFileCoverage['branchMap'] = {}
    const b: Record<string, [number, number]> = {}
    r.branches.forEach((br, i) => {
      const pos = { line: br.line, column: Math.max(0, br.col - 1) }
      branchMap[String(i)] = {
        line: br.line,
        type: br.kind === 'if' ? 'if' : 'loop',
        locations: [
          { start: pos, end: pos },
          { start: pos, end: pos },
        ],
      }
      b[String(i)] = [br.hits[0], br.hits[1]]
    })

    out[r.filename] = {
      path: r.filename,
      statementMap,
      fnMap,
      branchMap,
      s,
      f,
      b,
    }
  }
  return out
}
