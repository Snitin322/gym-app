import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { WorkoutExercise, WorkoutPlanVersionView, WorkoutPlanView, WorkoutWeek } from '@onthec/shared'
import { STARTER_EXERCISES } from '../src/services/workout-starter'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

describe.skipIf(!testDatabaseUrl)('Workout library and plan templates', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  const t = {} as Record<'owner' | 'admin' | 'trainer' | 'member' | 'ownerB', string>
  let bench: WorkoutExercise
  let curl: WorkoutExercise
  let treadmill: WorkoutExercise

  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  /** Mon: chest pyramid, Tue: treadmill, Wed–Sat empty, Sun: rest. */
  function week(): WorkoutWeek {
    const days: WorkoutWeek['days'] = Array.from({ length: 7 }, () => ({ rest: false, items: [] }))
    days[0] = {
      title: 'Chest + Triceps',
      rest: false,
      items: [
        {
          kind: 'strength',
          exerciseId: bench.id,
          sets: [
            { reps: 12, weightKg: 20 },
            { reps: 10, weightKg: 22.5 },
            { reps: 8, weightKg: 25 },
          ],
          restBetweenSetsSec: 90,
          restAfterSec: 120,
          note: 'Slow on the way down',
        },
      ],
    }
    days[1] = {
      title: 'Cardio',
      rest: false,
      items: [
        { kind: 'cardio', exerciseId: treadmill.id, minutes: 20, distanceKm: 2.5, restAfterSec: 0, note: 'Incline 6' },
      ],
    }
    days[6] = { rest: true, items: [] }
    return { days }
  }

  beforeEach(async () => {
    const gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    t.owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    t.admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Desk A' }))
    t.trainer = await tokenFor(
      await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi' }),
    )
    t.member = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111104', role: 'member', name: 'Asha' }))
    t.ownerB = await tokenFor(
      await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }),
    )
    ;({ app } = await startApp(ctx.db))

    const library = (await call('POST', '/workout-exercises/starter', t.admin)).json() as WorkoutExercise[]
    const find = (name: string) => library.find((e) => e.name === name) as WorkoutExercise
    bench = find('Barbell Bench Press')
    curl = find('Barbell Curl')
    treadmill = find('Treadmill')
  })
  afterEach(async () => {
    await app.close()
  })

  describe('exercise library', () => {
    it('adds the common exercises once; staff can read it, members can’t', async () => {
      const again = (await call('POST', '/workout-exercises/starter', t.owner)).json()
      expect(again).toHaveLength(STARTER_EXERCISES.length)
      expect(treadmill).toMatchObject({ kind: 'cardio', muscleGroup: 'Cardio', active: true })

      expect((await call('GET', '/workout-exercises', t.trainer)).json()).toHaveLength(STARTER_EXERCISES.length)
      expect((await call('GET', '/workout-exercises', t.member)).statusCode).toBe(403)
      expect((await call('POST', '/workout-exercises/starter', t.trainer)).statusCode).toBe(403)
    })

    it('owners and admins add and edit exercises; names are unique; deactivated ones are hidden', async () => {
      const res = await call('POST', '/workout-exercises', t.admin, {
        name: 'Battle Ropes',
        muscleGroup: 'Full body',
        kind: 'cardio',
        description: 'Alternate waves',
        videoUrl: 'https://youtu.be/example',
      })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ name: 'Battle Ropes', videoUrl: 'https://youtu.be/example' })

      const dup = await call('POST', '/workout-exercises', t.admin, { name: 'Battle Ropes', kind: 'cardio' })
      expect(dup.json().error.code).toBe('EXERCISE_NAME_TAKEN')
      const badLink = await call('POST', '/workout-exercises', t.admin, {
        name: 'Rope',
        kind: 'cardio',
        videoUrl: 'youtube',
      })
      expect(badLink.json().error.message).toBe('Video link must start with https://')
      expect((await call('POST', '/workout-exercises', t.trainer, { name: 'X', kind: 'cardio' })).statusCode).toBe(403)

      await call('PATCH', `/workout-exercises/${curl.id}`, t.owner, { active: false, description: '' })
      const active = (await call('GET', '/workout-exercises', t.admin)).json() as WorkoutExercise[]
      expect(active.some((e) => e.id === curl.id)).toBe(false)
      const all = (await call('GET', '/workout-exercises?all=1', t.admin)).json() as WorkoutExercise[]
      expect(all.find((e) => e.id === curl.id)).toMatchObject({ active: false, description: null })
    })
  })

  describe('templates', () => {
    it('saves a week with sets, rests and cardio, and shows it with its exercises', async () => {
      const res = await call('POST', '/workout-templates', t.admin, { name: 'Beginner split', week: week() })
      expect(res.statusCode).toBe(201)
      const plan = res.json() as WorkoutPlanView
      expect(plan).toMatchObject({
        name: 'Beginner split',
        version: 1,
        trainingDays: 2,
        memberId: null,
        updatedByName: 'Desk A',
      })
      expect(plan.week.days[0]?.items[0]).toMatchObject({
        sets: [
          { reps: 12, weightKg: 20 },
          { reps: 10, weightKg: 22.5 },
          { reps: 8, weightKg: 25 },
        ],
      })
      expect(plan.exercises.map((e) => e.name).sort()).toEqual(['Barbell Bench Press', 'Treadmill'])

      expect((await call('GET', '/workout-templates', t.trainer)).json()).toEqual([
        expect.objectContaining({ id: plan.id, name: 'Beginner split', trainingDays: 2 }),
      ])
      expect((await call('GET', `/workout-templates/${plan.id}`, t.trainer)).json().week).toEqual(plan.week)
      expect((await call('GET', '/workout-templates', t.member)).statusCode).toBe(403)
      expect((await call('POST', '/workout-templates', t.trainer, { name: 'Mine', week: week() })).statusCode).toBe(403)
    })

    it('refuses plans that don’t make sense', async () => {
      const bad = async (change: (w: WorkoutWeek) => void) => {
        const w = week()
        change(w)
        return (await call('POST', '/workout-templates', t.admin, { name: 'Bad', week: w })).json().error
      }
      const strength = (w: WorkoutWeek) =>
        w.days[0]!.items[0] as Extract<WorkoutWeek['days'][0]['items'][0], { kind: 'strength' }>

      expect((await bad((w) => (strength(w).sets[0]!.weightKg = 22.3))).message).toBe(
        'Weight must be in steps of 0.25 kg',
      )
      expect((await bad((w) => (strength(w).sets[0] = { weightKg: 20 }))).message).toBe(
        'Each set needs reps or seconds (one of them)',
      )
      expect((await bad((w) => (w.days[6] = { rest: true, items: w.days[0]!.items }))).message).toBe(
        'A rest day has no exercises',
      )
      expect((await bad((w) => w.days.pop())).message).toBe('A week has 7 days')
      // A cardio exercise used as a strength item, or an exercise from another gym.
      expect((await bad((w) => (strength(w).exerciseId = treadmill.id))).code).toBe('UNKNOWN_EXERCISE')
      const other = (
        await call('POST', '/workout-exercises', t.ownerB, { name: 'Their Press', kind: 'strength' })
      ).json()
      expect((await bad((w) => (strength(w).exerciseId = other.id))).code).toBe('UNKNOWN_EXERCISE')
    })

    it('every save keeps the previous version; a stale save is refused', async () => {
      const plan = (
        await call('POST', '/workout-templates', t.admin, { name: 'Beginner split', week: week() })
      ).json() as WorkoutPlanView
      const heavier = week()
      const item = heavier.days[0]!.items[0] as { sets: { reps?: number; weightKg?: number }[] }
      item.sets = [
        { reps: 8, weightKg: 30 },
        { reps: 8, weightKg: 30 },
      ]

      const saved = await call('PUT', `/workout-templates/${plan.id}`, t.owner, {
        name: 'Intermediate split',
        week: heavier,
        version: 1,
      })
      expect(saved.json()).toMatchObject({ name: 'Intermediate split', version: 2, updatedByName: 'Owner A' })

      const stale = await call('PUT', `/workout-templates/${plan.id}`, t.admin, {
        name: 'Oops',
        week: week(),
        version: 1,
      })
      expect(stale.statusCode).toBe(409)
      expect(stale.json().error).toEqual({
        code: 'PLAN_CHANGED',
        message: 'Owner A saved this plan just now. Reload to see their changes, then make yours again.',
      })

      const versions = (
        await call('GET', `/workout-templates/${plan.id}/versions`, t.admin)
      ).json() as WorkoutPlanVersionView[]
      expect(versions).toHaveLength(1)
      expect(versions[0]).toMatchObject({ version: 1, name: 'Beginner split', savedByName: 'Desk A' })
      expect((versions[0]!.week.days[0]!.items[0] as { sets: unknown[] }).sets).toHaveLength(3)
    })

    it('a deactivated exercise can stay in a plan but can’t be added again', async () => {
      const plan = (
        await call('POST', '/workout-templates', t.admin, { name: 'Split', week: week() })
      ).json() as WorkoutPlanView
      await call('PATCH', `/workout-exercises/${bench.id}`, t.admin, { active: false })
      expect(
        (await call('PUT', `/workout-templates/${plan.id}`, t.admin, { name: 'Split', week: week(), version: 1 }))
          .statusCode,
      ).toBe(200)

      await call('PATCH', `/workout-exercises/${curl.id}`, t.admin, { active: false })
      const withCurl = week()
      withCurl.days[2] = {
        rest: false,
        items: [
          { kind: 'strength', exerciseId: curl.id, sets: [{ reps: 10 }], restBetweenSetsSec: 60, restAfterSec: 60 },
        ],
      }
      const res = await call('PUT', `/workout-templates/${plan.id}`, t.admin, {
        name: 'Split',
        week: withCurl,
        version: 2,
      })
      expect(res.json().error.code).toBe('UNKNOWN_EXERCISE')
    })

    it('templates can be deleted by owners and admins', async () => {
      const plan = (
        await call('POST', '/workout-templates', t.admin, { name: 'Split', week: week() })
      ).json() as WorkoutPlanView
      await call('PUT', `/workout-templates/${plan.id}`, t.admin, { name: 'Split 2', week: week(), version: 1 })
      expect((await call('DELETE', `/workout-templates/${plan.id}`, t.trainer)).statusCode).toBe(403)
      expect((await call('DELETE', `/workout-templates/${plan.id}`, t.owner)).statusCode).toBe(204)
      expect((await call('GET', `/workout-templates/${plan.id}`, t.admin)).statusCode).toBe(404)
      expect(await ctx.db.workoutPlanVersion.count()).toBe(0)
    })
  })

  describe('gym isolation', () => {
    it('gym B can’t see or change gym A exercises or templates', async () => {
      const plan = (
        await call('POST', '/workout-templates', t.admin, { name: 'Split', week: week() })
      ).json() as WorkoutPlanView
      const attempts = await Promise.all([
        call('GET', `/workout-templates/${plan.id}`, t.ownerB),
        call('PUT', `/workout-templates/${plan.id}`, t.ownerB, { name: 'Hacked', week: week(), version: 1 }),
        call('DELETE', `/workout-templates/${plan.id}`, t.ownerB),
        call('GET', `/workout-templates/${plan.id}/versions`, t.ownerB),
        call('PATCH', `/workout-exercises/${bench.id}`, t.ownerB, { name: 'Hacked' }),
      ])
      expect(attempts.map((r) => r.statusCode)).toEqual([404, 404, 404, 404, 404])
      expect((await call('GET', '/workout-templates', t.ownerB)).json()).toEqual([])
      expect((await call('GET', '/workout-exercises', t.ownerB)).json()).toEqual([])
      expect((await call('GET', `/workout-templates/${plan.id}`, t.admin)).json()).toMatchObject({
        name: 'Split',
        version: 1,
      })
    })
  })
})
