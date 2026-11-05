// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { addDays, todayInIndia, type PtPurchaseView, type PtSessionView, type TrainerClient } from '@onthec/shared'
import App from '../../App'
import { AppProviders } from '../../AppProviders'
import { setAccessToken } from '../../api/client'
import { mockApi, ok, session, sessionUser } from '../../test/mockApi'

const today = todayInIndia()
const HOUR = 3600_000
const trainer = ok(session(sessionUser({ id: 'trainer-1', role: 'trainer', name: 'Ravi Kumar' })))

function purchase(overrides: Partial<PtPurchaseView> = {}): PtPurchaseView {
  return {
    id: 'ptp-1',
    memberId: 'mem-1',
    packageName: '12 Sessions',
    sessionCount: 12,
    sessionsLeft: 9,
    sessionsBooked: 1,
    startDate: addDays(today, -10),
    expiresOn: addDays(today, 49),
    status: 'active',
    trainer: { id: 'trainer-1', name: 'Ravi Kumar' },
    pricePaise: 1200000,
    listPricePaise: 1200000,
    discountReason: null,
    paidPaise: 1200000,
    duePaise: 0,
    ledger: [],
    ...overrides,
  }
}

function ptSession(startsAt: string, overrides: Partial<PtSessionView> = {}): PtSessionView {
  const start = Date.parse(startsAt)
  return {
    id: 'ses-1',
    purchaseId: 'ptp-1',
    packageName: '12 Sessions',
    trainer: { id: 'trainer-1', name: 'Ravi Kumar' },
    member: { id: 'mem-1', name: 'Asha Patel', phone: '+919876500001' },
    startsAt,
    endsAt: new Date(start + HOUR).toISOString(),
    status: 'booked',
    lateCancel: false,
    cancelledAt: null,
    cancelReason: null,
    cancelledByName: null,
    bookedByName: 'Asha Patel',
    freeCancelUntil: new Date(start - 12 * HOUR).toISOString(),
    trainerNotes: null,
    markedAt: null,
    markedByName: null,
    confirmation: null,
    disputeUntil: null,
    undoUntil: null,
    disputedAt: null,
    disputeReason: null,
    resolution: null,
    resolutionNote: null,
    resolvedByName: null,
    resolvedAt: null,
    ...overrides,
  }
}

const clients: TrainerClient[] = [
  { memberId: 'mem-1', name: 'Asha Patel', phone: '+919876500001', coached: false, purchases: [purchase()] },
  {
    memberId: 'mem-2',
    name: 'Bina Rao',
    phone: '+919876500002',
    coached: false,
    purchases: [purchase({ id: 'ptp-2', memberId: 'mem-2', status: 'expired', expiresOn: addDays(today, -3) })],
  },
]

function renderAt(path: string, routes: Parameters<typeof mockApi>[0] = {}) {
  const api = mockApi({
    'POST /auth/refresh': trainer,
    'GET /trainer/clients': ok(clients),
    'GET /trainers/trainer-1/sessions': ok([]),
    'GET /pt-sessions/unmarked': ok([]),
    ...routes,
  })
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

describe('trainer app', () => {
  it('Today: greeting, counts and today’s sessions; tabs to the other screens', async () => {
    const now = ptSession(new Date(Date.now() - 30 * 60_000).toISOString())
    renderAt('/home', { 'GET /trainers/trainer-1/sessions': ok([now]) })

    expect(await screen.findByRole('heading', { name: 'Ravi' })).toBeTruthy()
    const todays = await screen.findByRole('region', { name: 'Today’s sessions' })
    expect(await within(todays).findByText('Asha Patel ·', { exact: false })).toBeTruthy()
    expect(within(todays).getByRole('button', { name: 'Mark session' })).toBeTruthy()

    const tabs = screen.getByRole('navigation', { name: 'Main' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((l) => [l.textContent, l.getAttribute('href')]),
    ).toEqual([
      ['Today', '/home'],
      ['Clients', '/trainer/clients'],
      ['Schedule', '/trainer/schedule'],
      ['Profile', '/trainer/profile'],
    ])
  })

  it('marking a session opens a sheet and confirms with a short message', async () => {
    const now = ptSession(new Date(Date.now() - 30 * 60_000).toISOString())
    const { callsTo } = renderAt('/home', {
      'GET /trainers/trainer-1/sessions': ok([now]),
      'POST /pt-sessions/ses-1/mark': ok({ ...now, status: 'completed' }),
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Mark session' }))
    const sheet = screen.getByRole('dialog', { name: 'How did it go?' })
    await user.click(within(sheet).getByRole('radio', { name: 'Completed' }))
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(callsTo('POST /pt-sessions/ses-1/mark')).toHaveLength(1))
    expect((await screen.findByRole('status')).textContent).toBe('Session marked')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a client page shows Workout, Diet and PT; ended packages only show PT', async () => {
    renderAt('/trainer/clients', {
      'GET /members/mem-1/workout-plan': ok({ member: { id: 'mem-1', name: 'Asha Patel' }, plan: null }),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('link', { name: 'Asha Patel' }))

    expect(await screen.findByRole('heading', { name: 'Asha Patel' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Call Asha Patel' }).getAttribute('href')).toBe('tel:+919876500001')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Workout', 'Diet', 'PT'])
    expect(await screen.findByText(/No workout plan yet/)).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'PT' }))
    expect(screen.getByText('9 of 12 sessions left')).toBeTruthy()

    cleanup()
    renderAt('/trainer/clients/mem-2')
    expect(await screen.findByText(/package with you has ended/)).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('Profile: account, availability and log out', async () => {
    renderAt('/trainer/profile')
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByText('Trainer · Onthec Gym')).toBeTruthy()
    expect(screen.getByRole('link', { name: /My availability/ }).getAttribute('href')).toBe('/trainer/availability')
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
  })
})
