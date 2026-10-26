import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import { Prisma } from '@prisma/client'
import { CURRENT_NOTICE_VERSION } from '@onthec/shared'
import { TENANT_MODELS, TenantViolationError, forTenant } from '../src/db/tenant'
import { ACCESS_AUDIENCE, JWT_ISSUER } from '../src/services/auth/tokens'
import {
  TEST_JWT_SECRET,
  bearer,
  createGym,
  createUser,
  login,
  startApp,
  testDatabaseUrl,
  useTestDatabase,
  type CapturedOtps,
} from './helpers'

describe('TENANT_MODELS', () => {
  it('lists exactly the models that have a gymId column', () => {
    const withGymId = Prisma.dmmf.datamodel.models
      .filter((model) => model.fields.some((field) => field.name === 'gymId'))
      .map((model) => model.name)
      .sort()
    expect(withGymId).toEqual([...TENANT_MODELS].sort())
  })
})

describe.skipIf(!testDatabaseUrl)('tenant isolation', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let otps: CapturedOtps

  // Gym A: admin, member, trainer. Gym B: owner, member.
  const people = {
    adminA: '+919800000001',
    memberA: '+919800000002',
    trainerA: '+919800000003',
    ownerB: '+919800000011',
    memberB: '+919800000012',
  }
  let gymA: { id: string }
  let gymB: { id: string }
  let memberBId: string
  let memberAId: string

  beforeEach(async () => {
    gymA = await createGym(ctx.db, 'Alpha Gym')
    gymB = await createGym(ctx.db, 'Beta Gym')
    await createUser(ctx.db, gymA.id, { phone: people.adminA, name: 'A Admin', role: 'admin' })
    memberAId = (await createUser(ctx.db, gymA.id, { phone: people.memberA, name: 'A Member' })).id
    await createUser(ctx.db, gymA.id, { phone: people.trainerA, name: 'A Trainer', role: 'trainer' })
    await createUser(ctx.db, gymB.id, { phone: people.ownerB, name: 'B Owner', role: 'owner' })
    memberBId = (await createUser(ctx.db, gymB.id, { phone: people.memberB, name: 'B Member' })).id
    ;({ app, otps } = await startApp(ctx.db))
  })
  afterEach(async () => {
    await app.close()
  })

  const get = (url: string, accessToken: string) => app.inject({ method: 'GET', url, headers: bearer(accessToken) })

  describe('authentication', () => {
    it('requires a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/me' })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('UNAUTHENTICATED')
    })

    it('rejects garbage, expired and wrongly signed tokens', async () => {
      const sign = (secret: string, expiresAt: number) =>
        new SignJWT({ gym: gymA.id, role: 'admin' })
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject(memberAId)
          .setIssuer(JWT_ISSUER)
          .setAudience(ACCESS_AUDIENCE)
          .setExpirationTime(expiresAt)
          .sign(new TextEncoder().encode(secret))
      const now = Math.floor(Date.now() / 1000)

      const tokens = [
        'garbage',
        await sign(TEST_JWT_SECRET, now - 60),
        await sign('another-secret-that-is-at-least-32-characters', now + 600),
      ]
      for (const token of tokens) {
        expect((await get('/api/v1/me', token)).statusCode).toBe(401)
      }
    })
  })

  describe('roles', () => {
    it('stops members and trainers from listing users', async () => {
      for (const phone of [people.memberA, people.trainerA]) {
        const { accessToken } = await login(app, otps, phone)
        const res = await get('/api/v1/users', accessToken)
        expect(res.statusCode).toBe(403)
        expect(res.json().error.code).toBe('FORBIDDEN')
      }
    })
  })

  describe('gym A cannot see gym B', () => {
    it('lists only the caller’s own gym', async () => {
      const { accessToken } = await login(app, otps, people.adminA)
      const names = (await get('/api/v1/users', accessToken)).json().map((u: { name: string }) => u.name)
      expect(names).toEqual(['A Admin', 'A Member', 'A Trainer'])

      const owner = await login(app, otps, people.ownerB)
      const namesB = (await get('/api/v1/users', owner.accessToken)).json().map((u: { name: string }) => u.name)
      expect(namesB).toEqual(['B Member', 'B Owner'])
    })

    it('returns 404 for another gym’s user, exactly like a missing one', async () => {
      const { accessToken } = await login(app, otps, people.adminA)

      expect((await get(`/api/v1/users/${memberAId}`, accessToken)).statusCode).toBe(200)

      const other = await get(`/api/v1/users/${memberBId}`, accessToken)
      const missing = await get(`/api/v1/users/${crypto.randomUUID()}`, accessToken)
      expect(other.statusCode).toBe(404)
      expect(other.json()).toEqual(missing.json())
    })

    it('rejects malformed ids', async () => {
      const { accessToken } = await login(app, otps, people.adminA)
      expect((await get('/api/v1/users/not-a-uuid', accessToken)).statusCode).toBe(400)
    })
  })

  describe('consent', () => {
    it('is required until the current notice is accepted', async () => {
      const { accessToken, body } = await login(app, otps, people.memberA)
      expect(body.user.consentRequired).toBe(true)

      const wrongVersion = await app.inject({
        method: 'POST',
        url: '/api/v1/me/consent',
        headers: bearer(accessToken),
        payload: { noticeVersion: 'old' },
      })
      expect(wrongVersion.statusCode).toBe(400)

      const accepted = await app.inject({
        method: 'POST',
        url: '/api/v1/me/consent',
        headers: bearer(accessToken),
        payload: { noticeVersion: CURRENT_NOTICE_VERSION },
      })
      expect(accepted.statusCode).toBe(200)
      expect(accepted.json().consentRequired).toBe(false)

      const consents = await ctx.db.consent.findMany({ where: { userId: memberAId } })
      expect(consents.map((c) => c.purpose).sort()).toEqual(['privacy', 'terms'])
      expect(consents.every((c) => c.gymId === gymA.id)).toBe(true)
    })
  })

  describe('tenant-scoped client', () => {
    it('filters reads, counts and updates to one gym', async () => {
      const tenantA = forTenant(ctx.db, gymA.id)

      expect(await tenantA.user.count()).toBe(3)
      expect((await tenantA.user.findMany()).every((u) => u.gymId === gymA.id)).toBe(true)
      expect(await tenantA.user.findUnique({ where: { id: memberBId } })).toBeNull()
      // Naming the other gym explicitly must not be rewritten into "my gym".
      expect(await tenantA.user.findMany({ where: { gymId: gymB.id } })).toEqual([])
      expect(
        await tenantA.user.findUnique({ where: { gymId_phone: { gymId: gymB.id, phone: people.memberB } } }),
      ).toBeNull()

      await expect(tenantA.user.update({ where: { id: memberBId }, data: { name: 'Hacked' } })).rejects.toMatchObject({
        code: 'P2025',
      })
      const { count } = await tenantA.user.updateMany({ data: { name: 'Renamed' } })
      expect(count).toBe(3)
      expect((await ctx.db.user.findUniqueOrThrow({ where: { id: memberBId } })).name).toBe('B Member')
    })

    it('stamps the gym on create and refuses another gym’s id', async () => {
      const tenantA = forTenant(ctx.db, gymA.id)
      const base = { userId: memberAId, purpose: 'terms' as const, noticeVersion: 'v-test' }

      const created = await tenantA.consent.create({ data: { ...base, gymId: gymA.id } })
      expect(created.gymId).toBe(gymA.id)

      await expect(tenantA.consent.create({ data: { ...base, gymId: gymB.id } })).rejects.toBeInstanceOf(
        TenantViolationError,
      )
      await expect(tenantA.user.updateMany({ data: { gymId: gymB.id } })).rejects.toBeInstanceOf(TenantViolationError)
    })

    it('shows only the session’s own gym and cannot create gyms', async () => {
      const tenantA = forTenant(ctx.db, gymA.id)

      expect((await tenantA.gym.findMany()).map((g) => g.id)).toEqual([gymA.id])
      expect(await tenantA.gym.findUnique({ where: { id: gymB.id } })).toBeNull()
      await expect(tenantA.gym.create({ data: { name: 'Sneaky', slug: 'sneaky' } })).rejects.toBeInstanceOf(
        TenantViolationError,
      )
    })
  })
})
