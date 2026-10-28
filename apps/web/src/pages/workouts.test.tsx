// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { emptyWeek, type WorkoutExercise, type WorkoutPlanView, type WorkoutWeek } from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

const owner = ok(session(sessionUser({ role: 'owner', name: 'Nitin Sharma' })))

const bench: WorkoutExercise = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Barbell Bench Press',
  muscleGroup: 'Chest',
  kind: 'strength',
  description: 'Lower to mid-chest and press up.',
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

function plan(week: WorkoutWeek, overrides: Partial<WorkoutPlanView> = {}): WorkoutPlanView {
  return {
    id: 'tpl-1',
    name: 'Beginner split',
    trainingDays: 1,
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedByName: 'Nitin Sharma',
    memberId: null,
    notes: null,
    week,
    exercises: [bench, treadmill],
    ...overrides,
  }
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

describe('exercise library', () => {
  it('starts with the common exercises in one tap, and adds the gym’s own', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': owner,
      'GET /workout-exercises?all=1': (_body, call) => ok(call === 1 ? [] : [bench, treadmill]),
      'POST /workout-exercises/starter': ok([bench, treadmill]),
      'POST /workout-exercises': { status: 201, body: { ...treadmill, id: 'x', name: 'Battle Ropes' } },
    })
    const user = userEvent.setup()
    renderAt('/admin/workouts/exercises')

    await user.click(await screen.findByRole('button', { name: 'Add common exercises' }))
    await vi.waitFor(() => expect(callsTo('POST /workout-exercises/starter')).toHaveLength(1))
    expect(await screen.findByText('Barbell Bench Press')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Chest' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Add exercise' }))
    await user.type(screen.getByLabelText('Name'), 'Battle Ropes')
    await user.selectOptions(screen.getByLabelText('Type'), 'cardio')
    await user.selectOptions(screen.getByLabelText('Muscle group'), 'Full body')
    await user.type(screen.getByLabelText('Video link (optional)'), 'youtube')
    await user.click(screen.getAllByRole('button', { name: 'Add exercise' }).at(-1)!)
    expect((await screen.findByRole('alert')).textContent).toBe('Video link must start with https://')

    await user.clear(screen.getByLabelText('Video link (optional)'))
    await user.click(screen.getAllByRole('button', { name: 'Add exercise' }).at(-1)!)
    await vi.waitFor(() => expect(callsTo('POST /workout-exercises')).toHaveLength(1))
    expect(callsTo('POST /workout-exercises')[0]?.body).toMatchObject({
      name: 'Battle Ropes',
      kind: 'cardio',
      muscleGroup: 'Full body',
    })
  })
})

