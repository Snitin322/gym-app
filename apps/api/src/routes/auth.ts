import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import {
  ErrorCode,
  otpRequestBodySchema,
  otpVerifyBodySchema,
  selectGymBodySchema,
  type SessionResponse,
  type VerifyOtpResponse,
} from '@onthec/shared'
import type { AppDeps } from '../app'
import { forTenant } from '../db/tenant'
import { AppError } from '../errors'
import { requestOtp, verifyOtp } from '../services/auth/otp'
import {
  REFRESH_TOKEN_TTL_SECONDS,
  createSession,
  endSession,
  rotateSession,
  type IssuedSession,
} from '../services/auth/session'
import { ACCESS_TOKEN_TTL_SECONDS, signSelectionToken, verifySelectionToken } from '../services/auth/tokens'
import { getSessionUser } from '../services/me'

export const REFRESH_COOKIE = 'onthec_refresh'
export const REFRESH_COOKIE_PATH = '/api/v1/auth'

/** Per-IP limits on top of the per-phone OTP limits in the service. */
const limit = (max: number) => ({ config: { rateLimit: { max, timeWindow: '15 minutes' } } })

export function authRoutes({ db, env, otpSender }: AppDeps): FastifyPluginAsync {
  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: REFRESH_COOKIE_PATH,
  }

  async function respondWithSession(reply: FastifyReply, session: IssuedSession): Promise<SessionResponse> {
    reply.setCookie(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions, maxAge: REFRESH_TOKEN_TTL_SECONDS })
    const user = await getSessionUser(forTenant(db, session.subject.gymId), session.subject.id)
    if (!user) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please log in again.')
    return { accessToken: session.accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, user }
  }

  const userAgent = (request: FastifyRequest) => ({ userAgent: request.headers['user-agent'] })

  return async (app) => {
    app.post('/otp/request', limit(20), async (request) => {
      const { phone } = otpRequestBodySchema.parse(request.body)
      return requestOtp({ db, env, sender: otpSender, log: request.log }, phone)
    })

    app.post('/otp/verify', limit(40), async (request, reply): Promise<VerifyOtpResponse> => {
      const { phone, code } = otpVerifyBodySchema.parse(request.body)
      const accounts = await verifyOtp({ db, env }, phone, code)

      const [only] = accounts
      if (only && accounts.length === 1) {
        const session = await createSession({ db, env }, only, userAgent(request))
        return { status: 'authenticated', ...(await respondWithSession(reply, session)) }
      }
      return {
        status: 'select_gym',
        selectionToken: await signSelectionToken(env, phone),
        gyms: accounts.map((account) => account.gym),
      }
    })

    // The gym id comes from the body here only because no session exists yet; it is accepted
    // only if this OTP-verified phone has an account at that gym.
    app.post('/select-gym', limit(40), async (request, reply): Promise<SessionResponse> => {
      const { selectionToken, gymId } = selectGymBodySchema.parse(request.body)
      const phone = await verifySelectionToken(env, selectionToken)
      const user = await db.user.findFirst({
        where: { phone, gymId, deletedAt: null },
        select: { id: true, gymId: true, role: true },
      })
      if (!user) throw new AppError(403, ErrorCode.GYM_SELECTION_INVALID, 'You do not have an account at this gym.')
      return respondWithSession(reply, await createSession({ db, env }, user, userAgent(request)))
    })

    app.post('/refresh', limit(120), async (request, reply): Promise<SessionResponse> => {
      const token = request.cookies[REFRESH_COOKIE]
      if (!token) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please log in.')
      try {
        return await respondWithSession(reply, await rotateSession({ db, env }, token, userAgent(request)))
      } catch (error) {
        reply.clearCookie(REFRESH_COOKIE, cookieOptions)
        throw error
      }
    })

    app.post('/logout', async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE]
      if (token) await endSession(db, token)
      reply.clearCookie(REFRESH_COOKIE, cookieOptions)
      return reply.status(204).send()
    })
  }
}
