// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import {
  todayInIndia,
  type ClientProfile,
  type ClientProfileView,
  type MemberDetail,
  type TrainerClient,
  type UserSummary,
} from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

const today = todayInIndia()

const profile: ClientProfile = {
  dateOfBirth: '1994-06-15',
  sex: 'female',
  heightCm: 162,
  startWeightKg: 72,
  bodyFatPct: 31.5,
  goal: 'Lose 8 kg before March',
  dietPreference: 'veg',
  medicalConditions: 'Thyroid (hypo)',
  injuries: null,
  foodAllergies: 'Peanuts',
  medicines: null,
  lifestyle: 'Desk job, sleeps 6 h',
  trainingExperience: null,
  updatedAt: '2026-11-05T06:00:00.000Z',
  updatedByName: 'Ravi Kumar',
}

const ravi = { id: 'trainer-1', name: 'Ravi Kumar' }

function profileView(overrides: Partial<ClientProfileView> = {}): ClientProfileView {
  return {
    member: { id: 'mem-1', name: 'Asha Patel' },
    coach: ravi,
    profile,
    healthConsentAt: null,
    ...overrides,
  }
}

function renderAt(path: string, routes: Parameters<typeof mockApi>[0]) {
  const api = mockApi(routes)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <App />
      </AppProviders>
    </MemoryRouter>,
  )
  return api
}

