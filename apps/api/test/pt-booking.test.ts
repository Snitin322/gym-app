import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  indiaDateTime,
  type MemberDetail,
  type PtPurchaseView,
  type PtSessionView,
  type PtSlotsResponse,
} from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

/** "2026-03-21 06:00" (India) → ISO instant. */
function at(dateTime: string) {
  const [date, time] = dateTime.split(' ') as [string, string]
  const [h, m] = time.split(':').map(Number) as [number, number]
  return indiaDateTime(date, h * 60 + m).toISOString()
}
/** ISO instant → "2026-03-21 06:00" (India), for readable assertions. */
function local(iso: string) {
  return new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ')
}

// Friday 20 Mar 2026, 9:00 am in India.
const FRIDAY_9AM = new Date(at('2026-03-20 09:00'))

/** Ravi works Saturdays 6–9 am and Mondays 6–8 pm, 60-minute sessions. */
const RAVI_HOURS = {
  sessionMinutes: 60,
  windows: [
    { weekday: 6, startMinute: 6 * 60, endMinute: 9 * 60 },
    { weekday: 1, startMinute: 18 * 60, endMinute: 20 * 60 },
  ],
}

describe.skipIf(!testDatabaseUrl)('PT booking', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let clock: Date
  const t = {} as Record<'owner' | 'admin' | 'ravi' | 'sita' | 'asha' | 'bina' | 'ownerB', string>
  let raviId: string
  let sitaId: string
  let asha: MemberDetail
  let bina: MemberDetail
  let ashaPt: PtPurchaseView

  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  const memberToken = async (m: MemberDetail) =>
    tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: m.userId } }))

  async function sell(member: MemberDetail, trainerId: string, packageId: string) {
    const res = await call('POST', `/members/${member.id}/pt-purchases`, t.admin, {
      packageId,
      trainerId,
      payment: { method: 'cash' },
    })
    expect(res.statusCode).toBe(201)
    return res.json() as PtPurchaseView
  }

  async function slots(purchaseId: string, token = t.asha) {
    const res = await call('GET', `/pt-purchases/${purchaseId}/slots`, token)
    expect(res.statusCode).toBe(200)
    return (res.json() as PtSlotsResponse).slots.map((s) => local(s.startsAt))
  }

  async function book(purchaseId: string, when: string, token = t.asha) {
    return call('POST', `/pt-purchases/${purchaseId}/sessions`, token, { startsAt: at(when) })
  }

  async function booked(purchaseId: string, when: string, token = t.asha) {
    const res = await book(purchaseId, when, token)
    expect(res.statusCode, res.body).toBe(201)
    return res.json() as PtSessionView
  }

  const purchase = async (id: string) => (await call('GET', `/pt-purchases/${id}`, t.admin)).json() as PtPurchaseView

  beforeEach(async () => {
    const gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    t.owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    t.admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Desk A' }))
    const ravi = await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi' })
    const sita = await createUser(ctx.db, gymA, { phone: '+919811111104', role: 'trainer', name: 'Sita' })
    raviId = ravi.id
    sitaId = sita.id
    t.ravi = await tokenFor(ravi)
    t.sita = await tokenFor(sita)
    t.ownerB = await tokenFor(await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }))

    clock = FRIDAY_9AM
    ;({ app } = await startApp(ctx.db, {}, undefined, () => clock))

    asha = (await call('POST', '/members', t.admin, { name: 'Asha', phone: '9876500001' })).json()
    bina = (await call('POST', '/members', t.admin, { name: 'Bina', phone: '9876500002' })).json()
    t.asha = await memberToken(asha)
    t.bina = await memberToken(bina)

    const pkg = (
      await call('POST', '/pt-packages', t.owner, { name: '12 Sessions', sessionCount: 12, validityDays: 60, pricePaise: 1200000 })
    ).json()
    ashaPt = await sell(asha, raviId, pkg.id)
    expect((await call('PUT', `/trainers/${raviId}/availability`, t.ravi, RAVI_HOURS)).statusCode).toBe(200)
  })
  afterEach(async () => {
    await app.close()
  })

  describe('trainer hours', () => {
    it('trainers set their own hours; the desk can set anyone’s; nobody else can', async () => {
      const mine = (await call('GET', `/trainers/${raviId}/availability`, t.ravi)).json()
      // Returned in week order (Monday first).
      const [saturday, monday] = RAVI_HOURS.windows
      expect(mine).toMatchObject({ trainerName: 'Ravi', sessionMinutes: 60, windows: [monday, saturday], timeOff: [] })

      const byDesk = await call('PUT', `/trainers/${sitaId}/availability`, t.admin, { sessionMinutes: 45, windows: [] })
      expect(byDesk.json()).toMatchObject({ trainerName: 'Sita', sessionMinutes: 45 })

      for (const token of [t.sita, t.asha, t.ownerB]) {
        expect((await call('PUT', `/trainers/${raviId}/availability`, token, RAVI_HOURS)).statusCode).toBe(404)
      }
      // A member is not a trainer: no hours to set.
      const notTrainer = await call('GET', `/trainers/${asha.userId}/availability`, t.admin)
      expect(notTrainer.statusCode).toBe(404)

      const overlap = await call('PUT', `/trainers/${raviId}/availability`, t.ravi, {
        sessionMinutes: 60,
        windows: [
          { weekday: 1, startMinute: 360, endMinute: 600 },
          { weekday: 1, startMinute: 540, endMinute: 700 },
        ],
      })
      expect(overlap.json().error).toEqual({ code: 'VALIDATION_ERROR', message: 'Time ranges on the same day must not overlap' })
    })
  })

  describe('open slots and booking', () => {
    it('shows the trainer’s free hours, and booking takes the slot', async () => {
      expect((await slots(ashaPt.id)).slice(0, 5)).toEqual([
        '2026-03-21 06:00',
        '2026-03-21 07:00',
        '2026-03-21 08:00',
        '2026-03-23 18:00',
        '2026-03-23 19:00',
      ])

      const session = await booked(ashaPt.id, '2026-03-21 06:00')
      expect(session).toMatchObject({
        status: 'booked',
        trainer: { id: raviId, name: 'Ravi' },
        member: { id: asha.id, name: 'Asha' },
        bookedByName: 'Asha',
        packageName: '12 Sessions',
      })
      expect(local(session.endsAt)).toBe('2026-03-21 07:00')
      expect(local(session.freeCancelUntil)).toBe('2026-03-20 18:00')

      expect((await slots(ashaPt.id))[0]).toBe('2026-03-21 07:00')
      expect(await purchase(ashaPt.id)).toMatchObject({ sessionsLeft: 12, sessionsBooked: 1 })
    })

    it('refuses times that aren’t open: taken by someone else, off-grid, or too soon', async () => {
      const pkg = (await call('GET', '/pt-packages', t.admin)).json()[0]
      const binaPt = await sell(bina, raviId, pkg.id)
      await booked(binaPt.id, '2026-03-21 06:00', t.bina)

      for (const when of ['2026-03-21 06:00', '2026-03-21 06:30', '2026-03-22 07:00']) {
        const res = await book(ashaPt.id, when)
        expect(res.json().error.code, when).toBe('PT_SLOT_UNAVAILABLE')
      }
      // Less than 2 hours ahead.
      clock = new Date(at('2026-03-21 05:30'))
      expect((await book(ashaPt.id, '2026-03-21 07:00')).json().error.code).toBe('PT_SLOT_UNAVAILABLE')
      expect((await book(ashaPt.id, '2026-03-21 08:00')).statusCode).toBe(201)
    })

    it('counts booked sessions against the balance', async () => {
      await call('POST', `/pt-purchases/${ashaPt.id}/adjust`, t.admin, { change: -10, note: 'Used before the app' })
      await booked(ashaPt.id, '2026-03-21 06:00')
      await booked(ashaPt.id, '2026-03-21 07:00')

      const third = await book(ashaPt.id, '2026-03-21 08:00')
      expect(third.json().error).toEqual({
        code: 'PT_NO_SESSIONS_LEFT',
        message: 'No sessions left to book: 2 left and 2 already booked.',
      })
    })

    it('two bookings racing for the last session: exactly one wins', async () => {
      await call('POST', `/pt-purchases/${ashaPt.id}/adjust`, t.admin, { change: -11, note: 'One left' })
      const results = await Promise.all([book(ashaPt.id, '2026-03-21 06:00'), book(ashaPt.id, '2026-03-23 18:00')])
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409])
      expect(await ctx.db.ptSession.count({ where: { status: 'booked' } })).toBe(1)
    })

    it('two members racing for the same slot: exactly one wins', async () => {
      const pkg = (await call('GET', '/pt-packages', t.admin)).json()[0]
      const binaPt = await sell(bina, raviId, pkg.id)
      const results = await Promise.all([
        book(ashaPt.id, '2026-03-21 06:00'),
        book(binaPt.id, '2026-03-21 06:00', t.bina),
      ])
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409])
      expect(await ctx.db.ptSession.count({ where: { status: 'booked' } })).toBe(1)
    })

    it('the database itself blocks double-booking a trainer', async () => {
      const first = await booked(ashaPt.id, '2026-03-21 06:00')
      const row = await ctx.db.ptSession.findUniqueOrThrow({ where: { id: first.id } })
      const overlapping = ctx.db.ptSession.create({
        data: {
          gymId: row.gymId,
          purchaseId: row.purchaseId,
          trainerId: row.trainerId,
          memberId: bina.id,
          bookedById: row.bookedById,
          startsAt: new Date(at('2026-03-21 06:30')),
          endsAt: new Date(at('2026-03-21 07:30')),
        },
      })
      await expect(overlapping).rejects.toThrow(/pt_sessions_no_trainer_overlap/)
    })

    it('slots stop at the use-by date; an expired package can’t book', async () => {
      await call('POST', '/pt-packages', t.owner, { name: 'Trial', sessionCount: 2, validityDays: 2, pricePaise: 100000 })
      const trial = (await call('GET', '/pt-packages', t.admin)).json().find((p: { name: string }) => p.name === 'Trial')
      const binaPt = await sell(bina, raviId, trial.id)
      expect(binaPt.expiresOn).toBe('2026-03-21')
      expect(await slots(binaPt.id, t.bina)).toEqual(['2026-03-21 06:00', '2026-03-21 07:00', '2026-03-21 08:00'])

      clock = new Date(at('2026-03-22 09:00'))
      expect((await book(binaPt.id, '2026-03-23 18:00', t.bina)).json().error.code).toBe('PT_PACKAGE_EXPIRED')
    })

    it('trainers book for their own clients and the desk for anyone; other people can’t see the package', async () => {
      expect((await booked(ashaPt.id, '2026-03-21 06:00', t.ravi)).bookedByName).toBe('Ravi')
      expect((await booked(ashaPt.id, '2026-03-21 07:00', t.admin)).bookedByName).toBe('Desk A')
      for (const token of [t.bina, t.sita, t.ownerB]) {
        expect((await call('GET', `/pt-purchases/${ashaPt.id}/slots`, token)).statusCode).toBe(404)
        expect((await book(ashaPt.id, '2026-03-21 08:00', token)).statusCode).toBe(404)
      }
    })
  })

  describe('cancelling and rescheduling', () => {
    it('free until 12 hours before; later, the member uses up the session (once)', async () => {
      const early = await booked(ashaPt.id, '2026-03-21 06:00')
      const free = await call('POST', `/pt-sessions/${early.id}/cancel`, t.asha, { reason: 'Travelling' })
      expect(free.json()).toMatchObject({ status: 'cancelled', lateCancel: false, cancelReason: 'Travelling', cancelledByName: 'Asha' })
      expect(await purchase(ashaPt.id)).toMatchObject({ sessionsLeft: 12, sessionsBooked: 0 })

      const late = await booked(ashaPt.id, '2026-03-21 07:00')
      clock = new Date(at('2026-03-20 20:00')) // 11 hours before
      const lateRes = await call('POST', `/pt-sessions/${late.id}/cancel`, t.asha, {})
      expect(lateRes.json()).toMatchObject({ status: 'cancelled', lateCancel: true })
      const after = await purchase(ashaPt.id)
      expect(after.sessionsLeft).toBe(11)
      expect(after.ledger.at(-1)).toMatchObject({ change: -1, reason: 'late_cancel', createdByName: 'Asha' })

      const again = await call('POST', `/pt-sessions/${late.id}/cancel`, t.asha, {})
      expect(again.json().error.code).toBe('PT_SESSION_NOT_BOOKED')
      expect((await purchase(ashaPt.id)).sessionsLeft).toBe(11)
    })

    it('the trainer or desk cancelling never uses up a session; members can’t cancel once it started', async () => {
      const a = await booked(ashaPt.id, '2026-03-21 06:00')
      const b = await booked(ashaPt.id, '2026-03-21 07:00')
      clock = new Date(at('2026-03-21 06:30'))

      expect((await call('POST', `/pt-sessions/${a.id}/cancel`, t.asha, {})).json().error.code).toBe('PT_SESSION_STARTED')
      expect((await call('POST', `/pt-sessions/${a.id}/cancel`, t.ravi, { reason: 'Unwell' })).json()).toMatchObject({
        status: 'cancelled',
        lateCancel: false,
      })
      expect((await call('POST', `/pt-sessions/${b.id}/cancel`, t.admin, {})).json().lateCancel).toBe(false)
      expect((await purchase(ashaPt.id)).sessionsLeft).toBe(12)

      // Other people can't cancel it.
      const c = await booked(ashaPt.id, '2026-03-23 18:00')
      for (const token of [t.bina, t.sita, t.ownerB]) {
        expect((await call('POST', `/pt-sessions/${c.id}/cancel`, token, {})).statusCode).toBe(404)
      }
    })

    it('rescheduling moves the booking; members can only do it before the free-cancel time', async () => {
      const s = await booked(ashaPt.id, '2026-03-21 06:00')
      const moved = await call('POST', `/pt-sessions/${s.id}/reschedule`, t.asha, { startsAt: at('2026-03-21 08:00') })
      expect(moved.statusCode).toBe(200)
      const m = moved.json() as PtSessionView
      expect(local(m.startsAt)).toBe('2026-03-21 08:00')
      expect(await ctx.db.ptSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
        status: 'cancelled',
        cancelReason: 'Rescheduled',
        lateCancel: false,
      })
      expect(await slots(ashaPt.id)).toContain('2026-03-21 06:00')

      clock = new Date(at('2026-03-20 21:00'))
      const tooLate = await call('POST', `/pt-sessions/${m.id}/reschedule`, t.asha, { startsAt: at('2026-03-23 18:00') })
      expect(tooLate.json().error.code).toBe('PT_TOO_LATE_TO_RESCHEDULE')
      const byTrainer = await call('POST', `/pt-sessions/${m.id}/reschedule`, t.ravi, { startsAt: at('2026-03-23 18:00') })
      expect(byTrainer.statusCode).toBe(200)
      expect((await purchase(ashaPt.id)).sessionsLeft).toBe(12)
    })

    it('the owner can change the free-cancel time', async () => {
      expect((await call('PATCH', '/pt-rules', t.admin, { freeCancelHours: 6 })).statusCode).toBe(403)
      expect((await call('PATCH', '/pt-rules', t.owner, { freeCancelHours: 6 })).json()).toEqual({
        freeCancelHours: 6,
        bookingHorizonDays: 14,
        minNoticeHours: 2,
      })
      expect((await call('GET', '/pt-rules', t.asha)).json().freeCancelHours).toBe(6)

      const s = await booked(ashaPt.id, '2026-03-21 07:00')
      clock = new Date(at('2026-03-20 22:00')) // 9 hours before: still free with a 6-hour rule
      expect((await call('POST', `/pt-sessions/${s.id}/cancel`, t.asha, {})).json().lateCancel).toBe(false)
    })
  })

  describe('time off', () => {
    it('blocks slots and cancels clashing bookings for free; removing it opens them again', async () => {
      const s = await booked(ashaPt.id, '2026-03-21 07:00')
      const res = await call('POST', `/trainers/${raviId}/time-off`, t.ravi, {
        startsAt: at('2026-03-21 00:00'),
        endsAt: at('2026-03-22 00:00'),
        reason: 'Family function',
      })
      expect(res.statusCode).toBe(201)
      const { timeOff, cancelledSessions } = res.json()
      expect(cancelledSessions).toEqual([
        expect.objectContaining({ id: s.id, status: 'cancelled', lateCancel: false, cancelReason: 'Trainer time off: Family function' }),
      ])
      expect((await slots(ashaPt.id))[0]).toBe('2026-03-23 18:00')
      expect((await purchase(ashaPt.id)).sessionsLeft).toBe(12)

      expect((await call('DELETE', `/trainers/${raviId}/time-off/${timeOff.id}`, t.sita)).statusCode).toBe(404)
      expect((await call('DELETE', `/trainers/${raviId}/time-off/${timeOff.id}`, t.admin)).statusCode).toBe(204)
      expect((await slots(ashaPt.id))[0]).toBe('2026-03-21 06:00')
    })
  })

  describe('session lists', () => {
    it('members see their sessions, trainers their schedule, the desk any member’s', async () => {
      await booked(ashaPt.id, '2026-03-23 18:00')
      await booked(ashaPt.id, '2026-03-21 06:00')

      const mine = (await call('GET', '/me/pt-sessions', t.asha)).json() as PtSessionView[]
      expect(mine.map((s) => local(s.startsAt))).toEqual(['2026-03-21 06:00', '2026-03-23 18:00'])
      expect((await call('GET', '/me/pt-sessions', t.bina)).json()).toEqual([])

      const schedule = (await call('GET', `/trainers/${raviId}/sessions?from=2026-03-21&days=1`, t.ravi)).json()
      expect(schedule.map((s: PtSessionView) => [local(s.startsAt), s.member.name])).toEqual([['2026-03-21 06:00', 'Asha']])
      expect((await call('GET', `/trainers/${raviId}/sessions`, t.sita)).statusCode).toBe(404)

      expect((await call('GET', `/members/${asha.id}/pt-sessions`, t.admin)).json()).toHaveLength(2)
      expect((await call('GET', `/members/${asha.id}/pt-sessions`, t.ravi)).statusCode).toBe(403)
      expect((await call('GET', `/members/${asha.id}/pt-sessions`, t.ownerB)).statusCode).toBe(404)
    })
  })

  describe('gym isolation', () => {
    it('gym B can’t see or change gym A trainers, packages or sessions', async () => {
      const s = await booked(ashaPt.id, '2026-03-21 06:00')
      const attempts = await Promise.all([
        call('GET', `/trainers/${raviId}/availability`, t.ownerB),
        call('PUT', `/trainers/${raviId}/availability`, t.ownerB, RAVI_HOURS),
        call('POST', `/trainers/${raviId}/time-off`, t.ownerB, { startsAt: at('2026-03-21 00:00'), endsAt: at('2026-03-22 00:00') }),
        call('GET', `/trainers/${raviId}/sessions`, t.ownerB),
        call('GET', `/pt-purchases/${ashaPt.id}/slots`, t.ownerB),
        call('POST', `/pt-sessions/${s.id}/cancel`, t.ownerB, {}),
        call('POST', `/pt-sessions/${s.id}/reschedule`, t.ownerB, { startsAt: at('2026-03-21 07:00') }),
      ])
      expect(attempts.map((r) => r.statusCode)).toEqual([404, 404, 404, 404, 404, 404, 404])
      expect(await ctx.db.ptSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ status: 'booked' })
      expect(await ctx.db.trainerTimeOff.count()).toBe(0)
    })
  })
})
