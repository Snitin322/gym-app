import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import {
  ptAdjustSchema,
  ptExtendSchema,
  ptPackageInputSchema,
  ptPackageUpdateSchema,
  ptSaleSchema,
  recordPaymentSchema,
  type IsoDate,
} from '@onthec/shared'
import { getAuth, requireRole } from '../plugins/auth'
import {
  adjustPtSessions,
  createPtPackage,
  extendPtPurchase,
  getMyPtPurchases,
  getPtPurchase,
  getTrainerClients,
  listPtPackages,
  recordPtPayment,
  sellPtPackage,
  updatePtPackage,
} from '../services/pt'

const idParams = z.object({ id: z.uuid() })

interface Deps {
  authenticate: preHandlerAsyncHookHandler
  today: () => IsoDate
}

/** PT packages and sales — owners and admins. */
export function ptAdminRoutes({ authenticate, today }: Deps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)
    app.addHook('preHandler', requireRole('admin', 'owner'))

    const who = (request: Parameters<typeof getAuth>[0]) => {
      const auth = getAuth(request)
      return { db: auth.db, actor: { gymId: auth.gymId, userId: auth.userId } }
    }

    app.get('/pt-packages', async (request) => listPtPackages(getAuth(request).db))

    app.post('/pt-packages', async (request, reply) => {
      const auth = getAuth(request)
      return reply.status(201).send(await createPtPackage(auth.db, auth.gymId, ptPackageInputSchema.parse(request.body)))
    })

    app.patch('/pt-packages/:id', async (request) => {
      const { id } = idParams.parse(request.params)
      return updatePtPackage(getAuth(request).db, id, ptPackageUpdateSchema.parse(request.body))
    })

    app.post('/members/:id/pt-purchases', async (request, reply) => {
      const { id } = idParams.parse(request.params)
      const { db, actor } = who(request)
      return reply.status(201).send(await sellPtPackage(db, actor, id, ptSaleSchema.parse(request.body), today()))
    })

    app.get('/pt-purchases/:id', async (request) => {
      const { id } = idParams.parse(request.params)
      return getPtPurchase(getAuth(request).db, id, today())
    })

    app.post('/pt-purchases/:id/payments', async (request, reply) => {
      const { id } = idParams.parse(request.params)
      const { db, actor } = who(request)
      return reply.status(201).send(await recordPtPayment(db, actor, id, recordPaymentSchema.parse(request.body), today()))
    })

    app.post('/pt-purchases/:id/adjust', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, actor } = who(request)
      return adjustPtSessions(db, actor, id, ptAdjustSchema.parse(request.body), today())
    })

    app.post('/pt-purchases/:id/extend', async (request) => {
      const { id } = idParams.parse(request.params)
      const { expiresOn } = ptExtendSchema.parse(request.body)
      return extendPtPurchase(getAuth(request).db, id, expiresOn, today())
    })
  }
}

/** A member's own PT packages, and a trainer's clients. */
export function ptSelfRoutes({ authenticate, today }: Deps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)

    app.get('/me/pt', async (request) => {
      const auth = getAuth(request)
      return getMyPtPurchases(auth.db, auth.userId, today())
    })

    app.get('/trainer/clients', { preHandler: requireRole('trainer') }, async (request) => {
      const auth = getAuth(request)
      return getTrainerClients(auth.db, auth.userId, today())
    })
  }
}
