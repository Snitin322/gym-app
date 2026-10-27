import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import { createOrderSchema, verifyPaymentSchema, type IsoDate } from '@onthec/shared'
import { getAuth } from '../plugins/auth'
import {
  createOnlineOrder,
  getOnlinePaymentStatus,
  getRenewalOptions,
  verifyOnlinePayment,
} from '../services/online-payments'
import type { RazorpayGateway } from '../services/razorpay'

const idParams = z.object({ id: z.uuid() })

/** A member renewing and paying online with Razorpay. */
export function onlineRoutes({
  authenticate,
  gateway,
  today,
}: {
  authenticate: preHandlerAsyncHookHandler
  gateway: RazorpayGateway | null
  today: () => IsoDate
}): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)
    const limit = { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }

    app.get('/me/renewal-options', async (request) => {
      const auth = getAuth(request)
      return getRenewalOptions(auth.db, auth.userId, today(), gateway)
    })

    app.post('/me/orders', limit, async (request, reply) => {
      const { planId } = createOrderSchema.parse(request.body)
      const auth = getAuth(request)
      return reply.status(201).send(await createOnlineOrder(auth.db, gateway, { gymId: auth.gymId, userId: auth.userId }, planId))
    })

    app.post('/me/orders/verify', limit, async (request) => {
      const auth = getAuth(request)
      return verifyOnlinePayment(auth.db, gateway, auth.userId, verifyPaymentSchema.parse(request.body))
    })

    app.get('/me/payments/:id', async (request) => {
      const { id } = idParams.parse(request.params)
      const auth = getAuth(request)
      return getOnlinePaymentStatus(auth.db, auth.userId, id)
    })
  }
}
