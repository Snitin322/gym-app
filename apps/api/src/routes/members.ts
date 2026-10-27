import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import {
  ErrorCode,
  MEMBER_FILTERS,
  cancelMembershipSchema,
  createMemberSchema,
  freezeInputSchema,
  newMembershipSchema,
  recordPaymentSchema,
  updateMemberSchema,
  type IsoDate,
} from '@onthec/shared'
import { AppError } from '../errors'
import { getAuth, requireRole } from '../plugins/auth'
import { createMember, getMember, listMembers, updateMember } from '../services/members'
import {
  addMembership,
  cancelMembership,
  freezeMembership,
  recordPayment,
  unfreezeMembership,
} from '../services/memberships'

const idParams = z.object({ id: z.uuid() })
const listQuery = z.object({
  filter: z.enum(MEMBER_FILTERS).default('all'),
  q: z.string().trim().max(50).optional(),
})

interface Deps {
  authenticate: preHandlerAsyncHookHandler
  today: () => IsoDate
}

/** Members and their memberships — owners and admins only. */
export function membersRoutes({ authenticate, today }: Deps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)
    app.addHook('preHandler', requireRole('admin', 'owner'))

    const actor = (request: Parameters<typeof getAuth>[0]) => {
      const auth = getAuth(request)
      return { db: auth.db, actor: { gymId: auth.gymId, userId: auth.userId } }
    }

    app.get('/members', async (request) => {
      const { filter, q } = listQuery.parse(request.query)
      return listMembers(getAuth(request).db, { filter, q: q || undefined }, today())
    })

    app.post('/members', async (request, reply) => {
      const input = createMemberSchema.parse(request.body)
      const { db, actor: who } = actor(request)
      return reply.status(201).send(await createMember(db, who, input, today()))
    })

    app.get('/members/:id', async (request) => {
      const { id } = idParams.parse(request.params)
      const member = await getMember(getAuth(request).db, id, today())
      // Another gym's member looks exactly like a missing one.
      if (!member) throw new AppError(404, ErrorCode.NOT_FOUND, 'Member not found')
      return member
    })

    app.patch('/members/:id', async (request) => {
      const { id } = idParams.parse(request.params)
      return updateMember(getAuth(request).db, id, updateMemberSchema.parse(request.body), today())
    })

    app.post('/members/:id/memberships', async (request, reply) => {
      const { id } = idParams.parse(request.params)
      const input = newMembershipSchema.parse(request.body)
      const { db, actor: who } = actor(request)
      return reply.status(201).send(await addMembership(db, who, id, input, today()))
    })

    app.post('/memberships/:id/freeze', async (request) => {
      const { id } = idParams.parse(request.params)
      const input = freezeInputSchema.parse(request.body)
      const { db, actor: who } = actor(request)
      return freezeMembership(db, who, id, input, today())
    })

    app.post('/memberships/:id/unfreeze', async (request) => {
      const { id } = idParams.parse(request.params)
      return unfreezeMembership(getAuth(request).db, id, today())
    })

    app.post('/memberships/:id/payments', async (request, reply) => {
      const { id } = idParams.parse(request.params)
      const input = recordPaymentSchema.parse(request.body)
      const { db, actor: who } = actor(request)
      return reply.status(201).send(await recordPayment(db, who, id, input, today()))
    })

    app.post('/memberships/:id/cancel', async (request) => {
      const { id } = idParams.parse(request.params)
      const { reason } = cancelMembershipSchema.parse(request.body ?? {})
      return cancelMembership(getAuth(request).db, id, reason, today())
    })
  }
}
