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
  // Reference settings are separate from implementation versions.
  settings: {
    rlv: ['Reference startup version replies and blacklist depend on viewer settings; no emulator setting implemented.'],
    rlva: ['RlvSettings::isCompatibilityModeObject selects per-object API reporting; no emulator setting implemented.',
      'Attachment queries use RlvHideLockedAttachments=false; lock-filter setting overrides are unsupported.'],
  },
  commands: [
    {
      id: 'version', forms: ['@version=<channel>', '@versionnew=<channel>', '@versionnum=<channel>', '@versionnum:impl=<channel>', '@<version-query>,<version-query>,...'],
      comparison: 'version/setting dependent',
      wikiComparison: 'Wiki specifies ordered comma-separated commands, partial failure and case-insensitive, spacing-sensitive names. Both profiles accept decimal channel prefixes and skip empty tokens. RLVa rejects missing fields and unknown parameter kinds; Kokua permits empty fields and handles named version queries first. RLVa adds its implementation tag and impl option; Kokua ignores the versionnum option.',
      profiles: {
        rlv: { ...kokua(['RRInterface::reallyHandleCommand', 'RRInterface::getVersion', 'RRInterface::getVersion2', 'RR_VERSION_NUM'],
          'versionnum returns 2093500 with any option; legacy/new strings use fixture viewer suffix 26.4.0.'),
          support: 'enforced', coveredForms: ['@version[:<option>]=<nonzero-signed-channel>', '@versionnew[:<option>]=<nonzero-signed-channel>', '@versionnum[:<option>]=<nonzero-signed-channel>', 'Ordered version-query batches with per-token diagnostics and parameter classification'] },
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
        rlv: { ...kokua(['RRInterface::answerOnChat'],
          'Object queries reject zero. Positive replies use avatar-origin shout across regions within 100 m and take a raw 1023-byte prefix. Negative replies use avatar-origin dialog chat within 20 m in the current region and take a raw 254-byte prefix. Partial UTF-8 becomes U+FFFD in VM strings. DEBUG_CHANNEL replies use the positive-channel shout path.'),
          support: 'enforced', coveredForms: ['Signed nonzero version-query channels', 'sendViewerReply: single-message payload truncation and avatar-origin routing'] },
        rlva: { ...firestorm('rlvcommon.cpp', ['RlvUtil::isValidReplyChannel', 'RlvUtil::sendChatReply'],
          'Object queries require positive signed channels excluding DEBUG_CHANNEL. Replies use the current avatar global position, reach listeners within 100 m across regions, and truncate once to 1023 UTF-8 bytes without cutting a character. Valid empty query results still deliver one message. Console loopback and redirected-chat splitting are outside the covered forms.'),
          support: 'enforced', coveredForms: ['Positive version-query channels except DEBUG_CHANNEL', 'sendViewerReply: single-message payload truncation and avatar-origin routing'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-channels.test.ts'],
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
      id: 'sendchannel', forms: ['@sendchannel[:<channel>]=n|add|y|rem', '@sendchannel_sec[:<channel>]=n|add|y|rem', '@permissive=n|add|y|rem'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both profiles share ordinary cross-prim exceptions, issuer-scoped secure exceptions and permissive=n narrowing all sendchannel exceptions to their own issuers. RLVa parses positive decimal option prefixes; Kokua matches literal decimal channel text.',
      profiles: {
        rlv: { ...kokua(['RRInterface::containsWithoutException', 'RRInterface::contains', 'RRInterface::isAllowed'],
          'Ordinary restrictions accept an exception from any prim. Every secure issuer needs an ordinary or secure exception on that same prim. With permissive=n every restricting issuer needs its own exception. Options match the literal decimal outgoing channel. Other permissive command families remain unsupported.'),
          support: 'enforced', coveredForms: ['Positive private-channel avatar say via sendAvatarChat', 'No-option sendchannel/sendchannel_sec blocks and literal channel exceptions', 'No-option permissive scoped to sendchannel', 'Channel zero bypasses sendchannel; denied attempts are logged without delivery'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::isException', 'RlvHandler::isPermissive', 'RlvBehaviourSendChannelHandler::onCommand', 'RlvActions::canSendChannel'],
          'Ordinary restrictions accept an exception from any prim. Every secure issuer needs its own exception; with permissive=n every restricting issuer does. Exceptions accept positive signed 32-bit decimal prefixes; zero, negative and invalid options are rejected. Ordinary and secure option forms grant the same channel exception. Other permissive command families remain unsupported.'),
          support: 'enforced', coveredForms: ['Positive private-channel avatar say via sendAvatarChat', 'No-option sendchannel/sendchannel_sec blocks and numeric channel exceptions', 'No-option permissive scoped to sendchannel', 'Channel zero bypasses sendchannel; denied attempts are logged without delivery'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-sendchannel.test.ts'],
    },
    {
      id: 'status', forms: ['@getstatus[:<filter>[;<separator>]]=<channel>', '@getstatusall[:<filter>[;<separator>]]=<channel>'],
      comparison: 'confirmed difference', wikiComparison: 'Both profiles return canonical rule text with a leading separator for every match and an empty reply for no matches. Rules retain insertion order within each prim; getstatusall visits emitter UUIDs in ascending order and preserves cross-prim duplicates. Extra semicolons differ between profiles.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getStatus'], 'First semicolon separates the substring filter from the entire remaining separator string; empty separator defaults to slash. Queries include only stored rules, including options and unsupported wire rules, without enforcing their effects.'),
          support: 'enforced', coveredForms: ['Caller-prim getstatus and avatar-wide getstatusall on valid reply channels', 'Canonical rule substring filters, default and custom separators, empty replies', 'Per-prim insertion order and ascending emitter UUID order with duplicates retained'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['rlvParseGetStatusOption', 'RlvHandler::processReplyCommand'], 'First two semicolon-delimited fields set substring filter and separator; later fields are ignored; empty separator defaults to slash. Queries include only stored rules and do not extend restriction support.'),
          support: 'enforced', coveredForms: ['Caller-prim getstatus and avatar-wide getstatusall on valid reply channels', 'Canonical rule substring filters, default and custom separators, empty replies', 'Per-prim insertion order and ascending emitter UUID order with duplicates retained'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-status.test.ts'],
    },
    {
      id: 'getinv', forms: ['@getinv[:<path>]=<channel>'], comparison: 'confirmed difference',
      wikiComparison: 'Both profiles list nonempty non-hidden direct folder names, preserve inventory order and duplicates, omit items, and return empty messages for absent roots, empty folders and unknown paths. Comma names pass through as wire text, as the wiki warns. Both use case-insensitive partial lookup with exact-name priority and skip empty path segments. Kokua excludes hidden paths, selects the last exact duplicate, supports slash-bearing folder names using longest path spans, and strips pipe suffixes. RLVa permits exact hidden paths, selects the first exact duplicate, and excludes slash-bearing and folded folders from listings. Folded state depends on legacy naming and is an explicit fixture flag.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getInventoryList', 'RRInterface::getCategoryUnderRlvShare', 'match'],
          'Queries enumerate only the explicit avatar shared root and descendants. Kokua filters empty and dot-prefixed names. Longest matching path spans win; equal spans prefer later exact matches. Slash-only nonempty paths return empty results. Prim inventory and inventory offers do not populate this fixture.'),
          support: 'enforced', coveredForms: ['Root and nested getinv on valid reply channels, including empty replies', 'Case-insensitive partial paths, exact-name priority, duplicate names, slash names and pipe suffixes', 'Per-avatar seeded inventory with stable IDs, parents, explicit shared root and immutable snapshots'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::onGetInv', 'RlvInventory::getSharedFolder', 'RlvInventory::isFoldedFolder', 'RLV_FOLDER_INVALID_CHARS'],
          'Queries enumerate only the explicit avatar shared root and descendants. RLVa filters empty, hidden, slash-bearing and effectively folded names. Path segments choose the first exact match or first non-hidden partial match. Hidden exact paths remain queryable. Effective folded state is supplied per folder; naming inference and viewer setting overrides are outside the fixture.'),
          support: 'enforced', coveredForms: ['Root and nested getinv on valid reply channels, including empty replies', 'Case-insensitive exact and partial paths, first exact duplicate, hidden exact paths and empty segments', 'Per-avatar seeded inventory with stable IDs, parents, explicit shared root, effective folded flags and immutable snapshots'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-getinv.test.ts'],
    },
    {
      id: 'getattach', forms: ['@getattach[:<point>]=<channel>'],
      comparison: 'version/setting dependent',
      wikiComparison: 'Both profiles return a reserved leading zero followed by occupancy for points 1 through 55, or one bit for a named point. Duplicate objects occupy one bit. Root aliases Avatar Center. Invalid names return empty text; RLVa also records a failed-option outcome. The fixture uses the RLVa reference hide-locked default false; lock-filter setting overrides are unsupported.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getAttachments', 'RRInterface::reallyHandleCommand'],
          'Reads existing live linkset attachments for the queried avatar, including HUDs and any bridge fixture. Names match the canonical point table without trimming; root aliases Avatar Center. Uses the shared reply-channel policy.'),
          support: 'enforced', coveredForms: ['Full 56-character bitmap in attachment-ID order', 'Named and empty-point queries, root alias, invalid-name empty replies', 'Actual attachment, detachment and duplicate point occupancy, including HUDs'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::onGetAttach', 'RlvAttachPtLookup::initLookupTable', 'RlvSettings::getHideLockedAttach'],
          'Reads the same occupancy with RlvHideLockedAttachments=false. An explicitly identified valid bridge at Center 2 is excluded; absent bridges never create occupancy. Lock-filter overrides and lock enforcement are outside the covered forms.'),
          support: 'enforced', coveredForms: ['Full 56-character bitmap in attachment-ID order', 'Named and empty-point queries, root alias, invalid-name empty replies', 'Actual attachment, detachment and duplicate point occupancy, including HUDs', 'Explicit valid bridge identity and reference hide-locked default false'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-getattach.test.ts'],
    },
    {
      id: 'getattachnames', forms: ['@getattachnames[:<group>]=<channel>'], comparison: 'confirmed difference',
      wikiComparison: 'The RLV wiki does not specify getattachnames. RLVa returns occupied point names once each in attachment-ID order; Kokua has no query handler. RLVa recognizes head, torso, arms, legs and hud; other options select all points. Its hud group is viewer group 8, including Jaw and newer skeleton points, while HUD points are group 9.',
      profiles: {
        rlv: kokua(['RRInterface::reallyHandleCommand'], 'No getattachnames query handler; no reply is synthesized and the command remains inspectably unsupported.'),
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::onGetAttachNames', 'rlvAttachGroupFromIndex', 'rlvAttachGroupFromString'],
          'Capitalized canonical names are comma-separated in ascending attachment-ID order. Empty occupancy produces an empty reply. Group filters use viewer group IDs; unknown options include all groups. A registered valid bridge is excluded, and locked objects remain visible.'),
          support: 'enforced', coveredForms: ['All occupied attachment point names, once per point', 'head/torso/arms/legs/hud group filters and unknown-option all-points fallback', 'Valid empty replies and explicit valid bridge exclusion'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-getattach.test.ts'],
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
