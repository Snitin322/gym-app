// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { DashboardView } from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

function dashboard(overrides: Partial<DashboardView> = {}): DashboardView {
  return {
    today: '2026-03-25',
    members: {
      active: 42,
      joinedThisMonth: 5,
      frozen: 2,
      noPlan: 3,
      expiringSoon: [
        { memberId: 'm1', name: 'Asha Patel', phone: '+919876500001', planName: '1 month', endDate: '2026-03-31' },
      ],
      recentlyExpired: [
        { memberId: 'm2', name: 'Bina Rao', phone: '+919876500002', planName: '3 months', endDate: '2026-03-10' },
      ],
    },
    revenue: {
      todayPaise: 450000,
      monthPaise: 9800000,
      lastMonthPaise: 8700000,
      monthByMethod: { cash: 5000000, upi: 4800000 },
    },
    dues: { totalPaise: 250000, members: [{ memberId: 'm3', name: 'Esha', phone: '+919876500006', duePaise: 250000 }] },
    pt: {
      bookedThisWeek: 12,
      completedThisWeek: 8,
      noShowsThisWeek: 1,
      openDisputes: 1,
      unmarked: 2,
      runningOut: [
        {
          memberId: 'm1',
          name: 'Asha Patel',
          phone: '+919876500001',
          packageName: '12 Sessions',
          trainerName: 'Ravi',
          sessionsLeft: 3,
          expiresOn: '2026-03-29',
        },
      ],
    },
    workouts: { withPlan: 20, trackedThisWeek: 14 },
    ...overrides,
  }
}

function renderHome(role: 'owner' | 'admin', data: DashboardView) {
  mockApi({
    'POST /auth/refresh': ok(session(sessionUser({ role, name: 'Nitin Sharma' }))),
    'GET /dashboard': ok(data),
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

describe('dashboard', () => {
  it('shows member counts linking to the lists, and money taken for the owner', async () => {
    renderHome('owner', dashboard())
    const dash = await screen.findByRole('region', { name: 'Dashboard' })

    const active = within(dash).getByRole('link', { name: /Active members\s*42\s*5 joined this month/ })
    expect(active.getAttribute('href')).toBe('/admin/members?filter=active')
    expect(
      within(dash)
        .getByRole('link', { name: /Ending in 7 days\s*1/ })
        .getAttribute('href'),
    ).toBe('/admin/members?filter=expiring')
    expect(within(dash).getByText('₹4,500')).toBeTruthy()
    expect(within(dash).getByText('₹98,000')).toBeTruthy()
    expect(within(dash).getByText('Last month: ₹87,000')).toBeTruthy()
    expect(within(dash).getByRole('list', { name: 'This month by payment method' }).textContent).toBe(
      'Cash: ₹50,000UPI: ₹48,000',
    )
    expect(within(dash).getByText('14 of 20 members with a plan ticked a workout this week.')).toBeTruthy()
    expect(
      within(dash)
        .getByRole('link', { name: /1 open dispute · 2 sessions not marked/ })
        .getAttribute('href'),
    ).toBe('/admin/pt-disputes')
  })

  it('who to call: phone and a pre-typed WhatsApp message', async () => {
    renderHome('owner', dashboard())
    const list = await screen.findByRole('list', { name: 'Ending in the next 7 days' })
    expect(within(list).getByText('1 month · ends 31 Mar')).toBeTruthy()
    expect(within(list).getByRole('link', { name: 'Call Asha Patel' }).getAttribute('href')).toBe('tel:+919876500001')
    const whatsapp = within(list).getByRole('link', { name: 'WhatsApp Asha Patel' }).getAttribute('href') ?? ''
    expect(whatsapp.startsWith('https://wa.me/919876500001?text=')).toBe(true)
    expect(decodeURIComponent(whatsapp.split('text=')[1] ?? '')).toBe(
      'Hi Asha, your Onthec Gym membership ends on 31 Mar 2026. Renew at the front desk or in the app to keep training without a break.',
    )

    const expired = screen.getByRole('list', { name: 'Expired in the last 30 days' })
    expect(
      decodeURIComponent(within(expired).getByRole('link', { name: 'WhatsApp Bina Rao' }).getAttribute('href') ?? ''),
    ).toMatch(/we miss you at Onthec Gym! Your membership ended on 10 Mar 2026/)
    const pt = screen.getByRole('list', { name: 'PT packages running out' })
    expect(within(pt).getByText('3 sessions left · use by 29 Mar · Ravi')).toBeTruthy()
  })

  it('admins don’t see money taken, but do see dues', async () => {
    renderHome('admin', dashboard({ revenue: null }))
    const dash = await screen.findByRole('region', { name: 'Dashboard' })
    expect(within(dash).queryByText('Money taken')).toBeNull()
    expect(within(dash).getByRole('heading', { name: 'Dues · ₹2,500' })).toBeTruthy()
    // The usual tiles are still below.
    expect(screen.getByRole('link', { name: /Members →/ })).toBeTruthy()
  })
})