beforeEach(() => {
  setAccessToken(null)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('coaching: trainer', () => {
  const client: TrainerClient = {
    memberId: 'mem-1',
    name: 'Asha Patel',
    phone: '+919876500001',
    coached: true,
    purchases: [],
  }
  const routes = {
    'POST /auth/refresh': ok(session(sessionUser({ id: 'trainer-1', role: 'trainer', name: 'Ravi Kumar' }))),
    'GET /trainer/clients': ok([client]),
    'GET /members/mem-1/profile': ok(profileView()),
  }

  it('a coaching client opens on Progress; Profile shows health flags first', async () => {
    renderAt('/trainer/clients', routes)
    const user = userEvent.setup()
    const row = await screen.findByRole('link', { name: 'Asha Patel' })
    expect(row.textContent).toContain('Coaching')
    await user.click(row)

    // No PT package, so no PT view.
    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual([
      'Progress',
      'Workout',
      'Diet',
      'Profile',
    ])
    await user.click(screen.getByRole('tab', { name: 'Profile' }))
    const health = await screen.findByRole('region', { name: 'Health' })
    expect(within(health).getByText('Thyroid (hypo)')).toBeTruthy()
    expect(within(health).getByText('Peanuts')).toBeTruthy()
    expect(screen.getByText('Vegetarian')).toBeTruthy()
    expect(screen.getByText('162 cm')).toBeTruthy()
    expect(screen.getByText(/hasn’t agreed in the app yet/)).toBeTruthy()
  })

  it('the coach edits the profile in a sheet', async () => {
    const { callsTo } = renderAt('/trainer/clients/mem-1?view=profile', {
      ...routes,
      'PUT /members/mem-1/profile': (body) => ok(profileView({ profile: { ...profile, ...(body as object) } })),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit details' }))
    const sheet = screen.getByRole('dialog', { name: 'Asha’s details' })
    const goal = within(sheet).getByLabelText('Goal')
    await user.clear(goal)
    await user.type(goal, 'Run 5 km')
    await user.type(within(sheet).getByLabelText('Injuries or pain'), 'Lower back')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(callsTo('PUT /members/mem-1/profile')).toHaveLength(1))
    expect(callsTo('PUT /members/mem-1/profile')[0]?.body).toMatchObject({
      goal: 'Run 5 km',
      injuries: 'Lower back',
      heightCm: 162,
      startWeightKg: 72,
      sex: 'female',
      dietPreference: 'veg',
      dateOfBirth: '1994-06-15',
    })
    expect((await screen.findByRole('status')).textContent).toBe('Details saved')
  })
})

describe('coaching: member', () => {
  const member = ok(session(sessionUser({ id: 'user-9', role: 'member', name: 'Asha Patel' })))

  it('Home asks for health details; the first save needs the agreement box', async () => {
    const { callsTo } = renderAt('/home', {
      'POST /auth/refresh': member,
      'GET /me/profile': ok(profileView({ profile: null })),
      'GET /me/membership': ok({ current: null, history: [], duePaise: 0, payments: [] }),
      'GET /me/workout-plan': ok({ plan: null }),
      'GET /me/pt': ok([]),
      'GET /me/pt-sessions': ok([]),
      'PUT /me/profile': (body) =>
        ok(
          profileView({
            profile: { ...profile, heightCm: (body as { heightCm: number }).heightCm },
            healthConsentAt: today,
          }),
        ),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('link', { name: 'Health details' }))

    expect(await screen.findByText(/Only you, your coach and the gym owner can see them/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add my details' }))
    const sheet = screen.getByRole('dialog', { name: 'Your details' })
    await user.type(within(sheet).getByLabelText('Height (cm)'), '165')
    await user.click(within(sheet).getByRole('checkbox', { name: /I agree to share these health details/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(callsTo('PUT /me/profile')).toHaveLength(1))
    expect(callsTo('PUT /me/profile')[0]?.body).toMatchObject({ heightCm: 165, healthConsent: true, goal: '' })
    expect((await screen.findByRole('status')).textContent).toBe('Details saved')
    expect(screen.getByRole('button', { name: 'Delete my health details' })).toBeTruthy()
  })
})

describe('coaching: desk', () => {
  const staff: UserSummary[] = [
    { id: 'owner-1', name: 'Nitin Sharma', phone: '+919811111101', role: 'owner' },
    { id: 'admin-1', name: 'Desk Person', phone: '+919811111102', role: 'admin' },
    { id: 'trainer-1', name: 'Ravi Kumar', phone: '+919811111103', role: 'trainer' },
  ]
  const detail = {
    id: 'mem-1',
    userId: 'user-9',
    name: 'Asha Patel',
    phone: '+919876500001',
    coach: null,
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
  } satisfies MemberDetail

  it('the desk sets a coach from the member page; admins see no health details', async () => {
    const { callsTo } = renderAt('/admin/members/mem-1', {
      'POST /auth/refresh': ok(session(sessionUser({ id: 'admin-1', role: 'admin', name: 'Desk Person' }))),
      'GET /members/mem-1': (_, n) => ok(n === 1 ? detail : { ...detail, coach: ravi }),
      'GET /users?kind=staff': ok(staff),
      'PUT /members/mem-1/coach': { status: 204 },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Set coach' }))
    const sheet = screen.getByRole('dialog', { name: 'Coach' })
    const select = within(sheet).getByLabelText('Coach')
    await vi.waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3))
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['No coach', 'Nitin Sharma (owner)', 'Ravi Kumar'])
    await user.selectOptions(select, 'trainer-1')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(callsTo('PUT /members/mem-1/coach')).toHaveLength(1))
    expect(callsTo('PUT /members/mem-1/coach')[0]?.body).toEqual({ coachId: 'trainer-1' })
    expect((await screen.findByRole('status')).textContent).toBe('Coach saved')
    expect(await screen.findByText('Ravi Kumar')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Health details' })).toBeNull()
  })

  it('the owner gets My clients and opens a client’s health details', async () => {
    const owner = ok(session(sessionUser({ id: 'owner-1', role: 'owner', name: 'Nitin Sharma' })))
    renderAt('/admin/members/mem-1', {
      'POST /auth/refresh': owner,
      'GET /members/mem-1': ok({ ...detail, coach: { id: 'owner-1', name: 'Nitin Sharma' } }),
      'GET /members/mem-1/profile': ok(
        profileView({ coach: { id: 'owner-1', name: 'Nitin Sharma' }, healthConsentAt: today }),
      ),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('link', { name: 'Health details' }))
    expect(await screen.findByRole('heading', { name: 'Health details' })).toBeTruthy()
    expect(await screen.findByText('Peanuts')).toBeTruthy()
    expect(screen.getByText(/Asha agreed in the app/)).toBeTruthy()

    cleanup()
    renderAt('/admin/members', { 'POST /auth/refresh': owner, 'GET /members?filter=all': ok([]) })
    const filters = await screen.findByRole('group', { name: 'Filter members' })
    expect(
      within(filters)
        .getAllByRole('button')
        .map((b) => b.textContent)
        .slice(0, 2),
    ).toEqual(['All', 'My clients'])
  })
})
