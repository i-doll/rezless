import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const src = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url))

// A project with no coverage reporter: LSL_COVERAGE=1 collects, and the
// setup file writes the dumps that rezless-coverage renders.
export default defineConfig({
  resolve: {
    alias: [
      { find: '@rezless/vitest', replacement: src('vitest/src/index.ts') },
      { find: '@rezless/parser', replacement: src('parser/src/index.ts') },
      { find: '@rezless/vm', replacement: src('vm/src/index.ts') },
    ],
  },
  test: {
    include: ['*.fixture.ts'],
    // What a project writes as '@rezless/vitest/coverage-setup'. Vitest doesn't
    // apply `resolve.alias` to setup files, so the source path is given here.
    setupFiles: [src('vitest/src/coverage-setup.ts')],
  },
})
