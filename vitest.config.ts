import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    // The package tsconfig extends a Harness monorepo file. Tests must run
    // from this repo alone after `dsh plugin add github:`.
    tsconfigRaw: {
      compilerOptions: {
        target: 'es2022',
        module: 'esnext',
        jsx: 'react-jsx',
      },
    },
  },
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
  },
})
