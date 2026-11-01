# RLV/RLVa coverage

Generated from `RLV_MANIFEST` by `pnpm exec tsx scripts/rlv-coverage.ts`. The coverage documentation test rejects drift.

Profiles identify Kokua RLV 2.09.35.00 and Firestorm RLVa 2.4.2. A version reply identifies the selected protocol profile; it does not promise complete viewer conformance.

## Reading the matrix

- `enforced` means the listed query, protocol operation or explicit viewer action runs within the contract below.
- `state-only` means rules are stored and queryable, but the corresponding viewer action is not enforced.
- `unsupported` means the form or effect is outside the fixture. Inspect command logs and diagnostics; there is no synthetic wire success reply.

The option placeholder describes discovery metadata, not acceptance of every option value. Contract forms and limits below narrow each row. Add forms include removal aliases. Clear, transport, inventory offers and session operations have contract rows because they are not discoverable add/force/reply forms.

## Command forms

| Contract | Profile and version | Command form or operation | Support depth | Comparison | Tests |
| --- | --- | --- | --- | --- | --- |
| [version](#version) | Kokua RLV 2.09.35.00 | <code>@version[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-version.test.ts](../packages/vitest/test/rlv-version.test.ts)<br>[rlv-batch.test.ts](../packages/vitest/test/rlv-batch.test.ts) |
| [version](#version) | Kokua RLV 2.09.35.00 | <code>@versionnew[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-version.test.ts](../packages/vitest/test/rlv-version.test.ts)<br>[rlv-batch.test.ts](../packages/vitest/test/rlv-batch.test.ts) |
| [version](#version) | Kokua RLV 2.09.35.00 | <code>@versionnum[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-version.test.ts](../packages/vitest/test/rlv-version.test.ts)<br>[rlv-batch.test.ts](../packages/vitest/test/rlv-batch.test.ts) |
| [version](#version) | Firestorm RLVa 2.4.2 | <code>@version[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-version.test.ts](../packages/vitest/test/rlv-version.test.ts)<br>[rlv-batch.test.ts](../packages/vitest/test/rlv-batch.test.ts) |
| [version](#version) | Firestorm RLVa 2.4.2 | <code>@versionnew[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-version.test.ts](../packages/vitest/test/rlv-version.test.ts)<br>[rlv-batch.test.ts](../packages/vitest/test/rlv-batch.test.ts) |
| [version](#version) | Firestorm RLVa 2.4.2 | <code>@versionnum[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-version.test.ts](../packages/vitest/test/rlv-version.test.ts)<br>[rlv-batch.test.ts](../packages/vitest/test/rlv-batch.test.ts) |
| [channel-policy](#channel-policy) | Kokua RLV 2.09.35.00 | <code>&lt;query&gt;=&lt;signed-channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-channels.test.ts](../packages/vitest/test/rlv-channels.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [channel-policy](#channel-policy) | Firestorm RLVa 2.4.2 | <code>&lt;query&gt;=&lt;signed-channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-channels.test.ts](../packages/vitest/test/rlv-channels.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [add-remove-clear](#add-remove-clear) | Kokua RLV 2.09.35.00 | <code>@tplm=n&#124;add&#124;y&#124;rem</code> | state-only | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-restrictions.test.ts](../packages/vitest/test/rlv-restrictions.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [add-remove-clear](#add-remove-clear) | Kokua RLV 2.09.35.00 | <code>@&lt;behaviour&gt;[:&lt;option&gt;]=n&#124;add</code><br><code>@&lt;behaviour&gt;[:&lt;option&gt;]=y&#124;rem</code><br><code>@clear</code><br><code>@clear=</code><br><code>@clear=&lt;filter&gt;</code> | state-only | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-restrictions.test.ts](../packages/vitest/test/rlv-restrictions.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [add-remove-clear](#add-remove-clear) | Firestorm RLVa 2.4.2 | <code>@tplm=n&#124;add&#124;y&#124;rem</code> | state-only | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-restrictions.test.ts](../packages/vitest/test/rlv-restrictions.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [add-remove-clear](#add-remove-clear) | Firestorm RLVa 2.4.2 | <code>@&lt;behaviour&gt;[:&lt;option&gt;]=n&#124;add</code><br><code>@&lt;behaviour&gt;[:&lt;option&gt;]=y&#124;rem</code><br><code>@clear</code><br><code>@clear=</code><br><code>@clear=&lt;filter&gt;</code> | state-only | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-restrictions.test.ts](../packages/vitest/test/rlv-restrictions.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [sendchat](#sendchat) | Kokua RLV 2.09.35.00 | <code>@sendchat=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchat.test.ts](../packages/vitest/test/rlv-sendchat.test.ts) |
| [sendchat](#sendchat) | Firestorm RLVa 2.4.2 | <code>@sendchat=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchat.test.ts](../packages/vitest/test/rlv-sendchat.test.ts) |
| [chat-redirection](#chat-redirection) | Kokua RLV 2.09.35.00 | <code>@emote=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-redirchat.test.ts](../packages/vitest/test/rlv-redirchat.test.ts) |
| [chat-redirection](#chat-redirection) | Kokua RLV 2.09.35.00 | <code>@redirchat[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-redirchat.test.ts](../packages/vitest/test/rlv-redirchat.test.ts) |
| [chat-redirection](#chat-redirection) | Kokua RLV 2.09.35.00 | <code>@rediremote[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-redirchat.test.ts](../packages/vitest/test/rlv-redirchat.test.ts) |
| [chat-redirection](#chat-redirection) | Firestorm RLVa 2.4.2 | <code>@emote=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-redirchat.test.ts](../packages/vitest/test/rlv-redirchat.test.ts) |
| [chat-redirection](#chat-redirection) | Firestorm RLVa 2.4.2 | <code>@redirchat[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-redirchat.test.ts](../packages/vitest/test/rlv-redirchat.test.ts) |
| [chat-redirection](#chat-redirection) | Firestorm RLVa 2.4.2 | <code>@rediremote[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-redirchat.test.ts](../packages/vitest/test/rlv-redirchat.test.ts) |
| [chat-volume](#chat-volume) | Kokua RLV 2.09.35.00 | <code>@chatshout=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-chatvolume.test.ts](../packages/vitest/test/rlv-chatvolume.test.ts) |
| [chat-volume](#chat-volume) | Kokua RLV 2.09.35.00 | <code>@chatwhisper=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-chatvolume.test.ts](../packages/vitest/test/rlv-chatvolume.test.ts) |
| [chat-volume](#chat-volume) | Kokua RLV 2.09.35.00 | <code>@chatnormal=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-chatvolume.test.ts](../packages/vitest/test/rlv-chatvolume.test.ts) |
| [chat-volume](#chat-volume) | Firestorm RLVa 2.4.2 | <code>@chatshout=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-chatvolume.test.ts](../packages/vitest/test/rlv-chatvolume.test.ts) |
| [chat-volume](#chat-volume) | Firestorm RLVa 2.4.2 | <code>@chatwhisper=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-chatvolume.test.ts](../packages/vitest/test/rlv-chatvolume.test.ts) |
| [chat-volume](#chat-volume) | Firestorm RLVa 2.4.2 | <code>@chatnormal=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-chatvolume.test.ts](../packages/vitest/test/rlv-chatvolume.test.ts) |
| [received-chat](#received-chat) | Kokua RLV 2.09.35.00 | <code>@recvchat[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Kokua RLV 2.09.35.00 | <code>@recvchat_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Kokua RLV 2.09.35.00 | <code>@recvemote[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Kokua RLV 2.09.35.00 | <code>@recvemote_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Kokua RLV 2.09.35.00 | <code>@recvchatfrom[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Kokua RLV 2.09.35.00 | <code>@recvemotefrom[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Kokua RLV 2.09.35.00 | <code>@recvchatfrom_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Kokua RLV 2.09.35.00 | <code>@recvemotefrom_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Firestorm RLVa 2.4.2 | <code>@recvchat[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Firestorm RLVa 2.4.2 | <code>@recvchat_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Firestorm RLVa 2.4.2 | <code>@recvemote[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Firestorm RLVa 2.4.2 | <code>@recvemote_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Firestorm RLVa 2.4.2 | <code>@recvchatfrom[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Firestorm RLVa 2.4.2 | <code>@recvchatfrom_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Firestorm RLVa 2.4.2 | <code>@recvemotefrom[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-chat](#received-chat) | Firestorm RLVa 2.4.2 | <code>@recvemotefrom_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts) |
| [received-im](#received-im) | Kokua RLV 2.09.35.00 | <code>@recvim[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvim.test.ts](../packages/vitest/test/rlv-recvim.test.ts) |
| [received-im](#received-im) | Kokua RLV 2.09.35.00 | <code>@recvim_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvim.test.ts](../packages/vitest/test/rlv-recvim.test.ts) |
| [received-im](#received-im) | Kokua RLV 2.09.35.00 | <code>@recvimfrom[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvim.test.ts](../packages/vitest/test/rlv-recvim.test.ts) |
| [received-im](#received-im) | Kokua RLV 2.09.35.00 | <code>@recvimfrom_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvim.test.ts](../packages/vitest/test/rlv-recvim.test.ts) |
| [received-im](#received-im) | Firestorm RLVa 2.4.2 | <code>@recvim[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvim.test.ts](../packages/vitest/test/rlv-recvim.test.ts) |
| [received-im](#received-im) | Firestorm RLVa 2.4.2 | <code>@recvim_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvim.test.ts](../packages/vitest/test/rlv-recvim.test.ts) |
| [received-im](#received-im) | Firestorm RLVa 2.4.2 | <code>@recvimfrom[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvim.test.ts](../packages/vitest/test/rlv-recvim.test.ts) |
| [received-im](#received-im) | Firestorm RLVa 2.4.2 | <code>@recvimfrom_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvim.test.ts](../packages/vitest/test/rlv-recvim.test.ts) |
| [sent-im](#sent-im) | Kokua RLV 2.09.35.00 | <code>@sendim[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Kokua RLV 2.09.35.00 | <code>@sendim_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Kokua RLV 2.09.35.00 | <code>@sendimto[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Kokua RLV 2.09.35.00 | <code>@sendimto_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Kokua RLV 2.09.35.00 | <code>@startim[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Kokua RLV 2.09.35.00 | <code>@startim_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Kokua RLV 2.09.35.00 | <code>@startimto[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Kokua RLV 2.09.35.00 | <code>@startimto_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Firestorm RLVa 2.4.2 | <code>@sendim[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Firestorm RLVa 2.4.2 | <code>@sendim_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Firestorm RLVa 2.4.2 | <code>@sendimto[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Firestorm RLVa 2.4.2 | <code>@sendimto_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Firestorm RLVa 2.4.2 | <code>@startim[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Firestorm RLVa 2.4.2 | <code>@startim_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Firestorm RLVa 2.4.2 | <code>@startimto[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sent-im](#sent-im) | Firestorm RLVa 2.4.2 | <code>@startimto_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts) |
| [sendchannel_except](#sendchannel_except) | Kokua RLV 2.09.35.00 | <code>@sendchannel_except[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchat.test.ts](../packages/vitest/test/rlv-sendchat.test.ts) |
| [sendchannel_except](#sendchannel_except) | Firestorm RLVa 2.4.2 | <code>@sendchannel_except[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchat.test.ts](../packages/vitest/test/rlv-sendchat.test.ts) |
| [sendchannel_except](#sendchannel_except) | Firestorm RLVa 2.4.2 | <code>@sendchannel_except_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchat.test.ts](../packages/vitest/test/rlv-sendchat.test.ts) |
| [sendchannel](#sendchannel) | Kokua RLV 2.09.35.00 | <code>@sendchannel[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchannel.test.ts](../packages/vitest/test/rlv-sendchannel.test.ts) |
| [sendchannel](#sendchannel) | Kokua RLV 2.09.35.00 | <code>@sendchannel_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchannel.test.ts](../packages/vitest/test/rlv-sendchannel.test.ts) |
| [sendchannel](#sendchannel) | Kokua RLV 2.09.35.00 | <code>@permissive=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchannel.test.ts](../packages/vitest/test/rlv-sendchannel.test.ts) |
| [sendchannel](#sendchannel) | Firestorm RLVa 2.4.2 | <code>@sendchannel[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchannel.test.ts](../packages/vitest/test/rlv-sendchannel.test.ts) |
| [sendchannel](#sendchannel) | Firestorm RLVa 2.4.2 | <code>@sendchannel_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchannel.test.ts](../packages/vitest/test/rlv-sendchannel.test.ts) |
| [sendchannel](#sendchannel) | Firestorm RLVa 2.4.2 | <code>@permissive=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchannel.test.ts](../packages/vitest/test/rlv-sendchannel.test.ts) |
| [status](#status) | Kokua RLV 2.09.35.00 | <code>@getstatus[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-status.test.ts](../packages/vitest/test/rlv-status.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [status](#status) | Kokua RLV 2.09.35.00 | <code>@getstatusall[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-status.test.ts](../packages/vitest/test/rlv-status.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [status](#status) | Firestorm RLVa 2.4.2 | <code>@getstatus[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-status.test.ts](../packages/vitest/test/rlv-status.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [status](#status) | Firestorm RLVa 2.4.2 | <code>@getstatusall[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-status.test.ts](../packages/vitest/test/rlv-status.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [getinv](#getinv) | Kokua RLV 2.09.35.00 | <code>@getinv[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getinv.test.ts](../packages/vitest/test/rlv-getinv.test.ts) |
| [getinv](#getinv) | Firestorm RLVa 2.4.2 | <code>@getinv[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getinv.test.ts](../packages/vitest/test/rlv-getinv.test.ts) |
| [inventory-offers](#inventory-offers) | Kokua RLV 2.09.35.00 | <code>Explicit accept or decline of captured llGiveInventoryList avatar offers</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-offers.test.ts](../packages/vitest/test/rlv-offers.test.ts) |
| [inventory-offers](#inventory-offers) | Firestorm RLVa 2.4.2 | <code>Explicit accept or decline of captured llGiveInventoryList avatar offers</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-offers.test.ts](../packages/vitest/test/rlv-offers.test.ts) |
| [getoutfit](#getoutfit) | Kokua RLV 2.09.35.00 | <code>@getoutfit[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-outfit.test.ts](../packages/vitest/test/rlv-outfit.test.ts) |
| [getoutfit](#getoutfit) | Firestorm RLVa 2.4.2 | <code>@getoutfit[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-outfit.test.ts](../packages/vitest/test/rlv-outfit.test.ts) |
| [getinvworn](#getinvworn) | Kokua RLV 2.09.35.00 | <code>@getinvworn[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-outfit.test.ts](../packages/vitest/test/rlv-outfit.test.ts) |
| [getinvworn](#getinvworn) | Firestorm RLVa 2.4.2 | <code>@getinvworn[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-outfit.test.ts](../packages/vitest/test/rlv-outfit.test.ts) |
| [findfolder](#findfolder) | Kokua RLV 2.09.35.00 | <code>@findfolder[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-findfolder.test.ts](../packages/vitest/test/rlv-findfolder.test.ts) |
| [findfolder](#findfolder) | Kokua RLV 2.09.35.00 | <code>@findfolders[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-findfolder.test.ts](../packages/vitest/test/rlv-findfolder.test.ts) |
| [findfolder](#findfolder) | Firestorm RLVa 2.4.2 | <code>@findfolder[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-findfolder.test.ts](../packages/vitest/test/rlv-findfolder.test.ts) |
| [findfolder](#findfolder) | Firestorm RLVa 2.4.2 | <code>@findfolders[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-findfolder.test.ts](../packages/vitest/test/rlv-findfolder.test.ts) |
| [getpath](#getpath) | Kokua RLV 2.09.35.00 | <code>@getpath[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-findfolder.test.ts](../packages/vitest/test/rlv-findfolder.test.ts) |
| [getpath](#getpath) | Kokua RLV 2.09.35.00 | <code>@getpathnew[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-findfolder.test.ts](../packages/vitest/test/rlv-findfolder.test.ts) |
| [getpath](#getpath) | Firestorm RLVa 2.4.2 | <code>@getpath[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-findfolder.test.ts](../packages/vitest/test/rlv-findfolder.test.ts) |
| [getpath](#getpath) | Firestorm RLVa 2.4.2 | <code>@getpathnew[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-findfolder.test.ts](../packages/vitest/test/rlv-findfolder.test.ts) |
| [forcewear](#forcewear) | Kokua RLV 2.09.35.00 | <code>@attach[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forcewear.test.ts](../packages/vitest/test/rlv-forcewear.test.ts) |
| [forcewear](#forcewear) | Kokua RLV 2.09.35.00 | <code>@attachover[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forcewear.test.ts](../packages/vitest/test/rlv-forcewear.test.ts) |
| [forcewear](#forcewear) | Kokua RLV 2.09.35.00 | <code>@attachoverorreplace[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forcewear.test.ts](../packages/vitest/test/rlv-forcewear.test.ts) |
| [forcewear](#forcewear) | Firestorm RLVa 2.4.2 | <code>@attach[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forcewear.test.ts](../packages/vitest/test/rlv-forcewear.test.ts) |
| [forcewear](#forcewear) | Firestorm RLVa 2.4.2 | <code>@attachover[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forcewear.test.ts](../packages/vitest/test/rlv-forcewear.test.ts) |
| [forcewear](#forcewear) | Firestorm RLVa 2.4.2 | <code>@attachoverorreplace[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forcewear.test.ts](../packages/vitest/test/rlv-forcewear.test.ts) |
| [forceremove](#forceremove) | Kokua RLV 2.09.35.00 | <code>@remoutfit[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forceremove.test.ts](../packages/vitest/test/rlv-forceremove.test.ts) |
| [forceremove](#forceremove) | Kokua RLV 2.09.35.00 | <code>@addoutfit[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forceremove.test.ts](../packages/vitest/test/rlv-forceremove.test.ts) |
| [forceremove](#forceremove) | Kokua RLV 2.09.35.00 | <code>@remoutfit[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forceremove.test.ts](../packages/vitest/test/rlv-forceremove.test.ts) |
| [forceremove](#forceremove) | Firestorm RLVa 2.4.2 | <code>@remoutfit[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forceremove.test.ts](../packages/vitest/test/rlv-forceremove.test.ts) |
| [forceremove](#forceremove) | Firestorm RLVa 2.4.2 | <code>@addoutfit[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forceremove.test.ts](../packages/vitest/test/rlv-forceremove.test.ts) |
| [forceremove](#forceremove) | Firestorm RLVa 2.4.2 | <code>@remoutfit[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forceremove.test.ts](../packages/vitest/test/rlv-forceremove.test.ts) |
| [getattach](#getattach) | Kokua RLV 2.09.35.00 | <code>@getattach[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getattach.test.ts](../packages/vitest/test/rlv-getattach.test.ts) |
| [getattach](#getattach) | Firestorm RLVa 2.4.2 | <code>@getattach[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getattach.test.ts](../packages/vitest/test/rlv-getattach.test.ts) |
| [getattachnames](#getattachnames) | Kokua RLV 2.09.35.00 | <code>@getattachnames[:&lt;group&gt;]=&lt;channel&gt;</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getattach.test.ts](../packages/vitest/test/rlv-getattach.test.ts) |
| [getattachnames](#getattachnames) | Firestorm RLVa 2.4.2 | <code>@getattachnames[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getattach.test.ts](../packages/vitest/test/rlv-getattach.test.ts) |
| [detach](#detach) | Kokua RLV 2.09.35.00 | <code>@detach[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts)<br>[rlv-detach.test.ts](../packages/vitest/test/rlv-detach.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [detach](#detach) | Kokua RLV 2.09.35.00 | <code>@detach[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts)<br>[rlv-detach.test.ts](../packages/vitest/test/rlv-detach.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [detach](#detach) | Kokua RLV 2.09.35.00 | <code>@detachme[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts)<br>[rlv-detach.test.ts](../packages/vitest/test/rlv-detach.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [detach](#detach) | Firestorm RLVa 2.4.2 | <code>@detach[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts)<br>[rlv-detach.test.ts](../packages/vitest/test/rlv-detach.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [detach](#detach) | Firestorm RLVa 2.4.2 | <code>@detach[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts)<br>[rlv-detach.test.ts](../packages/vitest/test/rlv-detach.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [detach](#detach) | Firestorm RLVa 2.4.2 | <code>@detachme=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts)<br>[rlv-detach.test.ts](../packages/vitest/test/rlv-detach.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts) |
| [attachment-point-locks](#attachment-point-locks) | Kokua RLV 2.09.35.00 | <code>@addattach[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | shared | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts) |
| [attachment-point-locks](#attachment-point-locks) | Kokua RLV 2.09.35.00 | <code>@remattach[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | shared | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts) |
| [attachment-point-locks](#attachment-point-locks) | Kokua RLV 2.09.35.00 | <code>@remattach[:&lt;option&gt;]=force</code> | enforced | shared | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts) |
| [attachment-point-locks](#attachment-point-locks) | Firestorm RLVa 2.4.2 | <code>@addattach[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | shared | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts) |
| [attachment-point-locks](#attachment-point-locks) | Firestorm RLVa 2.4.2 | <code>@remattach[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | shared | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts) |
| [attachment-point-locks](#attachment-point-locks) | Firestorm RLVa 2.4.2 | <code>@remattach[:&lt;option&gt;]=force</code> | enforced | shared | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts) |
| [getaddattachnames](#getaddattachnames) | Kokua RLV 2.09.35.00 | <code>@getaddattachnames[:&lt;group&gt;]=&lt;channel&gt;</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts) |
| [getaddattachnames](#getaddattachnames) | Firestorm RLVa 2.4.2 | <code>@getaddattachnames[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts) |
| [getremattachnames](#getremattachnames) | Kokua RLV 2.09.35.00 | <code>@getremattachnames[:&lt;group&gt;]=&lt;channel&gt;</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts) |
| [getremattachnames](#getremattachnames) | Firestorm RLVa 2.4.2 | <code>@getremattachnames[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts) |
| [seating](#seating) | Kokua RLV 2.09.35.00 | <code>@getsitid[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Kokua RLV 2.09.35.00 | <code>@sit=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Kokua RLV 2.09.35.00 | <code>@unsit=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Kokua RLV 2.09.35.00 | <code>@sittp[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Kokua RLV 2.09.35.00 | <code>@sit[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Kokua RLV 2.09.35.00 | <code>@unsit=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Firestorm RLVa 2.4.2 | <code>@getsitid[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Firestorm RLVa 2.4.2 | <code>@sit=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Firestorm RLVa 2.4.2 | <code>@unsit=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Firestorm RLVa 2.4.2 | <code>@sittp[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Firestorm RLVa 2.4.2 | <code>@sit[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [seating](#seating) | Firestorm RLVa 2.4.2 | <code>@unsit=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts) |
| [teleport](#teleport) | Kokua RLV 2.09.35.00 | <code>@tpto[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-tpto.test.ts](../packages/vitest/test/rlv-tpto.test.ts) |
| [teleport](#teleport) | Kokua RLV 2.09.35.00 | <code>@tploc=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-tpto.test.ts](../packages/vitest/test/rlv-tpto.test.ts) |
| [teleport](#teleport) | Kokua RLV 2.09.35.00 | <code>@tplocal[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-tpto.test.ts](../packages/vitest/test/rlv-tpto.test.ts) |
| [teleport](#teleport) | Firestorm RLVa 2.4.2 | <code>@tpto[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-tpto.test.ts](../packages/vitest/test/rlv-tpto.test.ts) |
| [teleport](#teleport) | Firestorm RLVa 2.4.2 | <code>@tploc=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-tpto.test.ts](../packages/vitest/test/rlv-tpto.test.ts) |
| [teleport](#teleport) | Firestorm RLVa 2.4.2 | <code>@tplocal[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-tpto.test.ts](../packages/vitest/test/rlv-tpto.test.ts) |
| [camera-fov](#camera-fov) | Kokua RLV 2.09.35.00 | <code>@setcam_fovmin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Kokua RLV 2.09.35.00 | <code>@setcam_fovmax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Kokua RLV 2.09.35.00 | <code>@setcam_fov[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Kokua RLV 2.09.35.00 | <code>@getcam_fov[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Kokua RLV 2.09.35.00 | <code>@getcam_fovmin[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Kokua RLV 2.09.35.00 | <code>@getcam_fovmax[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Firestorm RLVa 2.4.2 | <code>@setcam_fovmin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Firestorm RLVa 2.4.2 | <code>@setcam_fovmax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Firestorm RLVa 2.4.2 | <code>@setcam_fov[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Firestorm RLVa 2.4.2 | <code>@getcam_fov[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Firestorm RLVa 2.4.2 | <code>@getcam_fovmin[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-fov](#camera-fov) | Firestorm RLVa 2.4.2 | <code>@getcam_fovmax[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts) |
| [camera-distance](#camera-distance) | Kokua RLV 2.09.35.00 | <code>@setcam_avdistmin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Kokua RLV 2.09.35.00 | <code>@setcam_avdistmax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Kokua RLV 2.09.35.00 | <code>@camdistmin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Kokua RLV 2.09.35.00 | <code>@camdistmax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Kokua RLV 2.09.35.00 | <code>@camzoommin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Kokua RLV 2.09.35.00 | <code>@camzoommax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Kokua RLV 2.09.35.00 | <code>@getcam_avdistmin[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Kokua RLV 2.09.35.00 | <code>@getcam_avdistmax[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Firestorm RLVa 2.4.2 | <code>@setcam_avdistmin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Firestorm RLVa 2.4.2 | <code>@setcam_avdistmax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Firestorm RLVa 2.4.2 | <code>@camdistmin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Firestorm RLVa 2.4.2 | <code>@camdistmax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Firestorm RLVa 2.4.2 | <code>@camzoommin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Firestorm RLVa 2.4.2 | <code>@camzoommax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Firestorm RLVa 2.4.2 | <code>@getcam_avdistmin[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance](#camera-distance) | Firestorm RLVa 2.4.2 | <code>@getcam_avdistmax[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance-query](#camera-distance-query) | Kokua RLV 2.09.35.00 | <code>@getcam_avdist=&lt;channel&gt;</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-distance-query](#camera-distance-query) | Firestorm RLVa 2.4.2 | <code>@getcam_avdist[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-zoom-query](#camera-zoom-query) | Kokua RLV 2.09.35.00 | <code>@getcam_zoom[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-zoom-query](#camera-zoom-query) | Kokua RLV 2.09.35.00 | <code>@getcam_zoommin[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-zoom-query](#camera-zoom-query) | Kokua RLV 2.09.35.00 | <code>@getcam_zoommax[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-zoom-query](#camera-zoom-query) | Firestorm RLVa 2.4.2 | <code>@getcam_zoom=&lt;channel&gt;</code><br><code>@getcam_zoommin=&lt;channel&gt;</code><br><code>@getcam_zoommax=&lt;channel&gt;</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-origin](#camera-origin) | Kokua RLV 2.09.35.00 | <code>@setcam_origindistmin:&lt;metres&gt;=n&#124;y</code><br><code>@setcam_origindistmax:&lt;metres&gt;=n&#124;y</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-origin](#camera-origin) | Firestorm RLVa 2.4.2 | <code>@setcam_origindistmin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-origin](#camera-origin) | Firestorm RLVa 2.4.2 | <code>@setcam_origindistmax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-silhouette](#camera-silhouette) | Kokua RLV 2.09.35.00 | <code>@setcam_avdist:&lt;metres&gt;=n&#124;y</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [camera-silhouette](#camera-silhouette) | Firestorm RLVa 2.4.2 | <code>@setcam_avdist[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | state-only | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@showinv=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@showloc=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@showminimap=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@showworldmap=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@shownearby=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@showhovertextall=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@showhovertexthud=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@showhovertextworld=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@viewnote=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@viewscript=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@viewtexture=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@shownames[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@shownames_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@shownametags[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@showhovertext[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@showself[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@showselfhead[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@viewtransparent[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@viewwireframe[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Kokua RLV 2.09.35.00 | <code>@shownametags_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@showinv=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@showloc=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@showminimap=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@showworldmap=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@shownearby=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@showhovertextall=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@showhovertexthud=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@showhovertextworld=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@viewnote=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@viewscript=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@viewtexture=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@showself=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@showselfhead=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@viewtransparent=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@viewwireframe=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@shownames[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@shownames_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@shownametags[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@shownametags_sec[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-ui](#viewer-ui) | Firestorm RLVa 2.4.2 | <code>@showhovertext[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setcam_textures[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@camtextures[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_mode[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_mode[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_origin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_origin[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_distmin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_distmin[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_distmax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_distmax[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_distextend[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_distextend[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_param[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_param[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_tween[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_tween[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_valuemin[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_valuemin[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_valuemax[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_valuemax[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setoverlay[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setoverlay_touch[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Kokua RLV 2.09.35.00 | <code>@setsphere_color[:&lt;option&gt;]=force</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setcam_textures[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@camtextures[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setoverlay=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setoverlay_touch=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setoverlay_alpha[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setoverlay_texture[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setoverlay_tint[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere_mode[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere_origin[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere_color[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere_distmin[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere_distmax[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere_distextend[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere_param[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere_tween[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere_valuemin[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [viewer-render](#viewer-render) | Firestorm RLVa 2.4.2 | <code>@setsphere_valuemax[:&lt;option&gt;]=force</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts) |
| [discovery](#discovery) | Kokua RLV 2.09.35.00 | <code>@getcommand[:&lt;behaviour&gt;[;&lt;type&gt;[;&lt;separator&gt;]]]=&lt;channel&gt;</code> | unsupported | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getcommand.test.ts](../packages/vitest/test/rlv-getcommand.test.ts) |
| [discovery](#discovery) | Firestorm RLVa 2.4.2 | <code>@getcommand[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getcommand.test.ts](../packages/vitest/test/rlv-getcommand.test.ts) |
| [notifications](#notifications) | Kokua RLV 2.09.35.00 | <code>@notify[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-notify.test.ts](../packages/vitest/test/rlv-notify.test.ts)<br>[rlv-offers.test.ts](../packages/vitest/test/rlv-offers.test.ts) |
| [notifications](#notifications) | Firestorm RLVa 2.4.2 | <code>@notify[:&lt;option&gt;]=n&#124;add&#124;y&#124;rem</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-notify.test.ts](../packages/vitest/test/rlv-notify.test.ts)<br>[rlv-offers.test.ts](../packages/vitest/test/rlv-offers.test.ts) |
| [blacklist](#blacklist) | Kokua RLV 2.09.35.00 | <code>@versionnumbl[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-blacklist.test.ts](../packages/vitest/test/rlv-blacklist.test.ts) |
| [blacklist](#blacklist) | Kokua RLV 2.09.35.00 | <code>@getblacklist[:&lt;option&gt;]=&lt;channel&gt;</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-blacklist.test.ts](../packages/vitest/test/rlv-blacklist.test.ts) |
| [blacklist](#blacklist) | Kokua RLV 2.09.35.00 | <code>@versionnumbl=&lt;channel&gt;</code><br><code>@getblacklist[:&lt;filter&gt;]=&lt;channel&gt;</code><br><code>Kokua blacklisted add and force; RLVa disabled setenv add/remove</code> | enforced | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-blacklist.test.ts](../packages/vitest/test/rlv-blacklist.test.ts) |
| [blacklist](#blacklist) | Firestorm RLVa 2.4.2 | <code>@versionnumbl=&lt;channel&gt;</code><br><code>@getblacklist[:&lt;filter&gt;]=&lt;channel&gt;</code><br><code>Kokua blacklisted add and force; RLVa disabled setenv add/remove</code> | unsupported | version/setting dependent | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-blacklist.test.ts](../packages/vitest/test/rlv-blacklist.test.ts) |
| [viewer-session](#viewer-session) | Kokua RLV 2.09.35.00 | <code>Startup command retention and ready-state release</code><br><code>Viewer session reset</code><br><code>Issuer lookup, detach and orphan collection</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-session.test.ts](../packages/vitest/test/rlv-session.test.ts) |
| [viewer-session](#viewer-session) | Firestorm RLVa 2.4.2 | <code>Startup command retention and ready-state release</code><br><code>Viewer session reset</code><br><code>Issuer lookup, detach and orphan collection</code> | enforced | confirmed difference | [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-session.test.ts](../packages/vitest/test/rlv-session.test.ts) |

## Profile settings

### Kokua RLV 2.09.35.00

- doNotQueueVersionRequests defaults true. Kokua time-based collection uses initialGarbageCollectionAdditionalWait=5000 and garbageCollectionAdditionalInterval=8000 milliseconds, added to minimum delays of 5000 and 2000 milliseconds. The default ignores first-fully-visible timing; frame-based and avatar-visibility scheduling are unsupported. An explicit per-avatar blacklist preserves wire order and uses %f for force entries; query and notify commands remain available.

### Firestorm RLVa 2.4.2

- rlvaNoSetEnv disables setenv add/remove through the dictionary; it is separate from the Kokua blacklist. Environment effects remain unsupported.
- RlvSettings::isCompatibilityModeObject selects per-object API reporting; no emulator setting implemented.
- Attachment queries use RlvHideLockedAttachments=false; lock-filter setting overrides are unsupported.
- Force wear uses RLVaEnableSharedWear=true by default; inventory.sharedWear=false disables unnamed items. Legacy folder naming is enabled, the add prefix is + and the replace prefix is empty.
- Outfit queries use RlvHideLockedLayers=false and RLVaEnableSharedWear=true; overrides are unsupported and effective folded state is explicit.

## Contracts and limits

### version

Forms: <code>@version=&lt;channel&gt;</code>, <code>@versionnew=&lt;channel&gt;</code>, <code>@versionnum=&lt;channel&gt;</code>, <code>@versionnum:impl=&lt;channel&gt;</code>, <code>@&lt;version-query&gt;,&lt;version-query&gt;,...</code>.

Comparison: version/setting dependent. Wiki specifies ordered comma-separated commands, partial failure and case-insensitive, spacing-sensitive names. Both profiles accept decimal channel prefixes and skip empty tokens. RLVa rejects missing fields and unknown parameter kinds; Kokua permits empty fields and handles named version queries first. RLVa adds its implementation tag and impl option; Kokua ignores the versionnum option.

#### Kokua RLV 2.09.35.00

Support depth: enforced. versionnum returns 2093500 with any option; legacy/new strings use fixture viewer suffix 26.4.0.

- @version[:<option>]=<nonzero-signed-channel>
- @versionnew[:<option>]=<nonzero-signed-channel>
- @versionnum[:<option>]=<nonzero-signed-channel>
- Ordered version-query batches with per-token diagnostics and parameter classification

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::reallyHandleCommand</code>, <code>RRInterface::getVersion</code>, <code>RRInterface::getVersion2</code>, <code>RR_VERSION_NUM</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Firestorm RLVa 2.4.2 with default settings returns RLVa-tagged strings, API 3040300, :impl 2040213, unknown numeric option empty. String queries ignore options. Compatibility overrides are not implemented.

- @version[:<option>]=<positive-channel>
- @versionnew[:<option>]=<positive-channel>
- @versionnum[:<option>]=<positive-channel>
- Ordered version-query batches with per-token diagnostics and parameter classification

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::processReplyCommand</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-version.test.ts](../packages/vitest/test/rlv-version.test.ts)<br>[rlv-batch.test.ts](../packages/vitest/test/rlv-batch.test.ts).

### channel-policy

Forms: <code>&lt;query&gt;=&lt;signed-channel&gt;</code>.

Comparison: confirmed difference. Wiki allows nonzero channels and describes 255 characters on negative channels. Kokua truncates negative replies to 254 bytes; RLVa rejects negative object-query channels.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Object queries reject zero. Positive replies use avatar-origin shout across regions within 100 m and take a raw 1023-byte prefix. Negative replies use avatar-origin dialog chat within 20 m in the current region and take a raw 254-byte prefix. Partial UTF-8 becomes U+FFFD in VM strings. DEBUG_CHANNEL replies use the positive-channel shout path.

- Signed nonzero version-query channels
- sendViewerReply: single-message payload truncation and avatar-origin routing

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::answerOnChat</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Object queries require positive signed channels excluding DEBUG_CHANNEL. Replies use the current avatar global position, reach listeners within 100 m across regions, and truncate once to 1023 UTF-8 bytes without cutting a character. Valid empty query results still deliver one message. Console loopback and redirected-chat splitting are outside the covered forms.

- Positive version-query channels except DEBUG_CHANNEL
- sendViewerReply: single-message payload truncation and avatar-origin routing

Reference symbols: <code>indra/newview/rlvcommon.cpp</code>: <code>RlvUtil::isValidReplyChannel</code>, <code>RlvUtil::sendChatReply</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-channels.test.ts](../packages/vitest/test/rlv-channels.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts).

### add-remove-clear

Forms: <code>@&lt;behaviour&gt;[:&lt;option&gt;]=n&#124;add</code>, <code>@&lt;behaviour&gt;[:&lt;option&gt;]=y&#124;rem</code>, <code>@clear</code>, <code>@clear=</code>, <code>@clear=&lt;filter&gt;</code>.

Comparison: confirmed difference. Both profiles share prim-scoped rules, aliases, duplicate suppression and substring clear. Kokua retains unknown names and options; RLVa validates forms. Script reset, state change and removal preserve rules. Missing prims lose their rules during viewer garbage collection.

#### Kokua RLV 2.09.35.00

Support depth: state-only. No-option tplm is state-only. Public chat restrictions are enforced by explicit avatar actions. Teleport restrictions constrain forced location travel. Detach actions have a separate contract. Seating restrictions are enforced by explicit user actions. Other wire rules remain inspectable with unsupported effects. Time-based maintenance collects missing prims with a default initial delay and interval of 10 seconds. Additional wait and interval fixture settings are supported.

- No-option detach/sendchat/sit/unsit/tploc/tplm with n/add and y/rem
- Unknown wire rule storage with unsupported effects
- Bare, empty and substring-filtered clear by emitter UUID
- LSL relay release clears its own issuer while retaining unrelated rules
- Immutable restriction snapshots and script-independent lifecycle

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::isAllowed</code>, <code>RRInterface::add</code>, <code>RRInterface::remove</code>, <code>RRInterface::clear</code>, <code>RRInterface::garbageCollector</code>.

#### Firestorm RLVa 2.4.2

Support depth: state-only. No-option tplm is state-only. Public chat restrictions are enforced by explicit avatar actions. Teleport restrictions constrain forced location travel. Detach actions have a separate contract. Seating restrictions are enforced by explicit user actions. Invalid options and unknown names are not stored. Other command families and valid option forms remain unsupported. Collection checks every 30 seconds from the first restriction. Known missing prims expire on the next pass; never-resolved prims expire after more than 20 misses. Completed detach clears known attachment issuers immediately. Distance and region changes alone do not imply object-list removal.

- No-option detach/sendchat/sit/unsit/tploc/tplm with n/add and y/rem
- Bare, empty and substring-filtered clear by emitter UUID
- LSL relay release clears its own issuer while retaining unrelated rules
- Immutable restriction snapshots and script-independent lifecycle

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::processCommand</code>, <code>RlvHandler::processClearCommand</code>, <code>RlvHandler::onGC</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-restrictions.test.ts](../packages/vitest/test/rlv-restrictions.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts).

### sendchat

Forms: <code>@sendchat=n&#124;add&#124;y&#124;rem</code>.

Comparison: confirmed difference. Both profiles replace restricted speech with ellipsis, allow OOC and short slash gestures, filter quoted emotes and truncate emotes. Kokua uses byte limits, accepts colon poses and strips text preceding an embedded /me; RLVa uses character limits and additionally filters question marks.

#### Kokua RLV 2.09.35.00

Support depth: enforced. With default OOC enabled, public avatar say replaces ordinary text with ... and permits ((OOC)), slash gestures up to seven bytes and safe emotes up to twenty bytes or the first period. Colon poses are emotes; text before embedded /me is discarded. DEBUG_CHANNEL is blocked. Gesture expansion and alternate settings are outside this action. The chat-redirection contract extends emote filtering and redirect ordering.

- No-option sendchat add/remove and clear
- Public avatar say filtering with original and delivered text in action records
- DEBUG_CHANNEL denial; other private channels and simulator chat remain independent

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::crunchEmote</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. With default OOC and ellipsis enabled, public avatar say replaces ordinary text with ... and permits ((OOC)), slash gestures up to seven characters and safe /me emotes up to twenty characters, shortened using the byte offset of the first period when below twenty. Question marks are forbidden in emotes. DEBUG_CHANNEL is blocked. Gesture expansion and alternate settings are outside this action. The chat-redirection contract extends emote filtering and redirect ordering.

- No-option sendchat add/remove and clear
- Public avatar say filtering with original and delivered text in action records
- DEBUG_CHANNEL denial; other private channels and simulator chat remain independent

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::filterChat</code>, <code>RlvUtil::isEmote</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchat.test.ts](../packages/vitest/test/rlv-sendchat.test.ts).

### chat-redirection

Forms: <code>@emote=n&#124;add&#124;y&#124;rem</code>, <code>@redirchat:&lt;channel&gt;=n&#124;add&#124;y&#124;rem</code>, <code>@rediremote:&lt;channel&gt;=n&#124;add&#124;y&#124;rem</code>.

Comparison: confirmed difference. Both profiles redirect avatar chat to each target instead of channel 0 and check sendchannel rules per target. Kokua redirects OOC and gestures; RLVa leaves OOC and short gestures public. Kokua preserves transformed volume; RLVa redirects with shout volume. emote removes safe-emote length limits without permitting forbidden punctuation.

#### Kokua RLV 2.09.35.00

Support depth: enforced. emote disables safe-emote truncation but retains punctuation filtering. With default OOC redirection enabled, redirchat redirects speech, OOC and gestures; rediremote selects /me-space and /me-apostrophe-s prefixes. sendchat filters before rediremote unless redirchat is present. With redirchat, unredirected emotes are punctuation-checked without truncation. Nonempty redirect options activate suppression even if their decimal prefix is not a usable positive channel; only channels 1 through 2147483646 receive messages. Each issuer sends its own copy, respecting sendchannel and sendchannel_except. Redirects retain transformed whisper/say/shout volume and never reach public avatar chat. Payload limits, gesture expansion and alternate OOC settings are outside this contract.

- No-option emote extension with sendchat
- Per-issuer redirect channels, add/remove aliases and substring clear
- Multi-target chat delivery, channel denials and immutable per-target records
- sendchat ordering, OOC and gesture redirects, emote classification and transformed volume

Reference symbols: <code>indra/newview/llfloaterimnearbychat.cpp</code>: <code>send_chat_from_viewer</code>, <code>LLFloaterIMNearbyChat::sendChat</code>, <code>RRInterface::crunchEmote</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. emote disables safe-emote truncation but retains punctuation filtering. Redirection precedes sendchat filtering. redirchat redirects speech that filterChat would suppress, leaving OOC and short slash gestures public. rediremote selects /me-space and /me-apostrophe prefixes with more than four bytes. Positive decimal-prefix channels below DEBUG_CHANNEL are accepted. Each issuer sends its own copy, checked against sendchannel and sendchannel_except, as shout with a complete-UTF-8 1023-byte limit under default unsplit redirection. Public chat is suppressed even when all targets are denied. DEBUG_CHANNEL is denied for the matching redirect family. Gesture expansion and alternate settings are outside this contract.

- No-option emote extension with sendchat
- Per-issuer redirect channels, add/remove aliases and substring clear
- Multi-target shout delivery, channel denials and immutable per-target records
- OOC and gesture exemptions, emote classification, DEBUG_CHANNEL denial and payload truncation

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::filterChat</code>, <code>RlvHandler::redirectChatOrEmote</code>, <code>RlvHandler::processAddRemCommand</code>, <code>RlvUtil::sendChatReply</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-redirchat.test.ts](../packages/vitest/test/rlv-redirchat.test.ts).

### chat-volume

Forms: <code>@chatshout=n&#124;add&#124;y&#124;rem</code>, <code>@chatwhisper=n&#124;add&#124;y&#124;rem</code>, <code>@chatnormal=n&#124;add&#124;y&#124;rem</code>.

Comparison: confirmed difference. Both profiles transform public avatar chat volume. chatshout converts shout to say, chatwhisper converts whisper to say, and chatnormal converts say and shout to whisper. Combined chatwhisper and chatnormal leave a requested whisper as whisper in Kokua and say in RLVa. Private channels bypass volume restrictions.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Avatar chat defaults to say. Public volume transforms sequentially: restricted whisper becomes say, restricted shout becomes say, then chatnormal converts say or shout to whisper. Requested and delivered volumes are recorded separately. Private channels bypass these transformations; simulator chat and automatic replies remain independent. Payload limits, gesture expansion and optional prevention of unrestricted shouts are outside this fixture.

- No-option volume restrictions with add/remove aliases and issuer-scoped clear
- Public whisper/say/shout volume transformation and immutable action records
- Delivered volume selects 10/20/100 m script and avatar hearing ranges across regions

Reference symbols: <code>indra/newview/llchatbar.cpp</code>: <code>LLChatBar::sendChatFromViewer</code>, <code>RRInterface::contains</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Avatar chat defaults to say. Public say or shout becomes whisper under chatnormal; otherwise restricted shout becomes say, otherwise restricted whisper becomes say. Only one transformation applies. Requested and delivered volumes are recorded separately. Delivered whisper/say/shout reaches scripts and avatars within 10/20/100 m across regions. Private channels bypass these transformations; simulator chat and automatic replies remain independent. Payload limits and gesture expansion are outside this fixture.

- No-option volume restrictions with add/remove aliases and issuer-scoped clear
- Public whisper/say/shout volume transformation and immutable action records
- Delivered volume selects 10/20/100 m script and avatar hearing ranges across regions

Reference symbols: <code>indra/newview/rlvactions.cpp</code>: <code>RlvActions::checkChatVolume</code>, <code>FSNearbyChat::sendChatFromViewer</code>, <code>RlvBehaviourDictionary::RlvBehaviourDictionary</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-chatvolume.test.ts](../packages/vitest/test/rlv-chatvolume.test.ts).

### received-chat

Forms: <code>@recvchat[:&lt;uuid&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@recvemote[:&lt;uuid&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@recvchat_sec[:&lt;uuid&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@recvemote_sec[:&lt;uuid&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@recvchatfrom:&lt;uuid&gt;=n&#124;add&#124;y&#124;rem</code>, <code>@recvemotefrom:&lt;uuid&gt;=n&#124;add&#124;y&#124;rem</code>, <code>@recvchatfrom_sec:&lt;uuid&gt;=n&#124;add&#124;y&#124;rem</code>, <code>@recvemotefrom_sec:&lt;uuid&gt;=n&#124;add&#124;y&#124;rem</code>.

Comparison: confirmed difference. Global receive restrictions have speaker UUID exceptions; targeted from rules deny the named speaker independently of those exceptions. Ordinary exceptions are shared, secure and permissive restrictions require each restricting issuer to grant an exception. Both profiles use ellipses by default. Kokua also matches object owners against targeted rules, filters self chat, and shortens emotes under recvchat. RLVa exempts self chat and leaves emotes unchanged under recvchat.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Per-avatar frozen receivedChatLog snapshots record delivered object and avatar local chat with copied speaker identity and displayed text. recvchat crunches speech and shortens emotes to twenty UTF-8 bytes or the first period; recvemote replaces the suffix starting at any /me with /me ... . Targeted rules match speaker or object owner UUID. Owned attachments and direct region messages bypass filtering; ordinary owner chat from unattached objects is filtered. Owner commands are consumed. Secure global exceptions and permissive issuer scope are enforced. Secure from aliases are unsupported. Default OOC and ellipsis settings are fixed; alternate settings, emote extensions and object-to-avatar name impersonation are outside this fixture.

- Global receive chat/emote add/remove, UUID exceptions, secure aliases and permissive issuer scope
- Targeted recvchatfrom/recvemotefrom speaker and object-owner denials
- Object whisper/say/shout, owner chat and direct region chat; avatar local say
- Immutable per-avatar received-chat snapshots; simulator listens and send-action records remain independent

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::containsWithoutException</code>, <code>RRInterface::crunchEmote</code>, <code>RRInterface::contains</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Per-avatar frozen receivedChatLog snapshots record delivered object and avatar local chat with copied speaker identity and displayed text. recvchat filters non-emote speech while preserving OOC and short slash gestures; recvemote replaces leading emotes with /me ... . Targeted rules match speaker UUID only, and support secure aliases. Self chat, owned attachments, owner chat and direct region messages bypass filtering. Owner commands are consumed. Secure global exceptions and permissive issuer scope are enforced. Default OOC and ellipsis settings are fixed; alternate settings and object-to-avatar name impersonation are outside this fixture.

- Global receive chat/emote add/remove, UUID exceptions, secure aliases and permissive issuer scope
- Targeted recvchatfrom/recvemotefrom speaker denials and secure aliases
- Object whisper/say/shout, owner chat and direct region chat; avatar local say
- Immutable per-avatar received-chat snapshots; simulator listens and send-action records remain independent

Reference symbols: <code>indra/newview/llviewermessage.cpp</code>: <code>process_chat_from_simulator</code>, <code>RlvHandler::filterChat</code>, <code>RlvHandler::isException</code>, <code>RlvBehaviourGenericHandler::onCommand</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvchat.test.ts](../packages/vitest/test/rlv-recvchat.test.ts).

### received-im

Forms: <code>@recvim[:&lt;uuid&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@recvim_sec[:&lt;uuid&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@recvimfrom:&lt;uuid&gt;=n&#124;add&#124;y&#124;rem</code>, <code>@recvimfrom_sec:&lt;uuid&gt;=n&#124;add&#124;y&#124;rem</code>.

Comparison: confirmed difference. Global recvim restrictions accept sender UUID exceptions; recvimfrom independently denies a sender. Secure global restrictions and permissive=n require issuer-scoped exceptions. Kokua replaces restricted avatar IM text with ...; Firestorm displays its default blocked-message notice. Scripted object IMs bypass these restrictions. Firestorm supports secure targeted aliases; Kokua does not.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Frozen receivedIMLog snapshots contain sender identity and displayed text. Online one-to-one avatar IMs delivered through World.sendAvatarIM become ... under recvim or recvimfrom. Ordinary UUID exceptions may come from any issuer; secure global restrictions and permissive=n require each restricting issuer to grant its own exception. Targeted denials override global exceptions. Scripted object IMs delivered through llInstantMessage bypass these filters. Secure targeted aliases, distance options, group IMs, offline delivery, privileged senders, automatic replies, custom viewer strings, name/location censoring and mute settings are outside this contract.

- Online one-to-one avatar IMs with profile-specific replacement text
- Global and secure recvim, sender UUID exceptions, permissive issuer scope
- Targeted recvimfrom UUID denials; add/remove aliases and clear
- Scripted object IM delivery; immutable per-avatar received IM snapshots

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::containsWithoutException</code>, <code>KokuaRLVExtras::cannotRecvIM</code>, <code>LLIMProcessing::processNewMessage</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Frozen receivedIMLog snapshots contain sender identity and displayed text. Online one-to-one avatar IMs delivered through World.sendAvatarIM display *** IM blocked by your viewer under recvim or recvimfrom. Ordinary UUID exceptions may come from any issuer; secure global restrictions and permissive=n require each restricting issuer to grant its own exception. Targeted denials override global exceptions. Secure targeted aliases require every secure issuer to list the sender; permissive=n extends that check to every targeted issuer. Scripted object IMs delivered through llInstantMessage bypass these filters. Distance options, group IMs, offline delivery, privileged senders, automatic replies, custom viewer strings, name/location censoring and mute settings are outside this contract.

- Online one-to-one avatar IMs with profile-specific replacement text
- Global and secure recvim, sender UUID exceptions, permissive issuer scope
- Targeted recvimfrom UUID denials and secure aliases; add/remove aliases and clear
- Scripted object IM delivery; immutable per-avatar received IM snapshots

Reference symbols: <code>indra/newview/llimprocessing.cpp</code>: <code>LLIMProcessing::processNewMessage</code>, <code>RlvActions::canReceiveIM</code>, <code>RlvHandler::isException</code>, <code>RlvBehaviourDictionary::RlvBehaviourDictionary</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-recvim.test.ts](../packages/vitest/test/rlv-recvim.test.ts).

### sent-im

Forms: <code>@sendim[:&lt;uuid&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@sendim_sec[:&lt;uuid&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@sendimto:&lt;uuid&gt;=n&#124;add&#124;y&#124;rem</code>, <code>@sendimto_sec:&lt;uuid&gt;=n&#124;add&#124;y&#124;rem</code>, <code>@startim[:&lt;uuid&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@startim_sec[:&lt;uuid&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@startimto:&lt;uuid&gt;=n&#124;add&#124;y&#124;rem</code>, <code>@startimto_sec:&lt;uuid&gt;=n&#124;add&#124;y&#124;rem</code>.

Comparison: confirmed difference. Global sendim and startim accept recipient UUID exceptions. Secure global rules and permissive=n require issuer-scoped grants. Targeted sendimto and startimto independently deny recipients. Firestorm also supports secure targeted aliases; Kokua does not. Start locks prevent new conversations; send locks replace outgoing text with the default blocked notice, which still reaches recipient receive filtering.

#### Kokua RLV 2.09.35.00

Support depth: enforced. World.attemptAvatarIM and fixture.sendIM return frozen AvatarIMAction outcomes; avatarIMLog exposes immutable snapshots. Online one-to-one conversations open on outgoing or incoming avatar IMs. Start locks block opening a new conversation; existing conversations can continue. Send locks replace text with *** IM blocked by sender's viewer and report blocked with deliveredMessage. Recipient recvim filtering follows sender filtering. Ordinary exceptions may come from any issuer; secure global locks and permissive=n require each restricting issuer to grant an exception. Targeted UUID denials override grants. Secure targeted aliases, distance options, group/offline IMs, closing sessions, long-message truncation/splitting, automatic replies and configurable strings are outside this contract.

- Global sendim/startim with UUID exceptions and secure issuer scope
- Targeted sendimto/startimto UUID denials; add/remove aliases and clear
- New and existing online one-to-one sessions; incoming conversations
- Frozen action outcomes with deciding restrictions; recipient received-IM delivery

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::containsWithoutException</code>, <code>KokuaRLVExtras::cannotSendIM</code>, <code>LLFloaterIMSession::sendMsg</code>, <code>LLIMMgr::addSession</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. World.attemptAvatarIM and fixture.sendIM return frozen AvatarIMAction outcomes; avatarIMLog exposes immutable snapshots. Online one-to-one conversations open on outgoing or incoming avatar IMs. Start locks block opening a new conversation; existing conversations can continue. Send locks replace text with *** IM blocked by sender's viewer and report blocked with deliveredMessage. Recipient recvim filtering follows sender filtering. Ordinary exceptions may come from any issuer; secure global locks and permissive=n require each restricting issuer to grant an exception. Targeted UUID denials override grants. Secure targeted aliases require every secure issuer to list the recipient; permissive=n extends this check to every targeted issuer. Distance options, group/offline IMs, closing sessions, long-message truncation/splitting, automatic replies and configurable strings are outside this contract.

- Global sendim/startim with UUID exceptions and secure issuer scope
- Targeted sendimto/startimto UUID denials and secure aliases; add/remove aliases and clear
- New and existing online one-to-one sessions; incoming conversations
- Frozen action outcomes with deciding restrictions; recipient received-IM delivery

Reference symbols: <code>indra/newview/rlvactions.cpp</code>: <code>RlvActions::canSendIM</code>, <code>RlvActions::canStartIM</code>, <code>RlvHandler::isException</code>, <code>FSFloaterIM::sendMsg</code>, <code>RlvBehaviourDictionary::RlvBehaviourDictionary</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendim.test.ts](../packages/vitest/test/rlv-sendim.test.ts).

### sendchannel_except

Forms: <code>@sendchannel_except[:&lt;channel&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@sendchannel_except_sec[:&lt;channel&gt;]=n&#124;add&#124;y&#124;rem</code>.

Comparison: confirmed difference. This is a channel exclusion list, independent of sendchannel grants. Kokua directly denies each literal outgoing channel listed; RLVa requires the no-option switch and accepts positive numeric option prefixes. Its secure form requires each secure issuer to list the channel; permissive=n extends this to every activating issuer. Kokua has no secure form. Channel zero bypasses this family.

#### Kokua RLV 2.09.35.00

Support depth: enforced. A sendchannel_except:<channel> rule denies that literal decimal channel regardless of sendchannel exceptions or issuer. The no-option rule has no action effect. The secure form is unsupported. Public chat and automatic replies are unaffected.

- Literal signed integer channel exclusions
- No-option inert rule, add/remove and clear
- Channel exclusions override ordinary and secure sendchannel grants

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::contains</code>, <code>RRInterface::add</code>, <code>RRInterface::remove</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. A no-option sendchannel_except restriction activates the exclusion list. Listed positive numeric channels are denied independently of sendchannel grants and issuer. Removing the last no-option switch deactivates the list. The secure form requires a channel entry from each secure issuer; permissive=n requires one from every activating issuer. Public chat and automatic replies are unaffected.

- Positive signed 32-bit decimal-prefix channel exclusions
- No-option activation switch, add/remove and clear
- Secure alias and permissive issuer scope
- Channel exclusions override ordinary and secure sendchannel grants

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvBehaviourSendChannelHandler::onCommand</code>, <code>RlvHandler::isException</code>, <code>RlvHandler::isPermissive</code>, <code>RlvActions::canSendChannel</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchat.test.ts](../packages/vitest/test/rlv-sendchat.test.ts).

### sendchannel

Forms: <code>@sendchannel[:&lt;channel&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@sendchannel_sec[:&lt;channel&gt;]=n&#124;add&#124;y&#124;rem</code>, <code>@permissive=n&#124;add&#124;y&#124;rem</code>.

Comparison: confirmed difference. Both profiles share ordinary cross-prim exceptions, issuer-scoped secure exceptions and permissive=n narrowing all sendchannel exceptions to their own issuers. RLVa parses positive decimal option prefixes; Kokua matches literal decimal channel text.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Ordinary restrictions accept an exception from any prim. Every secure issuer needs an ordinary or secure exception on that same prim. With permissive=n every restricting issuer needs its own exception. Options match the literal decimal outgoing channel. Other permissive command families remain unsupported.

- Positive private-channel avatar say via sendAvatarChat
- No-option sendchannel/sendchannel_sec blocks and literal channel exceptions
- No-option permissive scoped to sendchannel
- Channel zero bypasses sendchannel; denied attempts are logged without delivery

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::containsWithoutException</code>, <code>RRInterface::contains</code>, <code>RRInterface::isAllowed</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Ordinary restrictions accept an exception from any prim. Every secure issuer needs its own exception; with permissive=n every restricting issuer does. Exceptions accept positive signed 32-bit decimal prefixes; zero, negative and invalid options are rejected. Ordinary and secure option forms grant the same channel exception. Other permissive command families remain unsupported.

- Positive private-channel avatar say via sendAvatarChat
- No-option sendchannel/sendchannel_sec blocks and numeric channel exceptions
- No-option permissive scoped to sendchannel
- Channel zero bypasses sendchannel; denied attempts are logged without delivery

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::isException</code>, <code>RlvHandler::isPermissive</code>, <code>RlvBehaviourSendChannelHandler::onCommand</code>, <code>RlvActions::canSendChannel</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sendchannel.test.ts](../packages/vitest/test/rlv-sendchannel.test.ts).

### status

Forms: <code>@getstatus[:&lt;filter&gt;[;&lt;separator&gt;]]=&lt;channel&gt;</code>, <code>@getstatusall[:&lt;filter&gt;[;&lt;separator&gt;]]=&lt;channel&gt;</code>.

Comparison: confirmed difference. Both profiles return canonical rule text with a leading separator for every match and an empty reply for no matches. Rules retain insertion order within each prim; getstatusall visits emitter UUIDs in ascending order and preserves cross-prim duplicates. Extra semicolons differ between profiles.

#### Kokua RLV 2.09.35.00

Support depth: enforced. First semicolon separates the substring filter from the entire remaining separator string; empty separator defaults to slash. Queries include only stored rules, including options and unsupported wire rules, without enforcing their effects.

- Caller-prim getstatus and avatar-wide getstatusall on valid reply channels
- Canonical rule substring filters, default and custom separators, empty replies
- Per-prim insertion order and ascending emitter UUID order with duplicates retained

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::getStatus</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. First two semicolon-delimited fields set substring filter and separator; later fields are ignored; empty separator defaults to slash. Queries include only stored rules and do not extend restriction support.

- Caller-prim getstatus and avatar-wide getstatusall on valid reply channels
- Canonical rule substring filters, default and custom separators, empty replies
- Per-prim insertion order and ascending emitter UUID order with duplicates retained

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>rlvParseGetStatusOption</code>, <code>RlvHandler::processReplyCommand</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-status.test.ts](../packages/vitest/test/rlv-status.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts).

### getinv

Forms: <code>@getinv[:&lt;path&gt;]=&lt;channel&gt;</code>.

Comparison: confirmed difference. Both profiles list nonempty non-hidden direct folder names, preserve inventory order and duplicates, omit items, and return empty messages for absent roots, empty folders and unknown paths. Comma names pass through as wire text, as the wiki warns. Both use case-insensitive partial lookup with exact-name priority and skip empty path segments. Kokua excludes hidden paths, selects the last exact duplicate, supports slash-bearing folder names using longest path spans, and strips pipe suffixes. RLVa permits exact hidden paths, selects the first exact duplicate, and excludes slash-bearing and folded folders from listings. Folded state depends on legacy naming and is an explicit fixture flag.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Queries enumerate only the explicit avatar shared root and descendants. Kokua filters empty and dot-prefixed names. Longest matching path spans win; equal spans prefer later exact matches. Slash-only nonempty paths return empty results. Prim inventory stays separate; explicitly accepted folder offers can append fixture content.

- Root and nested getinv on valid reply channels, including empty replies
- Case-insensitive partial paths, exact-name priority, duplicate names, slash names and pipe suffixes
- Per-avatar seeded inventory with stable IDs, parents, explicit shared root and immutable snapshots

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::getInventoryList</code>, <code>RRInterface::getCategoryUnderRlvShare</code>, <code>match</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Queries enumerate only the explicit avatar shared root and descendants. RLVa filters empty, hidden, slash-bearing and effectively folded names. Path segments choose the first exact match or first non-hidden partial match. Hidden exact paths remain queryable. Effective folded state is supplied per folder; naming inference and viewer setting overrides are outside the fixture.

- Root and nested getinv on valid reply channels, including empty replies
- Case-insensitive exact and partial paths, first exact duplicate, hidden exact paths and empty segments
- Per-avatar seeded inventory with stable IDs, parents, explicit shared root, effective folded flags and immutable snapshots

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::onGetInv</code>, <code>RlvInventory::getSharedFolder</code>, <code>RlvInventory::isFoldedFolder</code>, <code>RLV_FOLDER_INVALID_CHARS</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getinv.test.ts](../packages/vitest/test/rlv-getinv.test.ts).

### inventory-offers

Forms: <code>Explicit accept or decline of captured llGiveInventoryList avatar offers</code>.

Comparison: confirmed difference. Both profiles require an explicit fixture decision and shared-routing opt-in. Prefix matching is case-sensitive. Parents are reused by exact case-insensitive name; every leaf offer creates a distinct folder. Kokua notifies all supported folder decisions using the original offer name. RLVa notifies only #RLV/~ offers, reporting the final path after successful shared routing. No acceptance wears content.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Accepted #RLV/~ folders route under an existing shared root unless forbidden. Nested paths skip empty segments without a depth limit. Missing roots and disallowed routing retain ordinary inventory. Accepted and declined notifications include the original folder name. Single-item and llGiveAgentInventory offers remain unsupported.

- Pending avatar folder offers, explicit accept/decline, recipient identity and one decision per offer
- Shared or ordinary inventory, missing shared root, nested parents and duplicate leaves
- Original-name offer notifications through notify channel and filter rules; transferred item metadata retained, including object definitions and modify permissions for subsequent queries and explicit wear

Reference symbols: <code>indra/newview/llinventorymodel.cpp</code>: <code>LLInventoryModel::processBulkUpdateInventory</code>, <code>buildRLVPathAndMove</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Accepted #RLV/~ folders create a missing shared root and route paths of up to four segments including #RLV. Deeper paths remain unrenamed at the initial destination without an acceptance notification. Disallowed routing sends accepted_in_inv; declines send declined with the original name. Other folder names do not send offer notifications. Single-item and llGiveAgentInventory offers remain unsupported.

- Pending avatar folder offers, explicit accept/decline, recipient identity and one decision per offer
- Shared or ordinary inventory, missing-root creation, nested parents, duplicate leaves and path-depth outcomes
- Final-path shared acceptance and original-name ordinary acceptance/decline notifications through notify transport; object definitions and modify permissions retained for later queries and explicit wear

Reference symbols: <code>indra/newview/rlvinventory.cpp</code>: <code>RlvGiveToRLVOffer::createDestinationFolder</code>, <code>RlvGiveToRLVTaskOffer::onOfferCompleted</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-offers.test.ts](../packages/vitest/test/rlv-offers.test.ts).

### getoutfit

Forms: <code>@getoutfit[:&lt;layer&gt;]=&lt;channel&gt;</code>.

Comparison: confirmed difference. Both profiles return clothing and bodypart occupancy in the reference layer order, including universal after physics. There is no reserved leading bit. Named layers return one bit. Kokua falls back to the full bitmap for an invalid layer; RLVa sends an empty failed-option reply. Seeded state is explicit, including shape, skin, hair and eyes; no bodyparts are fabricated. RLVa uses RlvHideLockedLayers=false; setting overrides are unsupported.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Reads worn wearable IDs, including unshared items and multiple items per layer. Unknown selectors return the full 17-bit bitmap. No force wear, removal, rendering, baking or automatic bodypart replacement is modeled.

- Full and named-layer occupancy, empty layers, bodyparts, universal and invalid selectors
- Per-avatar explicit wearable type and worn item IDs, with immediate fixture updates

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::getOutfit</code>, <code>RRInterface::getOutfitLayerAsType</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Reads the same explicit wearable state with RlvHideLockedLayers=false. Invalid selectors return empty with failed-option. Lock-filter overrides, force wear and removal, rendering, baking and automatic bodypart replacement are unsupported.

- Full and named-layer occupancy in reference order, including bodyparts and universal
- Default locked-layer visibility and invalid-selector empty replies with failed-option

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::onGetOutfit</code>, <code>RlvSettings::getHideLockedLayers</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-outfit.test.ts](../packages/vitest/test/rlv-outfit.test.ts).

### getinvworn

Forms: <code>@getinvworn[:&lt;path&gt;]=&lt;channel&gt;</code>.

Comparison: confirmed difference. Two digits describe direct and descendant wearable occupancy: 0 empty, 1 none worn, 2 some worn, 3 all worn. Clothing, bodyparts and mapped live attachments count together. Kokua preserves inventory order and ignores direct shared-root items; single no-mod named-point object folders use its 10/30 sentinel mapping. RLVa orders child folders by UUID, counts direct root items, and folds effective folders into their parents. Commas and slash-bearing child names remain unescaped. Inventory links and gestures are outside the fixture.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Uses existing shared-path lookup and inventory child order. Hidden normal subtrees do not contribute, but no-mod named-point object children contribute directly to non-root parents and retain Kokua descendant scoring. Direct no-mod queries return 10 or 30. Missing paths and absent roots reply empty. Object type and modify permission are explicit; mapped objects also retain their existing identity.

- Direct and recursive empty/none/some/all worn codes with mixed clothing and live attachments
- Shared-root policy, hidden folders, no-mod sentinel aggregation, stable identities and wire names

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::getInventoryList</code>, <code>RRInterface::getWornItems</code>, <code>RRInterface::findAttachmentPointFromName</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Uses explicit effective folded flags and RLVaEnableSharedWear=true. A folded child with exactly one object contributes direct items to its parent, excluding clothing or bodyparts with nostrip in the item or folded ancestry through the first non-folded parent; other folded children and hidden normal subtrees do not contribute. Visible normal descendants contribute recursively. A directly selected folded folder becomes the collection root: its direct wearable items count normally, and its visible child folders retain their own scores. Missing paths reply empty with failed-option; absent roots reply empty. Automatic naming inference, setting overrides, gestures and inventory links are unsupported.

- Direct and recursive worn codes, UUID child order, mixed live attachments and wearables
- Explicit effective folding under the containing folder and direct folded-folder root queries

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::onGetInvWorn</code>, <code>RlvWearableItemCollector</code>, <code>RlvForceWear::isWearingItem</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-outfit.test.ts](../packages/vitest/test/rlv-outfit.test.ts).

### findfolder

Forms: <code>@findfolder:&lt;criteria&gt;=&lt;channel&gt;</code>, <code>@findfolders:&lt;criteria&gt;[;&lt;separator&gt;]=&lt;channel&gt;</code>.

Comparison: confirmed difference. Both search case-insensitive folder names with all nonempty && terms and preserve inventory traversal order without escaping commas. Kokua visits children before their parent, skips hidden and tilde-prefixed subtrees, and findfolder returns the first match. RLVa visits parents first, traverses hidden and tilde-prefixed folders without matching them, excludes slash names, and findfolder chooses the deepest match with first ties. Only Kokua accepts a custom findfolders separator.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Depth-first postorder matches may include the shared root as an empty path. findfolder with empty criteria returns the first eligible folder. findfolders with no option returns empty; otherwise the first two nonempty semicolon fields select criteria and separator. Hidden and dropped subtrees are skipped.

- Single and multiple shared-folder searches, nested and duplicate names, empty results
- All nonempty && terms, postorder traversal, first match and custom separators

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::findCategoryUnderRlvShare</code>, <code>RRInterface::findCategoriesUnderRlvShare</code>, <code>RRInterface::reallyHandleCommand</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Preorder search excludes the shared root from matches. findfolder returns the first match at the greatest slash depth. findfolders uses commas. Hidden, tilde-prefixed and slash-bearing names cannot match, but their children remain searchable. Empty options reply empty with failed-option; && alone matches nothing.

- Single and multiple shared-folder searches, deepest selection and traversal order
- All nonempty && terms, hidden and dropped descendants, empty replies and invalid empty options

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::onFindFolder</code>, <code>RlvInventory::findSharedFolders</code>, <code>RlvCriteriaCategoryCollector</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-findfolder.test.ts](../packages/vitest/test/rlv-findfolder.test.ts).

### getpath

Forms: <code>@getpath[:&lt;attachment-point-or-object-uuid&gt;]=&lt;channel&gt;</code>, <code>@getpathnew[:&lt;attachment-point-or-object-uuid&gt;]=&lt;channel&gt;</code>.

Comparison: confirmed difference. Both query the containing shared path of a worn attachment by issuer, point or object UUID. Inventory UUIDs never select an attachment. getpath selects the first point result and getpathnew lists all, preserving live attachment order. Unshared items expose no path. Kokua retains empty positions for point attachments without shared items; RLVa omits them. Outfit-layer selectors remain unsupported until an outfit fixture exists.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Uses explicit item-to-root mappings and current avatar attachment state. Point getpath stops at the first attachment, including an empty unshared slot; getpathnew retains those slots. Item identity is independent of repeated names. Fixtures describe modifiable attachments; no-mod folder-name inference and inventory links are outside the covered forms.

- Modifiable attachment issuer, point and object UUID queries with shared-root containment
- Live attachment order and lifecycle, duplicate item names and empty results

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::getFullPath</code>, <code>RRInterface::getItem</code>, <code>RRInterface::getItemAux</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Uses the same explicit mapping and live attachment order. Only shared inventory items contribute paths. An effectively folded containing folder contributes its parent path. Invalid selectors return empty with failed-option. Outfit layers and inventory links remain outside the fixture.

- Attachment issuer, named point and owned object UUID queries with shared-root containment
- Live attachment order and lifecycle, duplicate names, effective folded folders and empty results

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::onGetPath</code>, <code>RlvCommandOptionGetPath</code>, <code>RlvInventory::getPath</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-findfolder.test.ts](../packages/vitest/test/rlv-findfolder.test.ts).

### forcewear

Forms: <code>@attach:&lt;folder&gt;=force</code>, <code>@attachover:&lt;folder&gt;=force</code>, <code>@attachoverorreplace:&lt;folder&gt;=force</code>.

Comparison: confirmed difference. Shared direct attachment items use add or replace semantics. Both profiles honor the default + folder prefix. Kokua always adds unnamed items; RLVa shared wear replaces at their saved point and can be disabled. Clothing, recursive commands and multiple-folder options are unsupported.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Named items replace for attach and attachoverorreplace; attachover and + prefixed folders add. The rightmost recognized parenthesised point wins without trimming. Unnamed direct items always add at their saved point, default Right Hand. Single no-mod object children in point-named folders use the child folder point. Replace respects every occupant detach lock. Already-worn items retain identity. Fixture order determines sequential replacement; definitions and script state survive wear and detach.

- Direct shared attachment definitions and existing mapped live attachments
- Add/replace, named and saved points, + folders and single no-mod folded children
- No-option and point locks, queued attachment lifecycle and per-item action outcomes; clothing, folder locks and recursive/multiple-folder forms excluded

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::forceAttach</code>, <code>RRInterface::findAttachmentPointFromName</code>, <code>RRInterface::findAttachmentPointFromParentName</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Attach and attachoverorreplace replace; attachover and + prefixed folders add. Named replace retains the last pending item per point; final pending requests follow inventory item UUID order. The last parenthesised item text is trimmed; legacy folder names provide fallback and take precedence for no-mod items. Explicit folded children with one object contribute attachments. Shared wear defaults on and accepts unnamed items at their saved point, default Right Hand; inventory.sharedWear=false skips them. Named replacement is blocked by any occupant detach lock. Unnamed replacement retains locked occupants and removes unlocked ones. Already-worn items retain identity.

- Direct shared attachment definitions and existing mapped live attachments
- Add/replace, named and saved points, default shared-wear setting and its disabled value, + folders and single-object folded children
- No-option and point locks, queued attachment lifecycle and per-item action outcomes; clothing, folder locks and recursive/multiple-folder forms excluded

Reference symbols: <code>indra/newview/rlvhelper.cpp</code>: <code>RlvForceWear::forceFolder</code>, <code>RlvForceWear::addAttachment</code>, <code>RlvForceWear::updatePendingAttachments</code>, <code>RlvWearableItemCollector</code>, <code>RlvAttachPtLookup::getAttachPointIndex</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forcewear.test.ts](../packages/vitest/test/rlv-forcewear.test.ts).

### forceremove

Forms: <code>@detach:&lt;shared-path&gt;=force</code>, <code>@remoutfit[:&lt;layer&gt;]=force</code>, <code>@addoutfit[:&lt;layer&gt;]=n&#124;y</code>, <code>@remoutfit[:&lt;layer&gt;]=n&#124;y</code>.

Comparison: confirmed difference. Shared: direct folder attachments and selected clothing layers are removable; skin, eyes, hair and shape remain worn. Both profiles respect every layer and attachment lock, including the force issuer. Confirmed difference: Kokua layer removal checks ancestor folder names for nostrip, case insensitively, but ignores item-name nostrip; RLVa checks the item and parent name case sensitively and ascends through folded parents. Wiki also describes folder clothing removal and recursive forms; those forms remain unsupported here.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Direct folder attachments plus single no-mod objects in point-named children can be removed. Ordinary descendants survive. Layer and bare removal affect clothing only, across shared and unshared inventory. Force commands do not bypass issuer locks. Folder removal honors item and ancestor nostrip names case insensitively; layer removal honors ancestor folders only. Invalid layer/path options are inert. Explicit clothing add/remove fixture actions honor global and named layer locks. Folder clothing, remoutfit folder forms, folder locks, recursive forms and inventory links are unsupported.

- Direct folder attachment removal with per-item results and subsequent query updates
- Selected and all clothing layer removal; nonremovable bodyparts
- Global and named add/remove layer locks, multiple issuers and no force-issuer exemption
- Case-insensitive folder protection and layer item-name exemption

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::force</code>, <code>RRInterface::forceDetachByName</code>, <code>RRInterface::removeItemFromAvatar</code>, <code>RRInterface::canUnwear</code>, <code>RRInterface::canDetachCategoryAux</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Direct folder attachments plus object items in effective folded children can be removed; ordinary descendants survive. Folder item results follow inventory UUID order. Layer and bare removal affect clothing only, across shared and unshared inventory. Every issuer lock remains effective; a registered valid bridge stays attached. Item and parent nostrip names are case sensitive, ascending through folded parents. Invalid layer/path options fail. Explicit clothing add/remove fixture actions honor global and named layer locks. Folder clothing, remoutfit folder forms, group removal, folder locks, recursive forms and inventory links are unsupported.

- Direct and folded folder attachment removal with deterministic per-item results
- Selected and all clothing layer removal; nonremovable bodyparts
- Global and named add/remove layer locks, multiple issuers and no force-issuer exemption
- Case-sensitive item and parent-folder protection; explicit unsupported mixed contents

Reference symbols: <code>indra/newview/rlvhelper.cpp</code>: <code>RlvForceWear::forceFolder</code>, <code>RlvForceWear::forceRemove</code>, <code>RlvForceWear::isForceDetachable</code>, <code>RlvForceWear::isForceRemovable</code>, <code>RlvForceWear::isStrippable</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-forceremove.test.ts](../packages/vitest/test/rlv-forceremove.test.ts).

### getattach

Forms: <code>@getattach[:&lt;point&gt;]=&lt;channel&gt;</code>.

Comparison: version/setting dependent. Both profiles return a reserved leading zero followed by occupancy for points 1 through 55, or one bit for a named point. Duplicate objects occupy one bit. Root aliases Avatar Center. Invalid names return empty text; RLVa also records a failed-option outcome. The fixture uses the RLVa reference hide-locked default false; lock-filter setting overrides are unsupported.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Reads existing live linkset attachments for the queried avatar, including HUDs and any bridge fixture. Names match the canonical point table without trimming; root aliases Avatar Center. Uses the shared reply-channel policy.

- Full 56-character bitmap in attachment-ID order
- Named and empty-point queries, root alias, invalid-name empty replies
- Actual attachment, detachment and duplicate point occupancy, including HUDs

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::getAttachments</code>, <code>RRInterface::reallyHandleCommand</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Reads the same occupancy with RlvHideLockedAttachments=false. An explicitly identified valid bridge at Center 2 is excluded; absent bridges never create occupancy. Lock-filter overrides and lock enforcement are outside the covered forms.

- Full 56-character bitmap in attachment-ID order
- Named and empty-point queries, root alias, invalid-name empty replies
- Actual attachment, detachment and duplicate point occupancy, including HUDs
- Explicit valid bridge identity and reference hide-locked default false

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::onGetAttach</code>, <code>RlvAttachPtLookup::initLookupTable</code>, <code>RlvSettings::getHideLockedAttach</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getattach.test.ts](../packages/vitest/test/rlv-getattach.test.ts).

### getattachnames

Forms: <code>@getattachnames[:&lt;group&gt;]=&lt;channel&gt;</code>.

Comparison: confirmed difference. The RLV wiki does not specify getattachnames. RLVa returns occupied point names once each in attachment-ID order; Kokua has no query handler. RLVa recognizes head, torso, arms, legs and hud; other options select all points. Its hud group is viewer group 8, including Jaw and newer skeleton points, while HUD points are group 9.

#### Kokua RLV 2.09.35.00

Support depth: unsupported. No getattachnames query handler; no reply is synthesized and the command remains inspectably unsupported.


Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::reallyHandleCommand</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Capitalized canonical names are comma-separated in ascending attachment-ID order. Empty occupancy produces an empty reply. Group filters use viewer group IDs; unknown options include all groups. A registered valid bridge is excluded, and locked objects remain visible.

- All occupied attachment point names, once per point
- head/torso/arms/legs/hud group filters and unknown-option all-points fallback
- Valid empty replies and explicit valid bridge exclusion

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::onGetAttachNames</code>, <code>rlvAttachGroupFromIndex</code>, <code>rlvAttachGroupFromString</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getattach.test.ts](../packages/vitest/test/rlv-getattach.test.ts).

### detach

Forms: <code>@detach[:&lt;point&gt;]=n&#124;add</code>, <code>@detach[:&lt;point&gt;]=y&#124;rem</code>, <code>@detach[:&lt;point&#124;uuid&gt;]=force</code>, <code>@detachme[:&lt;option&gt;]=force</code>.

Comparison: confirmed difference. Wiki describes attachment-local locks and ordered clear/self-detach, without specifying child emitter or malformed-option handling. No-option locks protect the containing attachment and remain scoped to the issuing prim. Self-detach respects every root and child lock, including its own. Kokua resolves a child emitter to its attachment and ignores detachme options. RLVa child self-detach is inert and nonempty options fail. Named detach locks deny removal in both profiles and additionally deny adding in RLVa. Bare, named point and UUID force removal preserve every issuer lock. Root is an alias for Avatar Center. Simulator detach is separate from a viewer detach attempt; forced reattachment recovery is excluded.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Root and child no-option detach locks deny viewer attempts on their attachment until the last relevant issuer removes its lock. detachme resolves the containing attachment, ignores options and respects all of its locks. Unlocked self-detach queues simulator completion and attach(NULL_KEY), surviving issuer script removal. Named detach locks deny removal at the selected point; adding there remains allowed. Bare, point and object UUID force detach respect locks and nostrip protection. Point and all-point target selection uses current attachments and excludes pending wear requests. Child UUIDs resolve to the containing attachment. Forced reattachment recovery is unsupported. Direct shared-folder removal has a separate contract.

- No-option and named point detach n/add and y/rem with per-prim locks
- Bare and point force removal, root and child UUID selection with lock and nostrip checks; point locks deny removal only
- Explicit viewer detach attempt and queued force self-detach from root or child
- Ignored detachme options, lock denial, attach events and llGetAttached state
- Simulator detach remains independent of viewer locks

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::force</code>, <code>RRInterface::forceDetachByUuid</code>, <code>RRInterface::canDetachWithExplanation</code>, <code>RRInterface::detachObject</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Root and child no-option detach locks deny viewer attempts on the containing attachment. Root detachme respects all its locks; unlocked root self-detach queues simulator completion and attach(NULL_KEY), surviving issuer script removal. Child detachme is a successful no-op, even unlocked; nonempty options fail. Named detach locks deny both adding and removing at the selected point. Bare, point and root UUID force detach respect locks, nostrip and bridge protection. Point and all-point target selection uses current attachments and excludes pending wear requests. Child UUID force removal, bridge exemption settings and forced reattachment recovery are unsupported. Direct shared-folder removal has a separate contract.

- No-option and named point detach n/add and y/rem with root and child issuer locks
- Bare, point and root UUID force removal with lock, nostrip and bridge checks; point locks deny add and remove
- Explicit viewer detach attempt and queued root force self-detach
- Child self-detach no-op, rejected nonempty options, attach events and llGetAttached state
- Simulator detach remains independent of viewer locks

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvBehaviourHandler&lt;RLV_BHVR_DETACH&gt;::onCommand</code>, <code>RlvForceHandler&lt;RLV_BHVR_DETACHME&gt;::onCommand</code>, <code>LLVOAvatarSelf::detachAttachmentIntoInventory</code>, <code>RlvAttachmentLocks::canDetach</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts)<br>[rlv-detach.test.ts](../packages/vitest/test/rlv-detach.test.ts)<br>[rlv-relay.test.ts](../packages/vitest/test/rlv-relay.test.ts).

### attachment-point-locks

Forms: <code>@addattach[:&lt;point&gt;]=n&#124;y</code>, <code>@remattach[:&lt;point&gt;]=n&#124;y</code>, <code>@remattach[:&lt;point&#124;uuid&#124;shared-path&gt;]=force</code>.

Comparison: shared. Global and named addattach/remattach locks deny adding/removing attachments at their points, including force actions and replacement. Every issuer contributes independently. Remattach force is a synonym of detach; recursive, multiple-folder and group force removal remain unsupported.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Global or canonical named point addattach/remattach rules constrain explicit user wear/removal and force actions. Root aliases Avatar Center. Replacement cannot remove locked occupants; add remains possible at a remove-locked point. Remattach force shares the detach contract, including child UUID resolution. Unknown point options retain unsupported wire state. User attach requires an explicit canonical point; simulator attachment remains separate.

- Global and named point locks, root alias, independent issuers and clear
- Explicit user attach/add/replace and detach; force wear and removal honor locks
- Named, remembered and default force-wear points; remattach force alias

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::canAttachWithExplanation</code>, <code>RRInterface::canDetachWithExplanation</code>, <code>RRInterface::force</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Global or canonical named point addattach/remattach rules constrain explicit user wear/removal and force actions. Root aliases Avatar Center. Replacement cannot remove locked occupants; add remains possible at a remove-locked point. Remattach force shares the detach contract; child UUID removal remains unsupported. Invalid point lock options have no effect. User attach requires an explicit canonical point; simulator attachment remains separate.

- Global and named point locks, root alias, independent issuers and clear
- Explicit user attach/add/replace and detach; force wear and removal honor locks
- Named, remembered and default force-wear points; remattach force alias

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvBehaviourAddRemAttachHandler::onCommand</code>, <code>RlvForceRemAttachHandler::onCommand</code>, <code>RlvAttachmentLocks::canAttach</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts).

### getaddattachnames

Forms: <code>@getaddattachnames[:&lt;group&gt;]=&lt;channel&gt;</code>.

Comparison: confirmed difference. RLVa returns canonical point names in attachment-ID order, with the same group filters as getattachnames. Kokua has no handler. Add names include points where add is permitted, even when replacement is blocked; removal names require at least one force-removable occupant.

#### Kokua RLV 2.09.35.00

Support depth: unsupported. No query handler; the command stays inspectably unsupported without a synthesized reply.


Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::reallyHandleCommand</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Comma-separated capitalized canonical point names follow attachment-ID order. Add names exclude add-locked points. Removal names require at least one occupant without detach/point locks, nostrip or bridge protection. No force-issuer exemption applies. Head, torso, arms, legs and hud filters use viewer groups; unknown options include every group. Empty results reply with empty text.

- Available add or force-removable points with lock checks
- Canonical capitalization, ordering, duplicate occupancy, empty replies and group filters
- Explicit unsupported Kokua queries and RLVa getcommand discovery

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::onGetAttachNames</code>, <code>RlvAttachmentLocks::canAttach</code>, <code>RlvForceWear::isForceDetachable</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts).

### getremattachnames

Forms: <code>@getremattachnames[:&lt;group&gt;]=&lt;channel&gt;</code>.

Comparison: confirmed difference. RLVa returns canonical point names in attachment-ID order, with the same group filters as getattachnames. Kokua has no handler. Add names include points where add is permitted, even when replacement is blocked; removal names require at least one force-removable occupant.

#### Kokua RLV 2.09.35.00

Support depth: unsupported. No query handler; the command stays inspectably unsupported without a synthesized reply.


Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::reallyHandleCommand</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Comma-separated capitalized canonical point names follow attachment-ID order. Add names exclude add-locked points. Removal names require at least one occupant without detach/point locks, nostrip or bridge protection. No force-issuer exemption applies. Head, torso, arms, legs and hud filters use viewer groups; unknown options include every group. Empty results reply with empty text.

- Available add or force-removable points with lock checks
- Canonical capitalization, ordering, duplicate occupancy, empty replies and group filters
- Explicit unsupported Kokua queries and RLVa getcommand discovery

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::onGetAttachNames</code>, <code>RlvAttachmentLocks::canAttach</code>, <code>RlvForceWear::isForceDetachable</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-pointlocks.test.ts](../packages/vitest/test/rlv-pointlocks.test.ts).

### seating

Forms: <code>@getsitid[:&lt;option&gt;]=&lt;channel&gt;</code>, <code>@sit[:&lt;uuid&gt;]=force</code>, <code>@unsit=force</code>, <code>@sit=n&#124;y</code>, <code>@unsit=n&#124;y</code>, <code>@sittp[:&lt;distance&gt;]=n&#124;y</code>.

Comparison: confirmed difference. Both profiles enforce user sit/stand locks without issuer exceptions and combine sittp distances by minimum with a strict 1.5 m default boundary. Kokua compares signed distance; RLVa compares its square. Both profiles return null standing and the object root when seated. RLVa ground sitting reports the avatar UUID. Empty/null sit requests ground sitting in RLVa and does nothing in Kokua. Object force sit respects sit and seated unsit locks; RLVa force unsit and ground sit exempt the issuing prim.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Explicit user actions enforce sit, seated unsit and the minimum signed sittp limit at the clicked global point. Finite decimal prefixes use float precision; invalid decimal text means zero. Non-finite, hexadecimal and overflow distance forms remain unsupported. Simulator seating and llUnSit bypass viewer locks. getsitid ignores options and uses normal reply channels. Force sit bypasses sittp and uses free configured targets or nearby plain prims in the same region. Empty/null sit has no target and leaves state unchanged. Force unsit respects every unsit lock, including its emitter. No script permissions are granted. Plain-prim surface placement beyond an 8 m centre-distance fixture radius, collision, autopilot, cross-region seating and standtp are unsupported.

- Explicit user sit/stand, independent issuers and strict default/custom sittp boundaries
- Simulator and force action separation
- Standing, object-root and ground getsitid replies
- UUID force sit with world occupancy, region, attachment and lifetime checks
- Empty/null sit without movement
- Force unsit with global lock checks
- Action outcomes and normal changed events without script permission grants

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::getSitTargetId</code>, <code>RRInterface::force</code>, <code>force_sit</code>, <code>RRInterface::getMin</code>, <code>handle_object_sit_or_stand</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Explicit user actions enforce sit, seated unsit and the minimum sittp limit squared at the clicked global point. Finite decimal prefixes use float precision; malformed text and float underflow are unsupported. Non-finite, hexadecimal and overflow distance forms remain unsupported. Simulator seating and llUnSit bypass viewer locks. Force sit bypasses sittp. getsitid ignores options and uses normal reply channels; ground sitting returns the avatar UUID. Empty/null sit requests ground sitting. Force unsit and ground sit exempt only the issuing prim from locks; object force sit exempts no emitter. Same-region free configured targets and plain prims within an 8 m centre-distance fixture radius update world seating. Farther plain-prim surface placement, collision, autopilot, cross-region seating and standtp are unsupported. No script permissions are granted.

- Explicit user sit/stand, independent issuers and strict default/custom sittp boundaries
- Simulator and force action separation
- Standing, object-root and avatar-UUID ground getsitid replies
- UUID and empty/null ground force sit with action outcomes
- World occupancy, region, attachment and lifetime checks
- Force unsit and ground-sit issuer exceptions
- Normal changed events without script permission grants

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::processReplyCommand</code>, <code>RlvForceHandler&lt;RLV_BHVR_SIT&gt;::onCommand</code>, <code>RlvForceHandler&lt;RLV_BHVR_SITGROUND&gt;::onCommand</code>, <code>RlvHandler::processForceCommand</code>, <code>RlvActions::canSit</code>, <code>RlvActions::canGroundSit</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-sit.test.ts](../packages/vitest/test/rlv-sit.test.ts)<br>[rlv-sit-enforce.test.ts](../packages/vitest/test/rlv-sit-enforce.test.ts).

### teleport

Forms: <code>@tpto:&lt;x&gt;/&lt;y&gt;/&lt;z&gt;[;&lt;angle&gt;]=force</code>, <code>@tpto:&lt;region&gt;/&lt;x&gt;/&lt;y&gt;/&lt;z&gt;[;&lt;angle&gt;]=force</code>, <code>@tploc=n&#124;y</code>, <code>@tplocal[:&lt;distance&gt;]=n&#124;y</code>.

Comparison: confirmed difference. Both profiles resolve global and named-region locations. Kokua truncates coordinates and ignores the supplied facing angle. RLVa preserves fractions and applies the angle in radians. RLVa classifies local moves by XY distance below 256 m and checks XYZ distance against strict sittp and tplocal limits; its bare tplocal limit is 1.5 m and the maximum is 256 m. Kokua applies tploc to all moves and an inclusive tplocal distance in the same region.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Slash fields discard empties and pad to three; integer prefixes truncate fractions and invalid fields mean zero. Three fields are global, four name a region. Angles do not set facing. Bare issuer tploc, tplocal, unsit and sittp locks lift temporarily for global moves and are restored before named-region callbacks. Named angles preserve orientation and refuse any sittp lock. All location moves obey remaining tploc and seated unsit; same-region moves obey the inclusive signed minimum tplocal distance. Finite decimal forms are supported; non-finite, hexadecimal and overflowing conversions are unsupported. Unknown regions and uncovered coordinates refuse without changing avatar state. Teleport action records and normal stand events do not grant simulator permissions. Landing-point routing, terrain/collision offsets and camera pose are outside the fixture.

- Global and named-region coordinates, integer-prefix and partial-field parsing
- Issuer restoration, seated locks and profile-specific local distance checks
- Known-region boundaries, unknown-region refusal, action results and simulator permission separation

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::force</code>, <code>RRInterface::forceTeleport</code>, <code>RRInterface::forceTeleportCallback</code>, <code>RRInterface::getMin</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Global floating vectors are tried before four-field named-region vectors. Final coordinate suffixes and angle prefixes are accepted; malformed and empty angles fail. Extra semicolon fields are ignored. Angles in radians request a horizontal facing direction. Only the force issuer is exempt from lock presence checks; distance modifiers use the global minimum. Moves within 256 m in XY obey strict XYZ sittp and tplocal limits, including vertical moves and nearby region crossings. Bare tplocal defaults to 1.5 m and its maximum is 256 m. Longer moves obey tploc. All seated moves obey foreign unsit. tplm and UUID tploc options do not block or grant exceptions for location travel. Finite decimal forms are supported; non-finite, hexadecimal and overflow conversions are unsupported. Explicit World regions resolve case-insensitively with half-open boundaries; unknown destinations refuse without mutation. Actions stand normally without granting simulator permissions. Landing-point routing, terrain/collision offsets and camera pose are outside the fixture.

- Floating global and named-region destinations, prefix/suffix parsing and radian facing
- XYZ local limits, maximum distance, issuer exemptions and distant tploc locks
- Known-region boundaries, unknown-region refusal, seated actions and permission separation

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvForceHandler&lt;RLV_BHVR_TPTO&gt;::onCommand</code>, <code>RlvHandler::onTeleportCallback</code>, <code>RlvActions::isLocalTp</code>, <code>RlvActions::canTeleportToLocal</code>, <code>RlvActions::canTeleportToLocation</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-tpto.test.ts](../packages/vitest/test/rlv-tpto.test.ts).

### camera-fov

Forms: <code>@setcam_fov[:&lt;radians&gt;]=force</code>, <code>@setcam_fovmin:&lt;radians&gt;=n&#124;y</code>, <code>@setcam_fovmax:&lt;radians&gt;=n&#124;y</code>, <code>@getcam_fov=&lt;channel&gt;</code>, <code>@getcam_fovmin=&lt;channel&gt;</code>, <code>@getcam_fovmax=&lt;channel&gt;</code>.

Comparison: confirmed difference. Both profiles use radians and strongest issuer bounds. Precision, unset replies, malformed options, contradictory limits and final-limit removal differ. The fixture uses a 1.4242 viewport aspect ratio; rendered effects and exclusive camera control are unsupported.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Six-decimal queries round exact halves to even and use float zoom reciprocals; unset minimum/maximum are 0.000001/-0.000001. Empty limits mean 1.5, invalid numeric prefixes mean zero, and zero limits have no effect. Contradictory bounds collapse to the minimum FOV. Removal leaves the current lens unchanged. Force without an angle means zero, clamped to the viewport minimum. Queries ignore options. Camera tracking permission is still required for script FOV reads.

- Per-avatar force/query and user lens attempts
- Aggregated per-prim limits, removal, clear and emitter collection
- Numeric prefixes, empty and non-finite values, fixed viewport range
- Permission-gated llGetCameraFOV

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::force</code>, <code>RRInterface::updateCameraLimits</code>, <code>RRInterface::getMin</code>, <code>RRInterface::getMax</code>, <code>LLViewerCamera::setDefaultFOV</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Three-decimal queries round exact halves to even, preserve negative zero, use fixed notation for large finite bounds and distinguish unset limits with empty replies. Numeric prefixes and explicit nan/inf are accepted; invalid, empty and float overflow/underflow limits are rejected. NaN modifier removal leaves a query-visible NaN even after its wire rule is removed. Force without an angle resets to pi/3. Bounds clamp before the viewport range; contradictory limits choose the minimum for an input below it, otherwise the maximum. Final-limit removal restores the saved lens. The first limit saves the current lens only when CameraAngle persistence is enabled, otherwise pi/3; user lens changes preserve the existing persistence mode. Query options deliver empty replies. Script FOV reads still require tracking permission.

- Per-avatar force/query and user lens attempts
- Strongest per-prim limits, removal, clear, collection and saved-lens restoration
- Three-decimal and empty replies, numeric prefixes and non-finite values
- Permission-gated llGetCameraFOV

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvForceHandler&lt;RLV_BHVR_SETCAM_FOV&gt;::onCommand</code>, <code>RlvBehaviourSetCamFovHandler::onCommand</code>, <code>RlvReplyCamMinMaxModifierHandler::onCommand</code>, <code>RlvActions::getCameraFOVLimits</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera.test.ts](../packages/vitest/test/rlv-camera.test.ts).

### camera-distance

Forms: <code>@setcam_avdistmin:&lt;metres&gt;=n&#124;y</code>, <code>@setcam_avdistmax:&lt;metres&gt;=n&#124;y</code>, <code>@camdistmin:&lt;metres&gt;=n&#124;y</code>, <code>@camdistmax:&lt;metres&gt;=n&#124;y</code>, <code>@camzoommin[:&lt;multiplier&gt;]=n&#124;y</code>, <code>@camzoommax[:&lt;multiplier&gt;]=n&#124;y</code>, <code>@getcam_avdistmin=&lt;channel&gt;</code>, <code>@getcam_avdistmax=&lt;channel&gt;</code>.

Comparison: confirmed difference. Avatar distance bounds constrain camera poses around an explicit joint reference. Deprecated zoom commands constrain the lens rather than camera distance. Their FOV directions differ between profiles. Current-distance and zoom queries have profile-specific availability.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Distance aliases aggregate together. Empty bounds mean 1.5, invalid numeric text means zero, and contradictory minimum collapses to maximum. The default distance range is -1000000 to 750000 metres, including the default drawing-distance cap. Six-decimal bound queries ignore options. camzoommin bounds minimum magnification and camzoommax bounds maximum magnification, with empty multiplier 1.5 and zero removing that zoom bound. getcam_zoommin, getcam_zoommax and getcam_zoom are supported; getcam_avdist is unsupported. Mouselook bypasses distance clamping. Coincident camera and reference positions with a positive minimum produce non-finite coordinates. Joint positions are explicit fixtures, defaulting to avatar position.

- Avatar distance aliases and pose reads
- Zoom multiplier bounds and queries
- Removal, clear, collection, multiple issuers and numeric conversion

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::updateCameraLimits</code>, <code>RRInterface::reallyHandleCommand</code>, <code>LLAgentCamera::calcCameraPositionTargetGlobal</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Distance aliases aggregate strongest minimum/maximum modifiers. Empty or invalid bounds are rejected; numeric prefixes and explicit non-finite values follow float parsing. Three-decimal queries distinguish unset bounds with empty replies and reject options with an empty reply. Contradictory modifiers remain independently queryable; position clamping checks maximum before minimum. getcam_avdist reports camera distance from avatar position, separately from the joint reference. camzoommin maps to minimum FOV and camzoommax to maximum FOV using pi/3 divided by the multiplier, default multiplier 1. Removing a final zoom alias keeps the current lens instead of restoring the saved FOV. Zoom queries are unsupported. Mouselook bypasses distance clamping. Coincident camera and reference positions with a positive minimum produce non-finite coordinates. Joint positions are explicit fixtures, defaulting to avatar position.

- Avatar distance aliases, current-distance query and pose reads
- Deprecated zoom aliases sharing FOV modifiers
- Removal, clear, collection, multiple issuers and numeric conversion

Reference symbols: <code>indra/newview/rlvhelper.cpp</code>: <code>RlvBehaviourDictionary::RlvBehaviourDictionary</code>, <code>RlvReplyCamMinMaxModifierHandler::onCommand</code>, <code>RlvReplyHandler&lt;RLV_BHVR_GETCAM_AVDIST&gt;::onCommand</code>, <code>RlvBehaviourCamZoomMinMaxHandler::onCommand</code>, <code>RlvActions::getCameraAvatarDistanceLimits</code>, <code>LLAgentCamera::clampCameraPosition</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts).

### camera-distance-query

Forms: <code>@getcam_avdist=&lt;channel&gt;</code>.

Comparison: confirmed difference. RLVa reports camera distance from avatar position. Kokua has no current-distance query handler.

#### Kokua RLV 2.09.35.00

Support depth: unsupported. No getcam_avdist query handler. Numeric parameters remain unsupported.


Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::reallyHandleCommand</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Three-decimal current distance from the seated camera eye when applicable, otherwise the fixture position, relative to avatar position, independently of the explicit joint reference used for clamping. Nonempty options return an empty reply with failed-option. Viewer queries need no simulator camera permission.

- Current camera distance and invalid query options

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvReplyHandler&lt;RLV_BHVR_GETCAM_AVDIST&gt;::onCommand</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts).

### camera-zoom-query

Forms: <code>@getcam_zoom=&lt;channel&gt;</code>, <code>@getcam_zoommin=&lt;channel&gt;</code>, <code>@getcam_zoommax=&lt;channel&gt;</code>.

Comparison: confirmed difference. Kokua exposes current and bounded zoom multipliers; RLVa has no zoom query handlers.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Six-decimal current magnification pi/3 divided by FOV, and aggregated minimum/maximum magnification. Unset bounds are -1000000 and 1000000. Options are ignored. Lens limits and zoom aliases both affect the effective magnification bounds.

- Current, minimum and maximum magnification queries

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::reallyHandleCommand</code>, <code>RRInterface::updateCameraLimits</code>.

#### Firestorm RLVa 2.4.2

Support depth: unsupported. No getcam_zoom, getcam_zoommin or getcam_zoommax handlers. Numeric parameters remain unsupported.


Reference symbols: <code>indra/newview/rlvhelper.cpp</code>: <code>RlvBehaviourDictionary::RlvBehaviourDictionary</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts).

### camera-origin

Forms: <code>@setcam_origindistmin:&lt;metres&gt;=n&#124;y</code>, <code>@setcam_origindistmax:&lt;metres&gt;=n&#124;y</code>.

Comparison: confirmed difference. RLVa origin distance limits use the default camera origin. A locked avatar distance takes precedence; otherwise active origin limits take precedence over avatar distance bounds. Neither profile has origin-distance queries.

#### Kokua RLV 2.09.35.00

Support depth: unsupported. No origin-distance limit or query handlers. Wire restrictions may be retained but remain unsupported.


Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::updateCameraLimits</code>, <code>RRInterface::reallyHandleCommand</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Strongest minimum and maximum constrain position around an explicit region-space camera origin. Without an explicit origin the fixture pose is the origin. Equal avatar distance bounds override origin limits; otherwise origin limits override avatar bounds. Empty options fail. Origin query names have no handlers. Skeleton offsets, smoothing and collisions are outside the fixture.

- Origin-distance pose clamping and avatar-lock precedence
- Explicit camera-origin fixture state

Reference symbols: <code>indra/newview/rlvactions.cpp</code>: <code>RlvActions::getCameraOriginDistanceLimits</code>, <code>LLAgentCamera::calcCameraPositionTargetGlobal</code>, <code>LLAgentCamera::clampCameraPosition</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts).

### camera-silhouette

Forms: <code>@setcam_avdist:&lt;metres&gt;=n&#124;y</code>.

Comparison: confirmed difference. RLVa setcam_avdist selects an avatar silhouette threshold, independently of the camera position limits. The fixture exposes the aggregated threshold as viewer state; rendering is outside the fixture.

#### Kokua RLV 2.09.35.00

Support depth: unsupported. No setcam_avdist handler. The wire restriction remains inspectably unsupported.


Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::updateCameraLimits</code>.

#### Firestorm RLVa 2.4.2

Support depth: state-only. Strongest numeric threshold is exposed as silhouetteDistance. It does not move the camera. Empty and invalid options fail. No rendering or silhouette query is implemented.

- Aggregated silhouetteDistance viewer state, removal and clear

Reference symbols: <code>indra/newview/rlvhelper.cpp</code>: <code>RlvBehaviourDictionary::RlvBehaviourDictionary</code>, <code>LLVOAvatar::isRlvSilhouette</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-camera-distance.test.ts](../packages/vitest/test/rlv-camera-distance.test.ts).

### viewer-ui

Forms: <code>@showinv&#124;showloc&#124;showminimap&#124;showworldmap&#124;shownearby=n&#124;y</code>, <code>@shownames[_sec][:&lt;uuid&gt;]=n&#124;y</code>, <code>@shownametags[_sec][:&lt;uuid&gt;&#124;&lt;distance&gt;]=n&#124;y</code>, <code>@showhovertext:&lt;uuid&gt;=n&#124;y</code>, <code>@showhovertextall&#124;showhovertexthud&#124;showhovertextworld=n&#124;y</code>, <code>@showself&#124;showselfhead&#124;viewtransparent&#124;viewwireframe=n&#124;y</code>, <code>@viewnote&#124;viewscript&#124;viewtexture=n&#124;y</code>.

Comparison: confirmed difference. The immutable viewer-state query exposes restriction policy with issuer and option details. RLVa supports self visibility, transparent/wireframe controls, strict name exceptions and nametag distance modifiers. Kokua has no effects for those four controls or distance modifiers; its name censor shares name/nametag exceptions and its nametag visibility has no exceptions. Window contents, rendered pixels and user preference overrides are outside this query.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Inventory, location, maps, names, nearby list, hover text and note/script/texture restrictions are queryable. Name censoring includes optioned shownames rules and shares UUID exceptions from shownames, shownames_sec and shownametags. Nametag hiding uses only unoptioned shownametags; name restrictions also hide nametags with the default settings. Hover text uses exact prim UUID and independent HUD/world/all scopes. showself, showselfhead, viewtransparent, viewwireframe, nametag distance and strict nametag forms remain unsupported.

- Global UI restrictions, removal, clear and session cleanup
- Name exceptions and exact-prim hover text scopes
- Immutable per-avatar policy snapshots with issuer/option details

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::refreshCachedVariable</code>, <code>RRInterface::censor</code>, <code>RRInterface::add</code>, <code>RRInterface::remove</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. All listed UI restrictions are queryable. Names and nametags exempt self and UUID exceptions; strict rules or permissive require exceptions from the corresponding issuers. Nametag modifiers choose the minimum distance (empty means zero), with a strict distance boundary. Object hover text is hidden by exact prim UUID or all/HUD/world scope. The query reports restriction policy rather than current window openness, pixel output or persistent user preferences.

- All listed show/view restrictions, removal, clear and session cleanup
- UUID exceptions, strict issuer scope, self exemptions and nametag distance modifiers
- Exact-prim hover text scopes and immutable snapshots

Reference symbols: <code>indra/newview/rlvhelper.cpp</code>: <code>RlvBehaviourDictionary::RlvBehaviourDictionary</code>, <code>RlvBehaviourHandler&lt;RLV_BHVR_SHOWNAMETAGS&gt;::onCommand</code>, <code>RlvActions::canShowName</code>, <code>RlvActions::canShowNameTag</code>, <code>RlvActions::canShowHoverText</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate.test.ts](../packages/vitest/test/rlv-viewstate.test.ts).

### viewer-render

Forms: <code>@setcam_textures&#124;camtextures[:&lt;uuid&gt;]=n&#124;y</code>, <code>@setoverlay&#124;setoverlay_touch=n&#124;y</code>, <code>@setoverlay_alpha&#124;texture&#124;tint[:&lt;value&gt;]=force</code>, <code>@setsphere=n&#124;y</code>, <code>@setsphere_mode&#124;origin&#124;color&#124;distmin&#124;distmax&#124;distextend&#124;param&#124;tween&#124;valuemin&#124;valuemax[:&lt;value&gt;]=force</code>.

Comparison: confirmed difference. Render configuration is exposed through the viewer-state query. Texture aliases share Firestorm state; Kokua retains both wire names. Firestorm overlays are issuer-local and selected by object hierarchy. Firestorm spheres are independent (at most six); Kokua combines spheres by mode and retains parameter restrictions, including force aliases. Tween parameters describe configured targets; pixel rendering and animation are outside this query.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Texture replacement uses the last changed texture rule, including removals. Sphere parameters are retained as restrictions, can precede activation, and are removed with setsphere. Spheres combine by mode: minimum distances, origin, extension and tween, maximum values, multiplied blend RGB, maximum kernel size or component-wise maxima. Negative numeric parameters clamp to zero. Overlay and sphere color commands remain unsupported.

- Texture restrictions and aliases
- Sphere activation, retained parameter add/remove and force aliases
- Mode aggregation, clear and session cleanup

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::refreshCachedVariable</code>, <code>RRInterface::updateSetsphere</code>, <code>RRInterface::force</code>, <code>RRInterface::remove</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Texture restrictions select the first retained modifier. An unoptioned rule inserts the viewer default texture with the same insertion priority as an explicit UUID. Overlays expose alpha, texture, tint and per-issuer touch blocking; one object hierarchy is enabled at a time. Spheres expose per-issuer mode, origin, color/param, distance, extension, values and tween targets. Local modifiers require that issuer to hold the base behaviour; an empty modifier restores its default. Removal, clear and session cleanup release local parameters. At most six sphere issuers are accepted.

- Texture UUID restrictions and canonical alias
- Overlay activation, local alpha/texture/tint and touch state
- Six independent spheres with typed local modifiers and default restoration

Reference symbols: <code>indra/newview/rlvhelper.cpp</code>: <code>RlvBehaviourDictionary::RlvBehaviourDictionary</code>, <code>RlvBehaviourInfo::processModifier</code>, <code>RlvBehaviourHandler&lt;RLV_BHVR_SETOVERLAY&gt;::onCommand</code>, <code>RlvBehaviourHandler&lt;RLV_BHVR_SETSPHERE&gt;::onCommand</code>, <code>RlvOverlayEffect</code>, <code>RlvSphereEffect</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-viewstate-camera.test.ts](../packages/vitest/test/rlv-viewstate-camera.test.ts).

### discovery

Forms: <code>@getcommand[:&lt;behaviour&gt;[;&lt;type&gt;[;&lt;separator&gt;]]]=&lt;channel&gt;</code>.

Comparison: confirmed difference. No getcommand section in the wiki. RLVa implements it; Kokua has no named query branch and falls through to ordinary parameter dispatch.

#### Kokua RLV 2.09.35.00

Support depth: unsupported. No getcommand query branch. Numeric reply parameter reaches fallback and returns false, rather than an empty successful query.


Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::reallyHandleCommand</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Enumerates implemented command forms in restriction, force and reply order with substring filtering and any/add/force/reply types. State-only restrictions are discoverable with their depth exposed in metadata; unsupported forms are excluded. Omitted separator is semicolon; an explicit empty separator joins names directly. Invalid types deliver one empty reply and an invalid-option outcome. Reply transport truncates once at 1023 UTF-8 bytes.

- getcommand on valid positive reply channels
- Substring filter, omitted/any/add/force/reply type, omitted/empty/custom separator, ignored extra fields
- Implemented form metadata and distinguishable unsupported outcomes without synthetic acknowledgements

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvReplyHandler&lt;RLV_BHVR_GETCOMMAND&gt;::onCommand</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-getcommand.test.ts](../packages/vitest/test/rlv-getcommand.test.ts).

### notifications

Forms: <code>@notify:&lt;channel&gt;[;&lt;filter&gt;]=n&#124;add</code>, <code>@notify:&lt;channel&gt;[;&lt;filter&gt;]=y&#124;rem</code>.

Comparison: confirmed difference. Wiki describes rule notifications. Alias preservation and clear event sequences require implementation-specific expectations.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Notifications normalize aliases to n/y, suppress duplicate adds and report absent removes; clear reports itself before individual removals, including collection.

- Emitter-scoped registrations, exact wire removals, duplicate suppression, substring filters and ordered avatar-origin delivery
- Restriction commands and clear, script reset/removal persistence and missing-emitter collection; inventory offer notices included; avatar action notices excluded
- Profile-specific channel and separator policies; invalid forms remain inspectable

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::notify</code>, <code>RRInterface::add</code>, <code>RRInterface::remove</code>, <code>RRInterface::clear</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Notifications preserve aliases, with duplicate adds using the first stored alias. Failed external add/remove commands notify; clear reports after removing registrations, and collection reports clear without individual removals.

- Emitter-scoped registrations, exact wire removals, duplicate suppression, substring filters and ordered avatar-origin delivery
- Restriction commands and clear, script reset/removal persistence and missing-emitter collection; inventory offer notices included; avatar action notices excluded
- Profile-specific channel and separator policies; invalid forms remain inspectable

Reference symbols: <code>indra/newview/rlvhelper.cpp</code>: <code>RlvBehaviourNotifyHandler::onCommand</code>, <code>RlvBehaviourNotifyHandler::sendNotification</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-notify.test.ts](../packages/vitest/test/rlv-notify.test.ts)<br>[rlv-offers.test.ts](../packages/vitest/test/rlv-offers.test.ts).

### blacklist

Forms: <code>@versionnumbl=&lt;channel&gt;</code>, <code>@getblacklist[:&lt;filter&gt;]=&lt;channel&gt;</code>, <code>Kokua blacklisted add and force; RLVa disabled setenv add/remove</code>.

Comparison: version/setting dependent. Kokua supports the wiki blacklist queries, comma composition and substring filters. RLVa has neither query and uses a separate dictionary setting to disable setenv add/remove.

#### Kokua RLV 2.09.35.00

Support depth: enforced. versionnumbl appends the configured comma-separated blacklist to 2093500; getblacklist preserves entry order and filters by substring. Blacklisted adds notify with =n before succeeding without state; notify is exempt. Force entries use %f and succeed without effects or notifications. Removes remain available. Unsupported effects retain diagnostics.

- Empty/nonempty blacklist, duplicate entries, substring filtering and version composition
- Per-avatar ignored add/force with notifications and unsupported diagnostics

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::getVersionNum</code>, <code>RRInterface::getBlacklist</code>, <code>RRInterface::isBlacklisted</code>, <code>RRInterface::add</code>, <code>RRInterface::force</code>.

#### Firestorm RLVa 2.4.2

Support depth: unsupported. versionnumbl and getblacklist are absent from the dictionary. rlvaNoSetEnv disables setenv add/remove with failed-disabled before notifications and state updates. Kokua blacklist entries have no effect. Environment effects remain unsupported.

- Absent blacklist queries and separate disabled-command outcome; unsupported environment diagnostics retained

Reference symbols: <code>indra/newview/rlvhelper.cpp</code>: <code>RlvBehaviourDictionary::RlvBehaviourDictionary</code>, <code>RlvCommand::isBlocked</code>, <code>RlvHandler::processCommand</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-blacklist.test.ts](../packages/vitest/test/rlv-blacklist.test.ts).

### viewer-session

Forms: <code>Startup command retention and ready-state release</code>, <code>Viewer session reset</code>, <code>Issuer lookup, detach and orphan collection</code>.

Comparison: confirmed difference. Wiki warns that version replies can be delayed during login and restrictions do not persist across sessions. Startup phases and orphan collection use profile-specific schedules.

#### Kokua RLV 2.09.35.00

Support depth: enforced. Startup retains commands in wire order; version requests bypass retention unless doNotQueueVersionRequests is false. Explicit readiness releases retained work. Time-based maintenance uses configurable additions to its initial 5-second wait and later 2-second interval; defaults produce 10-second delays. Missing issuers, including detached and never-resolved prims, lose rules and registrations on the next maintenance pass. Reset silently clears rules, retained commands and undelivered viewer replies.

- Ready/not-ready fixtures and startup version-query setting
- Time-based maintenance with initial and interval additions
- Session reset, object-list membership and orphan notifications; forced locked-attachment recovery excluded

Reference symbols: <code>indra/newview/RRInterface.cpp</code>: <code>RRInterface::reallyHandleCommand</code>, <code>RRInterface::fireCommands</code>, <code>RRInterface::garbageCollector</code>.

#### Firestorm RLVa 2.4.2

Support depth: enforced. Startup retains commands in wire order. From misc startup, version, versionnew and versionnum query groups flush every 2 seconds in that order. Full readiness releases remaining commands. A 30-second collector starts with the first restriction and stops on an empty collection pass; known missing issuers expire on the next pass and never-resolved issuers after more than 20 misses. Completed detach clears known attachment rules and registrations immediately. Reset silently clears rules, retained commands and undelivered viewer replies. Object-list membership is independent of range and region changes.

- Ready/not-ready and misc startup phases with ordered version flushing
- Known versus never-resolved issuer collection and immediate completed-detach cleanup
- Session reset and orphan notifications; forced locked-attachment recovery excluded

Reference symbols: <code>indra/newview/rlvhandler.cpp</code>: <code>RlvHandler::processCommand</code>, <code>RlvHandler::processRetainedCommands</code>, <code>RlvHandler::onIdleStartup</code>, <code>RlvHandler::onGC</code>, <code>RlvHandler::onDetach</code>.

Tests: [rlv-profiles.test.ts](../packages/vitest/test/rlv-profiles.test.ts)<br>[rlv-session.test.ts](../packages/vitest/test/rlv-session.test.ts).

## Explicit exclusions

Only the command forms and operations listed above are delivered. Unsupported names and option forms remain inspectable in `avatar.viewer.commandLog` and `avatar.viewer.diagnostics`. Kokua may retain an unknown wire rule; storage and status output do not enforce its effect.

- State-only effects: `sendchat` and `tplm`. Simulator LSL calls remain separate from explicit viewer actions.
- Other command families: environment and debug setters/queries such as `setenv`, `setdebug`, `getenv` and `getdebug`; chat redirection and IM commands such as `redirchat`, `rediremote`, `sendim` and `recvim`; movement, touch and vision controls such as `fly`, `edit`, `touchworld`, `showworld`. These names are examples, not an exhaustive upstream command catalog.
- Settings: per-object API compatibility, hide-locked-attachment overrides, bridge detach exemptions, automatic legacy folded-folder naming inference and general viewer setting/UI emulation. Supported fixture settings are documented in the contracts, including startup timing, blacklist, `rlvaNoSetEnv`, shared wear and camera persistence.
- Recovery: forced reattachment after a simulator detach, relay pong/relog recovery and optional relay meta-commands.
- Rendering: shaders, visible camera effects, exclusive camera control, camera pose, collision/autopilot placement and terrain/landing-point adjustments.
- Inventory: recursive `attachall`, `attachallover`, `attachalloverorreplace` and `detachall`; multi-folder wear/remove options; force-wearing clothing; inventory links, gestures, complete outfit layering, outfit-layer `getpath` selectors, point/folder wear locks and bare `detach=force`. Direct shared-folder attachment wear/removal and supported clothing removal are bounded by their contracts.
- Transport: console loopback, redirected-chat splitting, IM/network transport and full viewer UI. Fixtures make no network calls.

See [paired-profile usage and exact test commands](../packages/vitest/README.md#paired-rlvrlva-fixtures) and the [runnable example](../examples/rlv/README.md).
