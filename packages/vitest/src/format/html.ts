import type { CoverageReport } from '@rezless/vm'

/**
 * Render a self-contained HTML coverage report — `index.html` summary plus
 * one `<file>.html` per script with line-by-line annotation (green for
 * hit, red for miss, gray for non-statement lines).
 *
 * Returns a map of relative output path → file contents for the caller to
 * write. Pure function, no I/O — easier to test.
 */
export function renderHtml(reports: ReadonlyArray<CoverageReport>): Map<string, string> {
  const out = new Map<string, string>()
  const summary: SummaryRow[] = []

  // Two filenames can produce the same slug after `slugFor` collapses path
  // separators (e.g. `/a/b/x.lsl` and `/a_b/x.lsl` both become `a_b_x.lsl`).
  // Append a `-<n>` suffix on collision so each file gets its own page and
  // each index link resolves correctly.
  const slugCounts = new Map<string, number>()
  for (const r of reports) {
    const base = slugFor(r.filename)
    const n = slugCounts.get(base) ?? 0
    slugCounts.set(base, n + 1)
    const slug = n === 0 ? base : `${base}-${n}`
    const detail = renderFile(r)
    out.set(`${slug}.html`, detail)
    summary.push({ filename: r.filename, slug, ...summarize(r) })
  }

  out.set('index.html', renderIndex(summary))
  out.set('style.css', STYLE_CSS)
  return out
}

interface SummaryRow {
  filename: string
  slug: string
  stmts: { hit: number; total: number }
  branches: { hit: number; total: number }
  functions: { hit: number; total: number }
  states: { hit: number; total: number }
}

