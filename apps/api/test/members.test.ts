import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { MemberDetail, MembershipPlan, MembershipView } from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

// Fixed clock: 20 Mar 2026, 12:00 in India.
const NOW = new Date('2026-03-20T06:30:00Z')
const TODAY = '2026-03-20'

describe.skipIf(!testDatabaseUrl)('plans, members and memberships', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let gymA: string
  let gymB: string
  let owner: string // gym A owner token
  let admin: string // gym A admin token
  let trainer: string // gym A trainer token
  let ownerB: string // gym B owner token

  beforeEach(async () => {
    gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    gymB = (await createGym(ctx.db, 'Beta Gym')).id
    owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Admin A' }))
    trainer = await tokenFor(
      await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Trainer A' }),
    )
    ownerB = await tokenFor(await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }))
    ;({ app } = await startApp(ctx.db, {}, undefined, () => NOW))
  })
  afterEach(async () => {
    await app.close()
  })

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  async function plan(token: string, name: string, durationMonths: number, maxFreezeDays = 0, pricePaise = 150000) {
    const res = await call('POST', '/plans', token, { name, durationMonths, pricePaise, maxFreezeDays })
    expect(res.statusCode).toBe(201)
    return res.json() as MembershipPlan
  }

  async function member(
    token: string,
    name: string,
    phone: string,
    firstMembership?: { planId: string; startDate?: string },
  ) {
    const res = await call('POST', '/members', token, { name, phone, firstMembership })
    expect(res.statusCode).toBe(201)
    return res.json() as MemberDetail
  }

  describe('plans', () => {
    it('owners and admins create and list plans; names are unique per gym', async () => {
      await plan(owner, '3 months', 3, 15, 450000)
      await plan(admin, '1 month', 1)

      const list = (await call('GET', '/plans', owner)).json() as MembershipPlan[]
      expect(list.map((p) => [p.name, p.durationMonths, p.pricePaise, p.maxFreezeDays])).toEqual([
        ['1 month', 1, 150000, 0],
        ['3 months', 3, 450000, 15],
      ])

      const dup = await call('POST', '/plans', owner, { name: '3 months', durationMonths: 3, pricePaise: 1, maxFreezeDays: 0 })
      expect(dup.statusCode).toBe(400) // price below ₹1
      const dupName = await call('POST', '/plans', owner, {
        name: '3 months',
        durationMonths: 3,
        pricePaise: 400000,
        maxFreezeDays: 0,
      })
      expect(dupName.statusCode).toBe(409)
      expect(dupName.json().error.code).toBe('PLAN_NAME_TAKEN')

      // Another gym may use the same name.
      await plan(ownerB, '3 months', 3)
    })

    it('is closed to trainers and members', async () => {
      expect((await call('GET', '/plans', trainer)).statusCode).toBe(403)
    })

    it('price changes apply to new sales only', async () => {
      const p = await plan(owner, '1 month', 1, 0, 150000)
      const m = await member(owner, 'Asha', '9876500001', { planId: p.id })

      await call('PATCH', `/plans/${p.id}`, owner, { pricePaise: 200000 })

      const detail = (await call('GET', `/members/${m.id}`, owner)).json() as MemberDetail
      expect(detail.memberships[0]?.pricePaise).toBe(150000)
    })

    it('an emptied description is removed', async () => {
      const created = await call('POST', '/plans', owner, {
        name: 'Gold',
        durationMonths: 12,
        pricePaise: 1500000,
        maxFreezeDays: 45,
        description: 'Includes locker',
      })
      const res = await call('PATCH', `/plans/${created.json().id}`, owner, { description: '' })
      expect(res.json().description).toBeNull()
    })

    it('deactivated plans cannot be sold', async () => {
      const p = await plan(owner, '1 month', 1)
      await call('PATCH', `/plans/${p.id}`, owner, { active: false })
      const res = await call('POST', '/members', owner, { name: 'Asha', phone: '9876500001', firstMembership: { planId: p.id } })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('PLAN_INACTIVE')
    })
  })

  describe('adding members', () => {
    it('creates the login, profile and first membership starting today', async () => {
      const p = await plan(owner, '3 months', 3, 15)

      const m = await member(owner, 'Asha Patel', '98765 00001', { planId: p.id })

      expect(m).toMatchObject({ name: 'Asha Patel', phone: '+919876500001', joinedOn: TODAY, status: 'active' })
      expect(m.current).toMatchObject({
        planName: '3 months',
        startDate: '2026-03-20',
        endDate: '2026-06-19',
        status: 'active',
        daysLeft: 92,
        maxFreezeDays: 15,
      })

      // The member can see it themselves.
      const user = await ctx.db.user.findFirstOrThrow({ where: { phone: '+919876500001' } })
      expect(user.role).toBe('member')
      const mine = await call('GET', '/me/membership', await tokenFor(user))
      expect(mine.json().current).toMatchObject({ endDate: '2026-06-19', daysLeft: 92 })
    })

    it('refuses a phone number already used at the gym', async () => {
      await member(owner, 'Asha', '9876500001')
      const res = await call('POST', '/members', owner, { name: 'Other', phone: '+919876500001' })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('PHONE_TAKEN')
    })

    it('edits details; an emptied field is removed, a missing one is unchanged', async () => {
      const created = await call('POST', '/members', owner, {
        name: 'Asha',
        phone: '9876500001',
        emergencyContactName: 'Ravi',
        emergencyContactPhone: '9876500009',
        notes: 'Knee injury',
      })
      const id = created.json().id

      const res = await call('PATCH', `/members/${id}`, owner, { name: 'Asha Patel', notes: '', emergencyContactPhone: '' })

      expect(res.json()).toMatchObject({
        name: 'Asha Patel',
        notes: null,
        emergencyContactPhone: null,
        emergencyContactName: 'Ravi',
      })
    })

    it('staff without a member profile have no membership', async () => {
      expect((await call('GET', '/me/membership', trainer)).json()).toEqual({ current: null, history: [] })
    })
  })

  describe('renewals', () => {
    it('queues a renewal to start the day after the current membership ends', async () => {
      const three = await plan(owner, '3 months', 3)
      const one = await plan(owner, '1 month', 1)
      const m = await member(owner, 'Asha', '9876500001', { planId: three.id })

      const res = await call('POST', `/members/${m.id}/memberships`, owner, { planId: one.id })

      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ startDate: '2026-06-20', endDate: '2026-07-19', status: 'upcoming' })
      const detail = (await call('GET', `/members/${m.id}`, owner)).json() as MemberDetail
      expect(detail.current?.endDate).toBe('2026-06-19')
      expect(detail.status).toBe('active')
    })

    it('starts today when the last membership has already expired', async () => {
      const one = await plan(owner, '1 month', 1)
      const m = await member(owner, 'Asha', '9876500001', { planId: one.id, startDate: '2026-01-01' })
      expect(m.status).toBe('expired')

      const res = await call('POST', `/members/${m.id}/memberships`, owner, { planId: one.id })
      expect(res.json()).toMatchObject({ startDate: TODAY, endDate: '2026-04-19', status: 'active' })
    })

    it('refuses overlapping memberships', async () => {
      const one = await plan(owner, '1 month', 1)
      const m = await member(owner, 'Asha', '9876500001', { planId: one.id })

      const res = await call('POST', `/members/${m.id}/memberships`, owner, { planId: one.id, startDate: '2026-04-01' })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('MEMBERSHIP_OVERLAP')
    })
  })

  describe('member list', () => {
    it('filters by status and searches by name or phone', async () => {
      const one = await plan(owner, '1 month', 1)
      const three = await plan(owner, '3 months', 3)
      await member(owner, 'Active Anil', '9876500001', { planId: three.id })
      await member(owner, 'Expiring Esha', '9876500002', { planId: one.id, startDate: '2026-02-25' }) // ends 24 Mar
      await member(owner, 'Expired Emil', '9876500003', { planId: one.id, startDate: '2026-01-01' })
      await member(owner, 'New Neha', '9876500004')
      const renewed = await member(owner, 'Renewed Ravi', '9876500005', { planId: one.id, startDate: '2026-02-25' })
      await call('POST', `/members/${renewed.id}/memberships`, owner, { planId: one.id })

      const names = async (query: string) =>
        ((await call('GET', `/members${query}`, admin)).json() as MemberDetail[]).map((m) => m.name)

      expect(await names('')).toHaveLength(5)
      expect(await names('?filter=expiring')).toEqual(['Expiring Esha']) // Ravi already renewed
      expect(await names('?filter=expired')).toEqual(['Expired Emil'])
      expect(await names('?filter=none')).toEqual(['New Neha'])
      expect(await names('?filter=active')).toEqual(['Active Anil', 'Expiring Esha', 'Renewed Ravi'])
      expect(await names('?q=esh')).toEqual(['Expiring Esha'])
      expect(await names('?q=500004')).toEqual(['New Neha'])
    })
  })

  describe('freezing', () => {
    let three: MembershipPlan
    let membership: MembershipView
    let memberId: string

    beforeEach(async () => {
      three = await plan(owner, '3 months', 3, 15)
      const m = await member(owner, 'Asha', '9876500001', { planId: three.id }) // 20 Mar → 19 Jun
      memberId = m.id
      membership = m.current as MembershipView
    })

    const freeze = (fromDate: string, toDate: string) =>
      call('POST', `/memberships/${membership.id}/freeze`, admin, { fromDate, toDate, reason: 'Travel' })

    it('pushes the end date back by the frozen days, up to the plan limit', async () => {
      const res = await freeze('2026-03-25', '2026-04-03') // 10 days

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ endDate: '2026-06-29', freezeDaysUsed: 10, status: 'active' })

      const tooMany = await freeze('2026-05-01', '2026-05-06') // 6 more, only 5 left
      expect(tooMany.statusCode).toBe(409)
      expect(tooMany.json().error).toEqual({
        code: 'FREEZE_LIMIT_EXCEEDED',
        message: 'Only 5 freeze days left on this membership (asked for 6).',
      })

      const overlap = await freeze('2026-04-03', '2026-04-04')
      expect(overlap.json().error.code).toBe('FREEZE_OVERLAP')
    })

    it('refuses plans that do not allow freezing', async () => {
      const one = await plan(owner, '1 month', 1, 0)
      const m = await member(owner, 'Ravi', '9876500002', { planId: one.id })
      const res = await call('POST', `/memberships/${m.current?.id}/freeze`, admin, {
        fromDate: '2026-03-25',
        toDate: '2026-03-26',
      })
      expect(res.json().error).toEqual({ code: 'FREEZE_LIMIT_EXCEEDED', message: 'This plan does not allow freezing.' })
    })

    it('moves a queued renewal so the two never overlap', async () => {
      const one = await plan(owner, '1 month', 1)
      await call('POST', `/members/${memberId}/memberships`, owner, { planId: one.id }) // 20 Jun → 19 Jul

      await freeze('2026-03-25', '2026-04-03')

      const detail = (await call('GET', `/members/${memberId}`, owner)).json() as MemberDetail
      expect(detail.memberships.map((m) => [m.startDate, m.endDate])).toEqual([
        ['2026-06-30', '2026-07-29'],
        ['2026-03-20', '2026-06-29'],
      ])
    })

    it('refuses a freeze that starts before the membership', async () => {
      const res = await freeze('2026-03-18', '2026-03-22')
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('MEMBERSHIP_NOT_FREEZABLE')
    })

    it('shows frozen today, and unfreezing early gives the unused days back', async () => {
      const m = await member(owner, 'Ravi', '9876500002', { planId: three.id, startDate: '2026-03-01' }) // → 31 May
      const id = m.current?.id as string
      await call('POST', `/memberships/${id}/freeze`, admin, { fromDate: '2026-03-18', toDate: '2026-03-22' }) // → 5 Jun

      const frozen = (await call('GET', `/members/${m.id}`, owner)).json() as MemberDetail
      expect(frozen.status).toBe('frozen')
      expect(frozen.current).toMatchObject({ status: 'frozen', endDate: '2026-06-05' })

      const res = await call('POST', `/memberships/${id}/unfreeze`, admin)

      // Frozen 18–19 Mar (2 days) instead of 5: 3 days come back, and Ravi can come in today.
      expect(res.json()).toMatchObject({ status: 'active', endDate: '2026-06-02', freezeDaysUsed: 2 })
      expect(res.json().freezes[0]).toMatchObject({ fromDate: '2026-03-18', toDate: '2026-03-19' })
    })

    it('unfreezing on the day a freeze started removes it completely', async () => {
      await freeze(TODAY, '2026-03-24')
      const res = await call('POST', `/memberships/${membership.id}/unfreeze`, admin)
      expect(res.json()).toMatchObject({ status: 'active', endDate: '2026-06-19', freezeDaysUsed: 0, freezes: [] })
    })

    it('unfreezing a future freeze removes it completely', async () => {
      await freeze('2026-04-01', '2026-04-05')
      const res = await call('POST', `/memberships/${membership.id}/unfreeze`, admin)
      expect(res.json()).toMatchObject({ endDate: '2026-06-19', freezeDaysUsed: 0, freezes: [] })

      const again = await call('POST', `/memberships/${membership.id}/unfreeze`, admin)
      expect(again.json().error.code).toBe('NOTHING_TO_UNFREEZE')
    })

    it('cancelled memberships show no days left and cannot be frozen', async () => {
      const res = await call('POST', `/memberships/${membership.id}/cancel`, admin, { reason: 'Moved city' })
      expect(res.json()).toMatchObject({ status: 'cancelled', daysLeft: 0, cancelReason: 'Moved city' })

      expect((await call('POST', `/memberships/${membership.id}/cancel`, admin)).json().error.code).toBe(
        'ALREADY_CANCELLED',
      )
      expect((await freeze('2026-04-01', '2026-04-02')).json().error.code).toBe('MEMBERSHIP_NOT_FREEZABLE')
    })
  })

  describe('gym isolation', () => {
    it('gym B cannot read or change anything of gym A', async () => {
      const p = await plan(owner, '3 months', 3, 15)
      const m = await member(owner, 'Asha', '9876500001', { planId: p.id })
      const membershipId = m.current?.id as string

      const attempts = await Promise.all([
        call('GET', `/members/${m.id}`, ownerB),
        call('PATCH', `/members/${m.id}`, ownerB, { name: 'Hacked' }),
        call('POST', `/members/${m.id}/memberships`, ownerB, { planId: p.id }),
        call('POST', `/memberships/${membershipId}/freeze`, ownerB, { fromDate: '2026-04-01', toDate: '2026-04-02' }),
        call('POST', `/memberships/${membershipId}/unfreeze`, ownerB),
        call('POST', `/memberships/${membershipId}/cancel`, ownerB),
        call('PATCH', `/plans/${p.id}`, ownerB, { pricePaise: 100 }),
      ])
      expect(attempts.map((r) => r.statusCode)).toEqual([404, 404, 404, 404, 404, 404, 404])

      expect((await call('GET', '/members', ownerB)).json()).toEqual([])
      expect((await call('GET', '/plans', ownerB)).json()).toEqual([])

      // Nothing changed on gym A's side.
      const after = (await call('GET', `/members/${m.id}`, owner)).json() as MemberDetail
      expect(after).toMatchObject({ name: 'Asha', status: 'active' })
      expect(after.memberships).toHaveLength(1)
      expect(after.current).toMatchObject({ endDate: '2026-06-19', freezes: [] })
    })

    it("gym A cannot sell gym B's plan", async () => {
      const planB = await plan(ownerB, '1 month', 1)
      const res = await call('POST', '/members', owner, {
        name: 'Asha',
        phone: '9876500001',
        firstMembership: { planId: planB.id },
      })
      expect(res.statusCode).toBe(404)
      // The whole creation rolled back: no half-created member.
      expect(await ctx.db.user.count({ where: { phone: '+919876500001' } })).toBe(0)
    })
  })

  describe('staff', () => {
    it('owners add admins and trainers; admins add trainers only', async () => {
      const add = (token: string, role: string, phone: string) =>
        call('POST', '/users', token, { name: `New ${role}`, phone, role })

      expect((await add(owner, 'admin', '9876500011')).statusCode).toBe(201)
      expect((await add(owner, 'trainer', '9876500012')).statusCode).toBe(201)
      expect((await add(admin, 'trainer', '9876500013')).statusCode).toBe(201)

      const denied = await add(admin, 'admin', '9876500014')
      expect(denied.statusCode).toBe(403)
      expect((await add(owner, 'trainer', '9876500012')).json().error.code).toBe('PHONE_TAKEN')
      expect((await add(owner, 'owner', '9876500015')).statusCode).toBe(400)

      const users = await ctx.db.user.findMany({ where: { gymId: gymA, phone: { startsWith: '+9198765000' } } })
      expect(users.map((u) => u.role).sort()).toEqual(['admin', 'trainer', 'trainer'])
    })

    it('lists staff only (owner first, then admins, then trainers) without members or other gyms', async () => {
      await member(owner, 'Asha Member', '9876500001')
      await call('POST', '/users', owner, { name: 'Zed Admin', phone: '9876500011', role: 'admin' })

      const staff = (await call('GET', '/users?kind=staff', admin)).json() as { name: string; role: string }[]

      expect(staff.map((u) => [u.role, u.name])).toEqual([
        ['owner', 'Owner A'],
        ['admin', 'Admin A'],
        ['admin', 'Zed Admin'],
        ['trainer', 'Trainer A'],
      ])
    })
  })
})
