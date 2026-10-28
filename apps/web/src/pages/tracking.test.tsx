// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import {
  addDays,
  emptyWeek,
  isoWeekday,
  todayInIndia,
  weekStart,
  type WorkoutCalendarDay,
  type WorkoutCalendarWeek,
  type WorkoutExercise,
  type WorkoutPlanView,
} from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

const bench: WorkoutExercise = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Barbell Bench Press',
  muscleGroup: 'Chest',
  kind: 'strength',
  description: null,
  videoUrl: null,
  active: true,
}
const treadmill: WorkoutExercise = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Treadmill',
  muscleGroup: 'Cardio',
  kind: 'cardio',
  description: null,
  videoUrl: null,
  active: true,
}

const today = todayInIndia()
const start = weekStart(today)
const todayIndex = isoWeekday(today) - 1
const planned = {
  kind: 'strength' as const,
  exerciseId: bench.id,
  sets: [
    { reps: 12, weightKg: 20 },
    { reps: 10, weightKg: 22.5 },
  ],
  restBetweenSetsSec: 60,
  restAfterSec: 90,
}
const cardio = { kind: 'cardio' as const, exerciseId: treadmill.id, minutes: 20, restAfterSec: 0 }

const memberPlan: WorkoutPlanView = {
  id: 'mp-1',
  name: 'Asha plan',
  trainingDays: 6,
  version: 1,
  updatedAt: new Date().toISOString(),
  updatedByName: 'Ravi',
  memberId: 'mem-1',
  notes: null,
  week: emptyWeek(),
  exercises: [bench, treadmill],
}

/** This week: Sunday rest, other days "Chest"; today is to do with "last time" for the bench. */
function calendar(todayOverrides: Partial<WorkoutCalendarDay> = {}): WorkoutCalendarWeek {
  const days: WorkoutCalendarDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    return {
      date,
      title: i === 6 ? null : 'Chest',
      rest: i === 6,
      status: i === 6 ? 'rest' : date > today ? 'upcoming' : 'todo',
      canLog: i !== 6 && date <= today,
      planned: i === 6 ? [] : [planned, cardio],
      log: null,
      lastTime: {},
    }
  })
  days[todayIndex] = {
    ...(days[todayIndex] as WorkoutCalendarDay),
    rest: false,
    title: 'Chest',
    status: 'todo',
    canLog: true,
    planned: [planned, cardio],
    lastTime: {
      [bench.id]: {
        date: addDays(today, -7),
        item: { kind: 'strength', exerciseId: bench.id, sets: [{ reps: 12, weightKg: 17.5 }], skipped: false },
      },
    },
    ...todayOverrides,
  }
  return { start, today, hasPlan: true, days, exercises: [bench, treadmill] }
}

