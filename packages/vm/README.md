# @rezless/vm

Tree-walking interpreter, virtual clock, and event dispatcher for the
**Linden Scripting Language (LSL)**. Part of the
[rezless](https://github.com/i-doll/rezless) LSL test framework.

This package executes a parsed LSL AST in-process with deterministic
time, mockable `ll*` calls, and a full implementation of the wiki-
documented quirks (FDDx JSON sentinels, `JSON_APPEND`, the dataserver
event flow, Linkset Data, listen routing across a multi-prim linkset,
script pause/resume timer realignment, etc.).

This package is a building block of `@rezless/vitest`. Most users want
that package directly:

```sh
pnpm add -D @rezless/vitest vitest
```

See the [main README](https://github.com/i-doll/rezless#readme) for the
full framework documentation, including the `loadScript` /
`loadLinkset` API, custom matchers, and the catalogue of implemented
`ll*` functions.

## License

MIT — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

This package includes third-party code under other licences. The case-mapping
tables behind `llToLower` and `llToUpper` are generated from Unicode data under
the Unicode License v3; `wasm/slua.wasm` is built from SLua and the libraries
listed in `NOTICE`. The licence texts are in
[`wasm/THIRD-PARTY-LICENSES.txt`](wasm/THIRD-PARTY-LICENSES.txt).
