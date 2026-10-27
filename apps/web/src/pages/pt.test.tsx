// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import {
  addDays,
  todayInIndia,
  type MemberDetail,
  type MyMembership,
  type PtPackage,
  type PtPurchaseView,
  type TrainerClient,
  type UserSummary,
} from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { formatDate } from '../lib/format'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

const today = todayInIndia()
const owner = ok(session(sessionUser({ role: 'owner', name: 'Nitin Sharma' })))

const pkg12: PtPackage = {
  id: 'pkg-12',
  name: '12 Sessions',
  sessionCount: 12,
  validityDays: 60,
  pricePaise: 1200000,
  description: null,
  active: true,
}

const ravi: UserSummary = { id: 'trainer-1', name: 'Ravi Kumar', phone: '+919811111103', role: 'trainer' }
const staff: UserSummary[] = [{ id: 'admin-1', name: 'Admin A', phone: '+919811111102', role: 'admin' }, ravi]

function purchase(overrides: Partial<PtPurchaseView> = {}): PtPurchaseView {
  return {
    id: 'ptp-1',
    memberId: 'mem-1',
    packageName: '12 Sessions',
    sessionCount: 12,
    sessionsLeft: 9,
    startDate: addDays(today, -10),
    expiresOn: addDays(today, 49),
    status: 'active',
    trainer: { id: ravi.id, name: ravi.name },
    pricePaise: 1200000,
    listPricePaise: 1200000,
    discountReason: null,
    paidPaise: 1200000,
    duePaise: 0,
    ledger: [
      { id: 'l1', change: 12, reason: 'purchase', note: null, createdAt: new Date().toISOString(), createdByName: 'Admin A' },
      { id: 'l2', change: -3, reason: 'adjustment', note: 'Before the app', createdAt: new Date().toISOString(), createdByName: 'Admin A' },
    ],
    ...overrides,
  }
}

function memberDetail(overrides: Partial<MemberDetail> = {}): MemberDetail {
  return {
    id: 'mem-1',
    userId: 'user-9',
    name: 'Asha Patel',
    phone: '+919876500001',
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

describe('PT packages screen', () => {
  it('adds a package in rupees with sessions and validity', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': owner,
      'GET /pt-packages': ok([]),
      'POST /pt-packages': { status: 201, body: pkg12 },
    })
    const user = userEvent.setup()
    renderAt('/admin/pt-packages')

    await user.click(await screen.findByRole('button', { name: 'Add package' }))
    await user.type(screen.getByLabelText('Package name'), '12 Sessions')
    expect((screen.getByLabelText('Sessions') as HTMLInputElement).value).toBe('12')
    expect((screen.getByLabelText('Valid for (days)') as HTMLInputElement).value).toBe('60')
    await user.type(screen.getByLabelText('Price (incl. GST)'), '12,000')
    await user.click(screen.getAllByRole('button', { name: 'Add package' }).at(-1)!)

    await vi.waitFor(() => expect(callsTo('POST /pt-packages')).toHaveLength(1))
    expect(callsTo('POST /pt-packages')[0]?.body).toMatchObject({
      name: '12 Sessions',
      sessionCount: 12,
      validityDays: 60,
      pricePaise: 1200000,
    })
  })
})

