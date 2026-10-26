import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { createDb, type Db } from '../src/db'
import { ONTHEC_GYM_SLUG, seedDatabase } from '../src/seed'
import { testDatabaseUrl, testEnv } from './helpers'

describe.skipIf(!testDatabaseUrl)('with the test database', () => {
  let db: Db

  beforeAll(() => {
    // Guard: never fall back to DATABASE_URL, since these tests delete data.
    if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required')
    db = createDb(testDatabaseUrl)
  })

  afterAll(async () => {
    await db?.$disconnect()
  })

  beforeEach(async () => {
    await db.$executeRaw`TRUNCATE TABLE gyms CASCADE`
  })

  it('health check reaches the real database', async () => {
    const app = await buildApp({ env: testEnv(), db })
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' })
    await app.close()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok', db: 'ok' })
  })

  it('seed creates Onthec Gym once, however many times it runs', async () => {
    await seedDatabase(db)
    await seedDatabase(db)

    const gyms = await db.gym.findMany()
    expect(gyms).toHaveLength(1)
    expect(gyms[0]).toMatchObject({ slug: ONTHEC_GYM_SLUG, name: 'Onthec Gym', gstin: null, settings: {} })
  })
})
