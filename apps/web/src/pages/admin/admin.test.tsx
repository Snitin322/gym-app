// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import {
  addDays,
  todayInIndia,
  type MemberDetail,
  type MemberSummary,
  type MembershipPlan,
  type MembershipView,
} from '@onthec/shared'
import App from '../../App'
import { AppProviders } from '../../AppProviders'
import { setAccessToken } from '../../api/client'
import { mockApi, ok, session, sessionUser } from '../../test/mockApi'

const today = todayInIndia()

const owner = session(sessionUser({ role: 'owner', name: 'Nitin Sharma' }))

const plan3: MembershipPlan = {
  id: 'plan-3',
  name: '3 months',
  durationMonths: 3,
  pricePaise: 450000,
  maxFreezeDays: 15,
  description: null,
  active: true,
}

function membership(overrides: Partial<MembershipView> = {}): MembershipView {
  return {
    id: 'ms-1',
    planName: '3 months',
    durationMonths: 3,
    pricePaise: 450000,
    startDate: today,
    endDate: addDays(today, 91),
    status: 'active',
    daysLeft: 92,
    maxFreezeDays: 15,
    freezeDaysUsed: 0,
    freezes: [],
    cancelledAt: null,
    cancelReason: null,
    ...overrides,
  }
}

function memberDetail(overrides: Partial<MemberDetail> = {}): MemberDetail {
  const current = membership()
  return {
    id: 'mem-1',
    userId: 'user-9',
    name: 'Asha Patel',
    phone: '+919876500001',
    status: 'active',
    current,
    joinedOn: today,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    memberships: [current],
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

describe('access', () => {
  it('members cannot open admin screens', async () => {
    mockApi({ 'POST /auth/refresh': ok(session(sessionUser({ role: 'member', name: 'Asha Patel' }))) })
    renderAt('/admin/members')
    expect(await screen.findByRole('heading', { name: 'Hi Asha' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Members/ })).toBeNull()
  })

  it('owners see Members and Plans on their home screen', async () => {
    mockApi({ 'POST /auth/refresh': ok(owner) })
    renderAt('/home')
    expect(await screen.findByRole('link', { name: /Members/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Plans/ })).toBeTruthy()
  })
})

describe('plans', () => {
  it('adds a plan in rupees with the suggested freeze limit for its length', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /plans': ok([]),
      'POST /plans': { status: 201, body: plan3 },
    })
    const user = userEvent.setup()
    renderAt('/admin/plans')

    await user.click(await screen.findByRole('button', { name: 'Add plan' }))
    await user.type(screen.getByLabelText('Plan name'), '3 months')
    await user.selectOptions(screen.getByLabelText('Length'), '3')
    expect((screen.getByLabelText('Max freeze days') as HTMLInputElement).value).toBe('15')
    await user.type(screen.getByLabelText('Price (incl. GST)'), '4,500')
    await user.click(screen.getAllByRole('button', { name: 'Add plan' }).at(-1)!)

    await vi.waitFor(() => expect(callsTo('POST /plans')).toHaveLength(1))
    expect(callsTo('POST /plans')[0]?.body).toMatchObject({
      name: '3 months',
      durationMonths: 3,
      pricePaise: 450000,
      maxFreezeDays: 15,
    })
  })

  it('rejects an invalid price before calling the API', async () => {
    const { callsTo } = mockApi({ 'POST /auth/refresh': ok(owner), 'GET /plans': ok([]) })
    const user = userEvent.setup()
    renderAt('/admin/plans')

    await user.click(await screen.findByRole('button', { name: 'Add plan' }))
    await user.type(screen.getByLabelText('Plan name'), '1 month')
    await user.type(screen.getByLabelText('Price (incl. GST)'), 'abc')
    await user.click(screen.getAllByRole('button', { name: 'Add plan' }).at(-1)!)

    expect((await screen.findByRole('alert')).textContent).toMatch(/valid price/)
    expect(callsTo('POST /plans')).toHaveLength(0)
  })
})

describe('members', () => {
  const list: MemberSummary[] = [
    { id: 'mem-1', userId: 'u1', name: 'Asha Patel', phone: '+919876500001', status: 'active', current: membership() },
    {
      id: 'mem-2',
      userId: 'u2',
      name: 'Esha Rao',
      phone: '+919876500002',
      status: 'expiring',
      current: membership({ daysLeft: 3, endDate: addDays(today, 2) }),
    },
  ]

  it('lists members with status and filters by expiring', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /members?filter=all': ok(list),
      'GET /members?filter=expiring': ok([list[1]]),
    })
    const user = userEvent.setup()
    renderAt('/admin/members')

    const asha = await screen.findByRole('link', { name: /Asha Patel/ })
    expect(within(asha).getByText('Active')).toBeTruthy()
    expect(within(asha).getByText('3 months · 92 days left')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Expiring' }))

    await vi.waitFor(() => expect(callsTo('GET /members?filter=expiring')).toHaveLength(1))
    await vi.waitFor(() => expect(screen.queryByRole('link', { name: /Asha Patel/ })).toBeNull())
    expect(screen.getByRole('link', { name: /Esha Rao/ })).toBeTruthy()
  })

  it('adds a member with a first plan and opens their page', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /plans': ok([plan3]),
      'POST /members': { status: 201, body: memberDetail() },
      'GET /members/mem-1': ok(memberDetail()),
    })
    const user = userEvent.setup()
    renderAt('/admin/members/new')

    await user.type(await screen.findByLabelText('Full name'), 'Asha Patel')
    await user.type(screen.getByLabelText('Mobile number'), '98765 00001')
    await user.selectOptions(await screen.findByLabelText('Plan'), 'plan-3')
    await user.click(screen.getByRole('button', { name: 'Add member' }))

    expect(await screen.findByText('92 days left')).toBeTruthy()
    expect(callsTo('POST /members')[0]?.body).toMatchObject({
      name: 'Asha Patel',
      phone: '+919876500001',
      firstMembership: { planId: 'plan-3', startDate: today },
    })
  })
})

describe('member page', () => {
  it('freezes the current membership for the chosen days', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /members/mem-1': ok(memberDetail()),
      'POST /memberships/ms-1/freeze': ok(membership({ freezeDaysUsed: 7 })),
    })
    const user = userEvent.setup()
    renderAt('/admin/members/mem-1')

    await user.click(await screen.findByRole('button', { name: 'Freeze' }))
    expect(screen.getByText(/15 freeze days left/)).toBeTruthy()
    await user.type(screen.getByLabelText('Reason (optional)'), 'Travel')
    await user.click(screen.getByRole('button', { name: 'Freeze' }))

    await vi.waitFor(() => expect(callsTo('POST /memberships/ms-1/freeze')).toHaveLength(1))
    expect(callsTo('POST /memberships/ms-1/freeze')[0]?.body).toEqual({
      fromDate: today,
      toDate: addDays(today, 6),
      reason: 'Travel',
    })
  })

  it('asks before cancelling a membership', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /members/mem-1': ok(memberDetail()),
      'POST /memberships/ms-1/cancel': ok(membership({ status: 'cancelled', daysLeft: 0 })),
    })
    const user = userEvent.setup()
    renderAt('/admin/members/mem-1')

    await user.click(await screen.findByRole('button', { name: 'Cancel membership' }))
    expect(screen.getByRole('heading', { name: 'Cancel membership?' })).toBeTruthy()
    expect(callsTo('POST /memberships/ms-1/cancel')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Yes, cancel it' }))
    await vi.waitFor(() => expect(callsTo('POST /memberships/ms-1/cancel')).toHaveLength(1))
  })
})
