import { RLV_PROFILES, type RlvProfile } from './profiles.js'

export type RlvComparison = 'shared' | 'confirmed difference' | 'version/setting dependent' | 'not specified'
/** State-only never implies that a viewer action is enforced. */
export type RlvSupportDepth = 'unsupported' | 'state-only' | 'enforced'
/** Reference implementation version and symbols for this contract. */
export interface RlvEvidence {
  readonly implementation: string
  readonly file: string
  readonly symbols: readonly string[]
}
export interface RlvCommandProfile {
  readonly support: RlvSupportDepth
  readonly coveredForms: readonly string[]
  readonly contract: string
  readonly evidence: RlvEvidence
}
export interface RlvCommandContract {
  readonly id: string
  readonly forms: readonly string[]
  readonly comparison: RlvComparison
  readonly wikiComparison: string
  readonly profiles: Readonly<Record<RlvProfile, RlvCommandProfile>>
  readonly tests: readonly string[]
}

const kokua = (symbols: readonly string[], contract: string): RlvCommandProfile => ({
  support: 'unsupported', coveredForms: [], contract,
  evidence: {
    implementation: `${RLV_PROFILES.rlv.implementation} ${RLV_PROFILES.rlv.implementationVersion}`,
    file: 'indra/newview/RRInterface.cpp', symbols },
})
const firestorm = (file: string, symbols: readonly string[], contract: string): RlvCommandProfile => ({
  support: 'unsupported', coveredForms: [], contract,
  evidence: {
    implementation: `${RLV_PROFILES.rlva.implementation} ${RLV_PROFILES.rlva.implementationVersion}`,
    file: `indra/newview/${file}`, symbols },
})
const tests = ['packages/vitest/test/rlv-profiles.test.ts']

