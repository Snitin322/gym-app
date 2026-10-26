import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { ONTHEC_GYM_SLUG, seedDatabase } from '../src/seed'
import { noopSender, testDatabaseUrl, testEnv, useTestDatabase } from './helpers'

describe.skipIf(!testDatabaseUrl)('with the test database', () => {
  const ctx = useTestDatabase()

  it('health check reaches the real database', async () => {
    const app = await buildApp({ env: testEnv(), db: ctx.db, otpSender: noopSender })
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' })
    await app.close()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok', db: 'ok' })
  })

  it('seed creates Onthec Gym and its owner once, however many times it runs', async () => {
    const owner = { phone: '+919876500000', name: 'Gym Owner' }
    await seedDatabase(ctx.db, { owner })
    await seedDatabase(ctx.db, { owner })

    const gyms = await ctx.db.gym.findMany()
    expect(gyms).toHaveLength(1)
    expect(gyms[0]).toMatchObject({ slug: ONTHEC_GYM_SLUG, name: 'Onthec Gym', gstin: null, settings: {} })

    const users = await ctx.db.user.findMany()
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({ ...owner, role: 'owner', gymId: gyms[0]?.id })
  })

  it('seed without an owner creates only the gym', async () => {
    await seedDatabase(ctx.db)
    expect(await ctx.db.user.count()).toBe(0)
  })
})
