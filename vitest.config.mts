import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
      { find: /^next\/server$/, replacement: 'next/server.js' },
    ],
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['tests/global-setup.ts'],
    server: {
      deps: {
        inline: ['next-auth', '@auth/core'],
      },
    },
  },
})
