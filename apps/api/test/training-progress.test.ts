import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { LoggedItem, MemberDetail, TrainingProgress, WorkoutExercise } from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

describe.skipIf(!testDatabaseUrl)('Training progress (strength and consistency)', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  const t = {} as Record<'owner' | 'admin' | 'ravi' | 'sita' | 'asha' | 'ownerB', string>
  let raviId: string
  let gymA: string
  let asha: MemberDetail
  let memberB: MemberDetail
  let lib: Record<'squat' | 'bench' | 'curl' | 'treadmill', WorkoutExercise>

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  const lift = (e: WorkoutExercise, ...sets: [reps: number, kg?: number][]): LoggedItem => ({
    kind: 'strength',
    exerciseId: e.id,
    sets: sets.map(([reps, weightKg]) => (weightKg === undefined ? { reps } : { reps, weightKg })),
    skipped: false,
  })
  /** Logs written straight to the database, so any date can be used. */
  const log = (memberId: string, gymId: string, date: string, items: LoggedItem[], savedById: string) =>
    ctx.db.workoutLog.create({ data: { gymId, memberId, date: new Date(`${date}T00:00:00Z`), items, savedById } })

  beforeEach(async () => {
    gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    t.owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    t.admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Desk A' }))
    const ravi = await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi' })
    raviId = ravi.id
    t.ravi = await tokenFor(ravi)
    t.sita = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111104', role: 'trainer', name: 'Sita' }))
    t.ownerB = await tokenFor(
      await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }),
    )

    const clock = new Date('2026-03-25T03:30:00Z') // Wed 25 Mar in India; this week starts Mon 23 Mar
    ;({ app } = await startApp(ctx.db, {}, undefined, () => clock))

    asha = (await call('POST', '/members', t.admin, { name: 'Asha', phone: '9876500001' })).json()
    memberB = (await call('POST', '/members', t.ownerB, { name: 'Bela', phone: '9876500009' })).json()
    t.asha = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: asha.userId } }))
    await call('PUT', `/members/${asha.id}/coach`, t.admin, { coachId: raviId })

    const all = (await call('POST', '/workout-exercises/starter', t.admin)).json() as WorkoutExercise[]
    const find = (name: string) => all.find((e) => e.name === name) as WorkoutExercise
    lib = {
      squat: find('Barbell Squat'),
      bench: find('Barbell Bench Press'),
      curl: find('Barbell Curl'),
      treadmill: find('Treadmill'),
    }
  })
  afterEach(async () => {
    await app.close()
  })

  it('shows the heaviest set per week for the most-trained lifts, and workouts per week', async () => {
    const me = asha.userId
    // Week of 9 Mar: two days.
    await log(asha.id, gymA, '2026-03-09', [lift(lib.squat, [10, 40], [8, 45]), lift(lib.bench, [10, 20])], me)
    await log(asha.id, gymA, '2026-03-11', [lift(lib.squat, [8, 45], [6, 45]), lift(lib.curl, [12, 7.5])], me)
    // Week of 16 Mar: one day; skipped and unweighted sets don't count.
    await log(
      asha.id,
      gymA,
      '2026-03-16',
      [
        lift(lib.squat, [5, 50]),
        { ...lift(lib.bench, [5, 80]), skipped: true },
        lift(lib.curl, [15]),
        { kind: 'cardio', exerciseId: lib.treadmill.id, minutes: 20, skipped: false },
      ],
      me,
    )
    // This week: three days.
    await log(asha.id, gymA, '2026-03-23', [lift(lib.squat, [5, 52.5]), lift(lib.bench, [8, 25])], me)
    await log(
      asha.id,
      gymA,
      '2026-03-24',
      [{ kind: 'cardio', exerciseId: lib.treadmill.id, minutes: 30, skipped: false }],
      me,
    )
    await log(asha.id, gymA, '2026-03-25', [lift(lib.bench, [10, 25])], me)
    // Too long ago for the graphs (more than 26 weeks).
    await log(asha.id, gymA, '2025-09-01', [lift(lib.squat, [5, 100])], me)

    const mine = (await call('GET', '/me/training-progress', t.asha)).json() as TrainingProgress
    expect(mine.lifts.map((l) => l.name)).toEqual(['Barbell Squat', 'Barbell Bench Press', 'Barbell Curl'])
    expect(mine.lifts[0]?.points).toEqual([
      { date: '2026-03-09', weightKg: 45, reps: 8 },
      { date: '2026-03-16', weightKg: 50, reps: 5 },
      { date: '2026-03-23', weightKg: 52.5, reps: 5 },
    ])
    // Same weight twice in a week: the set with more reps.
    expect(mine.lifts[1]?.points.at(-1)).toEqual({ date: '2026-03-23', weightKg: 25, reps: 10 })
    expect(mine.weeks.slice(-3)).toEqual([
      { weekOf: '2026-03-09', done: 2 },
      { weekOf: '2026-03-16', done: 1 },
      { weekOf: '2026-03-23', done: 3 },
    ])
    expect(mine.weeks).toHaveLength(8)
    expect(mine.plannedPerWeek).toBeNull()

    // With a plan, the planned days a week come along.
    await call('POST', `/members/${asha.id}/workout-plan`, t.ravi, {})
    const week = Array.from({ length: 7 }, (_, i) =>
      i < 4
        ? {
            title: 'Day',
            rest: false,
            items: [
              {
                kind: 'strength',
                exerciseId: lib.squat.id,
                sets: [{ reps: 5 }],
                restBetweenSetsSec: 60,
                restAfterSec: 60,
              },
            ],
          }
        : { rest: true, items: [] },
    )
    await call('PUT', `/members/${asha.id}/workout-plan`, t.ravi, { name: 'Plan', week: { days: week }, version: 1 })
    expect(((await call('GET', '/me/training-progress', t.asha)).json() as TrainingProgress).plannedPerWeek).toBe(4)
  })

  it('a new member has empty progress; staff see it like workout tracking', async () => {
    const empty = (await call('GET', '/me/training-progress', t.asha)).json() as TrainingProgress
    expect(empty.lifts).toEqual([])
    expect(empty.weeks.every((w) => w.done === 0)).toBe(true)

    expect((await call('GET', `/members/${asha.id}/training-progress`, t.ravi)).statusCode).toBe(200)
    expect((await call('GET', `/members/${asha.id}/training-progress`, t.admin)).statusCode).toBe(200)
    expect((await call('GET', `/members/${asha.id}/training-progress`, t.sita)).statusCode).toBe(404)
    expect((await call('GET', `/members/${asha.id}/training-progress`, t.asha)).statusCode).toBe(403)
    expect((await call('GET', '/me/training-progress', t.ravi)).json().error.code).toBe('NOT_A_MEMBER')
  })

  it('gym A cannot see gym B’s training progress', async () => {
    expect((await call('GET', `/members/${memberB.id}/training-progress`, t.owner)).statusCode).toBe(404)
    expect((await call('GET', `/members/${memberB.id}/training-progress`, t.ownerB)).statusCode).toBe(200)
  })
})
