// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import {
  addDays,
  todayInIndia,
  weekOf,
  type CheckInToReview,
  type CheckInView,
  type MemberCheckIns,
  type MyCheckIns,
  type TrainerClient,
} from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

const thisWeek = weekOf(todayInIndia())
const ravi = { id: 'trainer-1', name: 'Ravi Kumar' }

function checkIn(overrides: Partial<CheckInView> = {}): CheckInView {
  return {
    id: 'ci-1',
    memberId: 'mem-1',
    weekOf: thisWeek,
    submittedAt: new Date().toISOString(),
    weightKg: 72,
    bodyFatPct: null,
    waistCm: null,
    chestCm: null,
    hipsCm: null,
    armCm: null,
    thighCm: null,
    note: null,
    photos: {},
    coachReply: null,
    reviewedAt: null,
    reviewedByName: null,
    ...overrides,
  }
}

const lastWeek = checkIn({ id: 'ci-0', weekOf: addDays(thisWeek, -7), weightKg: 72.4, waistCm: 86 })
const twoWeeksAgo = checkIn({ id: 'ci-m', weekOf: addDays(thisWeek, -14), weightKg: 73, waistCm: 87 })

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

const member = ok(session(sessionUser({ id: 'user-9', role: 'member', name: 'Asha Patel' })))
const mine = (overrides: Partial<MyCheckIns> = {}): MyCheckIns => ({
  weekOf: thisWeek,
  current: null,
  history: [lastWeek, twoWeeksAgo],
  coach: ravi,
  photosEnabled: true,
  ...overrides,
})

