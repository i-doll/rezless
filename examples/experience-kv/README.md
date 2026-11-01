# Experience visitor counter example

Run from the repository root:

```sh
pnpm exec vitest run examples/experience-kv/visitor-counter.test.ts
```

The root Vitest configuration resolves workspace packages to TypeScript source.
No build or development server is needed. On a fresh checkout, run
`pnpm install --frozen-lockfile --ignore-scripts` first.

`visitor-counter.lsl` counts touches using the Experience key named in the
object's description. Associate the script with an Experience and initialize
that key to an integer string before using it. The tests seed `visitors` and
`tours` with `experience.seed`.

On touch, the script reads the count with `llReadKeyValue`, then calls
`llUpdateKeyValue` with the original value for a checked increment. It matches
`dataserver` answers by request key and ignores touches while a request is
pending. Errors go to the owner through `llGetExperienceErrorMessage`; the
next touch can try again. A competing update therefore reports an error
instead of overwriting another counter's change.

The tests show a successful increment, `experience.failNext` on a read, and a
predicate that fails only an update to `tours`. The held-delivery test releases
the read first, checks that the update still waits, then releases the update
and verifies that later requests answer automatically. Release applies the
operation; `script.advanceTime(0)` dispatches its scheduled answer.