/** Append forms and behavioral tests as commands ship. Version reporting is not conformance. */
export const RLV_MANIFEST: {
  readonly schemaVersion: 3
  readonly wiki: { readonly url: string }
  readonly settings: Readonly<Record<RlvProfile, readonly string[]>>
  readonly commands: readonly RlvCommandContract[]
} = {
  schemaVersion: 3,
  wiki: { url: 'https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI' },
  // Reference settings are separate from versions. This slice exposes no setting overrides.
  settings: {
    rlv: ['Reference startup version replies and blacklist depend on viewer settings; no emulator setting implemented.'],
    rlva: ['RlvSettings::isCompatibilityModeObject selects per-object API reporting; no emulator setting implemented.'],
  },
  commands: [
    {
      id: 'version', forms: ['@version=<channel>', '@versionnew=<channel>', '@versionnum=<channel>', '@versionnum:impl=<channel>', '@<version-query>,<version-query>,...'],
      comparison: 'version/setting dependent',
      wikiComparison: 'Wiki specifies ordered comma-separated commands, partial failure and case-insensitive, spacing-sensitive names. Both profiles accept decimal channel prefixes and skip empty tokens. RLVa rejects missing fields and unknown parameter kinds; Kokua permits empty fields and handles named version queries first. RLVa adds its implementation tag and impl option; Kokua ignores the versionnum option.',
      profiles: {
        rlv: { ...kokua(['RRInterface::reallyHandleCommand', 'RRInterface::getVersion', 'RRInterface::getVersion2', 'RR_VERSION_NUM'],
          'versionnum returns 2093500 with any option; legacy/new strings use fixture viewer suffix 26.4.0.'),
          support: 'enforced', coveredForms: ['@version[:<option>]=<positive-channel>', '@versionnew[:<option>]=<positive-channel>', '@versionnum[:<option>]=<positive-channel>', 'Ordered version-query batches with per-token diagnostics and parameter classification'] },
        rlva: { ...firestorm('rlvcommon.cpp', ['RlvStrings::getVersion', 'RlvStrings::getVersionNum', 'RlvStrings::getVersionImplNum'],
          'Firestorm RLVa 2.4.2 with default settings returns RLVa-tagged strings, API 3040300, :impl 2040213, unknown numeric option empty. String queries ignore options. Compatibility overrides are not implemented.'),
          support: 'enforced', coveredForms: ['@version[:<option>]=<positive-channel>', '@versionnew[:<option>]=<positive-channel>', '@versionnum[:<option>]=<positive-channel>', 'Ordered version-query batches with per-token diagnostics and parameter classification'],
          evidence: { implementation: 'Firestorm RLVa 2.4.2', file: 'indra/newview/rlvhandler.cpp', symbols: ['RlvHandler::processReplyCommand'] } },
      },
      tests: [...tests, 'packages/vitest/test/rlv-version.test.ts', 'packages/vitest/test/rlv-batch.test.ts'],
    },
    {
      id: 'channel-policy', forms: ['<query>=<signed-channel>'], comparison: 'confirmed difference',
      wikiComparison: 'Wiki allows nonzero channels and describes 255 characters on negative channels. Kokua truncates negative replies to 254 bytes; RLVa rejects negative object-query channels.',
      profiles: {
        rlv: kokua(['RRInterface::answerOnChat'], 'Object queries reject zero; positive replies use SHOUT, max 1023 bytes; negative replies use ScriptDialogReply, max 254 bytes.'),
        rlva: firestorm('rlvcommon.h', ['RlvUtil::isValidReplyChannel'], 'Object queries require a positive signed channel other than DEBUG_CHANNEL; console loopback permits zero.'),
      },
      tests,
    },
    {
      id: 'add-remove-clear', forms: ['@<behaviour>[:<option>]=n|add', '@<behaviour>[:<option>]=y|rem', '@clear', '@clear=', '@clear=<filter>'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both profiles share prim-scoped rules, aliases, duplicate suppression and substring clear. Kokua retains unknown names and options; RLVa validates forms. Script reset, state change and removal preserve rules. Missing prims lose their rules during viewer garbage collection.',
      profiles: {
        rlv: { ...kokua(['RRInterface::isAllowed', 'RRInterface::add', 'RRInterface::remove', 'RRInterface::clear', 'RRInterface::garbageCollector'],
          'No-option detach, sendchat, sit, unsit, tploc and tplm are state-only. Other wire rules remain inspectable with unsupported effects. Ready-viewer fixtures collect missing prims at the default 10-second interval; startup and setting overrides are outside this fixture.'),
          support: 'state-only', coveredForms: ['No-option detach/sendchat/sit/unsit/tploc/tplm with n/add and y/rem', 'Unknown wire rule storage with unsupported effects', 'Bare, empty and substring-filtered clear by emitter UUID', 'Immutable restriction snapshots and script-independent lifecycle'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::processCommand', 'RlvHandler::processClearCommand', 'RlvHandler::onGC'],
          'No-option detach, sendchat, sit, unsit, tploc and tplm are state-only. Invalid options and unknown names are not stored. Other command families and valid option forms remain unsupported. Ready-viewer fixtures collect missing prims every 30 seconds.'),
          support: 'state-only', coveredForms: ['No-option detach/sendchat/sit/unsit/tploc/tplm with n/add and y/rem', 'Bare, empty and substring-filtered clear by emitter UUID', 'Immutable restriction snapshots and script-independent lifecycle'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-restrictions.test.ts'],
    },
    {
      id: 'status', forms: ['@getstatus[:<filter>[;<separator>]]=<channel>', '@getstatusall[:<filter>[;<separator>]]=<channel>'],
      comparison: 'confirmed difference', wikiComparison: 'Wiki specifies filter, separator and leading separator. Extra semicolons differ between implementations.',
      profiles: {
        rlv: kokua(['RRInterface::getStatus'], 'First semicolon separates the filter from the entire remaining separator string; empty separator defaults to slash.'),
        rlva: firestorm('rlvhandler.cpp', ['rlvParseGetStatusOption', 'RlvHandler::processReplyCommand'], 'First two semicolon-delimited fields set filter and separator; later fields are ignored; empty separator defaults to slash.'),
      },
      tests,
    },
    {
      id: 'discovery', forms: ['@getcommand[:<behaviour>[;<type>[;<separator>]]]=<channel>'],
      comparison: 'confirmed difference', wikiComparison: 'No getcommand section in the wiki. RLVa implements it; Kokua has no named query branch and falls through to ordinary parameter dispatch.',
      profiles: {
        rlv: kokua(['RRInterface::handleCommand'], 'No getcommand query branch. Numeric reply parameter reaches fallback and returns false, rather than an empty successful query.'),
        rlva: firestorm('rlvhandler.cpp', ['RlvReplyHandler<RLV_BHVR_GETCOMMAND>::onCommand'], 'Supports behaviour filtering, any/add/force/reply type and custom separator; invalid type fails.'),
      },
      tests,
    },
    {
      id: 'notifications', forms: ['@notify:<channel>[;<filter>]=n|add', '@notify:<channel>[;<filter>]=y|rem'],
      comparison: 'confirmed difference', wikiComparison: 'Wiki describes rule notifications. Alias preservation and clear event sequences require implementation-specific expectations.',
      profiles: {
        rlv: kokua(['RRInterface::notify', 'RRInterface::add', 'RRInterface::remove', 'RRInterface::clear'], 'Notifications normalize aliases to n/y; clear emits a clear notification and individual removals.'),
        rlva: firestorm('rlvhelper.cpp', ['RlvBehaviourNotifyHandler::onCommand', 'RlvBehaviourNotifyHandler::sendNotification'], 'Notifications preserve input aliases; internal commands do not notify; compare duplicate and failed external commands separately.'),
      },
      tests,
    },
  ],
}
