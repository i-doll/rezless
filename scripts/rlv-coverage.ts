import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RLV_MANIFEST, type RlvCommandForm } from '../packages/vm/src/rlv/manifest.js'
import { RLV_PROFILES } from '../packages/vm/src/rlv/profiles.js'

const code = (value: string) => `<code>${value.replaceAll('&', '&amp;').replaceAll('|', '&#124;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</code>`
const tests = (paths: readonly string[]) => paths.map(path => `[${path.split('/').at(-1)}](../${path})`).join('<br>')
const formText = (form: RlvCommandForm) => {
  const option = form.option === 'any' ? '[:<option>]' : ''
  const parameter = form.type === 'add' ? 'n|add|y|rem' : form.type === 'force' ? 'force' : '<channel>'
  return `@${form.behaviour}${option}=${parameter}`
}

/** The published table and contracts use the same manifest as command discovery. */
export function renderRlvCoverage(): string {
  const lines = [
    '# RLV/RLVa coverage', '',
    'Generated from `RLV_MANIFEST` by `pnpm exec tsx scripts/rlv-coverage.ts`. The coverage documentation test rejects drift.', '',
    'Profiles identify Kokua RLV 2.09.35.00 and Firestorm RLVa 2.4.2. A version reply identifies the selected protocol profile; it does not promise complete viewer conformance.', '',
    '## Reading the matrix', '',
    '- `enforced` means the listed query, protocol operation or explicit viewer action runs within the contract below.',
    '- `state-only` means rules are stored and queryable, but the corresponding viewer action is not enforced.',
    '- `unsupported` means the form or effect is outside the fixture. Inspect command logs and diagnostics; there is no synthetic wire success reply.', '',
    'The option placeholder describes discovery metadata, not acceptance of every option value. Contract forms and limits below narrow each row. Add forms include removal aliases. Clear, transport, inventory offers and session operations have contract rows because they are not discoverable add/force/reply forms.', '',
    '## Command forms', '',
    '| Contract | Profile and version | Command form or operation | Support depth | Comparison | Tests |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  for (const entry of RLV_MANIFEST.commands) {
    for (const profile of ['rlv', 'rlva'] as const) {
      const contract = entry.profiles[profile]
      const reference = RLV_PROFILES[profile]
      const version = `${reference.implementation} ${reference.implementationVersion}`
      const forms = contract.commandForms ?? []
      for (const form of forms) {
        lines.push(`| [${entry.id}](#${entry.id}) | ${version} | ${code(formText(form))} | ${form.support} | ${entry.comparison} | ${tests(entry.tests)} |`)
      }
      // Keep non-discoverable operations and unsupported profile forms visible.
      if (forms.length === 0 || entry.id === 'add-remove-clear' || entry.id === 'blacklist') {
        lines.push(`| [${entry.id}](#${entry.id}) | ${version} | ${entry.forms.map(code).join('<br>')} | ${contract.support} | ${entry.comparison} | ${tests(entry.tests)} |`)
      }
    }
  }
  lines.push('', '## Profile settings', '')
  for (const profile of ['rlv', 'rlva'] as const) {
    const reference = RLV_PROFILES[profile]
    lines.push(`### ${reference.implementation} ${reference.implementationVersion}`, '')
    for (const setting of RLV_MANIFEST.settings[profile]) lines.push(`- ${setting}`)
    lines.push('')
  }
  lines.push('## Contracts and limits', '')
  for (const entry of RLV_MANIFEST.commands) {
    lines.push(`### ${entry.id}`, '', `Forms: ${entry.forms.map(code).join(', ')}.`, '',
      `Comparison: ${entry.comparison}. ${entry.wikiComparison}`, '')
    for (const profile of ['rlv', 'rlva'] as const) {
      const contract = entry.profiles[profile]
      const reference = RLV_PROFILES[profile]
      lines.push(`#### ${reference.implementation} ${reference.implementationVersion}`, '',
        `Support depth: ${contract.support}. ${contract.contract}`, '')
      for (const covered of contract.coveredForms) lines.push(`- ${covered}`)
      lines.push('', `Reference symbols: ${code(contract.evidence.file)}: ${contract.evidence.symbols.map(code).join(', ')}.`, '')
    }
    lines.push(`Tests: ${tests(entry.tests)}.`, '')
  }
  lines.push('## Explicit exclusions', '',
    'Only the command forms and operations listed above are delivered. Unsupported names and option forms remain inspectable in `avatar.viewer.commandLog` and `avatar.viewer.diagnostics`. Kokua may retain an unknown wire rule; storage and status output do not enforce its effect.', '',
    '- State-only effects: `sendchat`. Simulator LSL calls remain separate from explicit viewer actions.',
    '- Other command families: environment and debug setters/queries such as `setenv`, `setdebug`, `getenv` and `getdebug`; chat redirection and IM commands such as `redirchat`, `rediremote`, `sendim` and `recvim`; movement, touch and vision controls such as `fly`, `edit`, `touchworld`, `showworld`. These names are examples, not an exhaustive upstream command catalog.',
    '- Settings: per-object API compatibility, hide-locked-attachment overrides, bridge detach exemptions, automatic legacy folded-folder naming inference and general viewer setting/UI emulation. Supported fixture settings are documented in the contracts, including startup timing, blacklist, `rlvaNoSetEnv`, shared wear and camera persistence.',
    '- Recovery: forced reattachment after a simulator detach, relay pong/relog recovery and optional relay meta-commands.',
    '- Rendering: shaders, visible camera effects, exclusive camera control, camera pose, collision/autopilot placement and terrain/landing-point adjustments.',
    '- Inventory: recursive `attachall`, `attachallover`, `attachalloverorreplace` and `detachall`; multi-folder wear/remove options; force-wearing clothing; inventory links, gestures, complete outfit layering, outfit-layer `getpath` selectors, point/folder wear locks and bare `detach=force`. Direct shared-folder attachment wear/removal and supported clothing removal are bounded by their contracts.',
    '- Transport: console loopback, redirected-chat splitting, IM/network transport and full viewer UI. Fixtures make no network calls.', '',
    'See [paired-profile usage and exact test commands](../packages/vitest/README.md#paired-rlvrlva-fixtures) and the [runnable example](../examples/rlv/README.md).', '')
  return lines.join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(new URL('../docs/', import.meta.url), { recursive: true })
  writeFileSync(new URL('../docs/rlv-coverage.md', import.meta.url), renderRlvCoverage())
}
