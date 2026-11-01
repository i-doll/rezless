import './matchers.js'

export * from '@rezless/vm'
export { loadScript } from './loadScript.js'
export type { LoadScriptInput, InlineScriptInput } from './loadScript.js'
export { loadLinkset } from './loadLinkset.js'
export type {
  LinksetInput,
  PrimInput,
  ObjectInput,
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

export { loadRlvPair, rlvExpectationFor, seedRlvInventory, setRlvViewerReady, resetRlvViewerSession, setRlvObjectAvailable } from './rlv.js'
export type { RlvFixture, RlvExpectation, RlvExpectations } from './rlv.js'
export { respondRlvInventoryOffer } from './rlv.js'
export type { RlvInventoryOfferDecision, RlvInventoryOfferResult } from './rlv.js'

export { receivedChatLog } from '@rezless/vm'
export type { ReceivedChat, ReceivedChatSpeaker } from '@rezless/vm'
