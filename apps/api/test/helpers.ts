import type { Db } from '../src/db'
import { loadEnv } from '../src/env'

export const testDatabaseUrl = process.env.TEST_DATABASE_URL

export function testEnv(overrides: Record<string, string> = {}) {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/unused',
    ...overrides,
  })
}

/** A stand-in for Prisma when a test only needs `SELECT 1` to succeed or fail. */
export function fakeDb(queryRaw: () => Promise<unknown>): Db {
  return { $queryRaw: queryRaw } as unknown as Db
}
