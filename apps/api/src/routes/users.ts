import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import { ErrorCode, type UserSummary } from '@onthec/shared'
import { AppError } from '../errors'
import { getAuth, requireRole } from '../plugins/auth'
import { getUser, listUsers } from '../services/users'

const userParamsSchema = z.object({ id: z.uuid() })

export function usersRoutes({ authenticate }: { authenticate: preHandlerAsyncHookHandler }): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)
    app.addHook('preHandler', requireRole('admin', 'owner'))

    app.get('/users', async (request): Promise<UserSummary[]> => listUsers(getAuth(request).db))

    app.get('/users/:id', async (request): Promise<UserSummary> => {
      const { id } = userParamsSchema.parse(request.params)
      const user = await getUser(getAuth(request).db, id)
      // Another gym's user looks exactly like a missing one.
      if (!user) throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found')
      return user
    })
  }
}
