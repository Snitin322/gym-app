import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { ClientProfileInput, ClientProfileView, MemberDetail, MemberSummary, TrainerClient } from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

const profile: ClientProfileInput = {
  dateOfBirth: '1994-06-15',
  sex: 'female',
  heightCm: 162,
  startWeightKg: 72.04,
  bodyFatPct: 31.5,
  goal: 'Lose 8 kg before March',
  dietPreference: 'veg',
  medicalConditions: 'Thyroid (hypo)',
  injuries: 'Old knee injury, right',
  foodAllergies: 'Peanuts',
  medicines: 'Thyroxine 50 mcg',
  lifestyle: 'Desk job, sleeps 6 h',
  trainingExperience: '',
}

describe.skipIf(!testDatabaseUrl)('Coaching: coaches and health profiles', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  const t = {} as Record<'owner' | 'admin' | 'ravi' | 'sita' | 'asha' | 'bina' | 'ownerB' | 'trainerB', string>
  const id = {} as Record<'owner' | 'admin' | 'ravi' | 'sita' | 'trainerB', string>
  let asha: MemberDetail
  let bina: MemberDetail
  let memberB: MemberDetail

  const call = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  beforeEach(async () => {
    const gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    const owner = await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' })
    const admin = await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Desk A' })
    const ravi = await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi' })
    const sita = await createUser(ctx.db, gymA, { phone: '+919811111104', role: 'trainer', name: 'Sita' })
    const ownerB = await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' })
    const trainerB = await createUser(ctx.db, gymB, { phone: '+919822222203', role: 'trainer', name: 'Trainer B' })
    Object.assign(id, { owner: owner.id, admin: admin.id, ravi: ravi.id, sita: sita.id, trainerB: trainerB.id })
    t.owner = await tokenFor(owner)
    t.admin = await tokenFor(admin)
    t.ravi = await tokenFor(ravi)
    t.sita = await tokenFor(sita)
    t.ownerB = await tokenFor(ownerB)
    t.trainerB = await tokenFor(trainerB)
    ;({ app } = await startApp(ctx.db))

    asha = (await call('POST', '/members', t.admin, { name: 'Asha', phone: '9876500001' })).json()
    bina = (await call('POST', '/members', t.admin, { name: 'Bina', phone: '9876500002' })).json()
    memberB = (await call('POST', '/members', t.ownerB, { name: 'Bela', phone: '9876500009' })).json()
    t.asha = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: asha.userId } }))
    t.bina = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: bina.userId } }))
  })
  afterEach(async () => {
    await app.close()
  })

  const setCoach = (member: MemberDetail, coachId: string | null, token = t.admin) =>
    call('PUT', `/members/${member.id}/coach`, token, { coachId })

  it('the desk assigns a trainer or the owner as coach, and the member list shows it', async () => {
    expect((await setCoach(asha, id.ravi)).statusCode).toBe(204)
    expect((await setCoach(bina, id.owner, t.owner)).statusCode).toBe(204)

    const detail = (await call('GET', `/members/${asha.id}`, t.admin)).json() as MemberDetail
    expect(detail.coach).toEqual({ id: id.ravi, name: 'Ravi' })

    // The owner's "My clients" filter.
    const mine = (await call('GET', '/members?filter=my_clients', t.owner)).json() as MemberSummary[]
    expect(mine.map((m) => m.name)).toEqual(['Bina'])
    // The admin coaches no one.
    expect((await call('GET', '/members?filter=my_clients', t.admin)).json()).toEqual([])

    // Clearing the coach.
    expect((await setCoach(asha, null)).statusCode).toBe(204)
    expect(((await call('GET', `/members/${asha.id}`, t.admin)).json() as MemberDetail).coach).toBeNull()
  })

  it('only trainers and the owner can be coaches, and only the desk assigns them', async () => {
    expect((await setCoach(asha, id.admin)).json().error.code).toBe('NOT_A_COACH')
    expect((await setCoach(asha, bina.userId)).json().error.code).toBe('NOT_A_COACH')
    expect((await setCoach(asha, '00000000-0000-4000-8000-000000000000')).json().error.code).toBe('NOT_A_COACH')
    expect((await setCoach(asha, id.ravi, t.ravi)).statusCode).toBe(403)
    expect((await setCoach(asha, id.ravi, t.asha)).statusCode).toBe(403)
  })

  it('a coach sees their clients in Clients and can manage their workout plan', async () => {
    await setCoach(asha, id.ravi)
    const clients = (await call('GET', '/trainer/clients', t.ravi)).json() as TrainerClient[]
    expect(clients).toEqual([
      expect.objectContaining({ memberId: asha.id, name: 'Asha', coached: true, purchases: [] }),
    ])
    expect((await call('GET', '/trainer/clients', t.sita)).json()).toEqual([])

    expect((await call('POST', `/members/${asha.id}/workout-plan`, t.ravi, {})).statusCode).toBe(200)
    expect((await call('GET', `/members/${asha.id}/workout-plan`, t.sita)).statusCode).toBe(404)
  })

  it('the coach and the owner read and save the health profile; admins and other trainers cannot', async () => {
    await setCoach(asha, id.ravi)

    const saved = await call('PUT', `/members/${asha.id}/profile`, t.ravi, profile)
    expect(saved.statusCode).toBe(200)
    const view = saved.json() as ClientProfileView
    expect(view.coach).toEqual({ id: id.ravi, name: 'Ravi' })
    expect(view.profile).toMatchObject({
      dateOfBirth: '1994-06-15',
      heightCm: 162,
      startWeightKg: 72, // rounded to one decimal place
      bodyFatPct: 31.5,
      foodAllergies: 'Peanuts',
      trainingExperience: null, // empty clears
      updatedByName: 'Ravi',
    })
    // The member hasn't agreed in the app yet.
    expect(view.healthConsentAt).toBeNull()

    const ownerView = (await call('GET', `/members/${asha.id}/profile`, t.owner)).json() as ClientProfileView
    expect(ownerView.profile?.medicines).toBe('Thyroxine 50 mcg')

    expect((await call('GET', `/members/${asha.id}/profile`, t.sita)).statusCode).toBe(404)
    expect((await call('PUT', `/members/${asha.id}/profile`, t.sita, profile)).statusCode).toBe(404)
    expect((await call('GET', `/members/${asha.id}/profile`, t.admin)).statusCode).toBe(403)
    expect((await call('GET', `/members/${asha.id}/profile`, t.asha)).statusCode).toBe(403)
    expect((await call('GET', `/members/${bina.id}/profile`, t.ravi)).statusCode).toBe(404)
  })

  it('a member saves their own details after agreeing, and can withdraw', async () => {
    await setCoach(asha, id.ravi)
    const empty = (await call('GET', '/me/profile', t.asha)).json() as ClientProfileView
    expect(empty).toEqual({
      member: { id: asha.id, name: 'Asha' },
      coach: { id: id.ravi, name: 'Ravi' },
      profile: null,
      healthConsentAt: null,
    })

    const refused = await call('PUT', '/me/profile', t.asha, profile)
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error.code).toBe('HEALTH_CONSENT_REQUIRED')

    const saved = (
      await call('PUT', '/me/profile', t.asha, { ...profile, healthConsent: true })
    ).json() as ClientProfileView
    expect(saved.healthConsentAt).not.toBeNull()
    expect(saved.profile?.updatedByName).toBe('Asha')
    // Later saves don't need the box again.
    expect((await call('PUT', '/me/profile', t.asha, { ...profile, goal: 'Run 5 km' })).json().profile.goal).toBe(
      'Run 5 km',
    )
    // The coach sees that the member agreed.
    expect(
      ((await call('GET', `/members/${asha.id}/profile`, t.ravi)).json() as ClientProfileView).healthConsentAt,
    ).not.toBeNull()

    const withdrawn = (await call('DELETE', '/me/profile', t.asha)).json() as ClientProfileView
    expect(withdrawn.profile).toBeNull()
    expect(withdrawn.healthConsentAt).toBeNull()
    expect(
      await ctx.db.consent.count({ where: { userId: asha.userId, purpose: 'health', withdrawnAt: { not: null } } }),
    ).toBe(1)
  })

  it('validates the profile', async () => {
    await setCoach(asha, id.ravi)
    const bad = await call('PUT', `/members/${asha.id}/profile`, t.ravi, { ...profile, heightCm: 20, sex: 'robot' })
    expect(bad.statusCode).toBe(400)
    const missing = await call('PUT', `/members/${asha.id}/profile`, t.ravi, { heightCm: 170 })
    expect(missing.statusCode).toBe(400)
    expect((await call('GET', '/me/profile', t.ravi)).json().error.code).toBe('NOT_A_MEMBER')
  })

  it('gym A cannot coach, read or change gym B’s members', async () => {
    // Another gym's trainer can't be a coach here, and another gym's member can't be given one.
    expect((await setCoach(asha, id.trainerB)).json().error.code).toBe('NOT_A_COACH')
    expect((await setCoach(memberB, id.ravi)).statusCode).toBe(404)

    await call('PUT', `/members/${memberB.id}/coach`, t.ownerB, { coachId: id.trainerB })
    await call('PUT', `/members/${memberB.id}/profile`, t.trainerB, profile)

    expect((await call('GET', `/members/${memberB.id}/profile`, t.owner)).statusCode).toBe(404)
    expect((await call('PUT', `/members/${memberB.id}/profile`, t.owner, profile)).statusCode).toBe(404)
    expect((await call('GET', '/members?filter=my_clients', t.trainerB)).statusCode).toBe(403)
    expect((await call('GET', '/trainer/clients', t.ravi)).json()).toEqual([])
    // Gym B's own owner still sees it.
    expect(
      ((await call('GET', `/members/${memberB.id}/profile`, t.ownerB)).json() as ClientProfileView).profile?.goal,
    ).toBe(profile.goal)
  })
})
