// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { todayInIndia, type MyMembership } from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { confirmation } from '../lib/razorpay'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

const today = todayInIndia()
const plan = { id: 'plan-1', name: 'Gold', durationMonths: 3, pricePaise: 450000, maxFreezeDays: 15, description: null, active: true }
const order = {
  paymentId: 'pay-1',
  orderId: 'order_abc',
  keyId: 'rzp_test_key',
  amountPaise: 450000,
  currency: 'INR',
  gymName: 'Onthec Gym',
  description: 'Gold membership',
  prefill: { name: 'Asha Patel', contact: '+919876500001' },
}
const noMembership: MyMembership = { current: null, history: [], duePaise: 0, payments: [] }

/** A stand-in for Razorpay Checkout that records its options and lets the test finish or close it. */
function fakeCheckout(behaviour: 'pay' | 'close') {
  const opened: Record<string, unknown>[] = []
  class FakeRazorpay {
    constructor(private options: Record<string, unknown>) {
      opened.push(options)
    }
    on() {}
    open() {
      const handler = this.options.handler as (r: object) => void
      const modal = this.options.modal as { ondismiss: () => void }
      if (behaviour === 'pay') {
        handler({ razorpay_payment_id: 'pay_rzp1', razorpay_order_id: 'order_abc', razorpay_signature: 'sig' })
      } else {
        modal.ondismiss()
      }
    }
  }
  vi.stubGlobal('Razorpay', FakeRazorpay)
  window.Razorpay = FakeRazorpay as unknown as typeof window.Razorpay
  return opened
}

function renderHome() {
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
  confirmation.intervalMs = 10
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete window.Razorpay
})

const member = ok(session(sessionUser({ role: 'member', name: 'Asha Patel' })))

describe('renew online', () => {
  it('pays with Razorpay, then shows success once the webhook has confirmed it', async () => {
    const opened = fakeCheckout('pay')
    const { callsTo } = mockApi({
      'POST /auth/refresh': member,
      'GET /me/membership': ok(noMembership),
      'GET /me/renewal-options': ok({ onlinePayments: true, startDate: today, plans: [plan] }),
      'POST /me/orders': { status: 201, body: order },
      'POST /me/orders/verify': ok({ paymentId: 'pay-1', status: 'created', invoice: null }),
      // First check: not yet confirmed; second: the webhook has arrived.
      'GET /me/payments/pay-1': (_body, n) =>
        ok({ paymentId: 'pay-1', status: n === 1 ? 'created' : 'paid', invoice: n === 1 ? null : { id: 'inv-1', number: 'OG/26-27/0007' } }),
    })
    const user = userEvent.setup()
    renderHome()

    await user.click(await screen.findByRole('button', { name: 'Renew online' }))
    expect(screen.getByRole('radio', { name: /Gold/ }).getAttribute('aria-checked')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Pay ₹4,500' }))

    expect(await screen.findByRole('heading', { name: 'Payment successful' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download invoice OG/26-27/0007' })).toBeTruthy()

    // Only the plan is sent; the amount comes from the server's order.
    expect(callsTo('POST /me/orders')[0]?.body).toEqual({ planId: 'plan-1' })
    expect(opened[0]).toMatchObject({ key: 'rzp_test_key', order_id: 'order_abc', amount: 450000, currency: 'INR' })
    expect(callsTo('POST /me/orders/verify')[0]?.body).toEqual({
      paymentId: 'pay-1',
      razorpayOrderId: 'order_abc',
      razorpayPaymentId: 'pay_rzp1',
      razorpaySignature: 'sig',
    })
  })

  it('closing Checkout just returns to the plan choice', async () => {
    fakeCheckout('close')
    const { callsTo } = mockApi({
      'POST /auth/refresh': member,
      'GET /me/membership': ok(noMembership),
      'GET /me/renewal-options': ok({ onlinePayments: true, startDate: today, plans: [plan] }),
      'POST /me/orders': { status: 201, body: order },
    })
    const user = userEvent.setup()
    renderHome()

    await user.click(await screen.findByRole('button', { name: 'Renew online' }))
    await user.click(screen.getByRole('button', { name: 'Pay ₹4,500' }))

    expect(await screen.findByRole('button', { name: 'Pay ₹4,500' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(callsTo('POST /me/orders/verify')).toHaveLength(0)
  })

  it('says the payment was received if confirmation takes longer', async () => {
    fakeCheckout('pay')
    confirmation.attempts = 2
    mockApi({
      'POST /auth/refresh': member,
      'GET /me/membership': ok(noMembership),
      'GET /me/renewal-options': ok({ onlinePayments: true, startDate: today, plans: [plan] }),
      'POST /me/orders': { status: 201, body: order },
      'POST /me/orders/verify': ok({ paymentId: 'pay-1', status: 'created', invoice: null }),
      'GET /me/payments/pay-1': ok({ paymentId: 'pay-1', status: 'created', invoice: null }),
    })
    const user = userEvent.setup()
    renderHome()

    await user.click(await screen.findByRole('button', { name: 'Renew online' }))
    await user.click(screen.getByRole('button', { name: 'Pay ₹4,500' }))

    expect(await screen.findByRole('heading', { name: 'Payment received' })).toBeTruthy()
    expect(screen.getByText(/no need to pay again/)).toBeTruthy()
    confirmation.attempts = 30
  })

  it('is hidden when the gym has not set up online payments', async () => {
    mockApi({
      'POST /auth/refresh': member,
      'GET /me/membership': ok(noMembership),
      'GET /me/renewal-options': ok({ onlinePayments: false, startDate: today, plans: [plan] }),
    })
    renderHome()

    expect(await screen.findByText(/Start a plan at the front desk/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Renew online' })).toBeNull()
  })
})
