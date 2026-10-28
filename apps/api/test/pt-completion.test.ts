import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { indiaDateTime, type MemberDetail, type PtPurchaseView, type PtSessionView } from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

/** "2026-03-21 06:00" (India) → Date. */
function at(dateTime: string) {
  const [date, time] = dateTime.split(' ') as [string, string]
  const [h, m] = time.split(':').map(Number) as [number, number]
  return indiaDateTime(date, h * 60 + m)
}

/** Ravi works Saturdays 6–9 am and Mondays 6–8 pm, 60-minute sessions. */
const RAVI_HOURS = {
  sessionMinutes: 60,
  windows: [
    { weekday: 6, startMinute: 6 * 60, endMinute: 9 * 60 },
    { weekday: 1, startMinute: 18 * 60, endMinute: 20 * 60 },
  ],
}

describe.skipIf(!testDatabaseUrl)('Completing PT sessions and disputes', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let clock: Date
  const t = {} as Record<'owner' | 'admin' | 'ravi' | 'sita' | 'asha' | 'bina' | 'ownerB', string>
  let asha: MemberDetail
  let ashaPt: PtPurchaseView
  /** Asha's sessions: Sat 21 Mar 6, 7 and 8 am, and Mon 23 Mar 6 pm. */
  let s6: PtSessionView, s7: PtSessionView, s8: PtSessionView, mon: PtSessionView

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  const post = (url: string, token: string, payload: object = {}) => call('POST', url, token, payload)
  const mark = (s: PtSessionView, token = t.ravi, outcome = 'completed', note?: string) =>
    post(`/pt-sessions/${s.id}/mark`, token, { outcome, note })
  const purchase = async () => (await call('GET', `/pt-purchases/${ashaPt.id}`, t.admin)).json() as PtPurchaseView

  beforeEach(async () => {
    const gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    t.owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    t.admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Desk A' }))
    const ravi = await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi' })
    t.ravi = await tokenFor(ravi)
    t.sita = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111104', role: 'trainer', name: 'Sita' }))
    t.ownerB = await tokenFor(await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }))

    clock = at('2026-03-20 09:00') // Friday
    ;({ app } = await startApp(ctx.db, {}, undefined, () => clock))

    asha = (await call('POST', '/members', t.admin, { name: 'Asha', phone: '9876500001' })).json()
    const bina = (await call('POST', '/members', t.admin, { name: 'Bina', phone: '9876500002' })).json()
    t.asha = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: asha.userId } }))
    t.bina = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: bina.userId } }))

    const pkg = (
      await call('POST', '/pt-packages', t.owner, { name: '12 Sessions', sessionCount: 12, validityDays: 60, pricePaise: 1200000 })
    ).json()
    ashaPt = (
      await post(`/members/${asha.id}/pt-purchases`, t.admin, { packageId: pkg.id, trainerId: ravi.id, payment: { method: 'cash' } })
    ).json()
    await call('PUT', `/trainers/${ravi.id}/availability`, t.ravi, RAVI_HOURS)
    const book = async (when: string) => {
      const res = await post(`/pt-purchases/${ashaPt.id}/sessions`, t.asha, { startsAt: at(when).toISOString() })
      expect(res.statusCode, res.body).toBe(201)
      return res.json() as PtSessionView
    }
    s6 = await book('2026-03-21 06:00')
    s7 = await book('2026-03-21 07:00')
    s8 = await book('2026-03-21 08:00')
    mon = await book('2026-03-23 18:00')

    clock = at('2026-03-21 08:30') // Saturday: the three morning sessions have started
  })
  afterEach(async () => {
    await app.close()
  })

  describe('marking', () => {
    it('the trainer marks a started session; it uses up one session, once', async () => {
      expect((await mark(mon)).json().error.code).toBe('PT_SESSION_NOT_STARTED')
      for (const token of [t.asha, t.sita, t.ownerB]) expect((await mark(s6, token)).statusCode).toBe(404)

      const res = await mark(s6, t.ravi, 'completed', 'Squats 60 kg')
      expect(res.json()).toMatchObject({
        status: 'completed',
        confirmation: 'pending',
        trainerNotes: 'Squats 60 kg',
        markedByName: 'Ravi',
      })
      expect((await mark(s6)).json().error.code).toBe('PT_SESSION_NOT_BOOKED')

      const p = await purchase()
      expect(p).toMatchObject({ sessionsLeft: 11, sessionsBooked: 3 })
      expect(p.ledger.at(-1)).toMatchObject({ change: -1, reason: 'session_completed', note: 'Squats 60 kg' })
    })

    it('a double tap racing itself still charges once; no-shows charge too; the desk can mark', async () => {
      const results = await Promise.all([mark(s6), mark(s6)])
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409])
      expect((await mark(s7, t.admin, 'no_show')).json()).toMatchObject({ status: 'no_show', markedByName: 'Desk A' })

      const p = await purchase()
      expect(p.sessionsLeft).toBe(10)
      expect(p.ledger.slice(-2).map((l) => l.reason)).toEqual(['session_completed', 'no_show'])
    })

    it('the trainer can undo within an hour; the desk until the member responds', async () => {
      await mark(s6)
      const undone = await post(`/pt-sessions/${s6.id}/undo-mark`, t.ravi)
      expect(undone.json()).toMatchObject({ status: 'booked', markedAt: null, confirmation: null })
      expect((await purchase()).sessionsLeft).toBe(12)

      // Marked again (the right way this time), then the hour passes.
      await mark(s6, t.ravi, 'no_show')
      expect((await purchase()).sessionsLeft).toBe(11)
      clock = at('2026-03-21 09:31')
      expect((await post(`/pt-sessions/${s6.id}/undo-mark`, t.ravi)).json().error.code).toBe('PT_UNDO_WINDOW_CLOSED')
      expect((await post(`/pt-sessions/${s6.id}/undo-mark`, t.admin)).json().status).toBe('booked')
      expect((await purchase()).sessionsLeft).toBe(12)

      await mark(s7)
      await post(`/pt-sessions/${s7.id}/confirm`, t.asha)
      expect((await post(`/pt-sessions/${s7.id}/undo-mark`, t.admin)).json().error.code).toBe('PT_UNDO_WINDOW_CLOSED')
    })
  })

  describe('the member’s answer', () => {
    it('confirm or dispute within 24 hours; no reply counts as confirmed', async () => {
      await mark(s6)
      await mark(s7, t.ravi, 'no_show')
      await mark(s8)

      expect((await post(`/pt-sessions/${s6.id}/confirm`, t.ravi)).statusCode).toBe(404)
      expect((await post(`/pt-sessions/${s6.id}/confirm`, t.bina)).statusCode).toBe(404)
      expect((await post(`/pt-sessions/${s6.id}/confirm`, t.asha)).json().confirmation).toBe('confirmed')
      expect((await post(`/pt-sessions/${s6.id}/confirm`, t.asha)).json().error.code).toBe('PT_ALREADY_CONFIRMED')
      expect((await post(`/pt-sessions/${s6.id}/dispute`, t.asha, { reason: 'Changed my mind' })).json().error.code).toBe(
        'PT_ALREADY_CONFIRMED',
      )

      expect((await post(`/pt-sessions/${s7.id}/dispute`, t.asha, { reason: '' })).statusCode).toBe(400)
      const disputed = await post(`/pt-sessions/${s7.id}/dispute`, t.asha, { reason: 'I was there, Ravi was late' })
      expect(disputed.json()).toMatchObject({ confirmation: 'disputed', disputeReason: 'I was there, Ravi was late' })
      expect((await post(`/pt-sessions/${mon.id}/confirm`, t.asha)).json().error.code).toBe('PT_SESSION_NOT_MARKED')

      clock = at('2026-03-22 08:31') // just over 24 hours after marking
      const mine = (await call('GET', '/me/pt-sessions', t.asha)).json() as PtSessionView[]
      expect(mine.find((s) => s.id === s8.id)?.confirmation).toBe('auto_confirmed')
      expect((await post(`/pt-sessions/${s8.id}/dispute`, t.asha, { reason: 'Too late?' })).json().error.code).toBe(
        'PT_DISPUTE_WINDOW_CLOSED',
      )
      expect((await purchase()).sessionsLeft).toBe(9)
    })
  })

  describe('resolving disputes', () => {
    it('the desk gives the session back (once) or keeps it as used', async () => {
      await mark(s6, t.ravi, 'no_show')
      await mark(s7)
      await post(`/pt-sessions/${s6.id}/dispute`, t.asha, { reason: 'I was there' })
      await post(`/pt-sessions/${s7.id}/dispute`, t.asha, { reason: 'Only 20 minutes' })

      expect((await call('GET', '/pt-disputes', t.ravi)).statusCode).toBe(403)
      const open = (await call('GET', '/pt-disputes', t.admin)).json() as PtSessionView[]
      expect(open.map((s) => [s.id, s.disputeReason])).toEqual([
        [s6.id, 'I was there'],
        [s7.id, 'Only 20 minutes'],
      ])
      expect((await call('GET', '/pt-disputes', t.ownerB)).json()).toEqual([])

      const resolve = (s: PtSessionView, resolution: string, token = t.admin) =>
        post(`/pt-sessions/${s.id}/resolve`, token, { resolution, note: 'Checked the CCTV' })
      expect((await resolve(s6, 'upheld', t.ownerB)).statusCode).toBe(404)
      expect((await resolve(s6, 'upheld', t.ravi)).statusCode).toBe(403)
      expect((await resolve(s6, 'upheld')).json()).toMatchObject({
        confirmation: 'upheld',
        resolutionNote: 'Checked the CCTV',
        resolvedByName: 'Desk A',
      })
      expect((await resolve(s6, 'upheld')).json().error.code).toBe('PT_ALREADY_RESOLVED')
      expect((await resolve(s7, 'rejected')).json().confirmation).toBe('rejected')
      expect((await resolve(s8, 'upheld')).json().error.code).toBe('PT_NOT_DISPUTED')

      const p = await purchase()
      expect(p.sessionsLeft).toBe(11) // two used, one given back
      expect(p.ledger.at(-1)).toMatchObject({ change: 1, reason: 'dispute_refund', note: 'Checked the CCTV' })
      expect((await call('GET', '/pt-disputes', t.admin)).json()).toEqual([])
    })
  })

  describe('sessions nobody marked', () => {
    it('stay reserved and show for the trainer and the desk', async () => {
      await mark(s6)
      const ravis = (await call('GET', '/pt-sessions/unmarked', t.ravi)).json() as PtSessionView[]
      expect(ravis.map((s) => s.id)).toEqual([s7.id, s8.id])
      expect((await call('GET', '/pt-sessions/unmarked', t.sita)).json()).toEqual([])
      expect((await call('GET', '/pt-sessions/unmarked', t.admin)).json()).toHaveLength(2)
      expect((await call('GET', '/pt-sessions/unmarked', t.asha)).statusCode).toBe(403)
      expect((await call('GET', '/pt-sessions/unmarked', t.ownerB)).json()).toEqual([])
      expect(await purchase()).toMatchObject({ sessionsLeft: 11, sessionsBooked: 3 })
    })
  })
})
