import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RLV_MANIFEST } from '@rezless/vm'
import { renderRlvCoverage } from '../../../scripts/rlv-coverage.js'

const root = new URL('../../../', import.meta.url)

describe('published RLV coverage', () => {
  it('matches the manifest including forms, profile versions, support depths and tests', () => {
    expect(readFileSync(new URL('docs/rlv-coverage.md', root), 'utf8')).toBe(renderRlvCoverage())
  })

  it('describes the supported Kokua startup and blacklist settings', () => {
    const settings = RLV_MANIFEST.settings.rlv.join(' ')
    for (const name of ['blacklist', 'doNotQueueVersionRequests', 'initialGarbageCollectionAdditionalWait', 'garbageCollectionAdditionalInterval']) {
      expect(settings).toContain(name)
    }
    expect(settings).not.toContain('no emulator setting implemented')
  })

  it('links each contract to existing behavioral tests', () => {
    for (const entry of RLV_MANIFEST.commands) {
      const behavioralTests = entry.tests.filter(path => !path.endsWith('/rlv-profiles.test.ts'))
      expect(behavioralTests.length, entry.id).toBeGreaterThan(0)
      for (const path of behavioralTests) expect(existsSync(new URL(path, root)), path).toBe(true)
    }
  })
})
