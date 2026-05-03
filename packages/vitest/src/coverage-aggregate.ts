import * as fs from 'node:fs'
import { mergeReports, type CoverageReport } from '@rezless/vm'

export interface AggregateOptions {
  /**
   * Include coverage reports for synthetic filenames — `<inline>`, names
   * that don't contain a path separator, or paths that don't exist on
   * disk. Off by default since these are almost always throwaway test
   * fixtures, not the LSL scripts the user actually wants reports for.
   */
  readonly includeFixtures?: boolean
}

/** A filename refers to an actual `.lsl` file we can render meaningfully. */
function isRealFile(filename: string): boolean {
  if (filename === '<inline>') return false
  // No path separator → almost certainly an inline test fixture with a
  // hand-rolled filename like 'a.lsl'.
  if (!filename.includes('/') && !filename.includes('\\')) return false
  try {
    return fs.statSync(filename).isFile()
  } catch {
    return false
  }
}

/**
 * Group a flat list of coverage reports by (filename, source) so identical
 * scripts loaded across multiple tests get their hits summed, while
 * distinct scripts that happen to share a filename stay as separate
 * entries.
 *
 * When two groups end up sharing a filename — for example, two inline
 * fixtures both reporting as `<inline>` — the second through Nth get a
 * `#<n>` suffix to keep them addressable in LCOV / Istanbul output.
 */
export function aggregateReports(
  dumps: ReadonlyArray<CoverageReport>,
  opts: AggregateOptions = {},
): CoverageReport[] {
  const includeFixtures = opts.includeFixtures ?? false
  const filtered = includeFixtures ? dumps : dumps.filter((r) => isRealFile(r.filename))

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
