import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { ErrorCode, consentBodySchema, type IsoDate, type MyMembership, type SessionUser } from '@onthec/shared'
import { AppError } from '../errors'
import { getAuth } from '../plugins/auth'
import { getSessionUser, recordConsent } from '../services/me'
import { getMyMembership } from '../services/members'

export function meRoutes({
  authenticate,
  today,
}: {
  authenticate: preHandlerAsyncHookHandler
  today: () => IsoDate
}): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)

    app.get('/me', async (request): Promise<SessionUser> => {
      const auth = getAuth(request)
      const user = await getSessionUser(auth.db, auth.userId)
      if (!user) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please log in again.')
      return user
    })

    app.get('/me/membership', async (request): Promise<MyMembership> => {
      const auth = getAuth(request)
      return getMyMembership(auth.db, auth.userId, today())
    })

    app.post('/me/consent', async (request): Promise<SessionUser> => {
      consentBodySchema.parse(request.body)
      const auth = getAuth(request)
      await recordConsent(auth.db, auth.gymId, auth.userId)
      const user = await getSessionUser(auth.db, auth.userId)
      if (!user) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please log in again.')
      return user
    })
  }
}
