import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import { workoutExerciseInputSchema, workoutExerciseUpdateSchema, workoutPlanInputSchema } from '@onthec/shared'
import { getAuth, requireRole } from '../plugins/auth'
import {
  addStarterExercises,
  createExercise,
  createTemplate,
  deleteTemplate,
  getTemplate,
  getTemplateVersions,
  listExercises,
  listTemplates,
  saveTemplate,
  updateExercise,
} from '../services/workouts'

const idParams = z.object({ id: z.uuid() })
const listQuery = z.object({ all: z.enum(['0', '1']).optional() })
const planSaveSchema = workoutPlanInputSchema.extend({ version: z.number().int().min(1) })

interface Deps {
  authenticate: preHandlerAsyncHookHandler
}

function actorOf(request: FastifyRequest) {
  const auth = getAuth(request)
  return { db: auth.db, actor: { gymId: auth.gymId, userId: auth.userId } }
}

/**
 * Exercise library and plan templates. Owners and admins manage them; trainers can read them
 * (they build their PT clients' plans from them).
 */
export function workoutRoutes({ authenticate }: Deps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)
    const staff = requireRole('trainer', 'admin', 'owner')
    const managers = requireRole('admin', 'owner')

    app.get('/workout-exercises', { preHandler: staff }, async (request) => {
      const { all } = listQuery.parse(request.query)
      return listExercises(getAuth(request).db, { all: all === '1' })
    })
    app.post('/workout-exercises', { preHandler: managers }, async (request, reply) => {
      const auth = getAuth(request)
      return reply
        .status(201)
        .send(await createExercise(auth.db, auth.gymId, workoutExerciseInputSchema.parse(request.body)))
    })
    app.patch('/workout-exercises/:id', { preHandler: managers }, async (request) => {
      const { id } = idParams.parse(request.params)
      return updateExercise(getAuth(request).db, id, workoutExerciseUpdateSchema.parse(request.body))
    })
    app.post('/workout-exercises/starter', { preHandler: managers }, async (request) => {
      const auth = getAuth(request)
      return addStarterExercises(auth.db, auth.gymId)
    })

    app.get('/workout-templates', { preHandler: staff }, async (request) => listTemplates(getAuth(request).db))
    app.post('/workout-templates', { preHandler: managers }, async (request, reply) => {
      const { db, actor } = actorOf(request)
      return reply.status(201).send(await createTemplate(db, actor, workoutPlanInputSchema.parse(request.body)))
    })
    app.get('/workout-templates/:id', { preHandler: staff }, async (request) => {
      const { id } = idParams.parse(request.params)
      return getTemplate(getAuth(request).db, id)
    })
    app.put('/workout-templates/:id', { preHandler: managers }, async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, actor } = actorOf(request)
      return saveTemplate(db, actor, id, planSaveSchema.parse(request.body))
    })
    app.delete('/workout-templates/:id', { preHandler: managers }, async (request, reply) => {
      const { id } = idParams.parse(request.params)
      await deleteTemplate(getAuth(request).db, id)
      return reply.status(204).send()
    })
    app.get('/workout-templates/:id/versions', { preHandler: staff }, async (request) => {
      const { id } = idParams.parse(request.params)
      return getTemplateVersions(getAuth(request).db, id)
    })
  }
}
