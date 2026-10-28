import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  plannedToLogged,
  type LoggedItem,
  type MemberDetail,
  type WorkoutCalendarWeek,
  type WorkoutExercise,
  type WorkoutWeek,
} from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

describe.skipIf(!testDatabaseUrl)('Workout tracking (weekly calendar)', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let clock: Date
  const t = {} as Record<'owner' | 'admin' | 'ravi' | 'sita' | 'asha' | 'bina' | 'ownerB', string>
  let asha: MemberDetail
  let bina: MemberDetail
  let bench: WorkoutExercise
  let curl: WorkoutExercise
  let treadmill: WorkoutExercise

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })
  const myWeek = async (start?: string, token = t.asha) =>
    (await call('GET', `/me/workout-week${start ? `?start=${start}` : ''}`, token)).json() as WorkoutCalendarWeek
  const tick = (date: string, items: LoggedItem[], token = t.asha, note?: string) =>
    call('PUT', `/me/workout-days/${date}`, token, { items, note })

  /** Mon and Wed: bench 12 × weight; Tue: 20 min treadmill; Sun: rest. */
  function plan(weightKg: number): WorkoutWeek {
    const days: WorkoutWeek['days'] = Array.from({ length: 7 }, () => ({ rest: false, items: [] }))
    const chest = {
      title: 'Chest',
      rest: false,
      items: [
        {
          kind: 'strength' as const,
          exerciseId: bench.id,
          sets: [
            { reps: 12, weightKg },
            { reps: 12, weightKg },
          ],
          restBetweenSetsSec: 60,
          restAfterSec: 90,
        },
      ],
    }
    days[0] = chest
    days[2] = chest
    days[1] = {
      title: 'Cardio',
      rest: false,
      items: [{ kind: 'cardio', exerciseId: treadmill.id, minutes: 20, restAfterSec: 0 }],
    }
    days[6] = { rest: true, items: [] }
    return { days }
  }

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

    clock = new Date('2026-03-25T03:30:00Z') // Wednesday 25 Mar, 9 am in India
    ;({ app } = await startApp(ctx.db, {}, undefined, () => clock))

    asha = (await call('POST', '/members', t.admin, { name: 'Asha', phone: '9876500001' })).json()
    bina = (await call('POST', '/members', t.admin, { name: 'Bina', phone: '9876500002' })).json()
    t.asha = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: asha.userId } }))
    t.bina = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: bina.userId } }))

    const library = (await call('POST', '/workout-exercises/starter', t.admin)).json() as WorkoutExercise[]
    const find = (name: string) => library.find((e) => e.name === name) as WorkoutExercise
    bench = find('Barbell Bench Press')
    curl = find('Barbell Curl')
    treadmill = find('Treadmill')

    await call('POST', `/members/${asha.id}/workout-plan`, t.admin, {})
    await call('PUT', `/members/${asha.id}/workout-plan`, t.admin, { name: 'Asha plan', week: plan(20), version: 1 })

    // Ravi trains Asha (so he can see her calendar).
    const pkg = (
      await call('POST', '/pt-packages', t.owner, {
        name: '8 Sessions',
        sessionCount: 8,
        validityDays: 30,
        pricePaise: 800000,
      })
    ).json()
    await call('POST', `/members/${asha.id}/pt-purchases`, t.admin, { packageId: pkg.id, trainerId: ravi.id })
  })
  afterEach(async () => {
    await app.close()
  })

  it('shows the week with each day’s plan pre-filled and its status', async () => {
    const week = await myWeek()
    expect(week).toMatchObject({ start: '2026-03-23', today: '2026-03-25', hasPlan: true })
    expect(week.days.map((d) => [d.date, d.title, d.status, d.canLog])).toEqual([
      ['2026-03-23', 'Chest', 'todo', true],
      ['2026-03-24', 'Cardio', 'todo', true],
      ['2026-03-25', 'Chest', 'todo', true],
      ['2026-03-26', null, 'upcoming', false],
      ['2026-03-27', null, 'upcoming', false],
      ['2026-03-28', null, 'upcoming', false],
      ['2026-03-29', null, 'rest', false],
    ])
    expect(week.days[0]?.planned[0]).toMatchObject({
      exerciseId: bench.id,
      sets: [
        { reps: 12, weightKg: 20 },
        { reps: 12, weightKg: 20 },
      ],
    })
    expect(week.exercises.map((e) => e.name).sort()).toEqual(['Barbell Bench Press', 'Treadmill'])

    // Last week: older than 7 days is missed and locked; within 7 days can still be ticked.
    const last = await myWeek('2026-03-16')
    expect(last.days.map((d) => [d.date, d.status, d.canLog]).slice(0, 3)).toEqual([
      ['2026-03-16', 'missed', false],
      ['2026-03-17', 'missed', false],
      ['2026-03-18', 'todo', true],
    ])
  })

  it('mark done as planned, or update what was done; "last time" shows the previous result', async () => {
    const monday = (await myWeek()).days[0]!
    const done = await tick('2026-03-23', monday.planned.map(plannedToLogged))
    expect(done.statusCode).toBe(200)
    const after = done.json() as WorkoutCalendarWeek
    expect(after.days[0]).toMatchObject({ status: 'done', log: { dayTitle: 'Chest', savedByName: 'Asha' } })

    // Wednesday: heavier, a third set, an extra exercise, and a note.
    const wednesday: LoggedItem[] = [
      {
        kind: 'strength',
        exerciseId: bench.id,
        sets: [
          { reps: 12, weightKg: 22.5 },
          { reps: 10, weightKg: 25 },
          { reps: 8, weightKg: 25 },
        ],
        skipped: false,
      },
      { kind: 'strength', exerciseId: curl.id, sets: [{ reps: 12, weightKg: 10 }], skipped: false },
    ]
    const wed = (await tick('2026-03-25', wednesday, t.asha, 'Felt strong')).json() as WorkoutCalendarWeek
    expect(wed.days[2]?.log).toMatchObject({ note: 'Felt strong', items: wednesday })
    expect(wed.days[2]?.lastTime[bench.id]).toEqual({
      date: '2026-03-23',
      item: expect.objectContaining({
        sets: [
          { reps: 12, weightKg: 20 },
          { reps: 12, weightKg: 20 },
        ],
      }),
    })
    expect(wed.days[2]?.lastTime[curl.id]).toBeUndefined()

    // Tuesday's cardio skipped, so it doesn't count as "last time"; bench on Tuesday isn't planned.
    const tue = await tick('2026-03-24', [{ kind: 'cardio', exerciseId: treadmill.id, minutes: 20, skipped: true }])
    expect(tue.json().error.message).toBe('Mark at least one exercise as done')

    // Editing Monday again within the window replaces it.
    const again = (
      await tick('2026-03-23', [{ ...plannedToLogged(monday.planned[0]!), skipped: false }], t.asha, 'Fixed')
    ).json()
    expect(again.days[0].log.note).toBe('Fixed')
    expect(await ctx.db.workoutLog.count()).toBe(2)
  })

  it('history stays as it was when the plan changes later', async () => {
    const monday = (await myWeek()).days[0]!
    await tick('2026-03-23', monday.planned.map(plannedToLogged))
    await call('PUT', `/members/${asha.id}/workout-plan`, t.admin, { name: 'Heavier', week: plan(30), version: 2 })

    const week = await myWeek()
    expect((week.days[0]?.log?.items[0] as { sets: { weightKg?: number }[] }).sets[0]?.weightKg).toBe(20)
    expect((week.days[0]?.planned[0] as { sets: { weightKg?: number }[] }).sets[0]?.weightKg).toBe(30)
    const row = await ctx.db.workoutLog.findFirstOrThrow()
    expect(row.planVersion).toBe(2)
  })

  it('only today and the past 7 days, never a rest day, and only with a plan', async () => {
    const item: LoggedItem[] = [{ kind: 'strength', exerciseId: bench.id, sets: [{ reps: 10 }], skipped: false }]
    expect((await tick('2026-03-26', item)).json().error.code).toBe('WORKOUT_DATE_LOCKED') // tomorrow
    expect((await tick('2026-03-17', item)).json().error.code).toBe('WORKOUT_DATE_LOCKED') // 8 days ago
    expect((await tick('2026-03-22', item)).json().error.code).toBe('WORKOUT_REST_DAY') // last Sunday
    expect((await tick('2026-03-18', item)).statusCode).toBe(200) // 7 days ago

    // A cardio exercise logged as sets is refused.
    const wrong = await tick('2026-03-24', [
      { kind: 'strength', exerciseId: treadmill.id, sets: [{ reps: 10 }], skipped: false },
    ])
    expect(wrong.json().error.code).toBe('UNKNOWN_EXERCISE')

    expect((await myWeek(undefined, t.bina)).hasPlan).toBe(false)
    expect((await tick('2026-03-25', item, t.bina)).json().error.code).toBe('NO_WORKOUT_PLAN')
    expect((await call('GET', '/me/workout-week', t.ravi)).statusCode).toBe(403)
  })

  it('their PT trainer and the desk can look (read-only); nobody else', async () => {
    const monday = (await myWeek()).days[0]!
    await tick('2026-03-23', monday.planned.map(plannedToLogged))

    for (const token of [t.ravi, t.admin]) {
      const week = (await call('GET', `/members/${asha.id}/workout-week`, token)).json() as WorkoutCalendarWeek
      expect(week.days[0]).toMatchObject({ status: 'done', canLog: false })
      expect(week.days.every((d) => !d.canLog)).toBe(true)
    }
    expect((await call('GET', `/members/${asha.id}/workout-week`, t.sita)).statusCode).toBe(404)
    expect((await call('GET', `/members/${asha.id}/workout-week`, t.bina)).statusCode).toBe(403)
    expect((await call('GET', `/members/${asha.id}/workout-week`, t.ownerB)).statusCode).toBe(404)
    // Staff can't tick a member's day: the tick route is the member's own.
    expect(
      (await call('PUT', '/me/workout-days/2026-03-24', t.admin, { items: monday.planned.map(plannedToLogged) }))
        .statusCode,
    ).toBe(403)
  })
})
