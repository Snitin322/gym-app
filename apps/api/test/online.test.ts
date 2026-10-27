import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { MemberDetail, MembershipPlan, OnlineOrder } from '@onthec/shared'
import { buildApp } from '../src/app'
import { razorpayGateway } from '../src/services/razorpay'
import { bearer, createGym, createUser, noopSender, testDatabaseUrl, testEnv, tokenFor, useTestDatabase } from './helpers'

const NOW = () => new Date('2026-03-20T06:30:00Z') // 20 Mar 2026 in India
const KEY_SECRET = 'test_key_secret_123456'
const WEBHOOK_SECRET = 'test_webhook_secret_abcdef'

const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex')

describe.skipIf(!testDatabaseUrl)('online renewal with Razorpay', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let razorpayFetch: ReturnType<typeof vi.fn>
  let orderCounter = 0
  let owner: string
  let memberToken: string
  let memberId: string
  let plan: MembershipPlan

  async function startWith(gateway: 'razorpay' | 'none') {
    razorpayFetch = vi.fn(async () => {
      orderCounter += 1
      return Response.json({ id: `order_test${orderCounter}`, amount: 450000, currency: 'INR' })
    })
    return buildApp({
      env: testEnv(),
      db: ctx.db,
      otpSender: noopSender,
      now: NOW,
      razorpay:
        gateway === 'none'
          ? null
          : razorpayGateway(
              { keyId: 'rzp_test_key', keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET },
              razorpayFetch as unknown as typeof fetch,
            ),
    })
  }

  beforeEach(async () => {
    const gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    app = await startWith('razorpay')
    plan = (await call('POST', '/plans', owner, { name: '3 months', durationMonths: 3, pricePaise: 450000, maxFreezeDays: 15 })).json()
    const m = (await call('POST', '/members', owner, { name: 'Asha Patel', phone: '9876500001' })).json() as MemberDetail
    memberId = m.id
    memberToken = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: m.userId } }))
  })
  afterEach(async () => {
    await app.close()
  })

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  async function order(token = memberToken) {
    const res = await call('POST', '/me/orders', token, { planId: plan.id })
    expect(res.statusCode).toBe(201)
    return res.json() as OnlineOrder
  }

  function captured(orderId: string, paymentId = 'pay_test1', amount = 450000, event = 'payment.captured') {
    return JSON.stringify({
      entity: 'event',
      event,
      payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: 'INR', status: 'captured' } } },
    })
  }

  const deliver = (body: string, eventId: string, signature = hmac(WEBHOOK_SECRET, body)) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/razorpay',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId },
      payload: body,
    })

  const memberships = () => ctx.db.membership.findMany({ where: { memberId } })

  describe('starting a renewal', () => {
    it('lists active plans and when the renewal would start', async () => {
      const options = (await call('GET', '/me/renewal-options', memberToken)).json()
      expect(options).toMatchObject({ onlinePayments: true, startDate: '2026-03-20' })
      expect(options.plans.map((p: MembershipPlan) => p.name)).toEqual(['3 months'])
    })

    it('creates the Razorpay order for the plan price decided by the server', async () => {
      const o = await order()

      expect(o).toMatchObject({
        keyId: 'rzp_test_key',
        orderId: 'order_test' + orderCounter,
        amountPaise: 450000,
        currency: 'INR',
        gymName: 'Alpha Gym',
        description: '3 months membership',
        prefill: { name: 'Asha Patel', contact: '+919876500001' },
      })
      const [url, init] = razorpayFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://api.razorpay.com/v1/orders')
      expect(new Headers(init.headers).get('authorization')).toBe(
        `Basic ${Buffer.from(`rzp_test_key:${KEY_SECRET}`).toString('base64')}`,
      )
      expect(JSON.parse(init.body as string)).toMatchObject({ amount: 450000, currency: 'INR', receipt: o.paymentId })

      const payment = await ctx.db.payment.findUniqueOrThrow({ where: { id: o.paymentId } })
      expect(payment).toMatchObject({ status: 'created', method: 'razorpay', amountPaise: 450000, planId: plan.id })
    })

    it('refuses staff without a member profile, inactive plans, and gyms without Razorpay', async () => {
      expect((await call('POST', '/me/orders', owner, { planId: plan.id })).json().error.code).toBe('NOT_A_MEMBER')

      await call('PATCH', `/plans/${plan.id}`, owner, { active: false })
      expect((await call('POST', '/me/orders', memberToken, { planId: plan.id })).json().error.code).toBe('PLAN_INACTIVE')

      await app.close()
      app = await startWith('none')
      expect((await call('GET', '/me/renewal-options', memberToken)).json().onlinePayments).toBe(false)
      const res = await call('POST', '/me/orders', memberToken, { planId: plan.id })
      expect(res.statusCode).toBe(503)
      expect(res.json().error.code).toBe('ONLINE_PAYMENTS_DISABLED')
    })

    it('marks the order failed if Razorpay cannot be reached', async () => {
      razorpayFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
      const res = await call('POST', '/me/orders', memberToken, { planId: plan.id })
      expect(res.statusCode).toBe(502)
      expect((await ctx.db.payment.findFirstOrThrow({ where: { memberId } })).status).toBe('failed')
    })
  })

  describe('after Checkout', () => {
    it('a valid signature is accepted but does not mark the payment paid (the webhook does)', async () => {
      const o = await order()
      const res = await call('POST', '/me/orders/verify', memberToken, {
        paymentId: o.paymentId,
        razorpayOrderId: o.orderId,
        razorpayPaymentId: 'pay_test1',
        razorpaySignature: hmac(KEY_SECRET, `${o.orderId}|pay_test1`),
      })

      expect(res.json()).toEqual({ paymentId: o.paymentId, status: 'created', invoice: null })
      expect(await memberships()).toHaveLength(0)
    })

    it('rejects forged signatures and other people’s payments', async () => {
      const o = await order()
      const forged = await call('POST', '/me/orders/verify', memberToken, {
        paymentId: o.paymentId,
        razorpayOrderId: o.orderId,
        razorpayPaymentId: 'pay_test1',
        razorpaySignature: hmac('wrong-secret', `${o.orderId}|pay_test1`),
      })
      expect(forged.json().error.code).toBe('INVALID_SIGNATURE')

      const other = (await call('POST', '/members', owner, { name: 'Ravi', phone: '9876500002' })).json() as MemberDetail
      const otherToken = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: other.userId } }))
      expect((await call('GET', `/me/payments/${o.paymentId}`, otherToken)).statusCode).toBe(404)
    })
  })

  describe('webhook (source of truth)', () => {
    it('confirms the payment, creates the membership and issues the invoice', async () => {
      const o = await order()

      const res = await deliver(captured(o.orderId), 'evt_1')

      expect(res.json()).toEqual({ ok: true, outcome: 'processed' })
      const [m] = await memberships()
      expect(m).toMatchObject({ planName: '3 months', pricePaise: 450000 })
      const status = (await call('GET', `/me/payments/${o.paymentId}`, memberToken)).json()
      expect(status).toMatchObject({ status: 'paid', invoice: { number: 'INV/25-26/0001' } })
      expect((await call('GET', '/me/membership', memberToken)).json().current).toMatchObject({
        startDate: '2026-03-20',
        endDate: '2026-06-19',
        paidPaise: 450000,
        duePaise: 0,
      })
    })

    it('handles repeats and both event types without fulfilling twice', async () => {
      const o = await order()
      const body = captured(o.orderId)

      expect((await deliver(body, 'evt_1')).json().outcome).toBe('processed')
      expect((await deliver(body, 'evt_1')).json().outcome).toBe('duplicate') // same event again
      expect((await deliver(captured(o.orderId, 'pay_test1', 450000, 'order.paid'), 'evt_2')).json().outcome).toBe(
        'duplicate',
      )

      expect(await memberships()).toHaveLength(1)
      expect(await ctx.db.invoice.count()).toBe(1)
    })

    it('fulfils once even when two deliveries arrive at the same moment', async () => {
      const o = await order()
      const body = captured(o.orderId)
      const results = await Promise.all([deliver(body, 'evt_a'), deliver(body, 'evt_b')])
      // A delivery that lost the race gets a non-2xx; Razorpay retries it, which is then a no-op.
      for (const [i, res] of results.entries()) if (res.statusCode !== 200) await deliver(body, `evt_retry_${i}`)

      expect(await memberships()).toHaveLength(1)
      expect(await ctx.db.invoice.count()).toBe(1)
    })

    it('ignores bad signatures, wrong amounts and unknown orders', async () => {
      const o = await order()

      const bad = await deliver(captured(o.orderId), 'evt_1', hmac('not-the-secret', captured(o.orderId)))
      expect(bad.statusCode).toBe(400)

      expect((await deliver(captured(o.orderId, 'pay_test1', 100), 'evt_2')).json().outcome).toBe('ignored')
      expect((await deliver(captured('order_unknown'), 'evt_3')).json().outcome).toBe('ignored')

      expect(await memberships()).toHaveLength(0)
      expect((await ctx.db.payment.findUniqueOrThrow({ where: { id: o.paymentId } })).status).toBe('created')
    })

    it('a failed attempt can be followed by a successful one on the same order', async () => {
      const o = await order()
      const failed = JSON.stringify({
        event: 'payment.failed',
        payload: { payment: { entity: { id: 'pay_fail', order_id: o.orderId, amount: 450000, currency: 'INR' } } },
      })
      await deliver(failed, 'evt_1')
      expect((await ctx.db.payment.findUniqueOrThrow({ where: { id: o.paymentId } })).status).toBe('failed')

      expect((await deliver(captured(o.orderId, 'pay_ok'), 'evt_2')).json().outcome).toBe('processed')
      expect((await ctx.db.payment.findUniqueOrThrow({ where: { id: o.paymentId } })).status).toBe('paid')
    })

    it('a renewal paid before the current membership ends starts the day after it', async () => {
      await call('POST', `/members/${memberId}/memberships`, owner, { planId: plan.id, payment: { method: 'cash' } }) // → 19 Jun
      const o = await order()
      await deliver(captured(o.orderId), 'evt_1')

      const ends = (await memberships()).map((m) => m.startDate.toISOString().slice(0, 10)).sort()
      expect(ends).toEqual(['2026-03-20', '2026-06-20'])
    })

    it('honours a paid order even if the plan was deactivated meanwhile', async () => {
      const o = await order()
      await call('PATCH', `/plans/${plan.id}`, owner, { active: false })
      expect((await deliver(captured(o.orderId), 'evt_1')).json().outcome).toBe('processed')
      expect(await memberships()).toHaveLength(1)
    })
  })
})
