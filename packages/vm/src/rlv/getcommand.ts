import { RLV_MANIFEST, type RlvCommandForm } from './manifest.js'
import type { RlvProfile } from './profiles.js'

/** Frozen form snapshots expose support depth without claiming action enforcement. */
export function getRlvCommandCoverage(profile: RlvProfile): readonly RlvCommandForm[] {
  const rank = { add: 0, force: 1, reply: 2 }
  return Object.freeze(RLV_MANIFEST.commands.flatMap(entry => entry.profiles[profile].commandForms ?? [])
    .map(form => Object.freeze({ ...form }))
    .sort((a, b) => rank[a.type] - rank[b.type] || (a.behaviour < b.behaviour ? -1 : a.behaviour > b.behaviour ? 1 : 0)))
}

/** Untruncated discovery text; undefined means this profile has no query handler. */
export function getRlvCommands(profile: RlvProfile, option = ''): string | undefined {
  if (profile !== 'rlva') return undefined
  const [filter = '', type = '', separator = ';'] = option.split(';')
  if (!['', 'any', 'add', 'force', 'reply'].includes(type)) return ''
  return getRlvCommandCoverage(profile)
    .filter(form => form.support !== 'unsupported' && form.behaviour.includes(filter) &&
      (!type || type === 'any' || type === form.type))
    .map(form => form.behaviour).join(separator)
}
