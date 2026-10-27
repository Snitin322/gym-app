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
    listPricePaise: 450000,
    discountReason: null,
    paidPaise: 450000,
    duePaise: 0,
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
    payments: [],
    duePaise: 0,
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
    { id: 'mem-1', userId: 'u1', name: 'Asha Patel', phone: '+919876500001', status: 'active', current: membership(), duePaise: 0 },
    {
      id: 'mem-2',
      userId: 'u2',
      name: 'Esha Rao',
      phone: '+919876500002',
      status: 'expiring',
      current: membership({ daysLeft: 3, endDate: addDays(today, 2) }),
      duePaise: 0,
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

describe('staff', () => {
  const staff = [
    { id: 'u-owner', name: 'Nitin Sharma', phone: '+919876500100', role: 'owner' },
    { id: 'u-trainer', name: 'Ravi Trainer', phone: '+919876500101', role: 'trainer' },
  ]

  it('lets the owner add an admin', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /users?kind=staff': ok(staff),
      'POST /users': { status: 201, body: { id: 'u-new', name: 'Meena', phone: '+919876500102', role: 'admin' } },
    })
    const user = userEvent.setup()
    renderAt('/admin/staff')

    expect(await screen.findByText('Ravi Trainer')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add staff' }))
    await user.type(screen.getByLabelText('Full name'), 'Meena')
    await user.type(screen.getByLabelText('Mobile number'), '98765 00102')
    await user.selectOptions(screen.getByLabelText('Role'), 'admin')
    await user.click(screen.getByRole('button', { name: 'Add admin' }))

    await vi.waitFor(() => expect(callsTo('POST /users')).toHaveLength(1))
    expect(callsTo('POST /users')[0]?.body).toEqual({ name: 'Meena', phone: '+919876500102', role: 'admin' })
  })

  it('admins can only add trainers', async () => {
    mockApi({
      'POST /auth/refresh': ok(session(sessionUser({ role: 'admin', name: 'Admin A' }))),
      'GET /users?kind=staff': ok(staff),
    })
    const user = userEvent.setup()
    renderAt('/admin/staff')

    await user.click(await screen.findByRole('button', { name: 'Add staff' }))
    const options = within(screen.getByLabelText('Role')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Trainer'])
  })
})

describe('payments at the desk', () => {
  async function fillNewMember(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText('Full name'), 'Asha Patel')
    await user.type(screen.getByLabelText('Mobile number'), '98765 00001')
    await user.selectOptions(await screen.findByLabelText('Plan'), 'plan-3')
  }

  it('takes the full price by UPI with a reference', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /plans': ok([plan3]),
      'POST /members': { status: 201, body: memberDetail() },
      'GET /members/mem-1': ok(memberDetail()),
    })
    const user = userEvent.setup()
    renderAt('/admin/members/new')

    await fillNewMember(user)
    expect((screen.getByLabelText('Price (incl. GST)') as HTMLInputElement).value).toBe('4500')
    await user.click(screen.getByRole('radio', { name: 'UPI' }))
    await user.type(screen.getByLabelText('Reference (optional)'), 'UPI-777')
    await user.click(screen.getByRole('button', { name: 'Add member' }))

    await vi.waitFor(() => expect(callsTo('POST /members')).toHaveLength(1))
    expect(callsTo('POST /members')[0]?.body).toMatchObject({
      firstMembership: { planId: 'plan-3', payment: { method: 'upi', reference: 'UPI-777' } },
    })
  })

  it('"Pay later" sends no payment; a discount needs a reason', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /plans': ok([plan3]),
      'POST /members': { status: 201, body: memberDetail() },
      'GET /members/mem-1': ok(memberDetail()),
    })
    const user = userEvent.setup()
    renderAt('/admin/members/new')

    await fillNewMember(user)
    const price = screen.getByLabelText('Price (incl. GST)')
    await user.clear(price)
    await user.type(price, '4000')
    await user.click(screen.getByRole('radio', { name: 'Pay later' }))
    await user.click(screen.getByRole('button', { name: 'Add member' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/reason for the discount/)
    expect(callsTo('POST /members')).toHaveLength(0)

    await user.type(screen.getByLabelText('Reason for discount'), 'Diwali offer')
    await user.click(screen.getByRole('button', { name: 'Add member' }))

    await vi.waitFor(() => expect(callsTo('POST /members')).toHaveLength(1))
    const sale = (callsTo('POST /members')[0]?.body as { firstMembership: Record<string, unknown> }).firstMembership
    expect(sale).toMatchObject({ pricePaise: 400000, discountReason: 'Diwali offer' })
    expect(sale.payment).toBeUndefined()
  })

  it('shows what is due and records a part payment', async () => {
    const due = membership({ paidPaise: 0, duePaise: 450000 })
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /members/mem-1': ok(memberDetail({ current: due, memberships: [due], duePaise: 450000 })),
      'POST /memberships/ms-1/payments': { status: 201, body: membership({ paidPaise: 200000, duePaise: 250000 }) },
    })
    const user = userEvent.setup()
    renderAt('/admin/members/mem-1')

    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getAllByText(/₹4,500 due/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    const amount = screen.getByLabelText('Amount received')
    expect((amount as HTMLInputElement).value).toBe('4500')
    await user.clear(amount)
    await user.type(amount, '2000')
    await user.click(screen.getByRole('radio', { name: 'Card' }))
    await user.click(screen.getByRole('button', { name: 'Record payment' }))

    await vi.waitFor(() => expect(callsTo('POST /memberships/ms-1/payments')).toHaveLength(1))
    expect(callsTo('POST /memberships/ms-1/payments')[0]?.body).toEqual({ amountPaise: 200000, method: 'card' })
  })
})