describe('check-ins: member', () => {
  it('sends a check-in in three steps: weight, photos, note', async () => {
    // jsdom has no object URLs (used for the photo preview).
    URL.createObjectURL = () => 'blob:preview'
    URL.revokeObjectURL = () => undefined
    const sent = checkIn({ weightKg: 71.4 })
    const { callsTo, calls } = renderAt('/check-in', {
      'POST /auth/refresh': member,
      'GET /me/check-ins': (_, n) => ok(n === 1 ? mine() : mine({ current: sent, history: [sent, lastWeek] })),
      'PUT /me/check-ins/current': ok(sent),
      'PUT /me/check-ins/ci-1/photos/front': ok({ ...sent, photos: { front: '/photo.jpg' } }),
    })
    const user = userEvent.setup()

    expect(await screen.findByText('Step 1 of 3')).toBeTruthy()
    expect(screen.getByText('Last check-in: 72.4 kg')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Enter your weight in kg, e.g. 72.5')).toBeTruthy()
    await user.type(screen.getByLabelText('Your weight this morning (kg)'), '71.4')
    await user.click(screen.getByRole('button', { name: 'Add body fat and measurements' }))
    await user.type(screen.getByLabelText('Waist (cm)'), '85')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Step 2 of 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip photos' })).toBeTruthy()
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'front.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Add front photo'), photo)
    await user.click(await screen.findByRole('button', { name: 'Next' }))

    await user.type(screen.getByLabelText('How was your week? (optional)'), 'Slept badly')
    await user.click(screen.getByRole('button', { name: 'Send check-in' }))

    await vi.waitFor(() => expect(callsTo('PUT /me/check-ins/ci-1/photos/front')).toHaveLength(1))
    expect(callsTo('PUT /me/check-ins/current')[0]?.body).toEqual({
      weightKg: 71.4,
      bodyFatPct: null,
      waistCm: 85,
      chestCm: null,
      hipsCm: null,
      armCm: null,
      thighCm: null,
      note: 'Slept badly',
    })
    const upload = calls.find((c) => c.path === '/me/check-ins/ci-1/photos/front')
    expect(upload?.headers.get('content-type')).toBe('image/jpeg')
    expect((await screen.findByRole('status')).textContent).toBe('Check-in sent')
    expect(await screen.findByText(/Ravi will reply here/)).toBeTruthy()
    expect(screen.getByText('−1 kg')).toBeTruthy()
  })

  it('the Progress home shows the weight graph and small cards for other measurements', async () => {
    const replied = checkIn({
      weightKg: 71.8,
      waistCm: 85,
      coachReply: 'Great week!',
      reviewedByName: 'Ravi Kumar',
      reviewedAt: new Date().toISOString(),
    })
    renderAt('/home', {
      'POST /auth/refresh': member,
      'GET /me/check-ins': ok(mine({ current: replied, history: [replied, lastWeek, twoWeeksAgo] })),
      'GET /me/membership': ok({ current: null, history: [], duePaise: 0, payments: [] }),
      'GET /me/workout-plan': ok({ plan: null }),
      'GET /me/diet-plan': ok({ plan: null }),
      'GET /me/profile': ok({
        member: { id: 'mem-1', name: 'Asha' },
        coach: ravi,
        profile: null,
        healthConsentAt: null,
      }),
      'GET /me/pt': ok([]),
    })
    const weight = await screen.findByRole('region', { name: 'Body weight' })
    expect(within(weight).getByText('71.8')).toBeTruthy()
    expect(within(weight).getByText(/−1.2 kg since/)).toBeTruthy()
    expect(within(weight).getByRole('img', { name: 'Body weight over time' })).toBeTruthy()
    expect(
      within(weight)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['1M', '3M', '6M', 'All'])

    // Tapping the waist card makes it the big graph.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Show waist graph' }))
    expect(within(await screen.findByRole('region', { name: 'Waist' })).getByText(/−2 cm since/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Your coach replied' }).textContent).toContain('Great week!')
  })

  it('invites a first check-in before there are any', async () => {
    renderAt('/home', {
      'POST /auth/refresh': member,
      'GET /me/check-ins': ok(mine({ history: [] })),
      'GET /me/membership': ok({ current: null, history: [], duePaise: 0, payments: [] }),
      'GET /me/workout-plan': ok({ plan: null }),
      'GET /me/pt': ok([]),
    })
    expect((await screen.findByRole('link', { name: /Send your first check-in/ })).getAttribute('href')).toBe(
      '/check-in',
    )
  })
})

describe('check-ins: coach', () => {
  const client: TrainerClient = {
    memberId: 'mem-1',
    name: 'Asha Patel',
    phone: '+919876500001',
    coached: true,
    purchases: [],
  }
  const waiting = checkIn({ weightKg: 71.4, note: 'Slept badly', photos: { front: '/front.jpg' } })

  it('Today lists check-ins to reply to; the client’s Progress view has graphs and a reply box', async () => {
    const queue: CheckInToReview[] = [{ member: { id: 'mem-1', name: 'Asha Patel' }, checkIn: waiting }]
    const list: MemberCheckIns = {
      member: { id: 'mem-1', name: 'Asha Patel' },
      checkIns: [waiting, lastWeek],
      photosEnabled: true,
    }
    const { callsTo } = renderAt('/home', {
      'POST /auth/refresh': ok(session(sessionUser({ id: 'trainer-1', role: 'trainer', name: 'Ravi Kumar' }))),
      'GET /trainers/trainer-1/sessions': ok([]),
      'GET /pt-sessions/unmarked': ok([]),
      'GET /coach/check-ins': ok(queue),
      'GET /trainer/clients': ok([client]),
      'GET /members/mem-1/check-ins': ok(list),
      'POST /check-ins/ci-1/review': (body) =>
        ok({
          ...waiting,
          coachReply: (body as { reply: string }).reply,
          reviewedAt: new Date().toISOString(),
          reviewedByName: 'Ravi Kumar',
        }),
    })
    const user = userEvent.setup()
    const section = await screen.findByRole('region', { name: 'Check-ins to reply to · 1' })
    await user.click(within(section).getByRole('link', { name: /Asha Patel/ }))

    expect(await screen.findByRole('tab', { name: 'Progress', selected: true })).toBeTruthy()
    expect(await screen.findByRole('region', { name: 'Body weight' })).toBeTruthy()
    expect(screen.getAllByRole('article', { name: /Week of/ })).toHaveLength(2)
    expect(screen.getByText('“Slept badly”')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Open front photo' }))
    expect(screen.getByRole('dialog', { name: /Front/ })).toBeTruthy()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Close/ }))

    await user.type(screen.getAllByLabelText('Reply')[0]!, 'Good. Add 100 g curd at night.')
    await user.click(screen.getAllByRole('button', { name: 'Send reply' })[0]!)
    await vi.waitFor(() => expect(callsTo('POST /check-ins/ci-1/review')).toHaveLength(1))
    expect(callsTo('POST /check-ins/ci-1/review')[0]?.body).toEqual({ reply: 'Good. Add 100 g curd at night.' })
    expect((await screen.findByRole('status')).textContent).toBe('Reply sent')
  })
})
