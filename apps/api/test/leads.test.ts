import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { DashboardView, LeadView } from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

describe.skipIf(!testDatabaseUrl)('Leads (enquiries)', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  const t = {} as Record<'owner' | 'admin' | 'trainer' | 'ownerB', string>

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })
  const add = async (body: object, token = t.admin) => {
    const res = await call('POST', '/leads', token, body)
    expect(res.statusCode, res.body).toBe(201)
    return res.json() as LeadView
  }
  const list = async (query = '', token = t.admin) => (await call('GET', `/leads${query}`, token)).json() as LeadView[]

  beforeEach(async () => {
    const gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    t.owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    t.admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Desk A' }))
    t.trainer = await tokenFor(
      await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi' }),
    )
    t.ownerB = await tokenFor(
      await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }),
    )
    // Wednesday 25 Mar 2026, 9 am in India.
    ;({ app } = await startApp(ctx.db, {}, undefined, () => new Date('2026-03-25T03:30:00Z')))
  })
  afterEach(async () => {
    await app.close()
  })

  it('adds enquiries and lists open ones by follow-up date', async () => {
    const riya = await add({
      name: 'Riya Shah',
      phone: '98765 11111',
      source: 'instagram',
      interest: 'Weight loss, 3 months',
      followUpOn: '2026-03-27',
    })
    expect(riya).toMatchObject({
      name: 'Riya Shah',
      phone: '+919876511111',
      source: 'instagram',
      status: 'new',
      followUpOn: '2026-03-27',
      createdByName: 'Desk A',
      duplicates: [],
    })
    await add({ name: 'Kabir', phone: '9876522222', source: 'walk_in', followUpOn: '2026-03-24' })
    await add({ name: 'Meera', phone: '9876533333', source: 'referral' })

    expect((await list()).map((l) => l.name)).toEqual(['Kabir', 'Riya Shah', 'Meera'])
    expect((await list('?q=riy')).map((l) => l.name)).toEqual(['Riya Shah'])
    expect((await list('?q=22222')).map((l) => l.name)).toEqual(['Kabir'])

    const bad = await call('POST', '/leads', t.admin, { name: 'X', phone: '123', source: 'tv' })
    expect(bad.statusCode).toBe(400)
  })

  it('statuses: contacted → trial → lost needs a reason; reopening clears it', async () => {
    const lead = await add({ name: 'Kabir', phone: '9876522222', source: 'walk_in' })
    const patch = (body: object) => call('PATCH', `/leads/${lead.id}`, t.admin, body)

    expect(
      (await patch({ status: 'contacted', followUpOn: '2026-03-28', note: 'Call after 6 pm' })).json(),
    ).toMatchObject({
      status: 'contacted',
      followUpOn: '2026-03-28',
      note: 'Call after 6 pm',
    })
    expect((await patch({ status: 'lost' })).json().error.message).toBe('Say why they didn’t join')
    expect((await patch({ status: 'lost', lostReason: 'Too far from home' })).json()).toMatchObject({
      status: 'lost',
      lostReason: 'Too far from home',
    })
    expect((await list()).map((l) => l.id)).not.toContain(lead.id)
    expect((await list('?filter=lost')).map((l) => l.id)).toEqual([lead.id])

    expect((await patch({ status: 'trial', followUpOn: null })).json()).toMatchObject({
      status: 'trial',
      lostReason: null,
      followUpOn: null,
    })
    // Joining only happens by adding them as a member.
    expect((await patch({ status: 'joined' })).statusCode).toBe(400)
  })

  it('warns about a number that is already a member or another enquiry', async () => {
    const member = (await call('POST', '/members', t.admin, { name: 'Asha', phone: '9876500001' })).json()
    const first = await add({ name: 'Kabir', phone: '9876522222', source: 'walk_in' })

    expect((await call('GET', '/leads/check-phone?phone=9876500001', t.admin)).json()).toEqual({
      duplicates: [{ kind: 'member', id: member.id, name: 'Asha' }],
    })
    const again = await add({ name: 'Kabir S', phone: '+91 98765 22222', source: 'phone_call' })
    expect(again.duplicates).toEqual([{ kind: 'lead', id: first.id, name: 'Kabir' }])
    expect((await call('GET', '/leads/check-phone?phone=9000000000', t.admin)).json()).toEqual({ duplicates: [] })
  })

  it('adding them as a member marks the enquiry Joined and links it', async () => {
    const lead = await add({ name: 'Riya Shah', phone: '9876511111', source: 'instagram', followUpOn: '2026-03-25' })
    const lost = await add({ name: 'Riya old', phone: '9876511111', source: 'google' })
    await call('PATCH', `/leads/${lost.id}`, t.admin, { status: 'lost', lostReason: 'Price' })

    const member = (await call('POST', '/members', t.admin, { name: 'Riya Shah', phone: '9876511111' })).json()
    const joined = (await list('?filter=joined'))[0]
    expect(joined).toMatchObject({ id: lead.id, status: 'joined', memberId: member.id, followUpOn: null })
    // The member it became isn't a "duplicate"; the older enquiry still is.
    expect(joined?.duplicates).toEqual([{ kind: 'lead', id: lost.id, name: 'Riya old' }])
    // A lead already marked lost stays lost.
    expect((await list('?filter=lost')).map((l) => l.id)).toEqual([lost.id])
    expect((await call('PATCH', `/leads/${lead.id}`, t.admin, { note: 'x' })).statusCode).toBe(409)
  })

  it('the dashboard shows follow-ups due today and overdue', async () => {
    await add({ name: 'Overdue', phone: '9876500011', source: 'walk_in', followUpOn: '2026-03-20' })
    await add({ name: 'Today', phone: '9876500012', source: 'walk_in', followUpOn: '2026-03-25', interest: 'PT' })
    await add({ name: 'Later', phone: '9876500013', source: 'walk_in', followUpOn: '2026-03-26' })
    await add({ name: 'No date', phone: '9876500014', source: 'walk_in' })
    const gone = await add({ name: 'Gone', phone: '9876500015', source: 'walk_in', followUpOn: '2026-03-21' })
    await call('PATCH', `/leads/${gone.id}`, t.admin, { status: 'lost', lostReason: 'Joined elsewhere' })

    const d = (await call('GET', '/dashboard', t.admin)).json() as DashboardView
    expect(d.leads.open).toBe(4)
    expect(d.leads.followUps.map((l) => [l.name, l.followUpOn])).toEqual([
      ['Overdue', '2026-03-20'],
      ['Today', '2026-03-25'],
    ])
    expect(d.leads.followUps[1]).toMatchObject({ phone: '+919876500012', status: 'new', interest: 'PT' })
  })

  it('only owners and admins; another gym never sees them', async () => {
    const lead = await add({ name: 'Riya Shah', phone: '9876511111', source: 'instagram' })
    expect((await call('GET', '/leads', t.trainer)).statusCode).toBe(403)
    expect(
      (await call('POST', '/leads', t.trainer, { name: 'X Y', phone: '9876599999', source: 'other' })).statusCode,
    ).toBe(403)

    expect(await list('?filter=all', t.ownerB)).toEqual([])
    expect((await call('PATCH', `/leads/${lead.id}`, t.ownerB, { status: 'contacted' })).statusCode).toBe(404)
    expect((await call('GET', '/leads/check-phone?phone=9876511111', t.ownerB)).json()).toEqual({ duplicates: [] })
    expect((await list('', t.owner))[0]).toMatchObject({ id: lead.id, status: 'new' })
  })
})
