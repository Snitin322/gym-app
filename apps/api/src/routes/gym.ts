import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { gymDetailsSchema } from '@onthec/shared'
import { getAuth, requireRole } from '../plugins/auth'
import { getGymDetails, updateGymDetails } from '../services/gym'

/** The gym's own details (used on invoices). Owners and admins read; only the owner edits. */
export function gymRoutes({ authenticate }: { authenticate: preHandlerAsyncHookHandler }): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)

    app.get('/gym', { preHandler: requireRole('owner', 'admin') }, async (request) => {
      const auth = getAuth(request)
      return getGymDetails(auth.db, auth.gymId)
    })

    app.patch('/gym', { preHandler: requireRole('owner') }, async (request) => {
      const auth = getAuth(request)
      return updateGymDetails(auth.db, auth.gymId, gymDetailsSchema.parse(request.body))
    })
  }
}