describe('gym details', () => {
  const gym = {
    id: 'gym-1',
    name: 'Onthec Gym',
    legalName: null,
    address: null,
    city: null,
    pincode: null,
    stateCode: null,
    gstin: null,
    sacCode: '999723',
    invoicePrefix: 'INV',
    contactPhone: null,
    email: null,
  }

  it('the owner saves invoice details; a mistyped GSTIN is caught first', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /gym': ok(gym),
      'PATCH /gym': ok({ ...gym, gstin: '27AAPFU0939F1ZV', stateCode: '27', invoicePrefix: 'OG' }),
    })
    const user = userEvent.setup()
    renderAt('/admin/gym')

    const gstin = await screen.findByLabelText('GSTIN')
    await user.type(gstin, '27aapfu0939f1zw')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not valid/)
    expect(callsTo('PATCH /gym')).toHaveLength(0)

    await user.clear(gstin)
    await user.type(gstin, '27aapfu0939f1zv')
    const prefix = screen.getByLabelText('Invoice prefix')
    await user.clear(prefix)
    await user.type(prefix, 'og')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeTruthy()
    expect(callsTo('PATCH /gym')[0]?.body).toMatchObject({ gstin: '27AAPFU0939F1ZV', invoicePrefix: 'OG' })
  })

  it('admins cannot open it', async () => {
    mockApi({ 'POST /auth/refresh': ok(session(sessionUser({ role: 'admin', name: 'Admin A' }))) })
    renderAt('/admin/gym')
    expect(await screen.findByRole('heading', { name: 'Hi Admin' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Gym details/ })).toBeNull()
  })
})

describe('invoices', () => {
  const paid = {
    id: 'pay-1',
    amountPaise: 450000,
    method: 'cash' as const,
    status: 'paid' as const,
    reference: null,
    note: null,
    paidAt: '2026-10-27T05:00:00.000Z',
    membershipId: 'ms-1',
    description: '3 months',
    recordedByName: 'Nitin Sharma',
  }

  it('downloads the invoice PDF with the login token', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /members/mem-1': ok(memberDetail({ payments: [{ ...paid, invoice: { id: 'inv-1', number: 'OG/26-27/0001' } }] })),
      'GET /invoices/inv-1/pdf': { status: 200, file: { content: '%PDF-1.3 test', type: 'application/pdf' } },
    })
    const createObjectURL = vi.fn(() => 'blob:invoice')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
    const user = userEvent.setup()
    renderAt('/admin/members/mem-1')

    await user.click(await screen.findByRole('button', { name: 'Invoice OG/26-27/0001 ↓' }))

    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce())
    expect(callsTo('GET /invoices/inv-1/pdf')[0]?.headers.get('authorization')).toBe('Bearer access-1')
  })

  it('creates an invoice for an older payment without one', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(owner),
      'GET /members/mem-1': ok(memberDetail({ payments: [{ ...paid, invoice: null }] })),
      'POST /payments/pay-1/invoice': { status: 201, body: { id: 'inv-9', number: 'OG/26-27/0009' } },
    })
    const user = userEvent.setup()
    renderAt('/admin/members/mem-1')

    await user.click(await screen.findByRole('button', { name: 'Create invoice' }))
    await vi.waitFor(() => expect(callsTo('POST /payments/pay-1/invoice')).toHaveLength(1))
  })
})
