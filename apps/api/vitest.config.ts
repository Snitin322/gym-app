import { defineConfig } from 'vitest/config'

try {
  process.loadEnvFile()
} catch {
  // No .env file (e.g. CI): variables come from the environment.
}

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Database tests share one test database, so run files one at a time.
    fileParallelism: false,
    // A login is several round trips to the cloud database, which can exceed the 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
