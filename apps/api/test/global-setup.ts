import { execSync } from 'node:child_process'

/** Brings the test database schema up to date before any test runs. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    if (process.env.CI) throw new Error('TEST_DATABASE_URL must be set in CI')
    console.warn('\nTEST_DATABASE_URL is not set: database tests will be skipped.\n')
    return
  }
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  })
}
