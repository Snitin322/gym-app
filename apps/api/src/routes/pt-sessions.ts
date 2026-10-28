import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import {
  availabilityInputSchema,
  bookSessionSchema,
  cancelSessionSchema,
  disputeSessionSchema,
  markSessionSchema,
  resolveDisputeSchema,
  ptRulesUpdateSchema,
  sessionRangeQuerySchema,
  timeOffInputSchema,
} from '@onthec/shared'
import { getAuth, requireRole } from '../plugins/auth'
import {
  addTimeOff,
  bookSession,
  cancelSession,
  getAvailability,
  getMemberSessions,
  getMySessions,
  getPtRules,
  getSlots,
  getTrainerSessions,
  removeTimeOff,
  rescheduleSession,
  setAvailability,
  updatePtRules,
} from '../services/pt-booking'
import {
  confirmSession,
  disputeSession,
  listDisputes,
  listUnmarked,
  markSession,
  resolveDispute,
  undoMark,
} from '../services/pt-completion'

const idParams = z.object({ id: z.uuid() })
const timeOffParams = z.object({ id: z.uuid(), timeOffId: z.uuid() })

interface Deps {
  authenticate: preHandlerAsyncHookHandler
  now: () => Date
}

/** Who is asking; services decide what each role may see or change. */
function viewerOf(request: FastifyRequest) {
  const auth = getAuth(request)
  return { db: auth.db, viewer: { gymId: auth.gymId, userId: auth.userId, role: auth.role } }
}

/**
 * PT booking: trainer hours and time off, open slots, booking, cancelling and rescheduling.
 * Members, trainers and the desk share these routes; access is checked per record in the service.
 */
export function ptSessionRoutes({ authenticate, now }: Deps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)

    // Gym rules: everyone can read them (the app explains them); only the owner changes them.
    app.get('/pt-rules', async (request) => getPtRules(getAuth(request).db))
    app.patch('/pt-rules', { preHandler: requireRole('owner') }, async (request) => {
      const auth = getAuth(request)
      return updatePtRules(auth.db, auth.gymId, ptRulesUpdateSchema.parse(request.body))
    })

    // Trainer hours and time off (the trainer themself, or owners/admins).
    app.get('/trainers/:id/availability', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      return getAvailability(db, viewer, id, now())
    })
    app.put('/trainers/:id/availability', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      return setAvailability(db, viewer, id, availabilityInputSchema.parse(request.body), now())
    })
    app.post('/trainers/:id/time-off', async (request, reply) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      return reply.status(201).send(await addTimeOff(db, viewer, id, timeOffInputSchema.parse(request.body), now()))
    })
    app.delete('/trainers/:id/time-off/:timeOffId', async (request, reply) => {
      const { id, timeOffId } = timeOffParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      await removeTimeOff(db, viewer, id, timeOffId)
      return reply.status(204).send()
    })
    app.get('/trainers/:id/sessions', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      return getTrainerSessions(db, viewer, id, sessionRangeQuerySchema.parse(request.query), now())
    })

    // Booking on a package (its member, its trainer, or the desk).
    app.get('/pt-purchases/:id/slots', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      return getSlots(db, viewer, id, now())
    })
    app.post('/pt-purchases/:id/sessions', async (request, reply) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      const { startsAt } = bookSessionSchema.parse(request.body)
      return reply.status(201).send(await bookSession(db, viewer, id, startsAt, now()))
    })
    app.post('/pt-sessions/:id/cancel', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      const { reason } = cancelSessionSchema.parse(request.body ?? {})
      return cancelSession(db, viewer, id, reason, now())
    })
    app.post('/pt-sessions/:id/reschedule', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      const { startsAt } = bookSessionSchema.parse(request.body)
      return rescheduleSession(db, viewer, id, startsAt, now())
    })

    // Completing sessions: the trainer (or desk) marks, the member confirms or disputes, the desk resolves.
    app.post('/pt-sessions/:id/mark', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      return markSession(db, viewer, id, markSessionSchema.parse(request.body), now())
    })
    app.post('/pt-sessions/:id/undo-mark', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      return undoMark(db, viewer, id, now())
    })
    app.post('/pt-sessions/:id/confirm', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      return confirmSession(db, viewer, id, now())
    })
    app.post('/pt-sessions/:id/dispute', async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      return disputeSession(db, viewer, id, disputeSessionSchema.parse(request.body).reason, now())
    })
    app.post('/pt-sessions/:id/resolve', { preHandler: requireRole('admin', 'owner') }, async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, viewer } = viewerOf(request)
      return resolveDispute(db, viewer, id, resolveDisputeSchema.parse(request.body), now())
    })
    app.get('/pt-disputes', { preHandler: requireRole('admin', 'owner') }, async (request) =>
      listDisputes(getAuth(request).db, now()),
    )
    app.get('/pt-sessions/unmarked', { preHandler: requireRole('trainer', 'admin', 'owner') }, async (request) => {
      const { db, viewer } = viewerOf(request)
      return listUnmarked(db, viewer, now())
    })

    // Session lists.
    app.get('/me/pt-sessions', async (request) => {
      const auth = getAuth(request)
      return getMySessions(auth.db, auth.userId, now())
    })
    app.get('/members/:id/pt-sessions', { preHandler: requireRole('admin', 'owner') }, async (request) => {
      const { id } = idParams.parse(request.params)
      return getMemberSessions(getAuth(request).db, id, now())
    })
  }
}