describe('plan templates', () => {
  it('builds a week: day title, sets with weights, cardio and a rest day; mistakes are named', async () => {
    const saved = plan(emptyWeek())
    const { callsTo } = mockApi({
      'POST /auth/refresh': owner,
      'GET /workout-exercises?all=1': ok([bench, treadmill]),
      'POST /workout-templates': { status: 201, body: saved },
      'GET /workout-templates/tpl-1': ok(saved),
      'GET /workout-templates/tpl-1/versions': ok([]),
    })
    const user = userEvent.setup()
    renderAt('/admin/workouts/templates/new')

    await user.type(await screen.findByLabelText('Plan name'), 'Beginner split')
    // Monday: chest, three sets of 10 by default.
    await user.type(screen.getByLabelText('Mon title'), 'Chest + Triceps')
    await user.selectOptions(screen.getByLabelText('Add exercise'), bench.id)
    const item = screen.getByRole('article', { name: 'Barbell Bench Press' })
    await user.type(within(item).getByLabelText('Barbell Bench Press set 1 weight (kg)'), '20')
    await user.type(within(item).getByLabelText('Barbell Bench Press set 2 weight (kg)'), '22.3')
    await user.click(within(item).getByRole('button', { name: 'Remove Barbell Bench Press set 3' }))
    await user.selectOptions(within(item).getByLabelText('Rest between sets'), '90')

    // Tuesday: 25 minutes on the treadmill. Sunday: rest.
    await user.click(screen.getByRole('tab', { name: /Tue/ }))
    await user.selectOptions(screen.getByLabelText('Add exercise'), treadmill.id)
    const minutes = screen.getByLabelText('Minutes')
    await user.clear(minutes)
    await user.type(minutes, '25')
    await user.click(screen.getByRole('tab', { name: /Sun/ }))
    await user.click(screen.getByLabelText('Rest day'))

    await user.click(screen.getByRole('button', { name: 'Create template' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Monday, Barbell Bench Press: Weight must be in steps of 0.25 kg',
    )
    expect(callsTo('POST /workout-templates')).toHaveLength(0)

    await user.click(screen.getByRole('tab', { name: /Mon/ }))
    const weight = screen.getByLabelText('Barbell Bench Press set 2 weight (kg)')
    await user.clear(weight)
    await user.type(weight, '22.5')
    await user.click(screen.getByRole('button', { name: 'Create template' }))

    await vi.waitFor(() => expect(callsTo('POST /workout-templates')).toHaveLength(1))
    const body = callsTo('POST /workout-templates')[0]?.body as { name: string; week: WorkoutWeek }
    expect(body.name).toBe('Beginner split')
    expect(body.week.days[0]).toMatchObject({
      title: 'Chest + Triceps',
      rest: false,
      items: [
        {
          kind: 'strength',
          exerciseId: bench.id,
          sets: [
            { reps: 10, weightKg: 20 },
            { reps: 10, weightKg: 22.5 },
          ],
          restBetweenSetsSec: 90,
        },
      ],
    })
    expect(body.week.days[1]?.items[0]).toMatchObject({ kind: 'cardio', exerciseId: treadmill.id, minutes: 25 })
    expect(body.week.days[6]).toMatchObject({ rest: true, items: [] })
    // Opens the saved template.
    expect(await screen.findByRole('button', { name: 'Save new version' })).toBeTruthy()
  })

  it('saves a new version from the version it opened, and explains when someone else saved first', async () => {
    const week = emptyWeek()
    week.days[0] = {
      title: 'Chest',
      rest: false,
      items: [
        {
          kind: 'strength',
          exerciseId: bench.id,
          sets: [{ reps: 12, weightKg: 20 }],
          restBetweenSetsSec: 60,
          restAfterSec: 90,
        },
      ],
    }
    const { callsTo } = mockApi({
      'POST /auth/refresh': owner,
      'GET /workout-exercises?all=1': ok([bench, treadmill]),
      'GET /workout-templates/tpl-1': ok(plan(week, { version: 3 })),
      'GET /workout-templates/tpl-1/versions': ok([
        {
          version: 2,
          name: 'Beginner split',
          notes: null,
          week,
          savedAt: new Date().toISOString(),
          savedByName: 'Ravi',
        },
      ]),
      'PUT /workout-templates/tpl-1': {
        status: 409,
        body: {
          error: { code: 'PLAN_CHANGED', message: 'Ravi saved this plan just now. Reload to see their changes.' },
        },
      },
    })
    const user = userEvent.setup()
    renderAt('/admin/workouts/templates/tpl-1')

    const weight = await screen.findByLabelText('Barbell Bench Press set 1 weight (kg)')
    expect((weight as HTMLInputElement).value).toBe('20')
    await user.clear(weight)
    await user.type(weight, '25')
    await user.click(screen.getByRole('button', { name: 'Save new version' }))

    await vi.waitFor(() => expect(callsTo('PUT /workout-templates/tpl-1')).toHaveLength(1))
    expect(callsTo('PUT /workout-templates/tpl-1')[0]?.body).toMatchObject({ version: 3, name: 'Beginner split' })
    expect((await screen.findByRole('alert')).textContent).toMatch(/Ravi saved this plan just now/)
    expect(screen.getByRole('button', { name: /Version 2/ })).toBeTruthy()
  })

  it('owners see Workouts on their home screen', async () => {
    mockApi({ 'POST /auth/refresh': owner, 'GET /workout-templates': ok([]) })
    renderAt('/home')
    expect((await screen.findByRole('link', { name: /Workouts/ })).getAttribute('href')).toBe('/admin/workouts')
  })
})
