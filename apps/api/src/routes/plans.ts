import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import { planInputSchema, planUpdateSchema } from '@onthec/shared'
import { getAuth, requireRole } from '../plugins/auth'
import { createPlan, listPlans, updatePlan } from '../services/plans'

const idParams = z.object({ id: z.uuid() })

export function plansRoutes({ authenticate }: { authenticate: preHandlerAsyncHookHandler }): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)
    app.addHook('preHandler', requireRole('admin', 'owner'))

    app.get('/plans', async (request) => listPlans(getAuth(request).db))

    app.post('/plans', async (request, reply) => {
      const input = planInputSchema.parse(request.body)
      const auth = getAuth(request)
      return reply.status(201).send(await createPlan(auth.db, auth.gymId, input))
    })

    app.patch('/plans/:id', async (request) => {
      const { id } = idParams.parse(request.params)
      return updatePlan(getAuth(request).db, id, planUpdateSchema.parse(request.body))
    })
  }
}
