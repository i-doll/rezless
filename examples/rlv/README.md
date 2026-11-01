# Paired viewer example

Run from the repository root:

```sh
pnpm exec vitest run examples/rlv/paired-viewers.test.ts
```

The root Vitest configuration resolves workspace packages to TypeScript source.
The example needs no build, viewer connection or development server. For a fresh
checkout, `pnpm install --frozen-lockfile --ignore-scripts` installs dependencies
without running the preparation build.

`paired-viewers.lsl` detects the numeric API version and adds `sendchannel=n`.
The test loads that same source into Kokua RLV 2.09.35.00 and Firestorm RLVa 2.4.2
with `loadRlvPair({ source })`. Each World then loads a second object with the
same script and the same owner. Starting both scripts creates two prim-scoped
restrictions. Ordinary avatar chat is blocked until both controllers clear.

Touching a controller queries its own status on positive and negative channels,
queries avatar-wide status, clears its own rules and queries avatar-wide status
again. The first controller's cleanup preserves the second controller's rule.
After the second cleanup, the restriction snapshot is empty and chat succeeds.
Avatar replies reach every matching listener. The first controller therefore
also hears the second object's version reply and both controllers hear status
replies on their shared channels.

`apiVersions` and `negativeChannelReplies` name the divergent expectations.
Kokua returns `2093500` and accepts the negative query channel. Firestorm returns
`3040300` and records the negative query as unsupported, without a reply.
Both omitted and explicitly disabled viewers run the same script with captured
owner chat, no viewer replies, no restrictions or diagnostics, and ordinary
avatar chat delivery.

Inspect `avatar.viewer.reference` for profile/version metadata,
`avatar.viewer.restrictions.snapshot()` for rules and emitter UUIDs,
`avatar.viewer.commandLog` for per-command outcomes, and `fixture.chatActions`
for explicit avatar chat attempts. Command parsing, storage and query replies do
not imply enforcement of every viewer action. The
[generated coverage matrix](../../docs/rlv-coverage.md) lists supported forms,
support depths, profile differences, test references and exclusions.
