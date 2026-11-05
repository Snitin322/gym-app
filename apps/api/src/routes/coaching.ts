import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import { clientProfileInputSchema, myClientProfileInputSchema, setCoachSchema } from '@onthec/shared'
import { getAuth, requireRole } from '../plugins/auth'
import {
  getClientProfile,
  getMyClientProfile,
  saveClientProfile,
  saveMyClientProfile,
  setCoach,
  withdrawMyHealthDetails,
} from '../services/coaching'

const idParams = z.object({ id: z.uuid() })

/** Coaches and their clients' health profiles. Who may see a profile is checked in the service. */
export function coachingRoutes({ authenticate }: { authenticate: preHandlerAsyncHookHandler }): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)

    // The coach or the owner. Admins can assign coaches but never read health details.
    app.get('/members/:id/profile', { preHandler: requireRole('trainer', 'owner') }, async (request) => {
      const { id } = idParams.parse(request.params)
      return getClientProfile(getAuth(request).db, getAuth(request), id)
    })

    app.put('/members/:id/profile', { preHandler: requireRole('trainer', 'owner') }, async (request) => {
      const { id } = idParams.parse(request.params)
      const input = clientProfileInputSchema.parse(request.body)
      return saveClientProfile(getAuth(request).db, getAuth(request), id, input)
    })

    app.put('/members/:id/coach', { preHandler: requireRole('admin', 'owner') }, async (request, reply) => {
      const { id } = idParams.parse(request.params)
      const { coachId } = setCoachSchema.parse(request.body)
      await setCoach(getAuth(request).db, id, coachId)
      return reply.status(204).send()
    })

    // A member's own profile.
    app.get('/me/profile', async (request) => getMyClientProfile(getAuth(request).db, getAuth(request)))

    app.put('/me/profile', async (request) => {
      const input = myClientProfileInputSchema.parse(request.body)
      return saveMyClientProfile(getAuth(request).db, getAuth(request), input)
    })

    app.delete('/me/profile', async (request) => withdrawMyHealthDetails(getAuth(request).db, getAuth(request)))
  }
}
