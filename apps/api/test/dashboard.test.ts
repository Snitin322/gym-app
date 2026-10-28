import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { emptyWeek, type DashboardView, type MemberDetail } from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

describe.skipIf(!testDatabaseUrl)('Owner/admin dashboard', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let clock: Date
  const t = {} as Record<'owner' | 'admin' | 'trainer' | 'ownerB', string>
  let gymA: string
  let trainerId: string
  let ownerId: string

  const call = (method: 'GET' | 'POST', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })
  const dashboard = async (token = t.owner) => (await call('GET', '/dashboard', token)).json() as DashboardView

  /** Adds a member (paid by `method`, or pay later) with the clock set to `paidAt`. */
  async function member(
    name: string,
    phone: string,
    {
      planId,
      startDate,
      method,
      paidAt,
      joinedOn,
    }: { planId?: string; startDate?: string; method?: string; paidAt: string; joinedOn?: string },
    token = t.admin,
  ) {
    clock = new Date(paidAt)
    const res = await call('POST', '/members', token, {
      name,
      phone,
      joinedOn,
      ...(planId ? { firstMembership: { planId, startDate, ...(method ? { payment: { method } } : {}) } } : {}),
    })
    expect(res.statusCode, res.body).toBe(201)
    const created = res.json() as MemberDetail
    // Desk payments are stamped with the real time; move them to the moment this test needs.
    await ctx.db.payment.updateMany({ where: { memberId: created.id }, data: { paidAt: new Date(paidAt) } })
    return created
  }

  beforeEach(async () => {
    gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    const owner = await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' })
    ownerId = owner.id
    t.owner = await tokenFor(owner)
    t.admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Desk A' }))
    const trainer = await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi' })
    trainerId = trainer.id
    t.trainer = await tokenFor(trainer)
    t.ownerB = await tokenFor(
      await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }),
    )
    clock = new Date('2026-03-25T03:30:00Z') // Wednesday 25 Mar 2026, 9 am in India
    ;({ app } = await startApp(ctx.db, {}, undefined, () => clock))
  })
  afterEach(async () => {
    await app.close()
  })

  it('counts members, lists who to call, and shows money for the owner only', async () => {
    const monthly = (
      await call('POST', '/plans', t.owner, {
        name: '1 month',
        durationMonths: 1,
        pricePaise: 100000,
        maxFreezeDays: 0,
      })
    ).json()
    const quarterly = (
      await call('POST', '/plans', t.owner, {
        name: '3 months',
        durationMonths: 3,
        pricePaise: 250000,
        maxFreezeDays: 0,
      })
    ).json()

    // Last month (Feb): Bina paid ₹1,000 by UPI; her month ended 28 Feb.
    await member('Bina', '9876500002', {
      planId: monthly.id,
      startDate: '2026-02-01',
      method: 'upi',
      paidAt: '2026-02-15T06:00:00Z',
      joinedOn: '2026-02-01',
    })
    // Long gone: ended in December (not a "recently expired" contact).
    await member('Old', '9876500005', {
      planId: monthly.id,
      startDate: '2025-12-01',
      method: 'cash',
      paidAt: '2025-12-01T06:00:00Z',
      joinedOn: '2025-12-01',
    })
    // 24 Mar 11:50 pm in India (still yesterday): Chetan, 3 months from 20 Mar, cash.
    await member('Chetan', '9876500003', {
      planId: quarterly.id,
      startDate: '2026-03-20',
      method: 'cash',
      paidAt: '2026-03-24T18:20:00Z',
      joinedOn: '2026-03-20',
    })
    // 25 Mar 12:10 am in India (today): Asha, 1 month from 1 Mar (ends 31 Mar), card.
    await member('Asha', '9876500001', {
      planId: monthly.id,
      startDate: '2026-03-01',
      method: 'card',
      paidAt: '2026-03-24T18:40:00Z',
      joinedOn: '2026-03-01',
    })
    // Today: Dev joined without a plan; Esha took 3 months but will pay later.
    await member('Dev', '9876500004', { paidAt: '2026-03-25T03:30:00Z' })
    await member('Esha', '9876500006', { planId: quarterly.id, paidAt: '2026-03-25T03:30:00Z' })

    const d = await dashboard()
    expect(d.today).toBe('2026-03-25')
    expect(d.members).toMatchObject({ active: 3, joinedThisMonth: 4, frozen: 0, noPlan: 1 })
    expect(d.members.expiringSoon).toEqual([
      {
        memberId: expect.any(String),
        name: 'Asha',
        phone: '+919876500001',
        planName: '1 month',
        endDate: '2026-03-31',
      },
    ])
    expect(d.members.recentlyExpired.map((m) => [m.name, m.endDate])).toEqual([['Bina', '2026-02-28']])

    expect(d.revenue).toEqual({
      todayPaise: 100000, // Asha at 12:10 am; Chetan at 11:50 pm the night before doesn't count
      monthPaise: 350000,
      lastMonthPaise: 100000,
      monthByMethod: { card: 100000, cash: 250000 },
    })
    expect(d.dues).toEqual({
      totalPaise: 250000,
      members: [{ memberId: expect.any(String), name: 'Esha', phone: '+919876500006', duePaise: 250000 }],
    })

    // Admins see everything except money taken; trainers and members don't get a dashboard.
    const forAdmin = await dashboard(t.admin)
    expect(forAdmin.revenue).toBeNull()
    expect(forAdmin.dues.totalPaise).toBe(250000)
    expect((await call('GET', '/dashboard', t.trainer)).statusCode).toBe(403)
  })

  it('PT this week, packages running out, and workout tracking', async () => {
    const asha = await member('Asha', '9876500001', { paidAt: '2026-03-20T03:30:00Z' })
    const bina = await member('Bina', '9876500002', { paidAt: '2026-03-20T03:30:00Z' })
    const pkg = (
      await call('POST', '/pt-packages', t.owner, {
        name: '10 days',
        sessionCount: 5,
        validityDays: 10,
        pricePaise: 500000,
      })
    ).json()
    // Sold on 20 Mar: valid until 29 Mar (within 7 days of today).
    const sold = (
      await call('POST', `/members/${asha.id}/pt-purchases`, t.admin, { packageId: pkg.id, trainerId })
    ).json()
    clock = new Date('2026-03-25T03:30:00Z')

    // Sessions this week (Mon 23 – Sun 29 Mar): one completed, one no-show, one booked but over (unmarked),
    // one booked later this week; one last week that doesn't count.
    const session = (startsAt: string, extra: object = {}) =>
      ctx.db.ptSession.create({
        data: {
          gymId: gymA,
          purchaseId: sold.id,
          trainerId,
          memberId: asha.id,
          bookedById: ownerId,
          startsAt: new Date(startsAt),
          endsAt: new Date(Date.parse(startsAt) + 3600_000),
          ...extra,
        },
      })
    await session('2026-03-23T00:30:00Z', { status: 'completed', markedAt: new Date(), markedById: trainerId })
    await session('2026-03-23T02:30:00Z', { status: 'no_show', markedAt: new Date(), markedById: trainerId })
    await session('2026-03-24T00:30:00Z')
    await session('2026-03-27T00:30:00Z')
    await session('2026-03-17T00:30:00Z', { status: 'completed', markedAt: new Date(), markedById: trainerId })

    // Workout plans: Asha and Bina; only Asha ticked a day this week (Bina's tick was last week).
    for (const m of [asha, bina]) {
      await ctx.db.workoutPlan.create({
        data: {
          gymId: gymA,
          memberId: m.id,
          name: 'Plan',
          week: emptyWeek(),
          createdById: ownerId,
          updatedById: ownerId,
        },
      })
    }
    const log = (memberId: string, date: string) =>
      ctx.db.workoutLog.create({
        data: { gymId: gymA, memberId, date: new Date(`${date}T00:00:00Z`), items: [], savedById: ownerId },
      })
    await log(asha.id, '2026-03-23')
    await log(asha.id, '2026-03-24')
    await log(bina.id, '2026-03-20')

    const d = await dashboard(t.admin)
    expect(d.pt).toMatchObject({
      bookedThisWeek: 2,
      completedThisWeek: 1,
      noShowsThisWeek: 1,
      openDisputes: 0,
      unmarked: 1,
    })
    expect(d.pt.runningOut).toEqual([
      {
        memberId: asha.id,
        name: 'Asha',
        phone: '+919876500001',
        packageName: '10 days',
        trainerName: 'Ravi',
        sessionsLeft: 5,
        expiresOn: '2026-03-29',
      },
    ])
    expect(d.workouts).toEqual({ withPlan: 2, trackedThisWeek: 1 })
  })

  it('another gym’s members and money never show up', async () => {
    const plan = (
      await call('POST', '/plans', t.ownerB, {
        name: '1 month',
        durationMonths: 1,
        pricePaise: 100000,
        maxFreezeDays: 0,
      })
    ).json()
    await member(
      'Zed',
      '9876500099',
      { planId: plan.id, startDate: '2026-03-01', method: 'cash', paidAt: '2026-03-25T03:30:00Z' },
      t.ownerB,
    )

    const mine = await dashboard()
    expect(mine.members).toMatchObject({ active: 0, joinedThisMonth: 0, expiringSoon: [] })
    expect(mine.revenue).toMatchObject({ todayPaise: 0, monthPaise: 0 })
    const theirs = await dashboard(t.ownerB)
    expect(theirs.members.expiringSoon.map((m) => m.name)).toEqual(['Zed'])
    expect(theirs.revenue?.todayPaise).toBe(100000)
  })
})
