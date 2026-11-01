import type { RlvProfile } from './profiles.js'
import type { RlvRestrictions } from './restrictions.js'

/** Query stored wire rules. Omitting sourcePrim includes every emitter. */
export function getRlvStatus(profile: RlvProfile, restrictions: RlvRestrictions, option = '', sourcePrim?: string): string {
  const semicolon = option.indexOf(';')
  const filter = semicolon < 0 ? option : option.slice(0, semicolon)
  const suffix = semicolon < 0 ? '' : option.slice(semicolon + 1)
  const separator = (profile === 'rlv' ? suffix : suffix.split(';')[0]) || '/'
  // Sort a copy: snapshots expose insertion order for inspection. Stable sorting
  // keeps each prim's rule order and retains duplicates from different prims.
  return [...restrictions.snapshot(sourcePrim)]
    .sort((a, b) => a.sourcePrim < b.sourcePrim ? -1 : a.sourcePrim > b.sourcePrim ? 1 : 0)
    .filter(entry => entry.rule.includes(filter))
    .map(entry => separator + entry.rule).join('')
}
