# Outfit wearer example

Run from the repository root:

```sh
pnpm exec vitest run examples/rlv-wear/outfit.test.ts
```

The root Vitest configuration resolves workspace packages to TypeScript source.
No build, viewer connection or development server is needed. On a fresh checkout,
run `pnpm install --frozen-lockfile --ignore-scripts` first.

Touch `outfit.lsl` to query the folders under `#RLV`. If `Outfit` exists, the
script requests `@attachover:Outfit=force`. A one-second timer retries a missing
reply once, then asks the owner to wear the outfit manually. Each query listens
on a new channel and removes the previous listener, so a late first answer
cannot complete the retry. A missing folder also prompts manual wear.

The tests run against both viewer profiles with `loadRlvPair`. They use
`dropNext` for one or two missing replies, `answerNext` for a crafted folder
list, and `hold` with `release` to deliver the first answer after the timer.
Assertions use captured chat and `avatar.viewer.commandLog`, without mocking
`llOwnerSay`, and check that the cuff actually attaches in the fixture.

The final test calls `seedRlvInventory` again while the mapped cuff is detached,
then checks that force-wear restores that same object. These are simulated
viewer deliveries and attachment state, not a connection to a running viewer.
