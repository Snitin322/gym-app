import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { MemberDetail, MembershipPlan, MembershipView } from '@onthec/shared'
import { invoiceLines } from '../src/services/invoice-pdf'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

// 20 Mar 2026 in India → financial year 2025-26.
const MARCH_20 = () => new Date('2026-03-20T06:30:00Z')

describe.skipIf(!testDatabaseUrl)('invoices', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let gymA: string
  let gymB: string
  let owner: string
  let ownerB: string
  let trainer: string
  let plan: MembershipPlan

  beforeEach(async () => {
    gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    gymB = (await createGym(ctx.db, 'Beta Gym')).id
    owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    trainer = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Trainer A' }))
    ownerB = await tokenFor(await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }))
    ;({ app } = await startApp(ctx.db, {}, undefined, MARCH_20))
    plan = await createPlan(app, owner)
  })
  afterEach(async () => {
    await app.close()
  })

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: object, on = app) =>
    on.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  async function createPlan(on: FastifyInstance, token: string) {
    const res = await on.inject({
      method: 'POST',
      url: '/api/v1/plans',
      headers: bearer(token),
      payload: { name: '3 months', durationMonths: 3, pricePaise: 450000, maxFreezeDays: 15 },
    })
    return res.json() as MembershipPlan
  }

  async function sell(phone: string, sale: object = { payment: { method: 'cash' } }, on = app, token = owner, planId = plan.id) {
    const res = await call('POST', '/members', token, { name: `Member ${phone.slice(-2)}`, phone, firstMembership: { planId, ...sale } }, on)
    expect(res.statusCode).toBe(201)
    return res.json() as MemberDetail
  }

  const invoiceOf = (id: string | undefined) => ctx.db.invoice.findUniqueOrThrow({ where: { id } })

  it('issues a receipt (no GST) while the gym has no GSTIN', async () => {
    const m = await sell('9876500001')
    const ref = m.payments[0]?.invoice

    expect(ref?.number).toBe('INV/25-26/0001')
    const invoice = await invoiceOf(ref?.id)
    expect(invoice).toMatchObject({
      kind: 'receipt',
      totalPaise: 450000,
      taxablePaise: 450000,
      cgstPaise: 0,
      sgstPaise: 0,
      gstRatePercent: 0,
      sacCode: null,
      financialYear: '2025-26',
    })
  })

  it('issues a GST tax invoice with the exact split once the GSTIN is set', async () => {
    await call('PATCH', '/gym', owner, {
      legalName: 'Onthec Fitness LLP',
      address: '12 MG Road',
      city: 'Pune',
      pincode: '411001',
      gstin: '27AAPFU0939F1ZV',
      invoicePrefix: 'OG',
    })

    const m = await sell('9876500001')
    const invoice = await invoiceOf(m.payments[0]?.invoice?.id)

    expect(invoice).toMatchObject({
      number: 'OG/25-26/0001',
      kind: 'tax_invoice',
      totalPaise: 450000,
      taxablePaise: 381356,
      cgstPaise: 34322,
      sgstPaise: 34322,
      gstRatePercent: 18,
      sacCode: '999723',
      description: '3 months membership, 20 Mar 2026 – 19 Jun 2026',
      buyer: { name: 'Member 01', phone: '+919876500001' },
    })
    expect(invoice.seller).toMatchObject({
      name: 'Onthec Fitness LLP',
      tradeName: 'Alpha Gym',
      gstin: '27AAPFU0939F1ZV',
      stateName: 'Maharashtra',
    })

    const lines = invoiceLines(invoice)
    expect(lines.title).toBe('TAX INVOICE')
    expect(lines.totals).toEqual([
      ['Taxable value', 'Rs. 3,813.56'],
      ['CGST @ 9%', 'Rs. 343.22'],
      ['SGST @ 9%', 'Rs. 343.22'],
      ['Total (incl. GST)', 'Rs. 4,500.00'],
    ])
    expect(lines.meta).toContainEqual(['Place of supply', 'Maharashtra (27)'])
    expect(lines.inWords).toBe('Rupees Four Thousand Five Hundred Only')
  })

  it('numbers invoices without gaps, per gym, with one invoice per part payment', async () => {
    const m = await sell('9876500001', {}) // pay later: no invoice yet
    expect(m.payments).toEqual([])
    const id = (m.current as MembershipView).id
    await call('POST', `/memberships/${id}/payments`, owner, { amountPaise: 200000, method: 'upi' })
    await call('POST', `/memberships/${id}/payments`, owner, { amountPaise: 250000, method: 'cash' })
    await sell('9876500002')

    const numbers = (await ctx.db.invoice.findMany({ where: { gymId: gymA }, orderBy: { sequence: 'asc' } })).map(
      (i) => [i.number, i.description.endsWith('(part payment)')],
    )
    expect(numbers).toEqual([
      ['INV/25-26/0001', true], // ₹2,000 of ₹4,500
      ['INV/25-26/0002', true], // ₹2,500 of ₹4,500 (the rest)
      ['INV/25-26/0003', false], // full price in one go
    ])

    // Gym B has its own sequence.
    const planB = await createPlan(app, ownerB)
    const b = await sell('9876500009', { payment: { method: 'cash' } }, app, ownerB, planB.id)
    expect(b.payments[0]?.invoice?.number).toBe('INV/25-26/0001')
  })

  it('stays gap-free when sales happen at the same moment', async () => {
    const attempts = await Promise.all(
      ['01', '02', '03', '04'].map((n) =>
        call('POST', '/members', owner, {
          name: `Member ${n}`,
          phone: `98765000${n}`,
          firstMembership: { planId: plan.id, payment: { method: 'cash' } },
        }),
      ),
    )
    // Concurrent sales may be told to retry (409); a retried sale never leaves a hole.
    for (const [index, res] of attempts.entries()) {
      if (res.statusCode === 409) await sell(`98765000${['01', '02', '03', '04'][index]}`)
      else expect(res.statusCode).toBe(201)
    }

    const sequences = (await ctx.db.invoice.findMany({ where: { gymId: gymA } })).map((i) => i.sequence).sort()
    expect(sequences).toEqual([1, 2, 3, 4])
  })

  it('starts a new sequence on 1 April (Indian financial year)', async () => {
    await app.close()
    ;({ app } = await startApp(ctx.db, {}, undefined, () => new Date('2026-03-31T18:00:00Z'))) // 31 Mar, 23:30 IST
    expect((await sell('9876500001')).payments[0]?.invoice?.number).toBe('INV/25-26/0001')

    await app.close()
    ;({ app } = await startApp(ctx.db, {}, undefined, () => new Date('2026-03-31T18:30:00Z'))) // 1 Apr, 00:00 IST
    expect((await sell('9876500002')).payments[0]?.invoice?.number).toBe('INV/26-27/0001')
  })

  it('never changes once issued, even if the gym details change', async () => {
    await call('PATCH', '/gym', owner, { legalName: 'First Name LLP' })
    const m = await sell('9876500001')
    await call('PATCH', '/gym', owner, { legalName: 'Renamed LLP', address: 'New address' })

    const invoice = await invoiceOf(m.payments[0]?.invoice?.id)
    expect(invoice.seller).toMatchObject({ name: 'First Name LLP', address: null })
  })

  describe('PDF download', () => {
    it('owners download any invoice of their gym; members only their own', async () => {
      const a = await sell('9876500001')
      const b = await sell('9876500002')
      const invoiceId = a.payments[0]?.invoice?.id as string
      const pdf = (token: string) => call('GET', `/invoices/${invoiceId}/pdf`, token)

      const res = await pdf(owner)
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('application/pdf')
      expect(res.headers['content-disposition']).toBe('attachment; filename="INV-25-26-0001.pdf"')
      expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
      expect(res.rawPayload.length).toBeGreaterThan(1500)

      const memberA = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: a.userId } }))
      const memberB = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: b.userId } }))
      expect((await pdf(memberA)).statusCode).toBe(200)
      expect((await pdf(memberB)).statusCode).toBe(404)
      expect((await pdf(trainer)).statusCode).toBe(404)
      expect((await pdf(ownerB)).statusCode).toBe(404)
    })
  })

  describe('payments from before invoices existed', () => {
    it('can be given an invoice once, by owners and admins', async () => {
      const m = await sell('9876500001', {})
      const payment = await ctx.db.payment.create({
        data: {
          gymId: gymA,
          memberId: m.id,
          membershipId: m.current?.id,
          amountPaise: 450000,
          method: 'cash',
          status: 'paid',
          paidAt: new Date(),
        },
      })

      const first = await call('POST', `/payments/${payment.id}/invoice`, owner)
      const again = await call('POST', `/payments/${payment.id}/invoice`, owner)

      expect(first.statusCode).toBe(201)
      expect(first.json().number).toBe('INV/25-26/0001')
      expect(again.json()).toEqual(first.json())
      expect((await call('POST', `/payments/${payment.id}/invoice`, ownerB)).statusCode).toBe(404)
      expect((await call('POST', `/payments/${payment.id}/invoice`, trainer)).statusCode).toBe(403)
    })
  })
})
