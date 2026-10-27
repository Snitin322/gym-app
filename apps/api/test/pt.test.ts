import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { MemberDetail, PtPackage, PtPurchaseView } from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

const MARCH_20 = () => new Date('2026-03-20T06:30:00Z') // 20 Mar 2026 in India

describe.skipIf(!testDatabaseUrl)('PT packages, sales and the session ledger', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let owner: string
  let admin: string
  let ownerB: string
  let trainerToken: string
  let trainerId: string
  let adminId: string
  let trainerBId: string
  let pkg: PtPackage
  let member: MemberDetail

  beforeEach(async () => {
    const gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    const adminUser = await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Admin A' })
    admin = await tokenFor(adminUser)
    adminId = adminUser.id
    const trainer = await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi Trainer' })
    trainerToken = await tokenFor(trainer)
    trainerId = trainer.id
    ownerB = await tokenFor(await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }))
    trainerBId = (await createUser(ctx.db, gymB, { phone: '+919822222203', role: 'trainer', name: 'Trainer B' })).id
    ;({ app } = await startApp(ctx.db, {}, undefined, MARCH_20))

    pkg = (
      await call('POST', '/pt-packages', owner, { name: '12 Sessions', sessionCount: 12, validityDays: 60, pricePaise: 1200000 })
    ).json()
    member = (await call('POST', '/members', admin, { name: 'Asha Patel', phone: '9876500001' })).json()
  })
  afterEach(async () => {
    await app.close()
  })

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  async function sell(sale: object = { payment: { method: 'cash' } }, token = admin) {
    const res = await call('POST', `/members/${member.id}/pt-purchases`, token, { packageId: pkg.id, trainerId, ...sale })
    expect(res.statusCode).toBe(201)
    return res.json() as PtPurchaseView
  }

  const memberToken = async () => tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: member.userId } }))

  describe('packages', () => {
    it('owners and admins manage packages; names are unique per gym', async () => {
      expect(pkg).toMatchObject({ name: '12 Sessions', sessionCount: 12, validityDays: 60, pricePaise: 1200000, active: true })
      const dup = await call('POST', '/pt-packages', admin, { name: '12 Sessions', sessionCount: 10, validityDays: 30, pricePaise: 100000 })
      expect(dup.json().error.code).toBe('PLAN_NAME_TAKEN')
      expect((await call('GET', '/pt-packages', trainerToken)).statusCode).toBe(403)
      expect((await call('GET', '/pt-packages', await memberToken())).statusCode).toBe(403)
    })
  })

  describe('selling', () => {
    it('writes +12 to the ledger, sets the use-by date and takes the payment with an invoice', async () => {
      const p = await sell()

      expect(p).toMatchObject({
        packageName: '12 Sessions',
        sessionCount: 12,
        sessionsLeft: 12,
        startDate: '2026-03-20',
        expiresOn: '2026-05-18', // 60 days including 20 Mar
        status: 'active',
        trainer: { id: trainerId, name: 'Ravi Trainer' },
        paidPaise: 1200000,
        duePaise: 0,
      })
      expect(p.ledger).toEqual([expect.objectContaining({ change: 12, reason: 'purchase', createdByName: 'Admin A' })])

      const invoice = await ctx.db.invoice.findFirstOrThrow()
      expect(invoice.description).toBe(
        '12 Sessions: 12 personal training sessions with Ravi Trainer, valid till 18 May 2026',
      )
      const detail = (await call('GET', `/members/${member.id}`, admin)).json() as MemberDetail
      expect(detail.ptPurchases).toHaveLength(1)
      expect(detail.payments[0]).toMatchObject({ description: '12 Sessions (PT)', ptPurchaseId: p.id, membershipId: null })
    })

    it('pay later shows as due (also in the Dues filter) until paid, part payments allowed', async () => {
      const p = await sell({})
      expect(p.duePaise).toBe(1200000)

      const dues = (await call('GET', '/members?filter=dues', admin)).json() as MemberDetail[]
      expect(dues.map((d) => [d.name, d.duePaise])).toEqual([['Asha Patel', 1200000]])

      const part = await call('POST', `/pt-purchases/${p.id}/payments`, admin, { amountPaise: 500000, method: 'upi' })
      expect(part.json()).toMatchObject({ paidPaise: 500000, duePaise: 700000 })
      const over = await call('POST', `/pt-purchases/${p.id}/payments`, admin, { amountPaise: 800000, method: 'cash' })
      expect(over.json().error).toEqual({ code: 'OVERPAYMENT', message: 'Only ₹7,000 is due.' })
      expect((await ctx.db.invoice.findFirstOrThrow()).description).toMatch(/\(part payment\)$/)
    })

    it('discounts need a reason and never exceed the package price', async () => {
      const noReason = await call('POST', `/members/${member.id}/pt-purchases`, admin, { packageId: pkg.id, trainerId, pricePaise: 1000000 })
      expect(noReason.json().error.code).toBe('DISCOUNT_REASON_REQUIRED')
      const above = await call('POST', `/members/${member.id}/pt-purchases`, admin, { packageId: pkg.id, trainerId, pricePaise: 1300000 })
      expect(above.json().error.code).toBe('PRICE_ABOVE_PLAN')

      const p = await sell({ pricePaise: 1000000, discountReason: 'Loyal member', payment: { method: 'card' } })
      expect(p).toMatchObject({ pricePaise: 1000000, listPricePaise: 1200000, discountReason: 'Loyal member', duePaise: 0 })
    })

    it('the trainer must be one of this gym’s trainers', async () => {
      for (const id of [adminId, trainerBId]) {
        const res = await call('POST', `/members/${member.id}/pt-purchases`, admin, { packageId: pkg.id, trainerId: id })
        expect(res.statusCode).toBe(400)
        expect(res.json().error.code).toBe('NOT_A_TRAINER')
      }
      expect(await ctx.db.ptPurchase.count()).toBe(0)
    })
  })

  describe('the ledger', () => {
    it('adjustments add a ledger line with a reason; the balance never goes below zero', async () => {
      const p = await sell()

      const minus = await call('POST', `/pt-purchases/${p.id}/adjust`, admin, { change: -3, note: 'Sessions taken before the app' })
      expect(minus.json()).toMatchObject({ sessionsLeft: 9 })
      expect(minus.json().ledger.at(-1)).toMatchObject({ change: -3, reason: 'adjustment', note: 'Sessions taken before the app', createdByName: 'Admin A' })

      const tooMany = await call('POST', `/pt-purchases/${p.id}/adjust`, admin, { change: -10, note: 'Oops' })
      expect(tooMany.json().error).toEqual({ code: 'PT_BALANCE_NEGATIVE', message: "Only 9 sessions left; you can't remove 10." })

      // The balance is always the sum of the ledger.
      const sum = await ctx.db.ptSessionLedger.aggregate({ where: { purchaseId: p.id }, _sum: { change: true } })
      expect(sum._sum.change).toBe(9)
      expect((await call('POST', `/pt-purchases/${p.id}/adjust`, admin, { change: 0, note: 'Nothing' })).statusCode).toBe(400)
    })

    it('expires after the use-by date; admins can only move that date later', async () => {
      const p = await sell()
      expect((await call('POST', `/pt-purchases/${p.id}/extend`, admin, { expiresOn: '2026-05-01' })).json().error.code).toBe(
        'PT_EXPIRY_EARLIER',
      )
      expect((await call('POST', `/pt-purchases/${p.id}/extend`, admin, { expiresOn: '2026-06-30' })).json()).toMatchObject({
        expiresOn: '2026-06-30',
        status: 'active',
      })

      await app.close()
      ;({ app } = await startApp(ctx.db, {}, undefined, () => new Date('2026-07-01T06:30:00Z')))
      expect((await call('GET', `/pt-purchases/${p.id}`, admin)).json()).toMatchObject({ status: 'expired', sessionsLeft: 12 })
    })
  })

  describe('what members and trainers see', () => {
    it('members see their own packages; trainers see their clients', async () => {
      await sell()
      const mine = (await call('GET', '/me/pt', await memberToken())).json() as PtPurchaseView[]
      expect(mine.map((p) => [p.packageName, p.sessionsLeft, p.trainer.name])).toEqual([['12 Sessions', 12, 'Ravi Trainer']])

      const clients = (await call('GET', '/trainer/clients', trainerToken)).json()
      expect(clients).toEqual([
        expect.objectContaining({ name: 'Asha Patel', phone: '+919876500001', purchases: [expect.objectContaining({ sessionsLeft: 12 })] }),
      ])

      // Not a trainer: no client list. Members can't use the desk endpoints.
      expect((await call('GET', '/trainer/clients', admin)).statusCode).toBe(403)
      expect((await call('POST', `/members/${member.id}/pt-purchases`, await memberToken(), { packageId: pkg.id, trainerId })).statusCode).toBe(403)
    })
  })

  describe('gym isolation', () => {
    it('gym B cannot see or change gym A packages, purchases or members', async () => {
      const p = await sell({})

      const attempts = await Promise.all([
        call('GET', `/pt-purchases/${p.id}`, ownerB),
        call('POST', `/pt-purchases/${p.id}/payments`, ownerB, { amountPaise: 100, method: 'cash' }),
        call('POST', `/pt-purchases/${p.id}/adjust`, ownerB, { change: 5, note: 'Free sessions' }),
        call('POST', `/pt-purchases/${p.id}/extend`, ownerB, { expiresOn: '2027-01-01' }),
        call('PATCH', `/pt-packages/${pkg.id}`, ownerB, { pricePaise: 100 }),
        call('POST', `/members/${member.id}/pt-purchases`, ownerB, { packageId: pkg.id, trainerId: trainerBId }),
      ])
      expect(attempts.map((r) => r.statusCode)).toEqual([404, 404, 404, 404, 404, 404])
      expect((await call('GET', '/pt-packages', ownerB)).json()).toEqual([])

      const after = (await call('GET', `/pt-purchases/${p.id}`, admin)).json()
      expect(after).toMatchObject({ sessionsLeft: 12, paidPaise: 0, expiresOn: '2026-05-18' })
    })
  })
})
