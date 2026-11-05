import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import {
  dietPlanInputSchema,
  foodInputSchema,
  foodUpdateSchema,
  saveDietPlanSchema,
  startDietPlanSchema,
  type IsoDate,
} from '@onthec/shared'
import { getAuth, requireRole } from '../plugins/auth'
import {
  addStarterFoods,
  createDietTemplate,
  createFood,
  deleteDietTemplate,
  getDietTemplate,
  getMemberDietPlan,
  getMyDietPlan,
  listDietTemplates,
  listFoods,
  saveDietTemplate,
  saveMemberDietPlan,
  startMemberDietPlan,
  updateFood,
} from '../services/diet'

const idParams = z.object({ id: z.uuid() })
const listQuery = z.object({ all: z.enum(['0', '1']).optional() })

interface Deps {
  authenticate: preHandlerAsyncHookHandler
  today: () => IsoDate
}

function actorOf(request: FastifyRequest) {
  const auth = getAuth(request)
  return { db: auth.db, actor: { gymId: auth.gymId, userId: auth.userId, role: auth.role } }
}

/**
 * Food list, diet templates and members' diet plans. All staff keep the food list (coaches add foods
 * as they plan); owners and admins manage templates, trainers read them.
 */
export function dietRoutes({ authenticate, today }: Deps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)
    const staff = requireRole('trainer', 'admin', 'owner')
    const managers = requireRole('admin', 'owner')

    app.get('/foods', { preHandler: staff }, async (request) => {
      const { all } = listQuery.parse(request.query)
      return listFoods(getAuth(request).db, { all: all === '1' })
    })
    app.post('/foods', { preHandler: staff }, async (request, reply) => {
      const auth = getAuth(request)
      return reply.status(201).send(await createFood(auth.db, auth.gymId, foodInputSchema.parse(request.body)))
    })
    app.put('/foods/:id', { preHandler: staff }, async (request) => {
      const { id } = idParams.parse(request.params)
      return updateFood(getAuth(request).db, id, foodUpdateSchema.parse(request.body))
    })
    app.post('/foods/starter', { preHandler: staff }, async (request) => {
      const auth = getAuth(request)
      return addStarterFoods(auth.db, auth.gymId)
    })

    app.get('/diet-templates', { preHandler: staff }, async (request) => listDietTemplates(getAuth(request).db))
    app.post('/diet-templates', { preHandler: managers }, async (request, reply) => {
      const { db, actor } = actorOf(request)
      return reply.status(201).send(await createDietTemplate(db, actor, dietPlanInputSchema.parse(request.body)))
    })
    app.get('/diet-templates/:id', { preHandler: staff }, async (request) => {
      const { id } = idParams.parse(request.params)
      return getDietTemplate(getAuth(request).db, id)
    })
    app.put('/diet-templates/:id', { preHandler: managers }, async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, actor } = actorOf(request)
      return saveDietTemplate(db, actor, id, saveDietPlanSchema.parse(request.body))
    })
    app.delete('/diet-templates/:id', { preHandler: managers }, async (request, reply) => {
      const { id } = idParams.parse(request.params)
      await deleteDietTemplate(getAuth(request).db, id)
      return reply.status(204).send()
    })

    // Members' own plans: owners/admins for anyone, trainers for their coaching and PT clients.
    app.get('/members/:id/diet-plan', { preHandler: staff }, async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, actor } = actorOf(request)
      return getMemberDietPlan(db, actor, id, today())
    })
    app.post('/members/:id/diet-plan', { preHandler: staff }, async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, actor } = actorOf(request)
      const { templateId } = startDietPlanSchema.parse(request.body ?? {})
      return startMemberDietPlan(db, actor, id, templateId, today())
    })
    app.put('/members/:id/diet-plan', { preHandler: staff }, async (request) => {
      const { id } = idParams.parse(request.params)
      const { db, actor } = actorOf(request)
      return saveMemberDietPlan(db, actor, id, saveDietPlanSchema.parse(request.body), today())
    })

    // The signed-in member's own plan (read-only).
    app.get('/me/diet-plan', async (request) => {
      const auth = getAuth(request)
      return { plan: await getMyDietPlan(auth.db, auth.userId) }
    })
  }
}
