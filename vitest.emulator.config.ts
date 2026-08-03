import { defineConfig } from 'vitest/config'

/** Tier 3 only. Run via `bun run test:emulator`, which boots the emulators first. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
