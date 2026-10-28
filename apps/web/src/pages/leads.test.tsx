// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { addDays, todayInIndia, type LeadView } from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

const admin = ok(session(sessionUser({ role: 'admin', name: 'Desk A' })))
const today = todayInIndia()

function lead(overrides: Partial<LeadView> = {}): LeadView {
  return {
    id: 'lead-1',
    name: 'Riya Shah',
    phone: '+919876511111',
    source: 'instagram',
    interest: 'Weight loss, 3 months',
    note: null,
    followUpOn: addDays(today, -2),
    status: 'contacted',
    lostReason: null,
    memberId: null,
    createdAt: new Date().toISOString(),
    createdByName: 'Desk A',
    duplicates: [],
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

describe('leads', () => {
  it('adds an enquiry, warning when the number is already a member', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': admin,
      'GET /leads?filter=open': ok([]),
      'GET /leads/check-phone?phone=%2B919876500001': ok({
        duplicates: [{ kind: 'member', id: 'mem-1', name: 'Asha Patel' }],
      }),
      'POST /leads': { status: 201, body: lead({ status: 'new' }) },
    })
    const user = userEvent.setup()
    renderAt('/admin/leads')

    await user.click(await screen.findByRole('button', { name: 'Add lead' }))
    await user.type(screen.getByLabelText('Name'), 'Kabir')
    await user.type(screen.getByLabelText('Mobile number'), '98765 00001')
    await user.selectOptions(screen.getByLabelText('How did they hear about us?'), 'referral')
    await user.click(screen.getByLabelText('Interested in (optional)'))
    expect((await screen.findByRole('status')).textContent).toBe('This number is already a member (Asha Patel).')

    await user.type(screen.getByLabelText('Interested in (optional)'), 'PT')
    await user.type(screen.getByLabelText('Follow up on (optional)'), addDays(today, 1))
    await user.click(screen.getAllByRole('button', { name: 'Add lead' }).at(-1)!)
    await vi.waitFor(() => expect(callsTo('POST /leads')).toHaveLength(1))
    expect(callsTo('POST /leads')[0]?.body).toMatchObject({
      name: 'Kabir',
      phone: '98765 00001',
      source: 'referral',
      interest: 'PT',
      followUpOn: addDays(today, 1),
    })
  })

  it('shows an overdue follow-up; marking lost needs a reason', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': admin,
      'GET /leads?filter=open': ok([lead()]),
      'PATCH /leads/lead-1': ok(lead({ status: 'lost', lostReason: 'Too far' })),
    })
    const user = userEvent.setup()
    renderAt('/admin/leads')

    const card = await screen.findByRole('article', { name: 'Riya Shah' })
    expect(within(card).getByText(/^Follow up was due /).className).toMatch(/text-danger/)
    expect(within(card).getByRole('link', { name: 'Call Riya Shah' }).getAttribute('href')).toBe('tel:+919876511111')

    await user.click(within(card).getByRole('button', { name: 'Update' }))
    await user.selectOptions(within(card).getByLabelText('Status'), 'lost')
    await user.click(within(card).getByRole('button', { name: 'Save' }))
    expect((await within(card).findByRole('alert')).textContent).toBe('Say why they didn’t join')
    await user.type(within(card).getByLabelText('Why didn’t they join?'), 'Too far')
    await user.click(within(card).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(callsTo('PATCH /leads/lead-1')).toHaveLength(1))
    expect(callsTo('PATCH /leads/lead-1')[0]?.body).toMatchObject({ status: 'lost', lostReason: 'Too far' })
  })

  it('Convert to member opens New member with their name and number', async () => {
    mockApi({
      'POST /auth/refresh': admin,
      'GET /leads?filter=open': ok([lead()]),
      'GET /plans': ok([]),
    })
    const user = userEvent.setup()
    renderAt('/admin/leads')

    await user.click(await screen.findByRole('button', { name: 'Convert to member' }))
    expect(((await screen.findByLabelText('Full name')) as HTMLInputElement).value).toBe('Riya Shah')
    expect((screen.getByLabelText('Mobile number') as HTMLInputElement).value).toBe('9876511111')
  })

  it('the dashboard lists follow-ups due with call and WhatsApp', async () => {
    mockApi({
      'POST /auth/refresh': admin,
      'GET /dashboard': ok({
        today,
        members: { active: 0, joinedThisMonth: 0, frozen: 0, noPlan: 0, expiringSoon: [], recentlyExpired: [] },
        revenue: null,
        dues: { totalPaise: 0, members: [] },
        pt: {
          bookedThisWeek: 0,
          completedThisWeek: 0,
          noShowsThisWeek: 0,
          openDisputes: 0,
          unmarked: 0,
          runningOut: [],
        },
        workouts: { withPlan: 0, trackedThisWeek: 0 },
        leads: {
          open: 1,
          followUps: [
            {
              leadId: 'lead-1',
              name: 'Riya Shah',
              phone: '+919876511111',
              status: 'contacted',
              interest: 'PT',
              followUpOn: today,
            },
          ],
        },
      }),
    })
    renderAt('/home')
    const list = await screen.findByRole('list', { name: 'Lead follow-ups due' })
    expect(within(list).getByText('Contacted · PT · today')).toBeTruthy()
    expect(
      within(list)
        .getByRole('link', { name: /^Riya Shah/ })
        .getAttribute('href'),
    ).toBe('/admin/leads')
    expect(
      decodeURIComponent(within(list).getByRole('link', { name: 'WhatsApp Riya Shah' }).getAttribute('href') ?? ''),
    ).toMatch(/Hi Riya, this is Onthec Gym\. Thanks for your interest!/)
    expect(screen.getByRole('link', { name: /Leads →/ }).getAttribute('href')).toBe('/admin/leads')
  })
})
