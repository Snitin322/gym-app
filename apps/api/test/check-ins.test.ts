import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { CheckInToReview, CheckInView, MemberCheckIns, MemberDetail, MyCheckIns } from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

/** The first bytes of a JPEG, enough for the type check. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1])

describe.skipIf(!testDatabaseUrl)('Weekly check-ins', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let clock: Date
  const t = {} as Record<'owner' | 'admin' | 'ravi' | 'sita' | 'asha' | 'bina' | 'ownerB', string>
  let raviId: string
  let asha: MemberDetail
  let bina: MemberDetail
  let memberB: MemberDetail

  const call = (method: 'GET' | 'PUT' | 'POST', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })
  const upload = (id: string, pose: string, token: string, body: Buffer = JPEG, type = 'image/jpeg') =>
    app.inject({
      method: 'PUT',
      url: `/api/v1/me/check-ins/${id}/photos/${pose}`,
      headers: { ...bearer(token), 'content-type': type },
      payload: body,
    })

  beforeEach(async () => {
    const gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    t.owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    t.admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Desk A' }))
    const ravi = await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi' })
    raviId = ravi.id
    t.ravi = await tokenFor(ravi)
    t.sita = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111104', role: 'trainer', name: 'Sita' }))
    const ownerB = await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' })
    t.ownerB = await tokenFor(ownerB)

    clock = new Date('2026-03-18T06:30:00Z') // Wed 18 Mar, noon in India; the week starts Mon 16 Mar
    ;({ app } = await startApp(ctx.db, {}, undefined, () => clock))

    asha = (await call('POST', '/members', t.admin, { name: 'Asha', phone: '9876500001' })).json()
    bina = (await call('POST', '/members', t.admin, { name: 'Bina', phone: '9876500002' })).json()
    memberB = (await call('POST', '/members', t.ownerB, { name: 'Bela', phone: '9876500009' })).json()
    t.asha = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: asha.userId } }))
    t.bina = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: bina.userId } }))
    await call('PUT', `/members/${asha.id}/coach`, t.admin, { coachId: raviId })
  })
  afterEach(async () => {
    await app.close()
  })

  it('a member sends this week’s check-in with photos, and can change it until the coach replies', async () => {
    const before = (await call('GET', '/me/check-ins', t.asha)).json() as MyCheckIns
    expect(before).toMatchObject({ weekOf: '2026-03-16', current: null, history: [], photosEnabled: true })
    expect(before.coach?.name).toBe('Ravi')

    const sent = await call('PUT', '/me/check-ins/current', t.asha, {
      weightKg: 72.04,
      waistCm: 84,
      note: 'Hungry at night',
    })
    expect(sent.statusCode).toBe(200)
    const checkIn = sent.json() as CheckInView
    expect(checkIn).toMatchObject({
      weekOf: '2026-03-16',
      weightKg: 72,
      waistCm: 84,
      bodyFatPct: null,
      note: 'Hungry at night',
    })

    // Sending again the same week updates it.
    const again = (await call('PUT', '/me/check-ins/current', t.asha, { weightKg: 71.8 })).json() as CheckInView
    expect(again.id).toBe(checkIn.id)
    expect(again.waistCm).toBeNull()

    // Photos: stored privately, shown through a signed link that works only unchanged.
    const withPhoto = (await upload(checkIn.id, 'front', t.asha)).json() as CheckInView
    const link = withPhoto.photos.front as string
    expect(link).toMatch(/^\/api\/v1\/files\/.+\?expires=\d+&sig=/)
    const photo = await app.inject({ method: 'GET', url: link })
    expect(photo.statusCode).toBe(200)
    expect(photo.headers['content-type']).toBe('image/jpeg')
    expect((await app.inject({ method: 'GET', url: link.replace(/sig=.*/, 'sig=forged') })).statusCode).toBe(404)

    // Not an image, or someone else's check-in.
    expect((await upload(checkIn.id, 'left', t.asha, Buffer.from('not a photo'))).json().error.code).toBe('BAD_PHOTO')
    expect((await upload(checkIn.id, 'left', t.bina)).statusCode).toBe(404)

    // The coach replies; then it's locked.
    const reviewed = await call('POST', `/check-ins/${checkIn.id}/review`, t.ravi, {
      reply: 'Good week. Add 100 g curd at night.',
    })
    expect(reviewed.json()).toMatchObject({ coachReply: 'Good week. Add 100 g curd at night.', reviewedByName: 'Ravi' })
    expect((await call('PUT', '/me/check-ins/current', t.asha, { weightKg: 70 })).json().error.code).toBe(
      'CHECK_IN_REVIEWED',
    )
    expect((await upload(checkIn.id, 'right', t.asha)).json().error.code).toBe('CHECK_IN_REVIEWED')

    // Next week is a new check-in; the history keeps both, newest first.
    clock = new Date('2026-03-23T06:30:00Z')
    await call('PUT', '/me/check-ins/current', t.asha, { weightKg: 71.2 })
    const mine = (await call('GET', '/me/check-ins', t.asha)).json() as MyCheckIns
    expect(mine.weekOf).toBe('2026-03-23')
    expect(mine.history.map((c) => [c.weekOf, c.weightKg])).toEqual([
      ['2026-03-23', 71.2],
      ['2026-03-16', 71.8],
    ])
    // Last week's photos can't be added to any more.
    expect((await upload(checkIn.id, 'left', t.asha)).statusCode).toBe(409)
  })

  it('the coach sees check-ins waiting for a reply; others can’t see them', async () => {
    const a = (await call('PUT', '/me/check-ins/current', t.asha, { weightKg: 72 })).json() as CheckInView
    await call('PUT', '/me/check-ins/current', t.bina, { weightKg: 60 }) // Bina has no coach

    const queue = (await call('GET', '/coach/check-ins', t.ravi)).json() as CheckInToReview[]
    expect(queue.map((q) => [q.member.name, q.checkIn.weightKg])).toEqual([['Asha', 72]])
    expect((await call('GET', '/coach/check-ins', t.sita)).json()).toEqual([])

    const list = (await call('GET', `/members/${asha.id}/check-ins`, t.ravi)).json() as MemberCheckIns
    expect(list.checkIns).toHaveLength(1)
    expect((await call('GET', `/members/${asha.id}/check-ins`, t.owner)).statusCode).toBe(200)
    expect((await call('GET', `/members/${asha.id}/check-ins`, t.sita)).statusCode).toBe(404)
    expect((await call('GET', `/members/${asha.id}/check-ins`, t.admin)).statusCode).toBe(403)
    expect((await call('POST', `/check-ins/${a.id}/review`, t.sita, { reply: 'Hi' })).statusCode).toBe(404)
    expect((await call('POST', `/check-ins/${a.id}/review`, t.asha, { reply: 'Hi' })).statusCode).toBe(403)

    await call('POST', `/check-ins/${a.id}/review`, t.ravi, { reply: 'Nice' })
    expect((await call('GET', '/coach/check-ins', t.ravi)).json()).toEqual([])
  })

  it('validates check-ins and needs a member', async () => {
    expect((await call('PUT', '/me/check-ins/current', t.asha, {})).statusCode).toBe(400)
    expect((await call('PUT', '/me/check-ins/current', t.asha, { weightKg: 500 })).statusCode).toBe(400)
    expect((await call('PUT', '/me/check-ins/current', t.asha, { weightKg: 70, waistCm: 2 })).statusCode).toBe(400)
    expect((await call('GET', '/me/check-ins', t.ravi)).json().error.code).toBe('NOT_A_MEMBER')
  })

  it('photos are switched off when no storage is set up', async () => {
    await app.close()
    ;({ app } = await startAppWithoutPhotos())
    const mine = (await call('GET', '/me/check-ins', t.asha)).json() as MyCheckIns
    expect(mine.photosEnabled).toBe(false)
    const c = (await call('PUT', '/me/check-ins/current', t.asha, { weightKg: 70 })).json() as CheckInView
    expect((await upload(c.id, 'front', t.asha)).json().error.code).toBe('PHOTOS_NOT_SET_UP')
  })

  async function startAppWithoutPhotos() {
    const { buildApp } = await import('../src/app')
    const { testEnv, noopSender } = await import('./helpers')
    return {
      app: await buildApp({ env: testEnv(), db: ctx.db, otpSender: noopSender, now: () => clock, photoStore: null }),
    }
  }

  it('gym A cannot read or reply to gym B’s check-ins', async () => {
    const b = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: memberB.userId } }))
    const checkInB = (await call('PUT', '/me/check-ins/current', b, { weightKg: 65 })).json() as CheckInView

    expect((await call('GET', `/members/${memberB.id}/check-ins`, t.owner)).statusCode).toBe(404)
    expect((await call('POST', `/check-ins/${checkInB.id}/review`, t.owner, { reply: 'Hi' })).statusCode).toBe(404)
    expect((await upload(checkInB.id, 'front', t.asha)).statusCode).toBe(404)
    expect((await call('GET', `/members/${memberB.id}/check-ins`, t.ownerB)).statusCode).toBe(200)
  })
})
