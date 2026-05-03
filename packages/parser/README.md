# @rezless/parser

Hand-written recursive-descent parser for the **Linden Scripting
Language (LSL)**. Part of the [rezless](https://github.com/i-doll/rezless)
LSL test framework.

```ts
import { parse, LslParseError } from '@rezless/parser'

try {
  const ast = parse(source, { filename: 'greeter.lsl' })
} catch (e) {
  if (e instanceof LslParseError) {
    console.error(`${e.file}:${e.line}:${e.col}: ${e.message}`)
  }
}
```

This package is a building block of `@rezless/vitest`. Most users want
that package directly:

```sh
pnpm add -D @rezless/vitest vitest
```

See the [main README](https://github.com/i-doll/rezless#readme) for the
full framework documentation.

## License

Apache-2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
