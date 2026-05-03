import type { CoverageReport } from '@lslvm/vm'

interface FilePct {
  filename: string
  stmts: { hit: number; total: number }
  branches: { hit: number; total: number }
  functions: { hit: number; total: number }
  states: { hit: number; total: number }
}

/** Right-aligned 7-char field — matches the `pad(name, 7)` headers below. */
function pct(hit: number, total: number): string {
  if (total === 0) return '  n/a  '
  const v = (hit / total) * 100
  return `${v.toFixed(1)}%`.padStart(7)
}

function summarize(r: CoverageReport): FilePct {
  return {
    filename: r.filename,
    stmts: {
      hit: r.statements.filter((s) => s.hits > 0).length,
      total: r.statements.length,
    },
    branches: {
      hit: r.branches.reduce((a, b) => a + (b.hits[0] > 0 ? 1 : 0) + (b.hits[1] > 0 ? 1 : 0), 0),
      total: r.branches.length * 2,
    },
    functions: {
      hit: r.functions.filter((f) => f.hits > 0).length,
      total: r.functions.length,
    },
    states: {
      hit: r.states.filter((s) => s.hits > 0).length,
      total: r.states.length,
    },
  }
}

/**
 * Format a per-file coverage summary as a multi-line ASCII table. Returned
 * as a string so callers can write it to stdout, a file, or a logger.
 */
export function renderConsoleSummary(reports: ReadonlyArray<CoverageReport>): string {
  if (reports.length === 0) return 'No LSL coverage collected.\n'
  const rows = reports.map(summarize)
  // Total row aggregates across all files.
  const total: FilePct = {
    filename: 'all files',
    stmts: { hit: 0, total: 0 },
    branches: { hit: 0, total: 0 },
    functions: { hit: 0, total: 0 },
    states: { hit: 0, total: 0 },
  }
  for (const r of rows) {
    total.stmts.hit += r.stmts.hit
    total.stmts.total += r.stmts.total
    total.branches.hit += r.branches.hit
    total.branches.total += r.branches.total
    total.functions.hit += r.functions.hit
    total.functions.total += r.functions.total
    total.states.hit += r.states.hit
    total.states.total += r.states.total
  }

  const fileColW = Math.max(
    ...rows.map((r) => r.filename.length),
    total.filename.length,
    'File'.length,
  )

  const header =
    pad('File', fileColW) +
    ' | ' +
    pad('Stmts', 7) +
    ' | ' +
    pad('Branch', 7) +
    ' | ' +
    pad('Fns', 7) +
    ' | ' +
    pad('States', 7)
  const sep = '-'.repeat(header.length)

  const lines: string[] = []
  lines.push('LSL coverage')
  lines.push(sep)
  lines.push(header)
  lines.push(sep)
  for (const r of rows) {
    lines.push(formatRow(r, fileColW))
  }
  lines.push(sep)
  lines.push(formatRow(total, fileColW))
  lines.push(sep)
  return lines.join('\n') + '\n'
}

function formatRow(r: FilePct, fileColW: number): string {
  return (
    pad(r.filename, fileColW) +
    ' | ' +
    pct(r.stmts.hit, r.stmts.total) +
    ' | ' +
    pct(r.branches.hit, r.branches.total) +
    ' | ' +
    pct(r.functions.hit, r.functions.total) +
    ' | ' +
    pct(r.states.hit, r.states.total)
  )
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length)
}
