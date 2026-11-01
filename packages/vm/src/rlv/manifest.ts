import { RLV_PROFILES, type RlvProfile } from './profiles.js'

export type RlvComparison = 'shared' | 'confirmed difference' | 'version/setting dependent' | 'not specified'
/** State-only never implies that a viewer action is enforced. */
export type RlvSupportDepth = 'unsupported' | 'state-only' | 'enforced'
export interface RlvCommandForm {
  readonly behaviour: string
  readonly type: 'add' | 'force' | 'reply'
  readonly support: RlvSupportDepth
  readonly option: 'none' | 'any'
}
/** Reference implementation version and symbols for this contract. */
export interface RlvEvidence {
  readonly implementation: string
  readonly file: string
  readonly symbols: readonly string[]
}
export interface RlvCommandProfile {
  /** Ordered command forms; only supported forms participate in discovery. */
  readonly commandForms?: readonly RlvCommandForm[]
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

const replyForms = (...names: string[]): RlvCommandForm[] => names.map(behaviour => ({
  behaviour, type: 'reply', support: 'enforced', option: 'any',
}))
const restrictionForms: RlvCommandForm[] = ['tplm'].map(behaviour => ({
  behaviour, type: 'add', support: 'state-only', option: 'none',
}))

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
    rlv: ['doNotQueueVersionRequests defaults true. Kokua time-based collection uses initialGarbageCollectionAdditionalWait=5000 and garbageCollectionAdditionalInterval=8000 milliseconds, added to minimum delays of 5000 and 2000 milliseconds. The default ignores first-fully-visible timing; frame-based and avatar-visibility scheduling are unsupported. An explicit per-avatar blacklist preserves wire order and uses %f for force entries; query and notify commands remain available.'],
    rlva: ['rlvaNoSetEnv disables setenv add/remove through the dictionary; it is separate from the Kokua blacklist. Environment effects remain unsupported.', 'RlvSettings::isCompatibilityModeObject selects per-object API reporting; no emulator setting implemented.',
      'Attachment queries use RlvHideLockedAttachments=false; lock-filter setting overrides are unsupported.',
      'Force wear uses RLVaEnableSharedWear=true by default; inventory.sharedWear=false disables unnamed items. Legacy folder naming is enabled, the add prefix is + and the replace prefix is empty.',
      'Outfit queries use RlvHideLockedLayers=false and RLVaEnableSharedWear=true; overrides are unsupported and effective folded state is explicit.'],
  },
  commands: [
    {
      id: 'version', forms: ['@version=<channel>', '@versionnew=<channel>', '@versionnum=<channel>', '@versionnum:impl=<channel>', '@<version-query>,<version-query>,...'],
      comparison: 'version/setting dependent',
      wikiComparison: 'Wiki specifies ordered comma-separated commands, partial failure and case-insensitive, spacing-sensitive names. Both profiles accept decimal channel prefixes and skip empty tokens. RLVa rejects missing fields and unknown parameter kinds; Kokua permits empty fields and handles named version queries first. RLVa adds its implementation tag and impl option; Kokua ignores the versionnum option.',
      profiles: {
        rlv: { ...kokua(['RRInterface::reallyHandleCommand', 'RRInterface::getVersion', 'RRInterface::getVersion2', 'RR_VERSION_NUM'],
          'versionnum returns 2093500 with any option; legacy/new strings use fixture viewer suffix 26.4.0.'),
          commandForms: replyForms('version', 'versionnew', 'versionnum'),
          support: 'enforced', coveredForms: ['@version[:<option>]=<nonzero-signed-channel>', '@versionnew[:<option>]=<nonzero-signed-channel>', '@versionnum[:<option>]=<nonzero-signed-channel>', 'Ordered version-query batches with per-token diagnostics and parameter classification'] },
        rlva: { ...firestorm('rlvcommon.cpp', ['RlvStrings::getVersion', 'RlvStrings::getVersionNum', 'RlvStrings::getVersionImplNum'],
          'Firestorm RLVa 2.4.2 with default settings returns RLVa-tagged strings, API 3040300, :impl 2040213, unknown numeric option empty. String queries ignore options. Compatibility overrides are not implemented.'),
          commandForms: replyForms('version', 'versionnew', 'versionnum'),
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
      tests: [...tests, 'packages/vitest/test/rlv-channels.test.ts', 'packages/vitest/test/rlv-relay.test.ts'],
    },
    {
      id: 'add-remove-clear', forms: ['@<behaviour>[:<option>]=n|add', '@<behaviour>[:<option>]=y|rem', '@clear', '@clear=', '@clear=<filter>'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both profiles share prim-scoped rules, aliases, duplicate suppression and substring clear. Kokua retains unknown names and options; RLVa validates forms. Script reset, state change and removal preserve rules. Missing prims lose their rules during viewer garbage collection.',
      profiles: {
        rlv: { ...kokua(['RRInterface::isAllowed', 'RRInterface::add', 'RRInterface::remove', 'RRInterface::clear', 'RRInterface::garbageCollector'],
          'No-option tplm is state-only. Public chat restrictions are enforced by explicit avatar actions. Teleport restrictions constrain forced location travel. Detach actions have a separate contract. Seating restrictions are enforced by explicit user actions. Other wire rules remain inspectable with unsupported effects. Time-based maintenance collects missing prims with a default initial delay and interval of 10 seconds. Additional wait and interval fixture settings are supported.'),
          commandForms: restrictionForms,
          support: 'state-only', coveredForms: ['No-option detach/sendchat/sit/unsit/tploc/tplm with n/add and y/rem', 'Unknown wire rule storage with unsupported effects', 'Bare, empty and substring-filtered clear by emitter UUID', 'LSL relay release clears its own issuer while retaining unrelated rules', 'Immutable restriction snapshots and script-independent lifecycle'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::processCommand', 'RlvHandler::processClearCommand', 'RlvHandler::onGC'],
          'No-option tplm is state-only. Public chat restrictions are enforced by explicit avatar actions. Teleport restrictions constrain forced location travel. Detach actions have a separate contract. Seating restrictions are enforced by explicit user actions. Invalid options and unknown names are not stored. Other command families and valid option forms remain unsupported. Collection checks every 30 seconds from the first restriction. Known missing prims expire on the next pass; never-resolved prims expire after more than 20 misses. Completed detach clears known attachment issuers immediately. Distance and region changes alone do not imply object-list removal.'),
          commandForms: restrictionForms,
          support: 'state-only', coveredForms: ['No-option detach/sendchat/sit/unsit/tploc/tplm with n/add and y/rem', 'Bare, empty and substring-filtered clear by emitter UUID', 'LSL relay release clears its own issuer while retaining unrelated rules', 'Immutable restriction snapshots and script-independent lifecycle'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-restrictions.test.ts', 'packages/vitest/test/rlv-relay.test.ts'],
    },
    {
      id: 'sendchat', forms: ['@sendchat=n|add|y|rem'], comparison: 'confirmed difference',
      wikiComparison: 'Both profiles replace restricted speech with ellipsis, allow OOC and short slash gestures, filter quoted emotes and truncate emotes. Kokua uses byte limits, accepts colon poses and strips text preceding an embedded /me; RLVa uses character limits and additionally filters question marks.',
      profiles: {
        rlv: { ...kokua(['RRInterface::crunchEmote'],
          'With default OOC enabled, public avatar say replaces ordinary text with ... and permits ((OOC)), slash gestures up to seven bytes and safe emotes up to twenty bytes or the first period. Colon poses are emotes; text before embedded /me is discarded. DEBUG_CHANNEL is blocked. Gesture expansion, chat redirection and emote restriction extensions are outside this action.'),
          commandForms: [{ behaviour: 'sendchat', type: 'add', support: 'enforced', option: 'none' }],
          support: 'enforced', coveredForms: ['No-option sendchat add/remove and clear', 'Public avatar say filtering with original and delivered text in action records', 'DEBUG_CHANNEL denial; other private channels and simulator chat remain independent'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::filterChat', 'RlvUtil::isEmote'],
          'With default OOC and ellipsis enabled, public avatar say replaces ordinary text with ... and permits ((OOC)), slash gestures up to seven characters and safe /me emotes up to twenty characters, shortened using the byte offset of the first period when below twenty. Question marks are forbidden in emotes. DEBUG_CHANNEL is blocked. Gesture expansion, chat redirection and emote restriction extensions are outside this action.'),
          commandForms: [{ behaviour: 'sendchat', type: 'add', support: 'enforced', option: 'none' }],
          support: 'enforced', coveredForms: ['No-option sendchat add/remove and clear', 'Public avatar say filtering with original and delivered text in action records', 'DEBUG_CHANNEL denial; other private channels and simulator chat remain independent'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-sendchat.test.ts'],
    },
    {
      id: 'chat-volume', forms: ['@chatshout=n|add|y|rem', '@chatwhisper=n|add|y|rem', '@chatnormal=n|add|y|rem'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both profiles transform public avatar chat volume. chatshout converts shout to say, chatwhisper converts whisper to say, and chatnormal converts say and shout to whisper. Combined chatwhisper and chatnormal leave a requested whisper as whisper in Kokua and say in RLVa. Private channels bypass volume restrictions.',
      profiles: {
        rlv: {
          support: 'enforced',
          commandForms: ['chatshout', 'chatwhisper', 'chatnormal'].map(behaviour => ({ behaviour, type: 'add', support: 'enforced', option: 'none' })),
          coveredForms: ['No-option volume restrictions with add/remove aliases and issuer-scoped clear', 'Public whisper/say/shout volume transformation and immutable action records', 'Delivered volume selects 10/20/100 m script and avatar hearing ranges across regions'],
          contract: 'Avatar chat defaults to say. Public volume transforms sequentially: restricted whisper becomes say, restricted shout becomes say, then chatnormal converts say or shout to whisper. Requested and delivered volumes are recorded separately. Private channels bypass these transformations; simulator chat and automatic replies remain independent. Payload limits, gesture expansion and optional prevention of unrestricted shouts are outside this fixture.',
          evidence: { implementation: 'Kokua RLV 2.09.35.00', file: 'indra/newview/llchatbar.cpp', symbols: ['LLChatBar::sendChatFromViewer', 'RRInterface::contains'] },
        },
        rlva: { ...firestorm('rlvactions.cpp', ['RlvActions::checkChatVolume', 'FSNearbyChat::sendChatFromViewer', 'RlvBehaviourDictionary::RlvBehaviourDictionary'],
          'Avatar chat defaults to say. Public say or shout becomes whisper under chatnormal; otherwise restricted shout becomes say, otherwise restricted whisper becomes say. Only one transformation applies. Requested and delivered volumes are recorded separately. Delivered whisper/say/shout reaches scripts and avatars within 10/20/100 m across regions. Private channels bypass these transformations; simulator chat and automatic replies remain independent. Payload limits and gesture expansion are outside this fixture.'),
          support: 'enforced',
          commandForms: ['chatshout', 'chatwhisper', 'chatnormal'].map(behaviour => ({ behaviour, type: 'add', support: 'enforced', option: 'none' })),
          coveredForms: ['No-option volume restrictions with add/remove aliases and issuer-scoped clear', 'Public whisper/say/shout volume transformation and immutable action records', 'Delivered volume selects 10/20/100 m script and avatar hearing ranges across regions'],
        },
      },
      tests: [...tests, 'packages/vitest/test/rlv-chatvolume.test.ts'],
    },
    {
      id: 'received-chat',
      forms: ['@recvchat[:<uuid>]=n|add|y|rem', '@recvemote[:<uuid>]=n|add|y|rem', '@recvchat_sec[:<uuid>]=n|add|y|rem', '@recvemote_sec[:<uuid>]=n|add|y|rem', '@recvchatfrom:<uuid>=n|add|y|rem', '@recvemotefrom:<uuid>=n|add|y|rem', '@recvchatfrom_sec:<uuid>=n|add|y|rem', '@recvemotefrom_sec:<uuid>=n|add|y|rem'],
      comparison: 'confirmed difference',
      wikiComparison: 'Global receive restrictions have speaker UUID exceptions; targeted from rules deny the named speaker independently of those exceptions. Ordinary exceptions are shared, secure and permissive restrictions require each restricting issuer to grant an exception. Both profiles use ellipses by default. Kokua also matches object owners against targeted rules, filters self chat, and shortens emotes under recvchat. RLVa exempts self chat and leaves emotes unchanged under recvchat.',
      profiles: {
        rlv: { ...kokua(['RRInterface::containsWithoutException', 'RRInterface::crunchEmote', 'RRInterface::contains'],
          'Per-avatar frozen receivedChatLog snapshots record delivered object and avatar local chat with copied speaker identity and displayed text. recvchat crunches speech and shortens emotes to twenty UTF-8 bytes or the first period; recvemote replaces the suffix starting at any /me with /me ... . Targeted rules match speaker or object owner UUID. Owned attachments and direct region messages bypass filtering; ordinary owner chat from unattached objects is filtered. Owner commands are consumed. Secure global exceptions and permissive issuer scope are enforced. Secure from aliases are unsupported. Default OOC and ellipsis settings are fixed; alternate settings, emote extensions and object-to-avatar name impersonation are outside this fixture.'),
          commandForms: ['recvchat', 'recvchat_sec', 'recvemote', 'recvemote_sec', 'recvchatfrom', 'recvemotefrom', 'recvchatfrom_sec', 'recvemotefrom_sec'].map(behaviour => ({ behaviour, type: 'add', support: behaviour.endsWith('from_sec') ? 'unsupported' : 'enforced', option: 'any' })),
          support: 'enforced', coveredForms: ['Global receive chat/emote add/remove, UUID exceptions, secure aliases and permissive issuer scope', 'Targeted recvchatfrom/recvemotefrom speaker and object-owner denials', 'Object whisper/say/shout, owner chat and direct region chat; avatar local say', 'Immutable per-avatar received-chat snapshots; simulator listens and send-action records remain independent'] },
        rlva: { ...firestorm('llviewermessage.cpp', ['process_chat_from_simulator', 'RlvHandler::filterChat', 'RlvHandler::isException', 'RlvBehaviourGenericHandler::onCommand'],
          'Per-avatar frozen receivedChatLog snapshots record delivered object and avatar local chat with copied speaker identity and displayed text. recvchat filters non-emote speech while preserving OOC and short slash gestures; recvemote replaces leading emotes with /me ... . Targeted rules match speaker UUID only, and support secure aliases. Self chat, owned attachments, owner chat and direct region messages bypass filtering. Owner commands are consumed. Secure global exceptions and permissive issuer scope are enforced. Default OOC and ellipsis settings are fixed; alternate settings and object-to-avatar name impersonation are outside this fixture.'),
          commandForms: ['recvchat', 'recvchat_sec', 'recvemote', 'recvemote_sec', 'recvchatfrom', 'recvchatfrom_sec', 'recvemotefrom', 'recvemotefrom_sec'].map(behaviour => ({ behaviour, type: 'add', support: 'enforced', option: 'any' })),
          support: 'enforced', coveredForms: ['Global receive chat/emote add/remove, UUID exceptions, secure aliases and permissive issuer scope', 'Targeted recvchatfrom/recvemotefrom speaker denials and secure aliases', 'Object whisper/say/shout, owner chat and direct region chat; avatar local say', 'Immutable per-avatar received-chat snapshots; simulator listens and send-action records remain independent'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-recvchat.test.ts'],
    },
    {
      id: 'received-im',
      forms: ['@recvim[:<uuid>]=n|add|y|rem', '@recvim_sec[:<uuid>]=n|add|y|rem', '@recvimfrom:<uuid>=n|add|y|rem', '@recvimfrom_sec:<uuid>=n|add|y|rem'],
      comparison: 'confirmed difference',
      wikiComparison: 'Global recvim restrictions accept sender UUID exceptions; recvimfrom independently denies a sender. Secure global restrictions and permissive=n require issuer-scoped exceptions. Kokua replaces restricted avatar IM text with ...; Firestorm displays its default blocked-message notice. Scripted object IMs bypass these restrictions. Firestorm supports secure targeted aliases; Kokua does not.',
      profiles: {
        rlv: { ...kokua(['RRInterface::containsWithoutException', 'KokuaRLVExtras::cannotRecvIM', 'LLIMProcessing::processNewMessage'],
          'Frozen receivedIMLog snapshots contain sender identity and displayed text. Online one-to-one avatar IMs delivered through World.sendAvatarIM become ... under recvim or recvimfrom. Ordinary UUID exceptions may come from any issuer; secure global restrictions and permissive=n require each restricting issuer to grant its own exception. Targeted denials override global exceptions. Scripted object IMs delivered through llInstantMessage bypass these filters. Secure targeted aliases, distance options, group IMs, offline delivery, privileged senders, automatic replies, custom viewer strings, name/location censoring and mute settings are outside this contract.'),
          commandForms: ['recvim', 'recvim_sec', 'recvimfrom', 'recvimfrom_sec'].map(behaviour => ({ behaviour, type: 'add', support: behaviour === 'recvimfrom_sec' ? 'unsupported' : 'enforced', option: 'any' })),
          support: 'enforced', coveredForms: ['Online one-to-one avatar IMs with profile-specific replacement text', 'Global and secure recvim, sender UUID exceptions, permissive issuer scope', 'Targeted recvimfrom UUID denials; add/remove aliases and clear', 'Scripted object IM delivery; immutable per-avatar received IM snapshots'] },
        rlva: { ...firestorm('llimprocessing.cpp', ['LLIMProcessing::processNewMessage', 'RlvActions::canReceiveIM', 'RlvHandler::isException', 'RlvBehaviourDictionary::RlvBehaviourDictionary'],
          'Frozen receivedIMLog snapshots contain sender identity and displayed text. Online one-to-one avatar IMs delivered through World.sendAvatarIM display *** IM blocked by your viewer under recvim or recvimfrom. Ordinary UUID exceptions may come from any issuer; secure global restrictions and permissive=n require each restricting issuer to grant its own exception. Targeted denials override global exceptions. Secure targeted aliases require every secure issuer to list the sender; permissive=n extends that check to every targeted issuer. Scripted object IMs delivered through llInstantMessage bypass these filters. Distance options, group IMs, offline delivery, privileged senders, automatic replies, custom viewer strings, name/location censoring and mute settings are outside this contract.'),
          commandForms: ['recvim', 'recvim_sec', 'recvimfrom', 'recvimfrom_sec'].map(behaviour => ({ behaviour, type: 'add', support: 'enforced', option: 'any' })),
          support: 'enforced', coveredForms: ['Online one-to-one avatar IMs with profile-specific replacement text', 'Global and secure recvim, sender UUID exceptions, permissive issuer scope', 'Targeted recvimfrom UUID denials and secure aliases; add/remove aliases and clear', 'Scripted object IM delivery; immutable per-avatar received IM snapshots'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-recvim.test.ts'],
    },
    {
      id: 'sendchannel_except', forms: ['@sendchannel_except[:<channel>]=n|add|y|rem', '@sendchannel_except_sec[:<channel>]=n|add|y|rem'], comparison: 'confirmed difference',
      wikiComparison: 'This is a channel exclusion list, independent of sendchannel grants. Kokua directly denies each literal outgoing channel listed; RLVa requires the no-option switch and accepts positive numeric option prefixes. Its secure form requires each secure issuer to list the channel; permissive=n extends this to every activating issuer. Kokua has no secure form. Channel zero bypasses this family.',
      profiles: {
        rlv: { ...kokua(['RRInterface::contains', 'RRInterface::add', 'RRInterface::remove'],
          'A sendchannel_except:<channel> rule denies that literal decimal channel regardless of sendchannel exceptions or issuer. The no-option rule has no action effect. The secure form is unsupported. Public chat and automatic replies are unaffected.'),
          commandForms: [{ behaviour: 'sendchannel_except', type: 'add', support: 'enforced', option: 'any' }],
          support: 'enforced', coveredForms: ['Literal signed integer channel exclusions', 'No-option inert rule, add/remove and clear', 'Channel exclusions override ordinary and secure sendchannel grants'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvBehaviourSendChannelHandler::onCommand', 'RlvHandler::isException', 'RlvHandler::isPermissive', 'RlvActions::canSendChannel'],
          'A no-option sendchannel_except restriction activates the exclusion list. Listed positive numeric channels are denied independently of sendchannel grants and issuer. Removing the last no-option switch deactivates the list. The secure form requires a channel entry from each secure issuer; permissive=n requires one from every activating issuer. Public chat and automatic replies are unaffected.'),
          commandForms: [{ behaviour: 'sendchannel_except', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'sendchannel_except_sec', type: 'add', support: 'enforced', option: 'any' }],
          support: 'enforced', coveredForms: ['Positive signed 32-bit decimal-prefix channel exclusions', 'No-option activation switch, add/remove and clear', 'Secure alias and permissive issuer scope', 'Channel exclusions override ordinary and secure sendchannel grants'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-sendchat.test.ts'],
    },
    {
      id: 'sendchannel', forms: ['@sendchannel[:<channel>]=n|add|y|rem', '@sendchannel_sec[:<channel>]=n|add|y|rem', '@permissive=n|add|y|rem'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both profiles share ordinary cross-prim exceptions, issuer-scoped secure exceptions and permissive=n narrowing all sendchannel exceptions to their own issuers. RLVa parses positive decimal option prefixes; Kokua matches literal decimal channel text.',
      profiles: {
        rlv: { ...kokua(['RRInterface::containsWithoutException', 'RRInterface::contains', 'RRInterface::isAllowed'],
          'Ordinary restrictions accept an exception from any prim. Every secure issuer needs an ordinary or secure exception on that same prim. With permissive=n every restricting issuer needs its own exception. Options match the literal decimal outgoing channel. Other permissive command families remain unsupported.'),
          commandForms: [
            { behaviour: 'sendchannel', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'sendchannel_sec', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'permissive', type: 'add', support: 'enforced', option: 'none' },
          ],
          support: 'enforced', coveredForms: ['Positive private-channel avatar say via sendAvatarChat', 'No-option sendchannel/sendchannel_sec blocks and literal channel exceptions', 'No-option permissive scoped to sendchannel', 'Channel zero bypasses sendchannel; denied attempts are logged without delivery'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::isException', 'RlvHandler::isPermissive', 'RlvBehaviourSendChannelHandler::onCommand', 'RlvActions::canSendChannel'],
          'Ordinary restrictions accept an exception from any prim. Every secure issuer needs its own exception; with permissive=n every restricting issuer does. Exceptions accept positive signed 32-bit decimal prefixes; zero, negative and invalid options are rejected. Ordinary and secure option forms grant the same channel exception. Other permissive command families remain unsupported.'),
          commandForms: [
            { behaviour: 'sendchannel', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'sendchannel_sec', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'permissive', type: 'add', support: 'enforced', option: 'none' },
          ],
          support: 'enforced', coveredForms: ['Positive private-channel avatar say via sendAvatarChat', 'No-option sendchannel/sendchannel_sec blocks and numeric channel exceptions', 'No-option permissive scoped to sendchannel', 'Channel zero bypasses sendchannel; denied attempts are logged without delivery'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-sendchannel.test.ts'],
    },
    {
      id: 'status', forms: ['@getstatus[:<filter>[;<separator>]]=<channel>', '@getstatusall[:<filter>[;<separator>]]=<channel>'],
      comparison: 'confirmed difference', wikiComparison: 'Both profiles return canonical rule text with a leading separator for every match and an empty reply for no matches. Rules retain insertion order within each prim; getstatusall visits emitter UUIDs in ascending order and preserves cross-prim duplicates. Extra semicolons differ between profiles.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getStatus'], 'First semicolon separates the substring filter from the entire remaining separator string; empty separator defaults to slash. Queries include only stored rules, including options and unsupported wire rules, without enforcing their effects.'),
          commandForms: replyForms('getstatus', 'getstatusall'),
          support: 'enforced', coveredForms: ['Caller-prim getstatus and avatar-wide getstatusall on valid reply channels', 'Canonical rule substring filters, default and custom separators, empty replies', 'Per-prim insertion order and ascending emitter UUID order with duplicates retained'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['rlvParseGetStatusOption', 'RlvHandler::processReplyCommand'], 'First two semicolon-delimited fields set substring filter and separator; later fields are ignored; empty separator defaults to slash. Queries include only stored rules and do not extend restriction support.'),
          commandForms: replyForms('getstatus', 'getstatusall'),
          support: 'enforced', coveredForms: ['Caller-prim getstatus and avatar-wide getstatusall on valid reply channels', 'Canonical rule substring filters, default and custom separators, empty replies', 'Per-prim insertion order and ascending emitter UUID order with duplicates retained'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-status.test.ts', 'packages/vitest/test/rlv-relay.test.ts'],
    },
    {
      id: 'getinv', forms: ['@getinv[:<path>]=<channel>'], comparison: 'confirmed difference',
      wikiComparison: 'Both profiles list nonempty non-hidden direct folder names, preserve inventory order and duplicates, omit items, and return empty messages for absent roots, empty folders and unknown paths. Comma names pass through as wire text, as the wiki warns. Both use case-insensitive partial lookup with exact-name priority and skip empty path segments. Kokua excludes hidden paths, selects the last exact duplicate, supports slash-bearing folder names using longest path spans, and strips pipe suffixes. RLVa permits exact hidden paths, selects the first exact duplicate, and excludes slash-bearing and folded folders from listings. Folded state depends on legacy naming and is an explicit fixture flag.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getInventoryList', 'RRInterface::getCategoryUnderRlvShare', 'match'],
          'Queries enumerate only the explicit avatar shared root and descendants. Kokua filters empty and dot-prefixed names. Longest matching path spans win; equal spans prefer later exact matches. Slash-only nonempty paths return empty results. Prim inventory stays separate; explicitly accepted folder offers can append fixture content.'),
          commandForms: replyForms('getinv'),
          support: 'enforced', coveredForms: ['Root and nested getinv on valid reply channels, including empty replies', 'Case-insensitive partial paths, exact-name priority, duplicate names, slash names and pipe suffixes', 'Per-avatar seeded inventory with stable IDs, parents, explicit shared root and immutable snapshots'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::onGetInv', 'RlvInventory::getSharedFolder', 'RlvInventory::isFoldedFolder', 'RLV_FOLDER_INVALID_CHARS'],
          'Queries enumerate only the explicit avatar shared root and descendants. RLVa filters empty, hidden, slash-bearing and effectively folded names. Path segments choose the first exact match or first non-hidden partial match. Hidden exact paths remain queryable. Effective folded state is supplied per folder; naming inference and viewer setting overrides are outside the fixture.'),
          commandForms: replyForms('getinv'),
          support: 'enforced', coveredForms: ['Root and nested getinv on valid reply channels, including empty replies', 'Case-insensitive exact and partial paths, first exact duplicate, hidden exact paths and empty segments', 'Per-avatar seeded inventory with stable IDs, parents, explicit shared root, effective folded flags and immutable snapshots'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-getinv.test.ts'],
    },
    {
      id: 'inventory-offers', forms: ['Explicit accept or decline of captured llGiveInventoryList avatar offers'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both profiles require an explicit fixture decision and shared-routing opt-in. Prefix matching is case-sensitive. Parents are reused by exact case-insensitive name; every leaf offer creates a distinct folder. Kokua notifies all supported folder decisions using the original offer name. RLVa notifies only #RLV/~ offers, reporting the final path after successful shared routing. No acceptance wears content.',
      profiles: {
        rlv: { ...kokua(['LLOfferInfo::inventory_task_offer_callback', 'LLInventoryModel::processBulkUpdateInventory', 'buildRLVPathAndMove'],
          'Accepted #RLV/~ folders route under an existing shared root unless forbidden. Nested paths skip empty segments without a depth limit. Missing roots and disallowed routing retain ordinary inventory. Accepted and declined notifications include the original folder name. Single-item and llGiveAgentInventory offers remain unsupported.'),
          evidence: { implementation: 'Kokua RLV 2.09.35.00', file: 'indra/newview/llinventorymodel.cpp', symbols: ['LLInventoryModel::processBulkUpdateInventory', 'buildRLVPathAndMove'] },
          support: 'enforced', coveredForms: ['Pending avatar folder offers, explicit accept/decline, recipient identity and one decision per offer', 'Shared or ordinary inventory, missing shared root, nested parents and duplicate leaves', 'Original-name offer notifications through notify channel and filter rules; transferred item metadata retained, including object definitions and modify permissions for subsequent queries and explicit wear'] },
        rlva: { ...firestorm('rlvinventory.cpp', ['RlvGiveToRLVOffer::createDestinationFolder', 'RlvGiveToRLVTaskOffer::onOfferCompleted'],
          'Accepted #RLV/~ folders create a missing shared root and route paths of up to four segments including #RLV. Deeper paths remain unrenamed at the initial destination without an acceptance notification. Disallowed routing sends accepted_in_inv; declines send declined with the original name. Other folder names do not send offer notifications. Single-item and llGiveAgentInventory offers remain unsupported.'),
          support: 'enforced', coveredForms: ['Pending avatar folder offers, explicit accept/decline, recipient identity and one decision per offer', 'Shared or ordinary inventory, missing-root creation, nested parents, duplicate leaves and path-depth outcomes', 'Final-path shared acceptance and original-name ordinary acceptance/decline notifications through notify transport; object definitions and modify permissions retained for later queries and explicit wear'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-offers.test.ts'],
    },
    {
      id: 'getoutfit', forms: ['@getoutfit[:<layer>]=<channel>'], comparison: 'confirmed difference',
      wikiComparison: 'Both profiles return clothing and bodypart occupancy in the reference layer order, including universal after physics. There is no reserved leading bit. Named layers return one bit. Kokua falls back to the full bitmap for an invalid layer; RLVa sends an empty failed-option reply. Seeded state is explicit, including shape, skin, hair and eyes; no bodyparts are fabricated. RLVa uses RlvHideLockedLayers=false; setting overrides are unsupported.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getOutfit', 'RRInterface::getOutfitLayerAsType'],
          'Reads worn wearable IDs, including unshared items and multiple items per layer. Unknown selectors return the full 17-bit bitmap. No force wear, removal, rendering, baking or automatic bodypart replacement is modeled.'),
          commandForms: replyForms('getoutfit'), support: 'enforced',
          coveredForms: ['Full and named-layer occupancy, empty layers, bodyparts, universal and invalid selectors', 'Per-avatar explicit wearable type and worn item IDs, with immediate fixture updates'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::onGetOutfit', 'RlvSettings::getHideLockedLayers'],
          'Reads the same explicit wearable state with RlvHideLockedLayers=false. Invalid selectors return empty with failed-option. Lock-filter overrides, force wear and removal, rendering, baking and automatic bodypart replacement are unsupported.'),
          commandForms: replyForms('getoutfit'), support: 'enforced',
          coveredForms: ['Full and named-layer occupancy in reference order, including bodyparts and universal', 'Default locked-layer visibility and invalid-selector empty replies with failed-option'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-outfit.test.ts'],
    },
    {
      id: 'getinvworn', forms: ['@getinvworn[:<path>]=<channel>'], comparison: 'confirmed difference',
      wikiComparison: 'Two digits describe direct and descendant wearable occupancy: 0 empty, 1 none worn, 2 some worn, 3 all worn. Clothing, bodyparts and mapped live attachments count together. Kokua preserves inventory order and ignores direct shared-root items; single no-mod named-point object folders use its 10/30 sentinel mapping. RLVa orders child folders by UUID, counts direct root items, and folds effective folders into their parents. Commas and slash-bearing child names remain unescaped. Inventory links and gestures are outside the fixture.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getInventoryList', 'RRInterface::getWornItems', 'RRInterface::findAttachmentPointFromName'],
          'Uses existing shared-path lookup and inventory child order. Hidden normal subtrees do not contribute, but no-mod named-point object children contribute directly to non-root parents and retain Kokua descendant scoring. Direct no-mod queries return 10 or 30. Missing paths and absent roots reply empty. Object type and modify permission are explicit; mapped objects also retain their existing identity.'),
          commandForms: replyForms('getinvworn'), support: 'enforced',
          coveredForms: ['Direct and recursive empty/none/some/all worn codes with mixed clothing and live attachments', 'Shared-root policy, hidden folders, no-mod sentinel aggregation, stable identities and wire names'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::onGetInvWorn', 'RlvWearableItemCollector', 'RlvForceWear::isWearingItem'],
          'Uses explicit effective folded flags and RLVaEnableSharedWear=true. A folded child with exactly one object contributes direct items to its parent, excluding clothing or bodyparts with nostrip in the item or folded ancestry through the first non-folded parent; other folded children and hidden normal subtrees do not contribute. Visible normal descendants contribute recursively. A directly selected folded folder becomes the collection root: its direct wearable items count normally, and its visible child folders retain their own scores. Missing paths reply empty with failed-option; absent roots reply empty. Automatic naming inference, setting overrides, gestures and inventory links are unsupported.'),
          commandForms: replyForms('getinvworn'), support: 'enforced',
          coveredForms: ['Direct and recursive worn codes, UUID child order, mixed live attachments and wearables', 'Explicit effective folding under the containing folder and direct folded-folder root queries'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-outfit.test.ts'],
    },
    {
      id: 'findfolder', forms: ['@findfolder:<criteria>=<channel>', '@findfolders:<criteria>[;<separator>]=<channel>'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both search case-insensitive folder names with all nonempty && terms and preserve inventory traversal order without escaping commas. Kokua visits children before their parent, skips hidden and tilde-prefixed subtrees, and findfolder returns the first match. RLVa visits parents first, traverses hidden and tilde-prefixed folders without matching them, excludes slash names, and findfolder chooses the deepest match with first ties. Only Kokua accepts a custom findfolders separator.',
      profiles: {
        rlv: { ...kokua(['RRInterface::findCategoryUnderRlvShare', 'RRInterface::findCategoriesUnderRlvShare', 'RRInterface::reallyHandleCommand'],
          'Depth-first postorder matches may include the shared root as an empty path. findfolder with empty criteria returns the first eligible folder. findfolders with no option returns empty; otherwise the first two nonempty semicolon fields select criteria and separator. Hidden and dropped subtrees are skipped.'),
          commandForms: replyForms('findfolder', 'findfolders'), support: 'enforced',
          coveredForms: ['Single and multiple shared-folder searches, nested and duplicate names, empty results', 'All nonempty && terms, postorder traversal, first match and custom separators'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::onFindFolder', 'RlvInventory::findSharedFolders', 'RlvCriteriaCategoryCollector'],
          'Preorder search excludes the shared root from matches. findfolder returns the first match at the greatest slash depth. findfolders uses commas. Hidden, tilde-prefixed and slash-bearing names cannot match, but their children remain searchable. Empty options reply empty with failed-option; && alone matches nothing.'),
          commandForms: replyForms('findfolder', 'findfolders'), support: 'enforced',
          coveredForms: ['Single and multiple shared-folder searches, deepest selection and traversal order', 'All nonempty && terms, hidden and dropped descendants, empty replies and invalid empty options'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-findfolder.test.ts'],
    },
    {
      id: 'getpath', forms: ['@getpath[:<attachment-point-or-object-uuid>]=<channel>', '@getpathnew[:<attachment-point-or-object-uuid>]=<channel>'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both query the containing shared path of a worn attachment by issuer, point or object UUID. Inventory UUIDs never select an attachment. getpath selects the first point result and getpathnew lists all, preserving live attachment order. Unshared items expose no path. Kokua retains empty positions for point attachments without shared items; RLVa omits them. Outfit-layer selectors remain unsupported until an outfit fixture exists.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getFullPath', 'RRInterface::getItem', 'RRInterface::getItemAux'],
          'Uses explicit item-to-root mappings and current avatar attachment state. Point getpath stops at the first attachment, including an empty unshared slot; getpathnew retains those slots. Item identity is independent of repeated names. Fixtures describe modifiable attachments; no-mod folder-name inference and inventory links are outside the covered forms.'),
          commandForms: replyForms('getpath', 'getpathnew'), support: 'enforced',
          coveredForms: ['Modifiable attachment issuer, point and object UUID queries with shared-root containment', 'Live attachment order and lifecycle, duplicate item names and empty results'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::onGetPath', 'RlvCommandOptionGetPath', 'RlvInventory::getPath'],
          'Uses the same explicit mapping and live attachment order. Only shared inventory items contribute paths. An effectively folded containing folder contributes its parent path. Invalid selectors return empty with failed-option. Outfit layers and inventory links remain outside the fixture.'),
          commandForms: replyForms('getpath', 'getpathnew'), support: 'enforced',
          coveredForms: ['Attachment issuer, named point and owned object UUID queries with shared-root containment', 'Live attachment order and lifecycle, duplicate names, effective folded folders and empty results'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-findfolder.test.ts'],
    },
    {
      id: 'forcewear', forms: ['@attach:<folder>=force', '@attachover:<folder>=force', '@attachoverorreplace:<folder>=force'],
      comparison: 'confirmed difference',
      wikiComparison: 'Shared direct attachment items use add or replace semantics. Both profiles honor the default + folder prefix. Kokua always adds unnamed items; RLVa shared wear replaces at their saved point and can be disabled. Clothing, recursive commands and multiple-folder options are unsupported.',
      profiles: {
        rlv: { ...kokua(['RRInterface::forceAttach', 'RRInterface::findAttachmentPointFromName', 'RRInterface::findAttachmentPointFromParentName'],
          'Named items replace for attach and attachoverorreplace; attachover and + prefixed folders add. The rightmost recognized parenthesised point wins without trimming. Unnamed direct items always add at their saved point, default Right Hand. Single no-mod object children in point-named folders use the child folder point. Replace respects every occupant detach lock. Already-worn items retain identity. Fixture order determines sequential replacement; definitions and script state survive wear and detach.'),
          support: 'enforced', commandForms: ['attach', 'attachover', 'attachoverorreplace'].map(behaviour => ({ behaviour, type: 'force', support: 'enforced', option: 'any' })),
          coveredForms: ['Direct shared attachment definitions and existing mapped live attachments', 'Add/replace, named and saved points, + folders and single no-mod folded children', 'No-option detach locks, queued attachment lifecycle and per-item action outcomes; clothing, point/folder locks and recursive/multiple-folder forms excluded'] },
        rlva: { ...firestorm('rlvhelper.cpp', ['RlvForceWear::forceFolder', 'RlvForceWear::addAttachment', 'RlvForceWear::updatePendingAttachments', 'RlvWearableItemCollector', 'RlvAttachPtLookup::getAttachPointIndex'],
          'Attach and attachoverorreplace replace; attachover and + prefixed folders add. Named replace retains the last pending item per point; final pending requests follow inventory item UUID order. The last parenthesised item text is trimmed; legacy folder names provide fallback and take precedence for no-mod items. Explicit folded children with one object contribute attachments. Shared wear defaults on and accepts unnamed items at their saved point, default Right Hand; inventory.sharedWear=false skips them. Named replacement is blocked by any occupant detach lock. Unnamed replacement retains locked occupants and removes unlocked ones. Already-worn items retain identity.'),
          support: 'enforced', commandForms: ['attach', 'attachover', 'attachoverorreplace'].map(behaviour => ({ behaviour, type: 'force', support: 'enforced', option: 'any' })),
          coveredForms: ['Direct shared attachment definitions and existing mapped live attachments', 'Add/replace, named and saved points, default shared-wear setting and its disabled value, + folders and single-object folded children', 'No-option detach locks, queued attachment lifecycle and per-item action outcomes; clothing, point/folder locks and recursive/multiple-folder forms excluded'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-forcewear.test.ts'],
    },
    {
      id: 'forceremove', forms: ['@detach:<shared-path>=force', '@remoutfit[:<layer>]=force', '@addoutfit[:<layer>]=n|y', '@remoutfit[:<layer>]=n|y'],
      comparison: 'confirmed difference',
      wikiComparison: 'Shared: direct folder attachments and selected clothing layers are removable; skin, eyes, hair and shape remain worn. Both profiles respect every layer and attachment lock, including the force issuer. Confirmed difference: Kokua layer removal checks ancestor folder names for nostrip, case insensitively, but ignores item-name nostrip; RLVa checks the item and parent name case sensitively and ascends through folded parents. Wiki also describes folder clothing removal and recursive forms; those forms remain unsupported here.',
      profiles: {
        rlv: { ...kokua(['RRInterface::force', 'RRInterface::forceDetachByName', 'RRInterface::removeItemFromAvatar', 'RRInterface::canUnwear', 'RRInterface::canDetachCategoryAux'],
          'Direct folder attachments plus single no-mod objects in point-named children can be removed. Ordinary descendants survive. Layer and bare removal affect clothing only, across shared and unshared inventory. Force commands do not bypass issuer locks. Folder removal honors item and ancestor nostrip names case insensitively; layer removal honors ancestor folders only. Invalid layer/path options are inert. Explicit clothing add/remove fixture actions honor global and named layer locks. Folder clothing, remoutfit folder forms, point/UUID removal, folder locks, recursive forms and inventory links are unsupported.'),
          support: 'enforced', commandForms: [
            { behaviour: 'detach', type: 'force', support: 'enforced', option: 'any' },
            { behaviour: 'remoutfit', type: 'force', support: 'enforced', option: 'any' },
            { behaviour: 'addoutfit', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'remoutfit', type: 'add', support: 'enforced', option: 'any' },
          ], coveredForms: ['Direct folder attachment removal with per-item results and subsequent query updates', 'Selected and all clothing layer removal; nonremovable bodyparts', 'Global and named add/remove layer locks, multiple issuers and no force-issuer exemption', 'Case-insensitive folder protection and layer item-name exemption'] },
        rlva: { ...firestorm('rlvhelper.cpp', ['RlvForceWear::forceFolder', 'RlvForceWear::forceRemove', 'RlvForceWear::isForceDetachable', 'RlvForceWear::isForceRemovable', 'RlvForceWear::isStrippable'],
          'Direct folder attachments plus object items in effective folded children can be removed; ordinary descendants survive. Folder item results follow inventory UUID order. Layer and bare removal affect clothing only, across shared and unshared inventory. Every issuer lock remains effective; a registered valid bridge stays attached. Item and parent nostrip names are case sensitive, ascending through folded parents. Invalid layer/path options fail. Explicit clothing add/remove fixture actions honor global and named layer locks. Folder clothing, remoutfit folder forms, point/group/UUID removal, folder locks, recursive forms and inventory links are unsupported.'),
          support: 'enforced', commandForms: [
            { behaviour: 'detach', type: 'force', support: 'enforced', option: 'any' },
            { behaviour: 'remoutfit', type: 'force', support: 'enforced', option: 'any' },
            { behaviour: 'addoutfit', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'remoutfit', type: 'add', support: 'enforced', option: 'any' },
          ], coveredForms: ['Direct and folded folder attachment removal with deterministic per-item results', 'Selected and all clothing layer removal; nonremovable bodyparts', 'Global and named add/remove layer locks, multiple issuers and no force-issuer exemption', 'Case-sensitive item and parent-folder protection; explicit unsupported mixed contents'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-forceremove.test.ts'],
    },
    {
      id: 'getattach', forms: ['@getattach[:<point>]=<channel>'],
      comparison: 'version/setting dependent',
      wikiComparison: 'Both profiles return a reserved leading zero followed by occupancy for points 1 through 55, or one bit for a named point. Duplicate objects occupy one bit. Root aliases Avatar Center. Invalid names return empty text; RLVa also records a failed-option outcome. The fixture uses the RLVa reference hide-locked default false; lock-filter setting overrides are unsupported.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getAttachments', 'RRInterface::reallyHandleCommand'],
          'Reads existing live linkset attachments for the queried avatar, including HUDs and any bridge fixture. Names match the canonical point table without trimming; root aliases Avatar Center. Uses the shared reply-channel policy.'),
          commandForms: replyForms('getattach'),
          support: 'enforced', coveredForms: ['Full 56-character bitmap in attachment-ID order', 'Named and empty-point queries, root alias, invalid-name empty replies', 'Actual attachment, detachment and duplicate point occupancy, including HUDs'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::onGetAttach', 'RlvAttachPtLookup::initLookupTable', 'RlvSettings::getHideLockedAttach'],
          'Reads the same occupancy with RlvHideLockedAttachments=false. An explicitly identified valid bridge at Center 2 is excluded; absent bridges never create occupancy. Lock-filter overrides and lock enforcement are outside the covered forms.'),
          commandForms: replyForms('getattach'),
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
          commandForms: replyForms('getattachnames'),
          support: 'enforced', coveredForms: ['All occupied attachment point names, once per point', 'head/torso/arms/legs/hud group filters and unknown-option all-points fallback', 'Valid empty replies and explicit valid bridge exclusion'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-getattach.test.ts'],
    },
    {
      id: 'detach', forms: ['@detach=n|add', '@detach=y|rem', '@detachme[:<option>]=force'],
      comparison: 'confirmed difference',
      wikiComparison: 'Wiki describes attachment-local locks and ordered clear/self-detach, without specifying child emitter or malformed-option handling. No-option locks protect the containing attachment and remain scoped to the issuing prim. Self-detach respects every root and child lock, including its own. Kokua resolves a child emitter to its attachment and ignores detachme options. RLVa child self-detach is inert and nonempty options fail. Simulator detach is separate from a viewer detach attempt; forced reattachment recovery is excluded.',
      profiles: {
        rlv: { ...kokua(['RRInterface::force', 'RRInterface::forceDetachByUuid', 'RRInterface::canDetachWithExplanation', 'RRInterface::detachObject'],
          'Root and child no-option detach locks deny viewer attempts on their attachment until the last relevant issuer removes its lock. detachme resolves the containing attachment, ignores options and respects all of its locks. Unlocked self-detach queues simulator completion and attach(NULL_KEY), surviving issuer script removal. Named locks, bare detach=force and forced reattachment recovery are unsupported. Direct shared-folder removal has a separate contract.'),
          support: 'enforced', commandForms: [
            { behaviour: 'detach', type: 'add', support: 'enforced', option: 'none' },
            { behaviour: 'detachme', type: 'force', support: 'enforced', option: 'any' },
          ], coveredForms: ['No-option detach n/add and y/rem with per-prim locks', 'Explicit viewer detach attempt and queued force self-detach from root or child', 'Ignored detachme options, lock denial, attach events and llGetAttached state', 'Simulator detach remains independent of viewer locks'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvBehaviourHandler<RLV_BHVR_DETACH>::onCommand', 'RlvForceHandler<RLV_BHVR_DETACHME>::onCommand', 'LLVOAvatarSelf::detachAttachmentIntoInventory', 'RlvAttachmentLocks::canDetach'],
          'Root and child no-option detach locks deny viewer attempts on the containing attachment. Root detachme respects all its locks; unlocked root self-detach queues simulator completion and attach(NULL_KEY), surviving issuer script removal. Child detachme is a successful no-op, even unlocked; nonempty options fail. Named locks, bare detach=force, bridge exemption settings and forced reattachment recovery are unsupported. Direct shared-folder removal has a separate contract.'),
          support: 'enforced', commandForms: [
            { behaviour: 'detach', type: 'add', support: 'enforced', option: 'none' },
            { behaviour: 'detachme', type: 'force', support: 'enforced', option: 'none' },
          ], coveredForms: ['No-option detach n/add and y/rem with root and child issuer locks', 'Explicit viewer detach attempt and queued root force self-detach', 'Child self-detach no-op, rejected nonempty options, attach events and llGetAttached state', 'Simulator detach remains independent of viewer locks'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-detach.test.ts', 'packages/vitest/test/rlv-relay.test.ts'],
    },
    {
      id: 'seating', forms: ['@getsitid[:<option>]=<channel>', '@sit[:<uuid>]=force', '@unsit=force', '@sit=n|y', '@unsit=n|y', '@sittp[:<distance>]=n|y'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both profiles enforce user sit/stand locks without issuer exceptions and combine sittp distances by minimum with a strict 1.5 m default boundary. Kokua compares signed distance; RLVa compares its square. Both profiles return null standing and the object root when seated. RLVa ground sitting reports the avatar UUID. Empty/null sit requests ground sitting in RLVa and does nothing in Kokua. Object force sit respects sit and seated unsit locks; RLVa force unsit and ground sit exempt the issuing prim.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getSitTargetId', 'RRInterface::force', 'force_sit', 'RRInterface::getMin', 'handle_object_sit_or_stand'],
          'Explicit user actions enforce sit, seated unsit and the minimum signed sittp limit at the clicked global point. Finite decimal prefixes use float precision; invalid decimal text means zero. Non-finite, hexadecimal and overflow distance forms remain unsupported. Simulator seating and llUnSit bypass viewer locks. getsitid ignores options and uses normal reply channels. Force sit bypasses sittp and uses free configured targets or nearby plain prims in the same region. Empty/null sit has no target and leaves state unchanged. Force unsit respects every unsit lock, including its emitter. No script permissions are granted. Plain-prim surface placement beyond an 8 m centre-distance fixture radius, collision, autopilot, cross-region seating and standtp are unsupported.'),
          support: 'enforced', commandForms: [...replyForms('getsitid'),
            { behaviour: 'sit', type: 'add', support: 'enforced', option: 'none' },
            { behaviour: 'unsit', type: 'add', support: 'enforced', option: 'none' },
            { behaviour: 'sittp', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'sit', type: 'force', support: 'enforced', option: 'any' },
            { behaviour: 'unsit', type: 'force', support: 'enforced', option: 'none' }],
          coveredForms: ['Explicit user sit/stand, independent issuers and strict default/custom sittp boundaries', 'Simulator and force action separation', 'Standing, object-root and ground getsitid replies', 'UUID force sit with world occupancy, region, attachment and lifetime checks', 'Empty/null sit without movement', 'Force unsit with global lock checks', 'Action outcomes and normal changed events without script permission grants'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::processReplyCommand', 'RlvForceHandler<RLV_BHVR_SIT>::onCommand', 'RlvForceHandler<RLV_BHVR_SITGROUND>::onCommand', 'RlvHandler::processForceCommand', 'RlvActions::canSit', 'RlvActions::canGroundSit'],
          'Explicit user actions enforce sit, seated unsit and the minimum sittp limit squared at the clicked global point. Finite decimal prefixes use float precision; malformed text and float underflow are unsupported. Non-finite, hexadecimal and overflow distance forms remain unsupported. Simulator seating and llUnSit bypass viewer locks. Force sit bypasses sittp. getsitid ignores options and uses normal reply channels; ground sitting returns the avatar UUID. Empty/null sit requests ground sitting. Force unsit and ground sit exempt only the issuing prim from locks; object force sit exempts no emitter. Same-region free configured targets and plain prims within an 8 m centre-distance fixture radius update world seating. Farther plain-prim surface placement, collision, autopilot, cross-region seating and standtp are unsupported. No script permissions are granted.'),
          support: 'enforced', commandForms: [...replyForms('getsitid'),
            { behaviour: 'sit', type: 'add', support: 'enforced', option: 'none' },
            { behaviour: 'unsit', type: 'add', support: 'enforced', option: 'none' },
            { behaviour: 'sittp', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'sit', type: 'force', support: 'enforced', option: 'any' },
            { behaviour: 'unsit', type: 'force', support: 'enforced', option: 'none' }],
          coveredForms: ['Explicit user sit/stand, independent issuers and strict default/custom sittp boundaries', 'Simulator and force action separation', 'Standing, object-root and avatar-UUID ground getsitid replies', 'UUID and empty/null ground force sit with action outcomes', 'World occupancy, region, attachment and lifetime checks', 'Force unsit and ground-sit issuer exceptions', 'Normal changed events without script permission grants'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-sit.test.ts', 'packages/vitest/test/rlv-sit-enforce.test.ts'],
    },
    {
      id: 'teleport', forms: ['@tpto:<x>/<y>/<z>[;<angle>]=force', '@tpto:<region>/<x>/<y>/<z>[;<angle>]=force', '@tploc=n|y', '@tplocal[:<distance>]=n|y'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both profiles resolve global and named-region locations. Kokua truncates coordinates and ignores the supplied facing angle. RLVa preserves fractions and applies the angle in radians. RLVa classifies local moves by XY distance below 256 m and checks XYZ distance against strict sittp and tplocal limits; its bare tplocal limit is 1.5 m and the maximum is 256 m. Kokua applies tploc to all moves and an inclusive tplocal distance in the same region.',
      profiles: {
        rlv: { ...kokua(['RRInterface::force', 'RRInterface::forceTeleport', 'RRInterface::forceTeleportCallback', 'RRInterface::getMin'],
          'Slash fields discard empties and pad to three; integer prefixes truncate fractions and invalid fields mean zero. Three fields are global, four name a region. Angles do not set facing. Bare issuer tploc, tplocal, unsit and sittp locks lift temporarily for global moves and are restored before named-region callbacks. Named angles preserve orientation and refuse any sittp lock. All location moves obey remaining tploc and seated unsit; same-region moves obey the inclusive signed minimum tplocal distance. Finite decimal forms are supported; non-finite, hexadecimal and overflowing conversions are unsupported. Unknown regions and uncovered coordinates refuse without changing avatar state. Teleport action records and normal stand events do not grant simulator permissions. Landing-point routing, terrain/collision offsets and camera pose are outside the fixture.'),
          support: 'enforced', commandForms: [
            { behaviour: 'tpto', type: 'force', support: 'enforced', option: 'any' },
            { behaviour: 'tploc', type: 'add', support: 'enforced', option: 'none' },
            { behaviour: 'tplocal', type: 'add', support: 'enforced', option: 'any' }],
          coveredForms: ['Global and named-region coordinates, integer-prefix and partial-field parsing', 'Issuer restoration, seated locks and profile-specific local distance checks', 'Known-region boundaries, unknown-region refusal, action results and simulator permission separation'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvForceHandler<RLV_BHVR_TPTO>::onCommand', 'RlvHandler::onTeleportCallback', 'RlvActions::isLocalTp', 'RlvActions::canTeleportToLocal', 'RlvActions::canTeleportToLocation'],
          'Global floating vectors are tried before four-field named-region vectors. Final coordinate suffixes and angle prefixes are accepted; malformed and empty angles fail. Extra semicolon fields are ignored. Angles in radians request a horizontal facing direction. Only the force issuer is exempt from lock presence checks; distance modifiers use the global minimum. Moves within 256 m in XY obey strict XYZ sittp and tplocal limits, including vertical moves and nearby region crossings. Bare tplocal defaults to 1.5 m and its maximum is 256 m. Longer moves obey tploc. All seated moves obey foreign unsit. tplm and UUID tploc options do not block or grant exceptions for location travel. Finite decimal forms are supported; non-finite, hexadecimal and overflow conversions are unsupported. Explicit World regions resolve case-insensitively with half-open boundaries; unknown destinations refuse without mutation. Actions stand normally without granting simulator permissions. Landing-point routing, terrain/collision offsets and camera pose are outside the fixture.'),
          support: 'enforced', commandForms: [
            { behaviour: 'tpto', type: 'force', support: 'enforced', option: 'any' },
            { behaviour: 'tploc', type: 'add', support: 'enforced', option: 'none' },
            { behaviour: 'tplocal', type: 'add', support: 'enforced', option: 'any' }],
          coveredForms: ['Floating global and named-region destinations, prefix/suffix parsing and radian facing', 'XYZ local limits, maximum distance, issuer exemptions and distant tploc locks', 'Known-region boundaries, unknown-region refusal, seated actions and permission separation'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-tpto.test.ts'],
    },
    {
      id: 'camera-fov', forms: ['@setcam_fov[:<radians>]=force', '@setcam_fovmin:<radians>=n|y', '@setcam_fovmax:<radians>=n|y', '@getcam_fov=<channel>', '@getcam_fovmin=<channel>', '@getcam_fovmax=<channel>'],
      comparison: 'confirmed difference',
      wikiComparison: 'Both profiles use radians and strongest issuer bounds. Precision, unset replies, malformed options, contradictory limits and final-limit removal differ. The fixture uses a 1.4242 viewport aspect ratio; rendered effects and exclusive camera control are unsupported.',
      profiles: {
        rlv: { ...kokua(['RRInterface::force', 'RRInterface::updateCameraLimits', 'RRInterface::getMin', 'RRInterface::getMax', 'LLViewerCamera::setDefaultFOV'],
          'Six-decimal queries round exact halves to even and use float zoom reciprocals; unset minimum/maximum are 0.000001/-0.000001. Empty limits mean 1.5, invalid numeric prefixes mean zero, and zero limits have no effect. Contradictory bounds collapse to the minimum FOV. Removal leaves the current lens unchanged. Force without an angle means zero, clamped to the viewport minimum. Queries ignore options. Camera tracking permission is still required for script FOV reads.'),
          support: 'enforced', coveredForms: ['Per-avatar force/query and user lens attempts', 'Aggregated per-prim limits, removal, clear and emitter collection', 'Numeric prefixes, empty and non-finite values, fixed viewport range', 'Permission-gated llGetCameraFOV'],
          commandForms: [
            { behaviour: 'setcam_fovmin', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'setcam_fovmax', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'setcam_fov', type: 'force', support: 'enforced', option: 'any' },
            ...replyForms('getcam_fov', 'getcam_fovmin', 'getcam_fovmax'),
          ] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvForceHandler<RLV_BHVR_SETCAM_FOV>::onCommand', 'RlvBehaviourSetCamFovHandler::onCommand', 'RlvReplyCamMinMaxModifierHandler::onCommand', 'RlvActions::getCameraFOVLimits'],
          'Three-decimal queries round exact halves to even, preserve negative zero, use fixed notation for large finite bounds and distinguish unset limits with empty replies. Numeric prefixes and explicit nan/inf are accepted; invalid, empty and float overflow/underflow limits are rejected. NaN modifier removal leaves a query-visible NaN even after its wire rule is removed. Force without an angle resets to pi/3. Bounds clamp before the viewport range; contradictory limits choose the minimum for an input below it, otherwise the maximum. Final-limit removal restores the saved lens. The first limit saves the current lens only when CameraAngle persistence is enabled, otherwise pi/3; user lens changes preserve the existing persistence mode. Query options deliver empty replies. Script FOV reads still require tracking permission.'),
          support: 'enforced', coveredForms: ['Per-avatar force/query and user lens attempts', 'Strongest per-prim limits, removal, clear, collection and saved-lens restoration', 'Three-decimal and empty replies, numeric prefixes and non-finite values', 'Permission-gated llGetCameraFOV'],
          commandForms: [
            { behaviour: 'setcam_fovmin', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'setcam_fovmax', type: 'add', support: 'enforced', option: 'any' },
            { behaviour: 'setcam_fov', type: 'force', support: 'enforced', option: 'any' },
            ...replyForms('getcam_fov', 'getcam_fovmin', 'getcam_fovmax'),
          ] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-camera.test.ts'],
    },
    {
      id: 'camera-distance',
      forms: ['@setcam_avdistmin:<metres>=n|y', '@setcam_avdistmax:<metres>=n|y', '@camdistmin:<metres>=n|y', '@camdistmax:<metres>=n|y', '@camzoommin[:<multiplier>]=n|y', '@camzoommax[:<multiplier>]=n|y', '@getcam_avdistmin=<channel>', '@getcam_avdistmax=<channel>'],
      comparison: 'confirmed difference',
      wikiComparison: 'Avatar distance bounds constrain camera poses around an explicit joint reference. Deprecated zoom commands constrain the lens rather than camera distance. Their FOV directions differ between profiles. Current-distance and zoom queries have profile-specific availability.',
      profiles: {
        rlv: { ...kokua(['RRInterface::updateCameraLimits', 'RRInterface::reallyHandleCommand', 'LLAgentCamera::calcCameraPositionTargetGlobal'],
          'Distance aliases aggregate together. Empty bounds mean 1.5, invalid numeric text means zero, and contradictory minimum collapses to maximum. The default distance range is -1000000 to 750000 metres, including the default drawing-distance cap. Six-decimal bound queries ignore options. camzoommin bounds minimum magnification and camzoommax bounds maximum magnification, with empty multiplier 1.5 and zero removing that zoom bound. getcam_zoommin, getcam_zoommax and getcam_zoom are supported; getcam_avdist is unsupported. Mouselook bypasses distance clamping. Coincident camera and reference positions with a positive minimum produce non-finite coordinates. Joint positions are explicit fixtures, defaulting to avatar position.'),
          support: 'enforced', coveredForms: ['Avatar distance aliases and pose reads', 'Zoom multiplier bounds and queries', 'Removal, clear, collection, multiple issuers and numeric conversion'],
          commandForms: [
            ...['setcam_avdistmin', 'setcam_avdistmax', 'camdistmin', 'camdistmax', 'camzoommin', 'camzoommax'].map(behaviour => ({ behaviour, type: 'add' as const, support: 'enforced' as const, option: 'any' as const })),
            ...replyForms('getcam_avdistmin', 'getcam_avdistmax'),
          ] },
        rlva: { ...firestorm('rlvhelper.cpp', ['RlvBehaviourDictionary::RlvBehaviourDictionary', 'RlvReplyCamMinMaxModifierHandler::onCommand', 'RlvReplyHandler<RLV_BHVR_GETCAM_AVDIST>::onCommand', 'RlvBehaviourCamZoomMinMaxHandler::onCommand', 'RlvActions::getCameraAvatarDistanceLimits', 'LLAgentCamera::clampCameraPosition'],
          'Distance aliases aggregate strongest minimum/maximum modifiers. Empty or invalid bounds are rejected; numeric prefixes and explicit non-finite values follow float parsing. Three-decimal queries distinguish unset bounds with empty replies and reject options with an empty reply. Contradictory modifiers remain independently queryable; position clamping checks maximum before minimum. getcam_avdist reports camera distance from avatar position, separately from the joint reference. camzoommin maps to minimum FOV and camzoommax to maximum FOV using pi/3 divided by the multiplier, default multiplier 1. Removing a final zoom alias keeps the current lens instead of restoring the saved FOV. Zoom queries are unsupported. Mouselook bypasses distance clamping. Coincident camera and reference positions with a positive minimum produce non-finite coordinates. Joint positions are explicit fixtures, defaulting to avatar position.'),
          support: 'enforced', coveredForms: ['Avatar distance aliases, current-distance query and pose reads', 'Deprecated zoom aliases sharing FOV modifiers', 'Removal, clear, collection, multiple issuers and numeric conversion'],
          commandForms: [
            ...['setcam_avdistmin', 'setcam_avdistmax', 'camdistmin', 'camdistmax', 'camzoommin', 'camzoommax'].map(behaviour => ({ behaviour, type: 'add' as const, support: 'enforced' as const, option: 'any' as const })),
            ...replyForms('getcam_avdistmin', 'getcam_avdistmax'),
          ] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-camera-distance.test.ts'],
    },
    {
      id: 'camera-distance-query', forms: ['@getcam_avdist=<channel>'],
      comparison: 'confirmed difference', wikiComparison: 'RLVa reports camera distance from avatar position. Kokua has no current-distance query handler.',
      profiles: {
        rlv: kokua(['RRInterface::reallyHandleCommand'], 'No getcam_avdist query handler. Numeric parameters remain unsupported.'),
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvReplyHandler<RLV_BHVR_GETCAM_AVDIST>::onCommand'],
          'Three-decimal current distance from the seated camera eye when applicable, otherwise the fixture position, relative to avatar position, independently of the explicit joint reference used for clamping. Nonempty options return an empty reply with failed-option. Viewer queries need no simulator camera permission.'),
          support: 'enforced', coveredForms: ['Current camera distance and invalid query options'], commandForms: replyForms('getcam_avdist') },
      },
      tests: [...tests, 'packages/vitest/test/rlv-camera-distance.test.ts'],
    },
    {
      id: 'camera-zoom-query', forms: ['@getcam_zoom=<channel>', '@getcam_zoommin=<channel>', '@getcam_zoommax=<channel>'],
      comparison: 'confirmed difference', wikiComparison: 'Kokua exposes current and bounded zoom multipliers; RLVa has no zoom query handlers.',
      profiles: {
        rlv: { ...kokua(['RRInterface::reallyHandleCommand', 'RRInterface::updateCameraLimits'],
          'Six-decimal current magnification pi/3 divided by FOV, and aggregated minimum/maximum magnification. Unset bounds are -1000000 and 1000000. Options are ignored. Lens limits and zoom aliases both affect the effective magnification bounds.'),
          support: 'enforced', coveredForms: ['Current, minimum and maximum magnification queries'], commandForms: replyForms('getcam_zoom', 'getcam_zoommin', 'getcam_zoommax') },
        rlva: firestorm('rlvhelper.cpp', ['RlvBehaviourDictionary::RlvBehaviourDictionary'], 'No getcam_zoom, getcam_zoommin or getcam_zoommax handlers. Numeric parameters remain unsupported.'),
      },
      tests: [...tests, 'packages/vitest/test/rlv-camera-distance.test.ts'],
    },
    {
      id: 'camera-origin', forms: ['@setcam_origindistmin:<metres>=n|y', '@setcam_origindistmax:<metres>=n|y'],
      comparison: 'confirmed difference', wikiComparison: 'RLVa origin distance limits use the default camera origin. A locked avatar distance takes precedence; otherwise active origin limits take precedence over avatar distance bounds. Neither profile has origin-distance queries.',
      profiles: {
        rlv: kokua(['RRInterface::updateCameraLimits', 'RRInterface::reallyHandleCommand'], 'No origin-distance limit or query handlers. Wire restrictions may be retained but remain unsupported.'),
        rlva: { ...firestorm('rlvactions.cpp', ['RlvActions::getCameraOriginDistanceLimits', 'LLAgentCamera::calcCameraPositionTargetGlobal', 'LLAgentCamera::clampCameraPosition'],
          'Strongest minimum and maximum constrain position around an explicit region-space camera origin. Without an explicit origin the fixture pose is the origin. Equal avatar distance bounds override origin limits; otherwise origin limits override avatar bounds. Empty options fail. Origin query names have no handlers. Skeleton offsets, smoothing and collisions are outside the fixture.'),
          support: 'enforced', coveredForms: ['Origin-distance pose clamping and avatar-lock precedence', 'Explicit camera-origin fixture state'],
          commandForms: ['setcam_origindistmin', 'setcam_origindistmax'].map(behaviour => ({ behaviour, type: 'add', support: 'enforced', option: 'any' })) },
      },
      tests: [...tests, 'packages/vitest/test/rlv-camera-distance.test.ts'],
    },
    {
      id: 'camera-silhouette', forms: ['@setcam_avdist:<metres>=n|y'],
      comparison: 'confirmed difference', wikiComparison: 'RLVa setcam_avdist selects an avatar silhouette threshold, independently of the camera position limits. The fixture exposes the aggregated threshold as viewer state; rendering is outside the fixture.',
      profiles: {
        rlv: kokua(['RRInterface::updateCameraLimits'], 'No setcam_avdist handler. The wire restriction remains inspectably unsupported.'),
        rlva: { ...firestorm('rlvhelper.cpp', ['RlvBehaviourDictionary::RlvBehaviourDictionary', 'LLVOAvatar::isRlvSilhouette'],
          'Strongest numeric threshold is exposed as silhouetteDistance. It does not move the camera. Empty and invalid options fail. No rendering or silhouette query is implemented.'),
          support: 'state-only', coveredForms: ['Aggregated silhouetteDistance viewer state, removal and clear'],
          commandForms: [{ behaviour: 'setcam_avdist', type: 'add', support: 'state-only', option: 'any' }] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-camera-distance.test.ts'],
    },
    {
      id: 'viewer-ui', forms: ['@showinv|showloc|showminimap|showworldmap|shownearby=n|y', '@shownames[_sec][:<uuid>]=n|y', '@shownametags[_sec][:<uuid>|<distance>]=n|y', '@showhovertext:<uuid>=n|y', '@showhovertextall|showhovertexthud|showhovertextworld=n|y', '@showself|showselfhead|viewtransparent|viewwireframe=n|y', '@viewnote|viewscript|viewtexture=n|y'],
      comparison: 'confirmed difference',
      wikiComparison: 'The immutable viewer-state query exposes restriction policy with issuer and option details. RLVa supports self visibility, transparent/wireframe controls, strict name exceptions and nametag distance modifiers. Kokua has no effects for those four controls or distance modifiers; its name censor shares name/nametag exceptions and its nametag visibility has no exceptions. Window contents, rendered pixels and user preference overrides are outside this query.',
      profiles: {
        rlv: { ...kokua(['RRInterface::refreshCachedVariable', 'RRInterface::censor', 'RRInterface::add', 'RRInterface::remove'],
          'Inventory, location, maps, names, nearby list, hover text and note/script/texture restrictions are queryable. Name censoring includes optioned shownames rules and shares UUID exceptions from shownames, shownames_sec and shownametags. Nametag hiding uses only unoptioned shownametags; name restrictions also hide nametags with the default settings. Hover text uses exact prim UUID and independent HUD/world/all scopes. showself, showselfhead, viewtransparent, viewwireframe, nametag distance and strict nametag forms remain unsupported.'),
          support: 'enforced', coveredForms: ['Global UI restrictions, removal, clear and session cleanup', 'Name exceptions and exact-prim hover text scopes', 'Immutable per-avatar policy snapshots with issuer/option details'],
          commandForms: [
            ...['showinv', 'showloc', 'showminimap', 'showworldmap', 'shownearby', 'showhovertextall', 'showhovertexthud', 'showhovertextworld', 'viewnote', 'viewscript', 'viewtexture'].map(behaviour => ({ behaviour, type: 'add' as const, support: 'enforced' as const, option: 'none' as const })),
            ...['shownames', 'shownames_sec', 'shownametags', 'showhovertext'].map(behaviour => ({ behaviour, type: 'add' as const, support: 'enforced' as const, option: 'any' as const })),
            ...['showself', 'showselfhead', 'viewtransparent', 'viewwireframe', 'shownametags_sec'].map(behaviour => ({ behaviour, type: 'add' as const, support: 'unsupported' as const, option: 'any' as const })),
          ] },
        rlva: { ...firestorm('rlvhelper.cpp', ['RlvBehaviourDictionary::RlvBehaviourDictionary', 'RlvBehaviourHandler<RLV_BHVR_SHOWNAMETAGS>::onCommand', 'RlvActions::canShowName', 'RlvActions::canShowNameTag', 'RlvActions::canShowHoverText'],
          'All listed UI restrictions are queryable. Names and nametags exempt self and UUID exceptions; strict rules or permissive require exceptions from the corresponding issuers. Nametag modifiers choose the minimum distance (empty means zero), with a strict distance boundary. Object hover text is hidden by exact prim UUID or all/HUD/world scope. The query reports restriction policy rather than current window openness, pixel output or persistent user preferences.'),
          support: 'enforced', coveredForms: ['All listed show/view restrictions, removal, clear and session cleanup', 'UUID exceptions, strict issuer scope, self exemptions and nametag distance modifiers', 'Exact-prim hover text scopes and immutable snapshots'],
          commandForms: [
            ...['showinv', 'showloc', 'showminimap', 'showworldmap', 'shownearby', 'showhovertextall', 'showhovertexthud', 'showhovertextworld', 'viewnote', 'viewscript', 'viewtexture', 'showself', 'showselfhead', 'viewtransparent', 'viewwireframe'].map(behaviour => ({ behaviour, type: 'add' as const, support: 'enforced' as const, option: 'none' as const })),
            ...['shownames', 'shownames_sec', 'shownametags', 'shownametags_sec', 'showhovertext'].map(behaviour => ({ behaviour, type: 'add' as const, support: 'enforced' as const, option: 'any' as const })),
          ] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-viewstate.test.ts'],
    },
    {
      id: 'viewer-render', forms: ['@setcam_textures|camtextures[:<uuid>]=n|y', '@setoverlay|setoverlay_touch=n|y', '@setoverlay_alpha|texture|tint[:<value>]=force', '@setsphere=n|y', '@setsphere_mode|origin|color|distmin|distmax|distextend|param|tween|valuemin|valuemax[:<value>]=force'],
      comparison: 'confirmed difference',
      wikiComparison: 'Render configuration is exposed through the viewer-state query. Texture aliases share Firestorm state; Kokua retains both wire names. Firestorm overlays are issuer-local and selected by object hierarchy. Firestorm spheres are independent (at most six); Kokua combines spheres by mode and retains parameter restrictions, including force aliases. Tween parameters describe configured targets; pixel rendering and animation are outside this query.',
      profiles: {
        rlv: { ...kokua(['RRInterface::refreshCachedVariable', 'RRInterface::updateSetsphere', 'RRInterface::force', 'RRInterface::remove'],
          'Texture replacement uses the last changed texture rule, including removals. Sphere parameters are retained as restrictions, can precede activation, and are removed with setsphere. Spheres combine by mode: minimum distances, origin, extension and tween, maximum values, multiplied blend RGB, maximum kernel size or component-wise maxima. Negative numeric parameters clamp to zero. Overlay and sphere color commands remain unsupported.'),
          support: 'enforced', coveredForms: ['Texture restrictions and aliases', 'Sphere activation, retained parameter add/remove and force aliases', 'Mode aggregation, clear and session cleanup'],
          commandForms: [
            ...['setcam_textures', 'camtextures', 'setsphere'].map(behaviour => ({ behaviour, type: 'add' as const, support: 'enforced' as const, option: 'any' as const })),
            ...['mode', 'origin', 'distmin', 'distmax', 'distextend', 'param', 'tween', 'valuemin', 'valuemax'].flatMap(field => (['add', 'force'] as const).map(type => ({ behaviour: 'setsphere_' + field, type, support: 'enforced' as const, option: 'any' as const }))),
            ...['setoverlay', 'setoverlay_touch', 'setsphere_color'].map(behaviour => ({ behaviour, type: behaviour === 'setsphere_color' ? 'force' as const : 'add' as const, support: 'unsupported' as const, option: 'any' as const })),
          ] },
        rlva: { ...firestorm('rlvhelper.cpp', ['RlvBehaviourDictionary::RlvBehaviourDictionary', 'RlvBehaviourInfo::processModifier', 'RlvBehaviourHandler<RLV_BHVR_SETOVERLAY>::onCommand', 'RlvBehaviourHandler<RLV_BHVR_SETSPHERE>::onCommand', 'RlvOverlayEffect', 'RlvSphereEffect'],
          'Texture restrictions select the first retained modifier. An unoptioned rule inserts the viewer default texture with the same insertion priority as an explicit UUID. Overlays expose alpha, texture, tint and per-issuer touch blocking; one object hierarchy is enabled at a time. Spheres expose per-issuer mode, origin, color/param, distance, extension, values and tween targets. Local modifiers require that issuer to hold the base behaviour; an empty modifier restores its default. Removal, clear and session cleanup release local parameters. At most six sphere issuers are accepted.'),
          support: 'enforced', coveredForms: ['Texture UUID restrictions and canonical alias', 'Overlay activation, local alpha/texture/tint and touch state', 'Six independent spheres with typed local modifiers and default restoration'],
          commandForms: [
            ...['setcam_textures', 'camtextures'].map(behaviour => ({ behaviour, type: 'add' as const, support: 'enforced' as const, option: 'any' as const })),
            ...['setoverlay', 'setoverlay_touch', 'setsphere'].map(behaviour => ({ behaviour, type: 'add' as const, support: 'enforced' as const, option: 'none' as const })),
            ...['alpha', 'texture', 'tint'].map(field => ({ behaviour: 'setoverlay_' + field, type: 'force' as const, support: 'enforced' as const, option: 'any' as const })),
            ...['mode', 'origin', 'color', 'distmin', 'distmax', 'distextend', 'param', 'tween', 'valuemin', 'valuemax'].map(field => ({ behaviour: 'setsphere_' + field, type: 'force' as const, support: 'enforced' as const, option: 'any' as const })),
          ] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-viewstate-camera.test.ts'],
    },
    {
      id: 'discovery', forms: ['@getcommand[:<behaviour>[;<type>[;<separator>]]]=<channel>'],
      comparison: 'confirmed difference', wikiComparison: 'No getcommand section in the wiki. RLVa implements it; Kokua has no named query branch and falls through to ordinary parameter dispatch.',
      profiles: {
        rlv: kokua(['RRInterface::reallyHandleCommand'], 'No getcommand query branch. Numeric reply parameter reaches fallback and returns false, rather than an empty successful query.'),
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvReplyHandler<RLV_BHVR_GETCOMMAND>::onCommand'],
          'Enumerates implemented command forms in restriction, force and reply order with substring filtering and any/add/force/reply types. State-only restrictions are discoverable with their depth exposed in metadata; unsupported forms are excluded. Omitted separator is semicolon; an explicit empty separator joins names directly. Invalid types deliver one empty reply and an invalid-option outcome. Reply transport truncates once at 1023 UTF-8 bytes.'),
          support: 'enforced', commandForms: replyForms('getcommand'),
          coveredForms: ['getcommand on valid positive reply channels', 'Substring filter, omitted/any/add/force/reply type, omitted/empty/custom separator, ignored extra fields', 'Implemented form metadata and distinguishable unsupported outcomes without synthetic acknowledgements'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-getcommand.test.ts'],
    },
    {
      id: 'notifications', forms: ['@notify:<channel>[;<filter>]=n|add', '@notify:<channel>[;<filter>]=y|rem'],
      comparison: 'confirmed difference', wikiComparison: 'Wiki describes rule notifications. Alias preservation and clear event sequences require implementation-specific expectations.',
      profiles: {
        rlv: { ...kokua(['RRInterface::notify', 'RRInterface::add', 'RRInterface::remove', 'RRInterface::clear'], 'Notifications normalize aliases to n/y, suppress duplicate adds and report absent removes; clear reports itself before individual removals, including collection.'),
          support: 'enforced', commandForms: [{ behaviour: 'notify', type: 'add', support: 'enforced', option: 'any' }],
          coveredForms: ['Emitter-scoped registrations, exact wire removals, duplicate suppression, substring filters and ordered avatar-origin delivery', 'Restriction commands and clear, script reset/removal persistence and missing-emitter collection; inventory offer notices included; avatar action notices excluded', 'Profile-specific channel and separator policies; invalid forms remain inspectable'] },
        rlva: { ...firestorm('rlvhelper.cpp', ['RlvBehaviourNotifyHandler::onCommand', 'RlvBehaviourNotifyHandler::sendNotification'], 'Notifications preserve aliases, with duplicate adds using the first stored alias. Failed external add/remove commands notify; clear reports after removing registrations, and collection reports clear without individual removals.'),
          support: 'enforced', commandForms: [{ behaviour: 'notify', type: 'add', support: 'enforced', option: 'any' }],
          coveredForms: ['Emitter-scoped registrations, exact wire removals, duplicate suppression, substring filters and ordered avatar-origin delivery', 'Restriction commands and clear, script reset/removal persistence and missing-emitter collection; inventory offer notices included; avatar action notices excluded', 'Profile-specific channel and separator policies; invalid forms remain inspectable'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-notify.test.ts', 'packages/vitest/test/rlv-offers.test.ts'],
    },
    {
      id: 'blacklist', forms: ['@versionnumbl=<channel>', '@getblacklist[:<filter>]=<channel>', 'Kokua blacklisted add and force; RLVa disabled setenv add/remove'],
      comparison: 'version/setting dependent',
      wikiComparison: 'Kokua supports the wiki blacklist queries, comma composition and substring filters. RLVa has neither query and uses a separate dictionary setting to disable setenv add/remove.',
      profiles: {
        rlv: { ...kokua(['RRInterface::getVersionNum', 'RRInterface::getBlacklist', 'RRInterface::isBlacklisted', 'RRInterface::add', 'RRInterface::force'],
          'versionnumbl appends the configured comma-separated blacklist to 2093500; getblacklist preserves entry order and filters by substring. Blacklisted adds notify with =n before succeeding without state; notify is exempt. Force entries use %f and succeed without effects or notifications. Removes remain available. Unsupported effects retain diagnostics.'),
          support: 'enforced', commandForms: replyForms('versionnumbl', 'getblacklist'),
          coveredForms: ['Empty/nonempty blacklist, duplicate entries, substring filtering and version composition', 'Per-avatar ignored add/force with notifications and unsupported diagnostics'] },
        rlva: { ...firestorm('rlvhelper.cpp', ['RlvBehaviourDictionary::RlvBehaviourDictionary', 'RlvCommand::isBlocked', 'RlvHandler::processCommand'],
          'versionnumbl and getblacklist are absent from the dictionary. rlvaNoSetEnv disables setenv add/remove with failed-disabled before notifications and state updates. Kokua blacklist entries have no effect. Environment effects remain unsupported.'),
          commandForms: [], coveredForms: ['Absent blacklist queries and separate disabled-command outcome; unsupported environment diagnostics retained'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-blacklist.test.ts'],
    },
    {
      id: 'viewer-session', forms: ['Startup command retention and ready-state release', 'Viewer session reset', 'Issuer lookup, detach and orphan collection'],
      comparison: 'confirmed difference',
      wikiComparison: 'Wiki warns that version replies can be delayed during login and restrictions do not persist across sessions. Startup phases and orphan collection use profile-specific schedules.',
      profiles: {
        rlv: { ...kokua(['RRInterface::reallyHandleCommand', 'RRInterface::fireCommands', 'RRInterface::garbageCollector'],
          'Startup retains commands in wire order; version requests bypass retention unless doNotQueueVersionRequests is false. Explicit readiness releases retained work. Time-based maintenance uses configurable additions to its initial 5-second wait and later 2-second interval; defaults produce 10-second delays. Missing issuers, including detached and never-resolved prims, lose rules and registrations on the next maintenance pass. Reset silently clears rules, retained commands and undelivered viewer replies.'),
          support: 'enforced', commandForms: [],
          coveredForms: ['Ready/not-ready fixtures and startup version-query setting', 'Time-based maintenance with initial and interval additions', 'Session reset, object-list membership and orphan notifications; forced locked-attachment recovery excluded'] },
        rlva: { ...firestorm('rlvhandler.cpp', ['RlvHandler::processCommand', 'RlvHandler::processRetainedCommands', 'RlvHandler::onIdleStartup', 'RlvHandler::onGC', 'RlvHandler::onDetach'],
          'Startup retains commands in wire order. From misc startup, version, versionnew and versionnum query groups flush every 2 seconds in that order. Full readiness releases remaining commands. A 30-second collector starts with the first restriction and stops on an empty collection pass; known missing issuers expire on the next pass and never-resolved issuers after more than 20 misses. Completed detach clears known attachment rules and registrations immediately. Reset silently clears rules, retained commands and undelivered viewer replies. Object-list membership is independent of range and region changes.'),
          support: 'enforced', commandForms: [],
          coveredForms: ['Ready/not-ready and misc startup phases with ordered version flushing', 'Known versus never-resolved issuer collection and immediate completed-detach cleanup', 'Session reset and orphan notifications; forced locked-attachment recovery excluded'] },
      },
      tests: [...tests, 'packages/vitest/test/rlv-session.test.ts'],
    },
  ],
}