function memberHome(week: WorkoutCalendarWeek) {
  return mockApi({
    'POST /auth/refresh': ok(session(sessionUser({ role: 'member', name: 'Asha Patel' }))),
    'GET /me/membership': ok({ current: null, history: [], duePaise: 0, payments: [] }),
    'GET /me/renewal-options': ok({ onlinePayments: false, startDate: '', plans: [] }),
    'GET /me/pt': ok([]),
    'GET /me/workout-plan': ok({ plan: memberPlan }),
    [`GET /me/workout-week?start=${start}`]: ok(week),
    [`PUT /me/workout-days/${today}`]: ok(calendar({ status: 'done' })),
    'GET /workout-exercises': ok([bench, treadmill]),
  })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <App />
      </AppProviders>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setAccessToken(null)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('workout tracking calendar', () => {
  it('shows the week; today is pre-filled from the plan with last time, and Mark done saves it as planned', async () => {
    const { callsTo } = memberHome(calendar())
    const user = userEvent.setup()
    renderAt('/home')

    const week = await screen.findByRole('region', { name: 'My week' })
    expect(await within(week).findAllByRole('tab')).toHaveLength(7)
    expect(within(week).getByRole('tab', { selected: true }).getAttribute('aria-label')).toMatch(/To do$/)
    expect(within(week).getByRole('tab', { name: /^Sun .*Rest$/ })).toBeTruthy()
    const day = within(week).getByRole('article')
    expect(within(day).getByText('12 reps × 20 kg, 10 reps × 22.5 kg')).toBeTruthy()
    expect(within(day).getByText(/^Last time \(.*\): 12 reps × 17\.5 kg$/)).toBeTruthy()

    await user.click(within(day).getByRole('button', { name: 'Mark done' }))
    await vi.waitFor(() => expect(callsTo(`PUT /me/workout-days/${today}`)).toHaveLength(1))
    expect(callsTo(`PUT /me/workout-days/${today}`)[0]?.body).toEqual({
      items: [
        { kind: 'strength', exerciseId: bench.id, sets: planned.sets, skipped: false },
        { kind: 'cardio', exerciseId: treadmill.id, minutes: 20, skipped: false },
      ],
    })
  })

  it('Update what I did: heavier weight, an extra set, skip cardio, add a note', async () => {
    const { callsTo } = memberHome(calendar())
    const user = userEvent.setup()
    renderAt('/home')

    const week = await screen.findByRole('region', { name: 'My week' })
    await user.click(await within(week).findByRole('button', { name: 'Update what I did' }))
    const weight = within(week).getByLabelText('Barbell Bench Press set 2 weight (kg)')
    await user.clear(weight)
    await user.type(weight, '25')
    await user.click(within(week).getByRole('button', { name: 'Add a set' }))
    const treadmillItem = within(week).getByRole('listitem', { name: 'Treadmill' })
    await user.click(within(treadmillItem).getByLabelText('Skipped'))
    await user.type(within(week).getByLabelText('Note (optional)'), 'Felt strong')
    await user.click(within(week).getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(callsTo(`PUT /me/workout-days/${today}`)).toHaveLength(1))
    expect(callsTo(`PUT /me/workout-days/${today}`)[0]?.body).toEqual({
      note: 'Felt strong',
      items: [
        {
          kind: 'strength',
          exerciseId: bench.id,
          sets: [
            { reps: 12, weightKg: 20 },
            { reps: 10, weightKg: 25 },
            { reps: 10, weightKg: 25 },
          ],
          skipped: false,
        },
        { kind: 'cardio', exerciseId: treadmill.id, minutes: 20, skipped: true },
      ],
    })
  })

  it('a ticked day shows what was done; the desk can only look', async () => {
    const done = calendar({
      status: 'done',
      canLog: false,
      log: {
        date: today,
        dayTitle: 'Chest',
        items: [{ kind: 'strength', exerciseId: bench.id, sets: [{ reps: 8, weightKg: 30 }], skipped: false }],
        note: 'New best',
        savedByName: 'Asha Patel',
        updatedAt: new Date().toISOString(),
      },
    })
    mockApi({
      'POST /auth/refresh': ok(session(sessionUser({ role: 'owner', name: 'Nitin Sharma' }))),
      'GET /members/mem-1': ok({
        id: 'mem-1',
        userId: 'user-9',
        name: 'Asha Patel',
        phone: '+919876500001',
        status: 'none',
        current: null,
        joinedOn: today,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
        memberships: [],
        ptPurchases: [],
        payments: [],
        duePaise: 0,
      }),
      'GET /members/mem-1/workout-plan': ok({ member: { id: 'mem-1', name: 'Asha Patel' }, plan: memberPlan }),
      [`GET /members/mem-1/workout-week?start=${start}`]: ok({
        ...done,
        days: done.days.map((d) => ({ ...d, canLog: false })),
      }),
    })
    renderAt('/admin/members/mem-1')

    const week = await screen.findByRole('region', { name: 'Workout tracking' })
    expect(await within(week).findByText('8 reps × 30 kg')).toBeTruthy()
    expect(within(week).getByText('Note: New best')).toBeTruthy()
    expect(within(week).queryByRole('button', { name: 'Mark done' })).toBeNull()
    expect(within(week).queryByRole('button', { name: 'Update what I did' })).toBeNull()
  })
})
