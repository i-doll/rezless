import * as fs from 'node:fs'
import * as path from 'node:path'
import type { CoverageReport } from '@rezless/vm'
import { renderLcov } from './format/lcov.js'
import { renderIstanbul } from './format/istanbul.js'
import { renderHtml } from './format/html.js'
import { renderSummary } from './format/summary.js'

/** Which coverage artifacts to skip. */
export interface CoverageWriteOptions {
  readonly disableLcov?: boolean
  readonly disableIstanbul?: boolean
  readonly disableSummary?: boolean
  readonly disableHtml?: boolean
}

/** Coverage reports by script language, so each can be its own component. */
export function splitByLanguage(reports: ReadonlyArray<CoverageReport>): {
  lsl: CoverageReport[]
  slua: CoverageReport[]
} {
  return {
    lsl: reports.filter((r) => r.language !== 'slua'),
    slua: reports.filter((r) => r.language === 'slua'),
  }
}

/**
 * Write `reports`' coverage artifacts into `dir`: `lcov.info`,
 * `coverage-final.json` (Istanbul), `coverage-summary.json` and `html/`.
 * Returns the paths written.
 */
export function writeCoverage(dir: string, reports: ReadonlyArray<CoverageReport>, opts: CoverageWriteOptions = {}): string[] {
  const written: string[] = []
  fs.mkdirSync(dir, { recursive: true })
  const write = (name: string, content: string): void => {
    const file = path.join(dir, name)
    fs.writeFileSync(file, content)
    written.push(file)
  }
  if (!opts.disableLcov) write('lcov.info', renderLcov(reports))
  if (!opts.disableIstanbul) write('coverage-final.json', JSON.stringify(renderIstanbul(reports), null, 2))
  // Summary is its own toggle so CI tooling that only consumes the summary
  // can still get it when the heavier per-file Istanbul detail is off.
  if (!opts.disableSummary) write('coverage-summary.json', JSON.stringify(renderSummary(reports), null, 2))
  if (!opts.disableHtml) {
    const htmlDir = path.join(dir, 'html')
    fs.mkdirSync(htmlDir, { recursive: true })
    for (const [name, content] of renderHtml(reports)) fs.writeFileSync(path.join(htmlDir, name), content)
    written.push(path.join(htmlDir, 'index.html'))
  }
  return written
}
