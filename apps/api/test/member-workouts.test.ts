import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type {
  MemberDetail,
  MemberWorkoutPlan,
  MyWorkoutPlan,
  WorkoutExercise,
  WorkoutPlanView,
  WorkoutWeek,
} from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

describe.skipIf(!testDatabaseUrl)('Members’ own workout plans', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let clock: Date
  const t = {} as Record<'owner' | 'admin' | 'ravi' | 'sita' | 'asha' | 'bina' | 'ownerB', string>
  let asha: MemberDetail
  let bina: MemberDetail
  let bench: WorkoutExercise
  let template: WorkoutPlanView

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  function week(weightKg: number, title = 'Chest'): WorkoutWeek {
    const days: WorkoutWeek['days'] = Array.from({ length: 7 }, () => ({ rest: false, items: [] }))
    days[0] = {
      title,
      rest: false,
      items: [
        {
          kind: 'strength',
          exerciseId: bench.id,
          sets: [{ reps: 12, weightKg }],
          restBetweenSetsSec: 60,
          restAfterSec: 90,
        },
      ],
    }
    return { days }
  }
  const planOf = async (member: MemberDetail, token = t.admin) =>
    (await call('GET', `/members/${member.id}/workout-plan`, token)).json() as MemberWorkoutPlan
  const weightOn = (plan: WorkoutPlanView | null) =>
    (plan?.week.days[0]?.items[0] as { sets: { weightKg?: number }[] } | undefined)?.sets[0]?.weightKg

  beforeEach(async () => {
    const gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    t.owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    t.admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Desk A' }))
    const ravi = await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi' })
    t.ravi = await tokenFor(ravi)
    t.sita = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111104', role: 'trainer', name: 'Sita' }))
    t.ownerB = await tokenFor(
      await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }),
    )

    clock = new Date('2026-03-20T03:30:00Z') // Fri 20 Mar, 9 am in India
    ;({ app } = await startApp(ctx.db, {}, undefined, () => clock))

    asha = (await call('POST', '/members', t.admin, { name: 'Asha', phone: '9876500001' })).json()
    bina = (await call('POST', '/members', t.admin, { name: 'Bina', phone: '9876500002' })).json()
    t.asha = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: asha.userId } }))
    t.bina = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: bina.userId } }))

    // Asha has PT with Ravi: 10 days, so it expires on 29 Mar.
    const pkg = (
      await call('POST', '/pt-packages', t.owner, {
        name: '8 Sessions',
        sessionCount: 8,
        validityDays: 10,
        pricePaise: 800000,
      })
    ).json()
    await call('POST', `/members/${asha.id}/pt-purchases`, t.admin, {
      packageId: pkg.id,
      trainerId: ravi.id,
      payment: { method: 'cash' },
    })

    const library = (await call('POST', '/workout-exercises/starter', t.admin)).json() as WorkoutExercise[]
    bench = library.find((e) => e.name === 'Barbell Bench Press') as WorkoutExercise
    template = (
      await call('POST', '/workout-templates', t.admin, {
        name: 'Beginner split',
        notes: 'Warm up first',
        week: week(20),
      })
    ).json()
  })
  afterEach(async () => {
    await app.close()
  })

  describe('giving a member a plan', () => {
    it('the member gets their own copy: later changes to either side don’t affect the other', async () => {
      expect(await planOf(asha)).toEqual({ member: { id: asha.id, name: 'Asha' }, plan: null })

      const started = (
        await call('POST', `/members/${asha.id}/workout-plan`, t.admin, { templateId: template.id })
      ).json()
      expect(started.plan).toMatchObject({
        name: 'Beginner split',
        notes: 'Warm up first',
        memberId: asha.id,
        version: 1,
      })
      expect(started.plan.id).not.toBe(template.id)

      // The template gets heavier; Asha's copy doesn't.
      await call('PUT', `/workout-templates/${template.id}`, t.admin, {
        name: 'Beginner split',
        week: week(30),
        version: 1,
      })
      expect(weightOn((await planOf(asha)).plan)).toBe(20)

      // Asha's copy gets heavier; the template doesn't.
      const saved = await call('PUT', `/members/${asha.id}/workout-plan`, t.admin, {
        name: 'Asha’s plan',
        week: week(25),
        version: 1,
      })
      expect(saved.json().plan).toMatchObject({ name: 'Asha’s plan', version: 2 })
      expect(weightOn((await call('GET', `/workout-templates/${template.id}`, t.admin)).json())).toBe(30)
    })

    it('a blank plan, then a template on top keeps the blank one in the history', async () => {
      const blank = (await call('POST', `/members/${bina.id}/workout-plan`, t.admin, {})).json() as MemberWorkoutPlan
      expect(blank.plan).toMatchObject({ name: 'Workout plan', version: 1, trainingDays: 0 })
      expect(blank.plan?.week.days).toHaveLength(7)

      const switched = (
        await call('POST', `/members/${bina.id}/workout-plan`, t.owner, { templateId: template.id })
      ).json()
      expect(switched.plan).toMatchObject({ name: 'Beginner split', version: 2, updatedByName: 'Owner A' })
      const versions = (await call('GET', `/members/${bina.id}/workout-plan/versions`, t.admin)).json()
      expect(versions).toEqual([expect.objectContaining({ version: 1, name: 'Workout plan', savedByName: 'Desk A' })])
    })

    it('two people editing: the later save is refused instead of overwriting', async () => {
      await call('POST', `/members/${asha.id}/workout-plan`, t.admin, { templateId: template.id })
      await call('PUT', `/members/${asha.id}/workout-plan`, t.ravi, { name: 'Ravi’s', week: week(25), version: 1 })
      const stale = await call('PUT', `/members/${asha.id}/workout-plan`, t.admin, {
        name: 'Desk',
        week: week(15),
        version: 1,
      })
      expect(stale.json().error.code).toBe('PLAN_CHANGED')
      expect(weightOn((await planOf(asha)).plan)).toBe(25)
    })
  })

  describe('who can edit', () => {
    it('trainers edit only their PT clients’ plans, while the package is active', async () => {
      // Ravi trains Asha.
      const byRavi = await call('POST', `/members/${asha.id}/workout-plan`, t.ravi, { templateId: template.id })
      expect(byRavi.statusCode).toBe(200)
      expect(byRavi.json().plan.updatedByName).toBe('Ravi')
      expect(
        (await call('PUT', `/members/${asha.id}/workout-plan`, t.ravi, { name: 'Heavier', week: week(25), version: 1 }))
          .statusCode,
      ).toBe(200)

      // Not Bina (no PT), and not Sita (not her client).
      expect((await call('GET', `/members/${bina.id}/workout-plan`, t.ravi)).statusCode).toBe(404)
      expect((await call('POST', `/members/${bina.id}/workout-plan`, t.ravi, {})).statusCode).toBe(404)
      expect((await call('GET', `/members/${asha.id}/workout-plan`, t.sita)).statusCode).toBe(404)
      expect(
        (
          await call('PUT', `/members/${asha.id}/workout-plan`, t.sita, {
            name: 'Sita plan',
            week: week(10),
            version: 2,
          })
        ).statusCode,
      ).toBe(404)

      // Members use their own read-only view instead.
      expect((await call('GET', `/members/${asha.id}/workout-plan`, t.asha)).statusCode).toBe(403)

      // After the package expires (29 Mar), Ravi no longer has access; the desk still does.
      clock = new Date('2026-03-30T03:30:00Z')
      expect((await call('GET', `/members/${asha.id}/workout-plan`, t.ravi)).statusCode).toBe(404)
      expect((await planOf(asha)).plan?.name).toBe('Heavier')
    })
  })

  describe('what the member sees', () => {
    it('their own plan, or nothing yet', async () => {
      expect((await call('GET', '/me/workout-plan', t.bina)).json()).toEqual({ plan: null })
      await call('POST', `/members/${asha.id}/workout-plan`, t.admin, { templateId: template.id })
      const mine = (await call('GET', '/me/workout-plan', t.asha)).json() as MyWorkoutPlan
      expect(mine.plan).toMatchObject({ name: 'Beginner split', memberId: asha.id })
      expect(mine.plan?.exercises.map((e) => e.name)).toEqual(['Barbell Bench Press'])
      expect((await call('GET', '/me/workout-plan', t.ravi)).json()).toEqual({ plan: null })
    })
  })

  describe('gym isolation', () => {
    it('gym B can’t see or change gym A members’ plans or use gym A templates', async () => {
      await call('POST', `/members/${asha.id}/workout-plan`, t.admin, { templateId: template.id })
      const attempts = await Promise.all([
        call('GET', `/members/${asha.id}/workout-plan`, t.ownerB),
        call('POST', `/members/${asha.id}/workout-plan`, t.ownerB, {}),
        call('PUT', `/members/${asha.id}/workout-plan`, t.ownerB, { name: 'Hacked', week: { days: [] }, version: 1 }),
        call('GET', `/members/${asha.id}/workout-plan/versions`, t.ownerB),
      ])
      expect(attempts.map((r) => r.statusCode)).toEqual([404, 404, 400, 404])

      const theirs = (await call('POST', '/members', t.ownerB, { name: 'Zed', phone: '9876500099' })).json()
      const steal = await call('POST', `/members/${theirs.id}/workout-plan`, t.ownerB, { templateId: template.id })
      expect(steal.statusCode).toBe(404)
      expect((await planOf(asha)).plan).toMatchObject({ name: 'Beginner split', version: 1 })
    })
  })
})
