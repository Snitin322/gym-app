// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import {
  DEFAULT_PT_RULES,
  addDays,
  indiaDateTime,
  todayInIndia,
  type MemberDetail,
  type MyMembership,
  type PtPurchaseView,
  type PtSessionView,
  type PtSlotsResponse,
  type TrainerAvailabilityView,
  type UserSummary,
} from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { formatDay, formatWhen } from '../lib/time'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

const today = todayInIndia()
const tomorrow = addDays(today, 1)
const dayAfter = addDays(today, 2)
const HOUR = 60 * 60_000
const at = (date: string, minute: number) => indiaDateTime(date, minute).toISOString()

const member = ok(session(sessionUser({ role: 'member', name: 'Asha Patel' })))
const trainer = ok(session(sessionUser({ id: 'trainer-1', role: 'trainer', name: 'Ravi Kumar' })))
const owner = ok(session(sessionUser({ role: 'owner', name: 'Nitin Sharma' })))

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

function ptSession(overrides: Partial<PtSessionView> & { startsAt: string }): PtSessionView {
  const start = Date.parse(overrides.startsAt)
  return {
    id: 'ses-1',
    purchaseId: 'ptp-1',
    packageName: '12 Sessions',
    trainer: { id: 'trainer-1', name: 'Ravi Kumar' },
    member: { id: 'mem-1', name: 'Asha Patel', phone: '+919876500001' },
    endsAt: new Date(start + HOUR).toISOString(),
    status: 'booked',
    lateCancel: false,
    cancelledAt: null,
    cancelReason: null,
    cancelledByName: null,
    bookedByName: 'Asha Patel',
    freeCancelUntil: new Date(start - 12 * HOUR).toISOString(),
    ...overrides,
  }
}

const slots: PtSlotsResponse = {
  purchaseId: 'ptp-1',
  trainer: { id: 'trainer-1', name: 'Ravi Kumar' },
  sessionMinutes: 60,
  rules: { ...DEFAULT_PT_RULES },
  slots: [
    { startsAt: at(tomorrow, 360), endsAt: at(tomorrow, 420) },
    { startsAt: at(tomorrow, 420), endsAt: at(tomorrow, 480) },
    { startsAt: at(dayAfter, 1080), endsAt: at(dayAfter, 1140) },
  ],
}

const myMembership: MyMembership = { current: null, history: [], duePaise: 0, payments: [] }

