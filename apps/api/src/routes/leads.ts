import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import { LEAD_FILTERS, leadInputSchema, leadUpdateSchema, phoneSchema } from '@onthec/shared'
import { getAuth, requireRole } from '../plugins/auth'
import { checkPhone, createLead, listLeads, updateLead } from '../services/leads'

const idParams = z.object({ id: z.uuid() })
const listQuery = z.object({ filter: z.enum(LEAD_FILTERS).default('open'), q: z.string().trim().max(80).optional() })
const phoneQuery = z.object({ phone: phoneSchema })

/** Enquiries (leads) — owners and admins. */
export function leadsRoutes({ authenticate }: { authenticate: preHandlerAsyncHookHandler }): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)
    app.addHook('preHandler', requireRole('admin', 'owner'))

    app.get('/leads', async (request) => {
      const { filter, q } = listQuery.parse(request.query)
      return listLeads(getAuth(request).db, { filter, q: q || undefined })
    })
    app.get('/leads/check-phone', async (request) => {
      const { phone } = phoneQuery.parse(request.query)
      return { duplicates: await checkPhone(getAuth(request).db, phone) }
    })
    app.post('/leads', async (request, reply) => {
      const auth = getAuth(request)
      const lead = await createLead(
        auth.db,
        { gymId: auth.gymId, userId: auth.userId },
        leadInputSchema.parse(request.body),
      )
      return reply.status(201).send(lead)
    })
    app.patch('/leads/:id', async (request) => {
      const { id } = idParams.parse(request.params)
      return updateLead(getAuth(request).db, id, leadUpdateSchema.parse(request.body))
    })
  }
}
