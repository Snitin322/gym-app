import type { FastifyBaseLogger } from 'fastify'
import { ErrorCode, type OtpRequestResponse } from '@onthec/shared'
import type { Db } from '../../db/unscoped'
import type { Env } from '../../env'
import { AppError } from '../../errors'
import { hmacSha256, randomOtp, safeEqual } from '../../lib/crypto'
import type { OtpSender } from './senders'

export const OTP_TTL_SECONDS = 5 * 60
export const OTP_MAX_SENDS = 3
export const OTP_SEND_WINDOW_MS = 15 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5

export interface OtpDeps {
  db: Db
  env: Env
  sender: OtpSender
  log: FastifyBaseLogger
}

function hashOtp(env: Env, phone: string, code: string) {
  return hmacSha256(env.OTP_SECRET, `${phone}:${code}`)
}

/** Test numbers work only while codes are not really delivered (OTP_PROVIDER=console). */
function testCodeFor(env: Env, phone: string): string | undefined {
  if (env.OTP_PROVIDER !== 'console') return undefined
  return env.OTP_TEST_PHONES.includes(phone) ? env.OTP_TEST_CODE : undefined
}

// The unscoped client is needed here: a login code is requested before we know the gym.
export async function requestOtp({ db, env, sender, log }: OtpDeps, phone: string): Promise<OtpRequestResponse> {
  const accounts = await db.user.count({ where: { phone, deletedAt: null } })
  if (accounts === 0) {
    throw new AppError(
      404,
      ErrorCode.ACCOUNT_NOT_FOUND,
      'This number is not registered with the gym. Please contact the front desk.',
    )
  }

  const recent = await db.otpChallenge.count({
    where: { phone, createdAt: { gte: new Date(Date.now() - OTP_SEND_WINDOW_MS) } },
  })
  if (recent >= OTP_MAX_SENDS) {
    throw new AppError(429, ErrorCode.OTP_RATE_LIMITED, 'Too many codes requested. Please wait 15 minutes and try again.')
  }

  const testCode = testCodeFor(env, phone)
  const code = testCode ?? randomOtp()
  const challenge = await db.otpChallenge.create({
    data: { phone, codeHash: hashOtp(env, phone, code), expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) },
  })
  if (!testCode) {
    try {
      await sender.send(phone, code, log)
    } catch (error) {
      // A code that never arrived must not count towards the per-phone limit.
      await db.otpChallenge.delete({ where: { id: challenge.id } })
      throw error
    }
  }

  return { expiresInSeconds: OTP_TTL_SECONDS }
}

/** Checks the code and returns every active account for this phone (one per gym). */
export async function verifyOtp({ db, env }: Pick<OtpDeps, 'db' | 'env'>, phone: string, code: string) {
  const challenge = await db.otpChallenge.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  if (!challenge) {
    throw new AppError(400, ErrorCode.OTP_INVALID, 'This code has expired. Please request a new one.')
  }

  // Count the attempt first and atomically, so parallel guesses can't exceed the limit.
  const { count: allowed } = await db.otpChallenge.updateMany({
    where: { id: challenge.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  })
  if (allowed === 0) {
    throw new AppError(429, ErrorCode.OTP_TOO_MANY_ATTEMPTS, 'Too many wrong attempts. Please request a new code.')
  }
  if (!safeEqual(challenge.codeHash, hashOtp(env, phone, code))) {
    throw new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.')
  }

  const { count: consumed } = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  if (consumed === 0) {
    throw new AppError(400, ErrorCode.OTP_INVALID, 'This code has already been used. Please request a new one.')
  }

  const accounts = await db.user.findMany({
    where: { phone, deletedAt: null },
    select: { id: true, gymId: true, role: true, gym: { select: { id: true, name: true } } },
    orderBy: { gym: { name: 'asc' } },
  })
  if (accounts.length === 0) {
    throw new AppError(404, ErrorCode.ACCOUNT_NOT_FOUND, 'This number is not registered with the gym.')
  }
  return accounts
}
