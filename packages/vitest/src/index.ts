import './matchers.js'

export * from '@rezless/vm'
export { loadScript } from './loadScript.js'
export type { LoadScriptInput, InlineScriptInput } from './loadScript.js'
export { loadLinkset } from './loadLinkset.js'
export type {
  LinksetInput,
  PrimInput,
  ScriptInput,
  ScriptSource,
  InlineSource,
  LoadedLinkset,
} from './loadLinkset.js'

// LslCoverageReporter is intentionally NOT re-exported here — importing it
// pulls in every format module (lcov / istanbul / html / summary / console),
// `node:fs`, and `node:path`. Test files don't need any of that. Import it
// from the dedicated subpath in vitest.config.ts only:
//   import { LslCoverageReporter } from '@rezless/vitest/reporter'
