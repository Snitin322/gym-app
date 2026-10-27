import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { AppError } from '../src/errors'
import { OTP_MAX_ATTEMPTS, OTP_MAX_SENDS } from '../src/services/auth/otp'
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from '../src/routes/auth'
import {
  bearer,
  createGym,
  createUser,
  login,
  refreshCookieOf,
  startApp,
  testDatabaseUrl,
  useTestDatabase,
  type CapturedOtps,
} from './helpers'

const PHONE = '+919876543210'

describe.skipIf(!testDatabaseUrl)('phone OTP login', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  let otps: CapturedOtps
  let gymId: string

  beforeEach(async () => {
    gymId = (await createGym(ctx.db, 'Alpha Gym')).id
    ;({ app, otps } = await startApp(ctx.db))
  })
  afterEach(async () => {
    await app.close()
  })

  const requestOtp = (phone: string) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/otp/request', payload: { phone } })
  const verifyOtp = (phone: string, code: string | undefined) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { phone, code } })

  describe('requesting a code', () => {
    it('refuses unregistered numbers without sending an SMS', async () => {
      const res = await requestOtp(PHONE)

      expect(res.statusCode).toBe(404)
      expect(res.json().error.code).toBe('ACCOUNT_NOT_FOUND')
      expect(otps.sent).toHaveLength(0)
    })

    it('rejects invalid phone numbers with a message the app can show', async () => {
      const res = await requestOtp('12345')
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Enter a valid 10-digit Indian mobile number' },
      })
    })

    it('sends a code, accepts any phone format, and stores only a hash', async () => {
      await createUser(ctx.db, gymId, { phone: PHONE })

      const res = await requestOtp('98765 43210')

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ expiresInSeconds: 300, channel: 'console' })
      expect(otps.sent).toEqual([{ phone: PHONE, code: expect.stringMatching(/^\d{6}$/) }])

      const [challenge] = await ctx.db.otpChallenge.findMany()
      expect(challenge?.codeHash).toMatch(/^[0-9a-f]{64}$/)
      expect(challenge?.codeHash).not.toContain(otps.sent[0]?.code)
    })

    it(`allows at most ${OTP_MAX_SENDS} codes per number per 15 minutes`, async () => {
      await createUser(ctx.db, gymId, { phone: PHONE })
      for (let i = 0; i < OTP_MAX_SENDS; i++) expect((await requestOtp(PHONE)).statusCode).toBe(200)

      const res = await requestOtp(PHONE)

      expect(res.statusCode).toBe(429)
      expect(res.json().error.code).toBe('OTP_RATE_LIMITED')
      expect(otps.sent).toHaveLength(OTP_MAX_SENDS)
    })

    it('limits requests per IP address', async () => {
      const responses = []
      for (let i = 0; i < 21; i++) responses.push(await requestOtp(PHONE))

      expect(responses.slice(0, 20).every((res) => res.statusCode === 404)).toBe(true)
      expect(responses[20]?.statusCode).toBe(429)
      expect(responses[20]?.json().error.code).toBe('RATE_LIMITED')
    })

    it('reports a failed delivery and does not count it towards the limit', async () => {
      await createUser(ctx.db, gymId, { phone: PHONE })
      await app.close()
      const failingSender = {
        async send(): Promise<void> {
          throw new AppError(502, 'OTP_DELIVERY_FAILED', 'We could not send your code on WhatsApp.')
        },
      }
      ;({ app } = await startApp(ctx.db, {}, failingSender))

      for (let i = 0; i < OTP_MAX_SENDS + 1; i++) {
        const res = await requestOtp(PHONE)
        expect(res.statusCode).toBe(502)
        expect(res.json().error.code).toBe('OTP_DELIVERY_FAILED')
      }
      expect(await ctx.db.otpChallenge.count()).toBe(0)
    })

    it('refuses deleted accounts', async () => {
      await ctx.db.user.update({
        where: { id: (await createUser(ctx.db, gymId, { phone: PHONE })).id },
        data: { deletedAt: new Date() },
      })
      expect((await requestOtp(PHONE)).json().error.code).toBe('ACCOUNT_NOT_FOUND')
    })
  })

  describe('verifying a code', () => {
    beforeEach(async () => {
      await createUser(ctx.db, gymId, { phone: PHONE, name: 'Asha', role: 'member' })
    })

    it('logs in with the right code and sets a secure refresh cookie', async () => {
      await requestOtp(PHONE)
      const res = await verifyOtp(PHONE, otps.lastCodeFor(PHONE))

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toMatchObject({
        status: 'authenticated',
        expiresIn: 900,
        user: { name: 'Asha', phone: PHONE, role: 'member', gym: { id: gymId, name: 'Alpha Gym' }, consentRequired: true },
      })

      const cookie = res.cookies.find((c) => c.name === REFRESH_COOKIE)
      expect(cookie).toMatchObject({ httpOnly: true, path: REFRESH_COOKIE_PATH, sameSite: 'Lax' })

      const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(body.accessToken) })
      expect(me.statusCode).toBe(200)
      expect(me.json().name).toBe('Asha')
    })

    it('accepts a code only once', async () => {
      await requestOtp(PHONE)
      const code = otps.lastCodeFor(PHONE)
      expect((await verifyOtp(PHONE, code)).statusCode).toBe(200)

      const again = await verifyOtp(PHONE, code)
      expect(again.statusCode).toBe(400)
      expect(again.json().error.code).toBe('OTP_INVALID')
    })

    it(`rejects wrong codes and locks the code after ${OTP_MAX_ATTEMPTS} attempts`, async () => {
      await requestOtp(PHONE)
      const code = otps.lastCodeFor(PHONE) as string
      const wrong = code === '000000' ? '111111' : '000000'

      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        const res = await verifyOtp(PHONE, wrong)
        expect(res.statusCode).toBe(400)
        expect(res.json().error.code).toBe('OTP_INVALID')
      }

      const correctButLocked = await verifyOtp(PHONE, code)
      expect(correctButLocked.statusCode).toBe(429)
      expect(correctButLocked.json().error.code).toBe('OTP_TOO_MANY_ATTEMPTS')
    })

    it('rejects expired codes', async () => {
      await requestOtp(PHONE)
      await ctx.db.otpChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })

      const res = await verifyOtp(PHONE, otps.lastCodeFor(PHONE))
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('OTP_INVALID')
    })

    it('lets test numbers use the fixed code without sending an SMS', async () => {
      await app.close()
      ;({ app, otps } = await startApp(ctx.db, { OTP_TEST_PHONES: '98765 43210', OTP_TEST_CODE: '246810' }))

      expect((await requestOtp(PHONE)).statusCode).toBe(200)
      expect(otps.sent).toHaveLength(0)
      expect((await verifyOtp(PHONE, '246810')).json().status).toBe('authenticated')
    })
  })

  describe('a phone with accounts at two gyms', () => {
    let otherGymId: string

    beforeEach(async () => {
      otherGymId = (await createGym(ctx.db, 'Beta Gym')).id
      await createUser(ctx.db, gymId, { phone: PHONE, role: 'member' })
      await createUser(ctx.db, otherGymId, { phone: PHONE, role: 'trainer' })
      await requestOtp(PHONE)
    })

    it('chooses a gym after the code is verified', async () => {
      const verified = await verifyOtp(PHONE, otps.lastCodeFor(PHONE))
      expect(verified.json()).toMatchObject({
        status: 'select_gym',
        gyms: [
          { id: gymId, name: 'Alpha Gym' },
          { id: otherGymId, name: 'Beta Gym' },
        ],
      })
      expect(refreshCookieOf(verified)).toBeUndefined()

      const selected = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/select-gym',
        payload: { selectionToken: verified.json().selectionToken, gymId: otherGymId },
      })
      expect(selected.statusCode).toBe(200)
      expect(selected.json().user).toMatchObject({ role: 'trainer', gym: { id: otherGymId } })
      expect(refreshCookieOf(selected)).toBeTruthy()
    })

    it('refuses a gym the phone has no account at', async () => {
      const strangerGymId = (await createGym(ctx.db, 'Gamma Gym')).id
      const verified = await verifyOtp(PHONE, otps.lastCodeFor(PHONE))

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/select-gym',
        payload: { selectionToken: verified.json().selectionToken, gymId: strangerGymId },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('GYM_SELECTION_INVALID')
    })

    it('refuses a forged selection token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/select-gym',
        payload: { selectionToken: 'not-a-token', gymId: otherGymId },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('refresh and logout', () => {
    beforeEach(async () => {
      await createUser(ctx.db, gymId, { phone: PHONE })
    })

    const refresh = (token?: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: token ? { [REFRESH_COOKIE]: token } : {},
      })

    it('swaps the refresh token for a new one and issues a new access token', async () => {
      const { refreshToken } = await login(app, otps, PHONE)

      const res = await refresh(refreshToken)

      expect(res.statusCode).toBe(200)
      expect(res.json().accessToken).toEqual(expect.any(String))
      const rotated = refreshCookieOf(res)
      expect(rotated).toBeTruthy()
      expect(rotated).not.toBe(refreshToken)
      expect((await refresh(rotated)).statusCode).toBe(200)
    })

    it('ends the whole login when an old refresh token is reused', async () => {
      const { refreshToken: first } = await login(app, otps, PHONE)
      const second = refreshCookieOf(await refresh(first))

      const reuse = await refresh(first)
      expect(reuse.statusCode).toBe(401)
      expect(reuse.json().error.code).toBe('UNAUTHENTICATED')

      // The legitimate newer token is revoked too.
      expect((await refresh(second)).statusCode).toBe(401)
    })

    it('needs the cookie', async () => {
      expect((await refresh()).statusCode).toBe(401)
    })

    it('logout ends the session and clears the cookie', async () => {
      const { refreshToken } = await login(app, otps, PHONE)

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        cookies: { [REFRESH_COOKIE]: refreshToken },
      })

      expect(res.statusCode).toBe(204)
      expect(res.cookies.find((c) => c.name === REFRESH_COOKIE)?.value).toBe('')
      expect((await refresh(refreshToken)).statusCode).toBe(401)
    })
  })
})
