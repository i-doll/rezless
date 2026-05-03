import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { LslCoverageReporter } from './packages/vitest/src/reporter.js'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their source TypeScript instead of the
    // built `dist/` JS. This lets vitest's transformer + coverage see the
    // real source files. Production consumers still go through `dist/` via
    // the package `exports` map.
    alias: {
      '@rezless/parser': here('./packages/parser/src/index.ts'),
      '@rezless/vm': here('./packages/vm/src/index.ts'),
      '@rezless/vitest': here('./packages/vitest/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'examples/*/**/*.test.ts'],
    environment: 'node',
    // The LSL reporter is dormant during plain `vitest run`. When invoked
    // with `--coverage` (or `coverage.enabled: true`) it enables the LSL
    // coverage path alongside @vitest/coverage-v8 and writes its artifacts
    // under `<reportsDirectory>/lsl/` next to the JS coverage output.
    reporters: ['default', new LslCoverageReporter()],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      // Only measure our own source. Skip generated tables, dist output,
      // example LSL scripts, and the codegen helper.
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/dist/**',
        '**/generated/**',
        '**/*.d.ts',
        'packages/*/test/**',
      ],
      reportsDirectory: 'coverage',
    },
  },
})