/** A signed-in member with one PT package. */
function memberRoutes(overrides: Record<string, Parameters<typeof mockApi>[0][string]> = {}) {
  return {
    'POST /auth/refresh': member,
    'GET /me/membership': ok(myMembership),
    'GET /me/renewal-options': ok({ onlinePayments: false, startDate: today, plans: [] }),
    'GET /me/pt': ok([purchase()]),
    'GET /me/pt-sessions': ok([]),
    'GET /pt-purchases/ptp-1/slots': ok(slots),
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

describe('trainer availability', () => {
  const availability: TrainerAvailabilityView = {
    trainerId: 'trainer-1',
    trainerName: 'Ravi Kumar',
    sessionMinutes: 60,
    windows: [{ weekday: 1, startMinute: 360, endMinute: 600 }],
    timeOff: [],
  }

  it('saves weekly hours and session length; overlapping ranges are caught first', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': trainer,
      'GET /trainers/trainer-1/availability': ok(availability),
      'PUT /trainers/trainer-1/availability': ok(availability),
    })
    const user = userEvent.setup()
    renderAt('/trainer/availability')

    expect(await screen.findByRole('heading', { name: 'My availability' })).toBeTruthy()
    // Times are shown like "6:00 am".
    expect(((await screen.findByLabelText('Mon from')) as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('6:00 am')
    expect((screen.getByLabelText('Mon to') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('10:00 am')

    const length = screen.getByLabelText('Session length (minutes)')
    await user.clear(length)
    await user.type(length, '45')

    // Wednesday: 6:00 am (default start) to 12:00 pm.
    await user.click(screen.getByRole('button', { name: 'Add hours on Wed' }))
    await user.selectOptions(screen.getByLabelText('Wed to'), '720')

    // A second Monday range that overlaps the first is refused before saving.
    await user.click(screen.getByRole('button', { name: 'Add hours on Mon' }))
    const monFrom = screen.getAllByLabelText('Mon from')
    await user.selectOptions(monFrom[1]!, '540')
    await user.click(screen.getByRole('button', { name: 'Save hours' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Mon: time ranges overlap')
    expect(callsTo('PUT /trainers/trainer-1/availability')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Remove Mon 9:00 am to 3:00 pm' }))
    await user.click(screen.getByRole('button', { name: 'Save hours' }))

    await vi.waitFor(() => expect(callsTo('PUT /trainers/trainer-1/availability')).toHaveLength(1))
    expect(callsTo('PUT /trainers/trainer-1/availability')[0]?.body).toEqual({
      sessionMinutes: 45,
      windows: [
        { weekday: 1, startMinute: 360, endMinute: 600 },
        { weekday: 3, startMinute: 360, endMinute: 720 },
      ],
    })
    expect(await screen.findByText(/Saved\. Sessions already booked stay as they are/)).toBeTruthy()
  })

  it('adds whole-day time off, lists the sessions cancelled for free, and removes it', async () => {
    const cancelled = ptSession({ startsAt: at(tomorrow, 360) })
    const timeOff = { id: 'off-1', startsAt: at(tomorrow, 0), endsAt: at(dayAfter, 0), reason: 'Family function' }
    const { callsTo } = mockApi({
      'POST /auth/refresh': trainer,
      'GET /trainers/trainer-1/availability': (_body, call) =>
        ok(call === 1 ? availability : { ...availability, timeOff: [timeOff] }),
      'POST /trainers/trainer-1/time-off': { status: 201, body: { timeOff, cancelledSessions: [cancelled] } },
      'DELETE /trainers/trainer-1/time-off/off-1': { status: 204 },
    })
    const user = userEvent.setup()
    renderAt('/trainer/availability')

    expect(await screen.findByText('No time off coming up.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add time off' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: tomorrow } })
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe(tomorrow)
    await user.type(screen.getByLabelText('Reason (optional)'), 'Family function')
    await user.click(screen.getAllByRole('button', { name: 'Add time off' }).at(-1)!)

    await vi.waitFor(() => expect(callsTo('POST /trainers/trainer-1/time-off')).toHaveLength(1))
    expect(callsTo('POST /trainers/trainer-1/time-off')[0]?.body).toEqual({
      startsAt: at(tomorrow, 0),
      endsAt: at(dayAfter, 0),
      reason: 'Family function',
    })
    const status = await screen.findByText(/1 booked session cancelled for free/)
    expect(status.parentElement?.textContent).toContain(`${formatWhen(cancelled.startsAt)} · Asha Patel`)
    expect(await screen.findByText('Tomorrow (whole day)')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Remove time off Tomorrow (whole day)' }))
    await vi.waitFor(() => expect(callsTo('DELETE /trainers/trainer-1/time-off/off-1')).toHaveLength(1))
  })

  it('the trainer home shows upcoming sessions by day with client name and phone', async () => {
    mockApi({
      'POST /auth/refresh': trainer,
      'GET /trainer/clients': ok([]),
      'GET /trainers/trainer-1/sessions': ok([
        ptSession({ startsAt: at(tomorrow, 420) }),
        ptSession({ id: 'ses-old', startsAt: at(tomorrow, 360), status: 'cancelled' }),
      ]),
    })
    renderAt('/home')

    expect(await screen.findByRole('heading', { name: 'My schedule' })).toBeTruthy()
    expect(await screen.findByText('Tomorrow · 1 session')).toBeTruthy()
    expect(screen.getByText('7:00 am – 8:00 am')).toBeTruthy()
    expect(screen.getByText('+91 98765 00001')).toBeTruthy()
    expect(screen.getByRole('link', { name: /My availability/ }).getAttribute('href')).toBe('/trainer/availability')
  })
})

describe('member booking', () => {
  it('books a session: day, then time, then confirm', async () => {
    const booked = ptSession({ startsAt: at(tomorrow, 420) })
    const { callsTo } = mockApi(memberRoutes({ 'POST /pt-purchases/ptp-1/sessions': { status: 201, body: booked } }))
    const user = userEvent.setup()
    renderAt('/home')

    expect(await screen.findByText('9 sessions left · 1 booked')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Book a session' }))

    const days = await screen.findByRole('radiogroup', { name: 'Day' })
    expect(
      within(days)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Tomorrow', formatDay(dayAfter)])
    await user.click(within(days).getByRole('radio', { name: formatDay(dayAfter) }))
    const times = screen.getByRole('radiogroup', { name: 'Time' })
    expect(
      within(times)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['6:00 pm'])

    await user.click(within(days).getByRole('radio', { name: 'Tomorrow' }))
    expect(screen.getByRole('button', { name: 'Book session' }).hasAttribute('disabled')).toBe(true)
    await user.click(within(screen.getByRole('radiogroup', { name: 'Time' })).getByRole('radio', { name: '7:00 am' }))
    expect(screen.getByText(/free until 12 hours before it starts/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Book session' }))

    await vi.waitFor(() => expect(callsTo('POST /pt-purchases/ptp-1/sessions')).toHaveLength(1))
    expect(callsTo('POST /pt-purchases/ptp-1/sessions')[0]?.body).toEqual({ startsAt: at(tomorrow, 420) })
    expect(await screen.findByText('Booked for Tomorrow, 7:00 am. See your upcoming sessions below.')).toBeTruthy()
  })

  it('cannot book when every session left is already booked', async () => {
    mockApi(memberRoutes({ 'GET /me/pt': ok([purchase({ sessionsLeft: 2, sessionsBooked: 2 })]) }))
    renderAt('/home')

    expect(await screen.findByText(/All your sessions are already booked/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Book a session' }).hasAttribute('disabled')).toBe(true)
  })

  it('cannot book on an expired package', async () => {
    mockApi(
      memberRoutes({
        'GET /me/pt': ok([purchase({ status: 'expired', expiresOn: addDays(today, -1), sessionsBooked: 0 })]),
      }),
    )
    renderAt('/home')

    expect(await screen.findByText(/This package has expired/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Book a session' }).hasAttribute('disabled')).toBe(true)
  })

  it('shows free cancel until the cut-off, and warns that a late cancel uses up the session', async () => {
    const later = ptSession({ id: 'ses-later', startsAt: at(addDays(today, 3), 420) })
    const soon = ptSession({
      id: 'ses-soon',
      startsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
      freeCancelUntil: new Date(Date.now() - 10 * HOUR).toISOString(),
    })
    const { callsTo } = mockApi(
      memberRoutes({
        'GET /me/pt-sessions': ok([soon, later]),
        'POST /pt-sessions/ses-soon/cancel': ok({ ...soon, status: 'cancelled', lateCancel: true }),
        'POST /pt-sessions/ses-later/cancel': ok({ ...later, status: 'cancelled' }),
      }),
    )
    const user = userEvent.setup()
    renderAt('/home')

    await screen.findByRole('heading', { name: 'Upcoming sessions' })
    const [soonCard, laterCard] = screen.getAllByRole('article')

    expect(within(laterCard!).getByText(`Free to cancel until ${formatWhen(later.freeCancelUntil)}`)).toBeTruthy()
    expect(within(laterCard!).getByRole('button', { name: 'Reschedule' })).toBeTruthy()

    expect(within(soonCard!).getByText('Cancelling now uses up this session.')).toBeTruthy()
    expect(within(soonCard!).queryByRole('button', { name: 'Reschedule' })).toBeNull()
    await user.click(within(soonCard!).getByRole('button', { name: 'Cancel' }))
    expect(within(soonCard!).getByRole('alert').textContent).toMatch(/cancelling now uses up this session/)
    await user.click(within(soonCard!).getByRole('button', { name: 'Cancel session' }))
    await vi.waitFor(() => expect(callsTo('POST /pt-sessions/ses-soon/cancel')).toHaveLength(1))
    expect(callsTo('POST /pt-sessions/ses-soon/cancel')[0]?.body).toEqual({})

    await user.click(within(laterCard!).getByRole('button', { name: 'Cancel' }))
    expect(within(laterCard!).getByText(/It's free/)).toBeTruthy()
    await user.click(within(laterCard!).getByRole('button', { name: 'Cancel session' }))
    await vi.waitFor(() => expect(callsTo('POST /pt-sessions/ses-later/cancel')).toHaveLength(1))
  })

  it('reschedules to another open time', async () => {
    const later = ptSession({ id: 'ses-later', startsAt: at(addDays(today, 3), 420) })
    const { callsTo } = mockApi(
      memberRoutes({
        'GET /me/pt-sessions': ok([later]),
        'POST /pt-sessions/ses-later/reschedule': ok(ptSession({ id: 'ses-new', startsAt: at(dayAfter, 1080) })),
      }),
    )
    const user = userEvent.setup()
    renderAt('/home')

    const card = (await screen.findAllByRole('article'))[0]!
    await user.click(within(card).getByRole('button', { name: 'Reschedule' }))
    await user.click(await within(card).findByRole('radio', { name: formatDay(dayAfter) }))
    await user.click(within(card).getByRole('radio', { name: '6:00 pm' }))
    await user.click(within(card).getByRole('button', { name: 'Move session' }))

    await vi.waitFor(() => expect(callsTo('POST /pt-sessions/ses-later/reschedule')).toHaveLength(1))
    expect(callsTo('POST /pt-sessions/ses-later/reschedule')[0]?.body).toEqual({ startsAt: at(dayAfter, 1080) })
  })
})

describe('desk booking', () => {
  const memberDetail: MemberDetail = {
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
    ptPurchases: [purchase()],
    payments: [],
    duePaise: 0,
  }

  it('books for the member and cancels without using up a session', async () => {
    const upcoming = ptSession({ id: 'ses-1', startsAt: new Date(Date.now() + 2 * HOUR).toISOString() })
    const { callsTo } = mockApi({
      'POST /auth/refresh': owner,
      'GET /members/mem-1': ok(memberDetail),
      'GET /members/mem-1/pt-sessions': ok([upcoming]),
      'GET /pt-purchases/ptp-1/slots': ok(slots),
      'POST /pt-purchases/ptp-1/sessions': { status: 201, body: ptSession({ startsAt: at(tomorrow, 360) }) },
      'POST /pt-sessions/ses-1/cancel': ok({ ...upcoming, status: 'cancelled' }),
    })
    const user = userEvent.setup()
    renderAt('/admin/members/mem-1')

    expect(await screen.findByText('9 sessions left · 1 booked')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Book session' }))
    await user.click(await screen.findByRole('radio', { name: '6:00 am' }))
    await user.click(screen.getByRole('button', { name: 'Book session' }))
    await vi.waitFor(() => expect(callsTo('POST /pt-purchases/ptp-1/sessions')).toHaveLength(1))
    expect(callsTo('POST /pt-purchases/ptp-1/sessions')[0]?.body).toEqual({ startsAt: at(tomorrow, 360) })

    // Even inside the free-cancel window, the desk can move or cancel and the member keeps the session.
    const card = (await screen.findAllByRole('article'))[0]!
    expect(within(card).getByRole('button', { name: 'Reschedule' })).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: 'Cancel' }))
    expect(within(card).getByText(/keeps the session/)).toBeTruthy()
    await user.type(within(card).getByLabelText('Reason (optional)'), 'Trainer unwell')
    await user.click(within(card).getByRole('button', { name: 'Cancel session' }))
    await vi.waitFor(() => expect(callsTo('POST /pt-sessions/ses-1/cancel')).toHaveLength(1))
    expect(callsTo('POST /pt-sessions/ses-1/cancel')[0]?.body).toEqual({ reason: 'Trainer unwell' })
  })

  it("opens a trainer's hours from Staff", async () => {
    const staff: UserSummary[] = [
      { id: 'admin-1', name: 'Admin A', phone: '+919811111102', role: 'admin' },
      { id: 'trainer-1', name: 'Ravi Kumar', phone: '+919811111103', role: 'trainer' },
    ]
    mockApi({
      'POST /auth/refresh': owner,
      'GET /users?kind=staff': ok(staff),
      'GET /trainers/trainer-1/availability': ok({
        trainerId: 'trainer-1',
        trainerName: 'Ravi Kumar',
        sessionMinutes: 60,
        windows: [],
        timeOff: [],
      }),
    })
    const user = userEvent.setup()
    renderAt('/admin/staff')

    expect(screen.queryByRole('link', { name: "Admin A's hours" })).toBeNull()
    await user.click(await screen.findByRole('link', { name: "Ravi Kumar's hours" }))
    expect(await screen.findByRole('heading', { name: "Ravi Kumar's hours" })).toBeTruthy()
    expect(screen.getAllByText('Off')).toHaveLength(7)
  })
})

describe('owner PT rules', () => {
  it('saves the three rules in Gym details', async () => {
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
    const { callsTo } = mockApi({
      'POST /auth/refresh': owner,
      'GET /gym': ok(gym),
      'GET /pt-rules': ok({ ...DEFAULT_PT_RULES }),
      'PATCH /pt-rules': ok({ ...DEFAULT_PT_RULES, freeCancelHours: 6 }),
    })
    const user = userEvent.setup()
    renderAt('/admin/gym')

    const freeCancel = (await screen.findByLabelText('Free cancellation (hours before)')) as HTMLInputElement
    expect(freeCancel.value).toBe('12')
    await user.clear(freeCancel)
    await user.click(screen.getByRole('button', { name: 'Save PT rules' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Free cancellation/)
    expect(callsTo('PATCH /pt-rules')).toHaveLength(0)

    await user.type(freeCancel, '6')
    await user.click(screen.getByRole('button', { name: 'Save PT rules' }))
    await vi.waitFor(() => expect(callsTo('PATCH /pt-rules')).toHaveLength(1))
    expect(callsTo('PATCH /pt-rules')[0]?.body).toEqual({
      freeCancelHours: 6,
      bookingHorizonDays: 14,
      minNoticeHours: 2,
    })
    expect(await screen.findByText('PT rules saved.')).toBeTruthy()
  })
})
