// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { addDays, todayInIndia, type MembershipView, type MyMembership } from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { formatDate } from '../lib/format'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

const today = todayInIndia()

function membership(overrides: Partial<MembershipView> = {}): MembershipView {
  return {
    id: 'ms-1',
    planName: '3 months',
    durationMonths: 3,
    pricePaise: 450000,
    listPricePaise: 450000,
    discountReason: null,
    paidPaise: 450000,
    duePaise: 0,
    startDate: addDays(today, -30),
    endDate: addDays(today, 61),
    status: 'active',
    daysLeft: 62,
    maxFreezeDays: 15,
    freezeDaysUsed: 0,
    freezes: [],
    cancelledAt: null,
    cancelReason: null,
    ...overrides,
  }
}

function renderHome(partial: Pick<MyMembership, 'current' | 'history'> & Partial<MyMembership>) {
  const mine: MyMembership = { duePaise: 0, payments: [], ...partial }
  mockApi({
    'POST /auth/refresh': ok(session(sessionUser({ role: 'member', name: 'Asha Patel' }))),
    'GET /me/membership': ok(mine),
  })
  render(
    <MemoryRouter initialEntries={['/home']}>
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

describe('member home card', () => {
  it('shows the plan, days left, dates and progress', async () => {
    renderHome({ current: membership(), history: [] })

    expect(await screen.findByText('62 days left')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '3 months' })).toBeTruthy()
    expect(screen.getByText(`${formatDate(addDays(today, -30))} – ${formatDate(addDays(today, 61))}`)).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33') // day 31 of 92
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('reminds the member to renew in the last week', async () => {
    renderHome({ current: membership({ endDate: addDays(today, 2), daysLeft: 3 }), history: [] })
    expect((await screen.findByRole('status')).textContent).toMatch(/Only 3 days left\. Renew at the front desk/)
  })

  it('shows the queued renewal instead of a reminder', async () => {
    const next = membership({
      id: 'ms-2',
      planName: '1 month',
      durationMonths: 1,
      status: 'upcoming',
      startDate: addDays(today, 3),
      endDate: addDays(today, 32),
    })
    renderHome({ current: membership({ endDate: addDays(today, 2), daysLeft: 3 }), history: [next] })

    expect(await screen.findByText(/Next:/)).toBeTruthy()
    expect(screen.getByText('1 month')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('explains a freeze', async () => {
    const freeze = { id: 'f1', fromDate: addDays(today, -1), toDate: addDays(today, 5), reason: 'Travel' }
    renderHome({ current: membership({ status: 'frozen', freezes: [freeze], freezeDaysUsed: 7 }), history: [] })

    expect(await screen.findByText(`Frozen until ${formatDate(freeze.toDate, { short: true })}`)).toBeTruthy()
    expect(screen.getByText(/These days are added to your end date/)).toBeTruthy()
  })

  it('tells members without a plan to contact the front desk', async () => {
    renderHome({ current: null, history: [] })
    expect(await screen.findByText(/Start a plan at the front desk/)).toBeTruthy()
  })

  it('shows an expired membership with a renew prompt and past memberships', async () => {
    const expired = membership({ status: 'expired', endDate: addDays(today, -3), daysLeft: 0 })
    const older = membership({ id: 'ms-0', status: 'expired', startDate: '2025-01-01', endDate: '2025-03-31' })
    renderHome({ current: expired, history: [older] })

    expect(await screen.findByText('Expired 3 days ago')).toBeTruthy()
    expect(screen.getByText(/Renew at the front desk to start again/)).toBeTruthy()
    expect(screen.getByText('Past memberships (1)')).toBeTruthy()
  })
})

describe('member dues and payments', () => {
  it('shows the amount due and past payments', async () => {
    renderHome({
      current: membership({ paidPaise: 200000, duePaise: 250000 }),
      history: [],
      duePaise: 250000,
      payments: [
        {
          id: 'p1',
          amountPaise: 200000,
          method: 'upi',
          status: 'paid',
          reference: null,
          note: null,
          paidAt: '2026-10-20T05:00:00.000Z',
          membershipId: 'ms-1',
          description: '3 months',
          recordedByName: 'Front Desk',
          invoice: { id: 'inv-1', number: 'OG/26-27/0001' },
        },
      ],
    })

    expect((await screen.findByRole('alert')).textContent).toMatch(/₹2,500 due\. Please pay at the front desk/)
    expect(screen.getByText('My payments (1)')).toBeTruthy()
  })
})