function summarize(r: CoverageReport): {
  stmts: { hit: number; total: number }
  branches: { hit: number; total: number }
  functions: { hit: number; total: number }
  states: { hit: number; total: number }
} {
  return {
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

function pct(hit: number, total: number): { text: string; cls: string } {
  if (total === 0) return { text: 'n/a', cls: 'na' }
  const v = (hit / total) * 100
  const cls = v >= 90 ? 'good' : v >= 60 ? 'medium' : 'bad'
  return { text: `${v.toFixed(1)}%`, cls }
}

function renderIndex(rows: ReadonlyArray<SummaryRow>): string {
  const total = {
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

  const headerRow = (label: string, t: typeof total) => {
    const s = pct(t.stmts.hit, t.stmts.total)
    const b = pct(t.branches.hit, t.branches.total)
    const f = pct(t.functions.hit, t.functions.total)
    const st = pct(t.states.hit, t.states.total)
    return `<tr class="totals">
      <th>${esc(label)}</th>
      <td class="${s.cls}">${s.text}</td>
      <td class="${b.cls}">${b.text}</td>
      <td class="${f.cls}">${f.text}</td>
      <td class="${st.cls}">${st.text}</td>
    </tr>`
  }

  const fileRows = rows
    .map((r) => {
      const s = pct(r.stmts.hit, r.stmts.total)
      const b = pct(r.branches.hit, r.branches.total)
      const f = pct(r.functions.hit, r.functions.total)
      const st = pct(r.states.hit, r.states.total)
      return `<tr>
        <td><a href="${esc(r.slug)}.html">${esc(r.filename)}</a></td>
        <td class="${s.cls}">${s.text} <span class="frac">${r.stmts.hit}/${r.stmts.total}</span></td>
        <td class="${b.cls}">${b.text} <span class="frac">${r.branches.hit}/${r.branches.total}</span></td>
        <td class="${f.cls}">${f.text} <span class="frac">${r.functions.hit}/${r.functions.total}</span></td>
        <td class="${st.cls}">${st.text} <span class="frac">${r.states.hit}/${r.states.total}</span></td>
      </tr>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>LSL coverage</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>LSL coverage</h1>
  </header>
  <main>
    <table class="summary">
      <thead>
        <tr>
          <th>File</th>
          <th>Statements</th>
          <th>Branches</th>
          <th>Functions</th>
          <th>States</th>
        </tr>
      </thead>
      <tbody>
        ${headerRow('All files', total)}
        ${fileRows}
      </tbody>
    </table>
  </main>
</body>
</html>
`
}

function renderFile(r: CoverageReport): string {
  const lines = r.source.split('\n')
  // Build per-line max hit-count from statements. A line with only
  // hits=0 statements still gets recorded as 0, which renders as a miss.
  const lineHits = new Map<number, number>()
  for (const s of r.statements) {
    const prev = lineHits.get(s.line) ?? 0
    lineHits.set(s.line, Math.max(prev, s.hits))
  }
  // Per-line branch state: 'partial' if any branch on the line is missed.
  const lineBranchPartial = new Set<number>()
  for (const b of r.branches) {
    if (b.hits[0] === 0 || b.hits[1] === 0) lineBranchPartial.add(b.line)
  }

  const sum = summarize(r)
  const s = pct(sum.stmts.hit, sum.stmts.total)
  const b = pct(sum.branches.hit, sum.branches.total)
  const f = pct(sum.functions.hit, sum.functions.total)
  const st = pct(sum.states.hit, sum.states.total)

  const rendered = lines
    .map((text, i) => {
      const lineNo = i + 1
      const hits = lineHits.get(lineNo)
      let cls = 'noncode'
      let countLabel = ''
      if (hits !== undefined) {
        if (hits > 0) {
          cls = lineBranchPartial.has(lineNo) ? 'partial' : 'hit'
          countLabel = String(hits)
        } else {
          cls = 'miss'
          countLabel = '0'
        }
      }
      return `<tr class="${cls}"><td class="ln">${lineNo}</td><td class="ct">${countLabel}</td><td class="src">${esc(text) || '&nbsp;'}</td></tr>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(r.filename)} — LSL coverage</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1><a href="index.html">LSL coverage</a> &raquo; ${esc(r.filename)}</h1>
    <ul class="meta">
      <li>Statements <span class="${s.cls}">${s.text}</span> <span class="frac">${sum.stmts.hit}/${sum.stmts.total}</span></li>
      <li>Branches <span class="${b.cls}">${b.text}</span> <span class="frac">${sum.branches.hit}/${sum.branches.total}</span></li>
      <li>Functions <span class="${f.cls}">${f.text}</span> <span class="frac">${sum.functions.hit}/${sum.functions.total}</span></li>
      <li>States <span class="${st.cls}">${st.text}</span> <span class="frac">${sum.states.hit}/${sum.states.total}</span></li>
    </ul>
  </header>
  <main>
    <table class="source">
      <tbody>
        ${rendered}
      </tbody>
    </table>
  </main>
</body>
</html>
`
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function slugFor(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'inline'
}

const STYLE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #fff;
  --fg: #111;
  --muted: #666;
  --hit: #c8e6c9;
  --miss: #ffcdd2;
  --partial: #fff59d;
  --noncode: transparent;
  --frac: #888;
  --good: #2e7d32;
  --medium: #f9a825;
  --bad: #c62828;
  --na: #888;
  --link: #1565c0;
  --border: #e0e0e0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1a;
    --fg: #e0e0e0;
    --muted: #999;
    --hit: #1b3a1f;
    --miss: #3a1b1b;
    --partial: #3a361b;
    --frac: #777;
    --good: #66bb6a;
    --medium: #ffd54f;
    --bad: #ef5350;
    --na: #888;
    --link: #64b5f6;
    --border: #333;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
header {
  border-bottom: 1px solid var(--border);
  padding: 16px 24px;
}
header h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
header h1 a { color: var(--link); text-decoration: none; }
header h1 a:hover { text-decoration: underline; }
.meta { list-style: none; padding: 0; margin: 0; display: flex; gap: 24px; flex-wrap: wrap; color: var(--muted); }
.meta li { font-size: 13px; }
main { padding: 16px 24px; }
table.summary { border-collapse: collapse; width: 100%; }
table.summary th, table.summary td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
table.summary th { font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--muted); }
table.summary td a { color: var(--link); text-decoration: none; }
table.summary td a:hover { text-decoration: underline; }
table.summary tr.totals { font-weight: 600; background: rgba(0, 0, 0, 0.03); }
@media (prefers-color-scheme: dark) {
  table.summary tr.totals { background: rgba(255, 255, 255, 0.05); }
}
.frac { color: var(--frac); font-size: 11px; }
.good { color: var(--good); }
.medium { color: var(--medium); }
.bad { color: var(--bad); }
.na { color: var(--na); }
table.source {
  border-collapse: collapse;
  width: 100%;
  font: 13px/1.5 ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
table.source td { padding: 0 8px; vertical-align: top; }
table.source td.ln { width: 4em; text-align: right; color: var(--muted); user-select: none; }
table.source td.ct { width: 4em; text-align: right; color: var(--muted); user-select: none; }
table.source td.src { white-space: pre; }
table.source tr.hit { background: var(--hit); }
table.source tr.miss { background: var(--miss); }
table.source tr.partial { background: var(--partial); }
table.source tr.noncode { background: var(--noncode); }
`
