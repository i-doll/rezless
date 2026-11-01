# Collar leash example

Run from the repository root:

```sh
pnpm exec vitest run examples/leash/leash.test.ts
```

The root Vitest configuration resolves workspace packages to TypeScript source.
No build or development server is needed. On a fresh checkout, run
`pnpm install --frozen-lockfile --ignore-scripts` first.

Wear `leash.lsl` in a collar. A second avatar touches the collar and chooses
Grab. The wearer cannot grab their own leash. While held, only the holder and
wearer can open its controls, and the wearer can always choose Unleash.

Particles aim at the holder's key. A half-second timer tracks their position
with `llGetObjectDetails` and registers `llTarget` with a four-metre leash
length. `not_at_target` requests a pull with `llMoveToTarget`; `at_target`
stops it. A missing endpoint or one beyond 48 metres makes the leash slack,
clearing particles, the position target and pulling. Tracking continues so it
can resume when the endpoint returns.

Post scans for nearby objects with `llSensor`. The dialog numbers up to nine
results so even identical object names remain selectable. It shortens displayed
names to keep the message within the dialog byte limit. Selecting one aims
the chain and movement target at its key. Removing the post makes the leash
slack. Unleash removes the endpoint, stops the timer and closes the menu too.

The tests create two World avatars, an attached collar and a rezzed post with
`loadLinkset`. They answer dialogs through `script.answerDialog`, move the
holder's position or region, and advance virtual time. The post scan uses
actual fixture sensor results. Particle assertions inspect `PSYS_SRC_TARGET_KEY`
in captured calls; target events are fired explicitly to check pull and stop
requests. These assertions cover script decisions and fixture state. They do
not simulate particle rendering, attachment bone transforms or avatar locomotion.
