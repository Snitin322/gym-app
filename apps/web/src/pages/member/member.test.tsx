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
  type MembershipView,
  type PtPurchaseView,
  type PtSessionView,
  type WorkoutPlanView,
} from '@onthec/shared'
import App from '../../App'
import { AppProviders } from '../../AppProviders'
import { setAccessToken } from '../../api/client'
import { mockApi, ok, session, sessionUser } from '../../test/mockApi'

const today = todayInIndia()

const membership: MembershipView = {
  id: 'ms-1',
  planName: '3 months',
  durationMonths: 3,
  pricePaise: 450000,
  listPricePaise: 450000,
  discountReason: null,
  paidPaise: 300000,
  duePaise: 150000,
  startDate: addDays(today, -30),
  endDate: addDays(today, 41),
  status: 'active',
  daysLeft: 42,
  maxFreezeDays: 15,
  freezeDaysUsed: 0,
  freezes: [],
  cancelledAt: null,
  cancelReason: null,
}

function plan(): WorkoutPlanView {
  const week = emptyWeek()
  week.days[isoWeekday(today) - 1] = {
    title: 'Chest + Triceps',
    rest: false,
    items: [
      { kind: 'strength', exerciseId: 'ex-1', sets: [{ reps: 10 }], restBetweenSetsSec: 60, restAfterSec: 60 },
      { kind: 'strength', exerciseId: 'ex-2', sets: [{ reps: 10 }], restBetweenSetsSec: 60, restAfterSec: 60 },
    ],
  }
  return {
    id: 'p1',
    name: 'Beginner split',
    trainingDays: 1,
    version: 1,
    updatedAt: new Date().toISOString(),
    updatedByName: 'Ravi',
    memberId: 'mem-1',
    notes: null,
    week,
    exercises: [],
  }
}

const pt: PtPurchaseView = {
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
}

const tomorrow7am = new Date(Date.parse(`${addDays(today, 1)}T01:30:00Z`)).toISOString() // 7:00 am India
const session_: PtSessionView = {
  id: 'ses-1',
  purchaseId: 'ptp-1',
  packageName: '12 Sessions',
  trainer: { id: 'trainer-1', name: 'Ravi Kumar' },
  member: { id: 'mem-1', name: 'Asha Patel', phone: '+919876500001' },
  startsAt: tomorrow7am,
  endsAt: new Date(Date.parse(tomorrow7am) + 3600_000).toISOString(),
  status: 'booked',
  lateCancel: false,
  cancelledAt: null,
  cancelReason: null,
  cancelledByName: null,
  bookedByName: 'Asha Patel',
  freeCancelUntil: new Date(Date.parse(tomorrow7am) - 12 * 3600_000).toISOString(),
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
}

function renderAt(path: string) {
  mockApi({
    'POST /auth/refresh': ok(session(sessionUser({ role: 'member', name: 'Asha Patel' }))),
    'GET /me/membership': ok({ current: membership, history: [], duePaise: 150000, payments: [] }),
    'GET /me/renewal-options': ok({ onlinePayments: false, startDate: today, plans: [] }),
    'GET /me/workout-plan': ok({ plan: plan() }),
    'GET /me/pt': ok([pt]),
    'GET /me/pt-sessions': ok([session_]),
  })
  render(
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

describe('member app', () => {
  it('home shows the membership, today’s workout and the next PT session at a glance', async () => {
    renderAt('/home')
    expect(await screen.findByRole('heading', { name: 'Asha' })).toBeTruthy()

    const card = await screen.findByRole('region', { name: 'Your membership' })
    expect(within(card).getByText('42 days left')).toBeTruthy()
    expect(within(card).getByText('₹1,500 due · pay at the front desk')).toBeTruthy()

    const workout = await screen.findByRole('link', { name: 'Today’s workout' })
    expect(workout.getAttribute('href')).toBe('/workout')
    expect(within(workout).getByText('Chest + Triceps')).toBeTruthy()
    expect(within(workout).getByText('2 exercises')).toBeTruthy()

    const ptCard = await screen.findByRole('link', { name: 'Personal training' })
    expect(await within(ptCard).findByText('Tomorrow, 7:00 am')).toBeTruthy()
    expect(within(ptCard).getByText('with Ravi Kumar · 9 sessions left')).toBeTruthy()
  })

  it('the tab bar moves between Home, Workout, PT and Profile', async () => {
    renderAt('/home')
    const tabs = await screen.findByRole('navigation', { name: 'Main' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Home', 'Workout', 'PT', 'Profile'])
    expect(within(tabs).getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page')

    const user = userEvent.setup()
    // Each screen draws its own tab bar, so look it up again after every move.
    const tab = (name: string) => within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name })
    await user.click(tab('PT'))
    expect(await screen.findByRole('heading', { name: 'Personal training' })).toBeTruthy()
    await user.click(tab('Profile'))
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
    await user.click(tab('Workout'))
    expect(await screen.findByRole('heading', { name: 'Workout' })).toBeTruthy()
  })

  it('staff screens aren’t reachable from the member tabs', async () => {
    renderAt('/admin/members')
    expect(await screen.findByRole('heading', { name: 'Asha' })).toBeTruthy()
  })
})
