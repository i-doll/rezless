import { mergeReports, type CoverageReport } from '@lslvm/vm'

export interface AggregateOptions {
  /** Include reports whose filename is "<inline>" (test-fixture scripts).
   *  Defaults to false — real `.lsl` files are usually what you want. */
  readonly includeInline?: boolean
}

/**
 * Group a flat list of coverage reports by (filename, source) so identical
 * scripts loaded across multiple tests get their hits summed, while
 * distinct scripts that happen to share a filename (typically `<inline>`)
 * stay as separate entries.
 *
 * When two groups end up sharing a filename — for example, two inline
 * fixtures both reporting as `<inline>` — the second through Nth get a
 * `#<n>` suffix to keep them addressable in LCOV / Istanbul output.
 */
export function aggregateReports(
  dumps: ReadonlyArray<CoverageReport>,
  opts: AggregateOptions = {},
): CoverageReport[] {
  const includeInline = opts.includeInline ?? false
  const filtered = includeInline ? dumps : dumps.filter((r) => r.filename !== '<inline>')

  const byKey = new Map<string, CoverageReport[]>()
  for (const r of filtered) {
    // Source is included in the key so distinct inline scripts (or any
    // file that legitimately changed mid-run) don't trigger plan-size
    // mismatches inside mergeReports.
    const key = `${r.filename}\0${r.source}`
    let list = byKey.get(key)
    if (!list) {
      list = []
      byKey.set(key, list)
    }
    list.push(r)
  }

  const merged: CoverageReport[] = []
  for (const list of byKey.values()) {
    merged.push(list.length === 1 ? list[0]! : mergeReports(list))
  }

  // Disambiguate any remaining filename collisions across distinct groups.
  const counts = new Map<string, number>()
  for (const r of merged) counts.set(r.filename, (counts.get(r.filename) ?? 0) + 1)
  const seen = new Map<string, number>()
  const disambiguated = merged.map((r) => {
    if ((counts.get(r.filename) ?? 0) <= 1) return r
    const n = seen.get(r.filename) ?? 0
    seen.set(r.filename, n + 1)
    if (n === 0) return r
    return { ...r, filename: `${r.filename}#${n}` }
  })

  disambiguated.sort((a, b) => a.filename.localeCompare(b.filename))
  return disambiguated
}
