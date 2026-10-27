import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { MemberDetail, MembershipPlan, MembershipView } from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

const NOW = new Date('2026-03-20T06:30:00Z') // 20 Mar 2026 in India

describe.skipIf(!testDatabaseUrl)('payments, dues and gym details', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let gymA: string
  let owner: string
  let admin: string
  let ownerB: string
  let plan: MembershipPlan // 3 months, ₹4,500

  beforeEach(async () => {
    gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Admin A' }))
    ownerB = await tokenFor(await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }))
    ;({ app } = await startApp(ctx.db, {}, undefined, () => NOW))
    plan = (
      await call('POST', '/plans', owner, { name: '3 months', durationMonths: 3, pricePaise: 450000, maxFreezeDays: 15 })
    ).json()
  })
  afterEach(async () => {
    await app.close()
  })

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  async function sell(sale: object, phone = '9876500001') {
    const res = await call('POST', '/members', admin, { name: 'Asha', phone, firstMembership: { planId: plan.id, ...sale } })
    expect(res.statusCode).toBe(201)
    return res.json() as MemberDetail
  }

  describe('selling a membership', () => {
    it('records a desk payment for the full price', async () => {
      const m = await sell({ payment: { method: 'upi', reference: 'UPI-123' } })

      expect(m.current).toMatchObject({ pricePaise: 450000, listPricePaise: 450000, paidPaise: 450000, duePaise: 0 })
      expect(m.duePaise).toBe(0)
      expect(m.payments).toEqual([
        expect.objectContaining({
          amountPaise: 450000,
          method: 'upi',
          status: 'paid',
          reference: 'UPI-123',
          description: '3 months',
          recordedByName: 'Admin A',
        }),
      ])
    })

    it('"pay later" leaves the full price due and shows under the Dues filter', async () => {
      const m = await sell({})
      await sell({ payment: { method: 'cash' } }, '9876500002')

      expect(m.current).toMatchObject({ paidPaise: 0, duePaise: 450000 })
      expect(m.duePaise).toBe(450000)
      expect(m.payments).toEqual([])

      const dues = (await call('GET', '/members?filter=dues', admin)).json() as MemberDetail[]
      expect(dues.map((d) => [d.id, d.duePaise])).toEqual([[m.id, 450000]])
    })

    it('allows a discount with a reason, never above the plan price', async () => {
      const noReason = await call('POST', '/members', admin, {
        name: 'Asha',
        phone: '9876500001',
        firstMembership: { planId: plan.id, pricePaise: 400000 },
      })
      expect(noReason.json().error.code).toBe('DISCOUNT_REASON_REQUIRED')

      const above = await call('POST', '/members', admin, {
        name: 'Asha',
        phone: '9876500001',
        firstMembership: { planId: plan.id, pricePaise: 500000 },
      })
      expect(above.json().error).toEqual({
        code: 'PRICE_ABOVE_PLAN',
        message: "The price can't be more than the plan price (₹4,500).",
      })

      const m = await sell({ pricePaise: 400000, discountReason: 'Diwali offer', payment: { method: 'cash' } })
      expect(m.current).toMatchObject({
        pricePaise: 400000,
        listPricePaise: 450000,
        discountReason: 'Diwali offer',
        paidPaise: 400000,
        duePaise: 0,
      })
    })

    it('a free membership needs a reason and creates no payment', async () => {
      const m = await sell({ pricePaise: 0, discountReason: 'Staff family', payment: { method: 'cash' } })
      expect(m.current).toMatchObject({ pricePaise: 0, duePaise: 0 })
      expect(m.payments).toEqual([])
    })
  })

  describe('recording payments later', () => {
    it('accepts part payments until nothing is due, and refuses overpaying', async () => {
      const m = await sell({})
      const id = (m.current as MembershipView).id
      const pay = (amountPaise: number) =>
        call('POST', `/memberships/${id}/payments`, admin, { amountPaise, method: 'cash', note: 'Part payment' })

      expect((await pay(200000)).json()).toMatchObject({ paidPaise: 200000, duePaise: 250000 })

      const over = await pay(300000)
      expect(over.statusCode).toBe(400)
      expect(over.json().error).toEqual({ code: 'OVERPAYMENT', message: 'Only ₹2,500 is due.' })

      expect((await pay(250000)).json()).toMatchObject({ paidPaise: 450000, duePaise: 0 })
      expect((await pay(100)).json().error.code).toBe('NOTHING_DUE')

      const detail = (await call('GET', `/members/${m.id}`, owner)).json() as MemberDetail
      expect(detail.payments.map((p) => p.amountPaise).sort()).toEqual([200000, 250000])
    })

    it('nothing is due on cancelled memberships or ones paid before the app', async () => {
      const m = await sell({})
      const id = (m.current as MembershipView).id
      const cancelled = await call('POST', `/memberships/${id}/cancel`, admin, { reason: 'Changed mind' })
      expect(cancelled.json().duePaise).toBe(0)
      expect((await call('POST', `/memberships/${id}/payments`, admin, { amountPaise: 100, method: 'cash' })).json().error.code).toBe(
        'NOTHING_DUE',
      )

      // Memberships from before payments existed are marked paid outside the app by the migration.
      const legacy = await sell({}, '9876500002')
      await ctx.db.membership.update({ where: { id: legacy.current?.id }, data: { paidOutsideApp: true } })
      const after = (await call('GET', `/members/${legacy.id}`, owner)).json() as MemberDetail
      expect(after.duePaise).toBe(0)
    })

    it('members see their own dues and payments', async () => {
      const m = await sell({ payment: { method: 'card' } })
      const user = await ctx.db.user.findUniqueOrThrow({ where: { id: m.userId } })

      const mine = (await call('GET', '/me/membership', await tokenFor(user))).json()

      expect(mine.duePaise).toBe(0)
      expect(mine.payments).toEqual([expect.objectContaining({ amountPaise: 450000, method: 'card' })])
    })
  })

  describe('gym details', () => {
    it('start with defaults; the owner edits them and the state follows the GSTIN', async () => {
      expect((await call('GET', '/gym', admin)).json()).toMatchObject({
        name: 'Alpha Gym',
        gstin: null,
        sacCode: '999723',
        invoicePrefix: 'INV',
      })

      const res = await call('PATCH', '/gym', owner, {
        legalName: 'Onthec Fitness LLP',
        address: '12 MG Road',
        city: 'Pune',
        pincode: '411001',
        gstin: '27aapfu0939f1zv',
        invoicePrefix: 'og',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ gstin: '27AAPFU0939F1ZV', stateCode: '27', invoicePrefix: 'OG' })
    })

    it('refuses invalid GSTINs, a state mismatch, and edits by admins', async () => {
      expect((await call('PATCH', '/gym', owner, { gstin: '27AAPFU0939F1ZW' })).statusCode).toBe(400)

      await call('PATCH', '/gym', owner, { stateCode: '29' })
      const mismatch = await call('PATCH', '/gym', owner, { gstin: '27AAPFU0939F1ZV' })
      expect(mismatch.json().error.message).toMatch(/different state/)

      expect((await call('PATCH', '/gym', admin, { legalName: 'X' })).statusCode).toBe(403)
    })
  })

  describe('gym isolation', () => {
    it('gym B cannot take payments on gym A memberships or see gym A details', async () => {
      const m = await sell({})
      const id = (m.current as MembershipView).id

      const attempt = await call('POST', `/memberships/${id}/payments`, ownerB, { amountPaise: 450000, method: 'cash' })
      expect(attempt.statusCode).toBe(404)
      expect(await ctx.db.payment.count()).toBe(0)

      expect((await call('GET', '/members?filter=dues', ownerB)).json()).toEqual([])
      expect((await call('GET', '/gym', ownerB)).json().name).toBe('Beta Gym')
      await call('PATCH', '/gym', ownerB, { legalName: 'Beta Legal' })
      expect((await call('GET', '/gym', owner)).json()).toMatchObject({ id: gymA, legalName: null })
    })
  })
})