describe('selling PT at the desk', () => {
  it('sells a package with a trainer (only trainers are offered) and takes the payment', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': owner,
      'GET /members/mem-1': ok(memberDetail()),
      'GET /pt-packages': ok([pkg12, { ...pkg12, id: 'pkg-old', name: 'Old', active: false }]),
      'GET /users?kind=staff': ok(staff),
      'POST /members/mem-1/pt-purchases': { status: 201, body: purchase() },
    })
    const user = userEvent.setup()
    renderAt('/admin/members/mem-1')

    expect(await screen.findByText('No PT packages yet.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Sell PT package' }))

    const trainer = (await screen.findByLabelText('Trainer')) as HTMLSelectElement
    expect([...trainer.options].map((o) => o.textContent)).toEqual(['Ravi Kumar'])
    const packages = (await screen.findByLabelText(/^Package/)) as HTMLSelectElement
    expect([...packages.options].map((o) => o.value)).toEqual(['pkg-12'])
    expect(screen.getByText(`Valid till ${formatDate(addDays(today, 59))}.`)).toBeTruthy()
    expect((screen.getByLabelText('Price (incl. GST)') as HTMLInputElement).value).toBe('12000')

    await user.click(screen.getByRole('radio', { name: 'UPI' }))
    await user.click(screen.getByRole('button', { name: 'Sell package' }))

    await vi.waitFor(() => expect(callsTo('POST /members/mem-1/pt-purchases')).toHaveLength(1))
    expect(callsTo('POST /members/mem-1/pt-purchases')[0]?.body).toEqual({
      packageId: 'pkg-12',
      trainerId: 'trainer-1',
      payment: { method: 'upi' },
    })
  })

  it('shows the balance and history; adjusting needs a reason and never goes below zero', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': owner,
      'GET /members/mem-1': ok(memberDetail({ ptPurchases: [purchase()] })),
      'POST /pt-purchases/ptp-1/adjust': ok(purchase({ sessionsLeft: 7 })),
    })
    const user = userEvent.setup()
    renderAt('/admin/members/mem-1')

    expect(await screen.findByText('9 of 12 sessions left')).toBeTruthy()
    expect(screen.getByText('with Ravi Kumar')).toBeTruthy()
    expect(screen.getByText(/Before the app/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Adjust sessions' }))
    const count = screen.getByLabelText('Sessions')
    await user.clear(count)
    await user.type(count, '10')
    await user.click(screen.getByRole('button', { name: 'Save change' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Only 9 sessions left')

    await user.clear(count)
    await user.type(count, '2')
    await user.click(screen.getByRole('button', { name: 'Save change' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/reason/)
    expect(callsTo('POST /pt-purchases/ptp-1/adjust')).toHaveLength(0)

    await user.type(screen.getByLabelText('Reason'), 'Missed sessions last month')
    await user.click(screen.getByRole('button', { name: 'Save change' }))
    await vi.waitFor(() => expect(callsTo('POST /pt-purchases/ptp-1/adjust')).toHaveLength(1))
    expect(callsTo('POST /pt-purchases/ptp-1/adjust')[0]?.body).toEqual({ change: -2, note: 'Missed sessions last month' })
  })

  it('records a payment for a PT package that is due', async () => {
    const due = purchase({ paidPaise: 0, duePaise: 1200000 })
    const { callsTo } = mockApi({
      'POST /auth/refresh': owner,
      'GET /members/mem-1': ok(memberDetail({ ptPurchases: [due], duePaise: 1200000 })),
      'POST /pt-purchases/ptp-1/payments': { status: 201, body: purchase() },
    })
    const user = userEvent.setup()
    renderAt('/admin/members/mem-1')

    await user.click(await screen.findByRole('button', { name: 'Record payment' }))
    expect(screen.getByText('12 Sessions (PT) · ₹12,000 due')).toBeTruthy()
    const amount = screen.getByLabelText('Amount received')
    await user.clear(amount)
    await user.type(amount, '5000')
    await user.click(screen.getByRole('button', { name: 'Record payment' }))

    await vi.waitFor(() => expect(callsTo('POST /pt-purchases/ptp-1/payments')).toHaveLength(1))
    expect(callsTo('POST /pt-purchases/ptp-1/payments')[0]?.body).toMatchObject({ amountPaise: 500000, method: 'cash' })
  })

  it('extends the use-by date, only to a later date', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': owner,
      'GET /members/mem-1': ok(memberDetail({ ptPurchases: [purchase()] })),
      'POST /pt-purchases/ptp-1/extend': ok(purchase({ expiresOn: addDays(today, 63) })),
    })
    const user = userEvent.setup()
    renderAt('/admin/members/mem-1')

    await user.click(await screen.findByRole('button', { name: 'Extend' }))
    const date = screen.getByLabelText('New use-by date') as HTMLInputElement
    expect(date.value).toBe(addDays(today, 63)) // two more weeks suggested
    await user.click(screen.getAllByRole('button', { name: 'Extend' }).at(-1)!)

    await vi.waitFor(() => expect(callsTo('POST /pt-purchases/ptp-1/extend')).toHaveLength(1))
    expect(callsTo('POST /pt-purchases/ptp-1/extend')[0]?.body).toEqual({ expiresOn: addDays(today, 63) })
  })
})

describe('what members and trainers see', () => {
  it('members see sessions left, their trainer and the use-by date', async () => {
    const mine: MyMembership = { current: null, history: [], duePaise: 0, payments: [] }
    mockApi({
      'POST /auth/refresh': ok(session(sessionUser({ role: 'member', name: 'Asha Patel' }))),
      'GET /me/membership': ok(mine),
      'GET /me/pt': ok([purchase()]),
      'GET /me/renewal-options': ok({ onlinePayments: false, startDate: today, plans: [] }),
    })
    renderAt('/home')

    expect(await screen.findByText('PT · 12 Sessions')).toBeTruthy()
    expect(screen.getByText('9 of 12 sessions left')).toBeTruthy()
    expect(screen.getByText('with Ravi Kumar')).toBeTruthy()
    expect(screen.getByText(`Use by ${formatDate(addDays(today, 49))}`)).toBeTruthy()
  })

  it('trainers see their clients and sessions left', async () => {
    const clients: TrainerClient[] = [
      { memberId: 'mem-1', name: 'Asha Patel', phone: '+919876500001', purchases: [purchase({ expiresOn: addDays(today, 3) })] },
    ]
    mockApi({
      'POST /auth/refresh': ok(session(sessionUser({ role: 'trainer', name: 'Ravi Kumar' }))),
      'GET /trainer/clients': ok(clients),
    })
    renderAt('/home')

    expect(await screen.findByRole('heading', { name: 'My clients' })).toBeTruthy()
    expect(await screen.findByText('Asha Patel')).toBeTruthy()
    expect(screen.getByText('+91 98765 00001')).toBeTruthy()
    expect(screen.getByText('9 of 12 sessions left')).toBeTruthy()
    // Use-by date within a week is highlighted.
    expect(screen.getByText(`Use by ${formatDate(addDays(today, 3))}`).className).toMatch(/text-warn/)
  })
})
