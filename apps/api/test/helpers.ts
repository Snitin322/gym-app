import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, expect } from 'vitest'
import type { Role } from '@onthec/shared'
import { buildApp } from '../src/app'
import { createDb, type Db } from '../src/db/unscoped'
import { loadEnv } from '../src/env'
import { REFRESH_COOKIE } from '../src/routes/auth'
import type { OtpSender } from '../src/services/auth/senders'
import { signAccessToken } from '../src/services/auth/tokens'

export const testDatabaseUrl = process.env.TEST_DATABASE_URL

export const TEST_JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long'

export function testEnv(overrides: Record<string, string> = {}) {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/unused',
    JWT_SECRET: TEST_JWT_SECRET,
    OTP_SECRET: 'test-otp-secret-that-is-at-least-32-characters-long',
    ...overrides,
  })
}

/** A stand-in for Prisma when a test only needs `SELECT 1` to succeed or fail. */
export function fakeDb(queryRaw: () => Promise<unknown>): Db {
  return { $queryRaw: queryRaw } as unknown as Db
}

export const noopSender: OtpSender = { async send() {} }

/** An OTP sender that records codes instead of sending SMS. */
export function captureOtps() {
  const sent: { phone: string; code: string }[] = []
  const sender: OtpSender = {
    async send(phone, code) {
      sent.push({ phone, code })
    },
  }
  const lastCodeFor = (phone: string) => sent.findLast((otp) => otp.phone === phone)?.code
  return { sender, sent, lastCodeFor }
}

export type CapturedOtps = ReturnType<typeof captureOtps>

/**
 * Connects to TEST_DATABASE_URL and wipes it before every test.
 * Call inside a `describe.skipIf(!testDatabaseUrl)` block.
 */
export function useTestDatabase() {
  const state = {} as { db: Db }

  beforeAll(() => {
    // Guard: never fall back to DATABASE_URL, since these tests delete data.
    if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required')
    state.db = createDb(testDatabaseUrl)
  })
  afterAll(async () => {
    await state.db?.$disconnect()
  })
  beforeEach(async () => {
    await state.db.$executeRaw`TRUNCATE TABLE consents, refresh_tokens, otp_challenges, users, gyms CASCADE`
  })

  return state
}

let gymCounter = 0

export async function createGym(db: Db, name: string) {
  gymCounter += 1
  return db.gym.create({ data: { name, slug: `test-gym-${Date.now()}-${gymCounter}` } })
}

export async function createUser(
  db: Db,
  gymId: string,
  { phone, name = 'Test User', role = 'member' }: { phone: string; name?: string; role?: Role },
) {
  return db.user.create({ data: { gymId, phone, name, role } })
}

/**
 * Builds the app with a recording OTP sender (or `otpSender` to simulate delivery problems) and,
 * optionally, a fixed clock for date rules.
 */
export async function startApp(
  db: Db,
  envOverrides: Record<string, string> = {},
  otpSender?: OtpSender,
  now?: () => Date,
) {
  const otps = captureOtps()
  const app = await buildApp({ env: testEnv(envOverrides), db, otpSender: otpSender ?? otps.sender, now })
  return { app, otps }
}

/** An access token for a user, without going through OTP (for tests of other endpoints). */
export function tokenFor(user: { id: string; gymId: string; role: Role }) {
  return signAccessToken(testEnv(), { userId: user.id, gymId: user.gymId, role: user.role })
}

export function refreshCookieOf(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.find((cookie) => cookie.name === REFRESH_COOKIE)?.value
}

/** Full OTP login for a phone with exactly one account. Returns the tokens. */
export async function login(app: FastifyInstance, otps: CapturedOtps, phone: string) {
  const requested = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/request', payload: { phone } })
  expect(requested.statusCode).toBe(200)

  const code = otps.lastCodeFor(phone)
  const verified = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { phone, code } })
  expect(verified.statusCode).toBe(200)
  expect(verified.json().status).toBe('authenticated')

  return {
    accessToken: verified.json().accessToken as string,
    refreshToken: refreshCookieOf(verified) as string,
    body: verified.json(),
  }
}

export function bearer(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` }
}
