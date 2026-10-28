import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import type { IsoDate } from '@onthec/shared'
import { getAuth, requireRole } from '../plugins/auth'
import { getDashboard } from '../services/dashboard'

interface Deps {
  authenticate: preHandlerAsyncHookHandler
  today: () => IsoDate
  now: () => Date
}

/** The owner/admin home dashboard. Money taken is included for the owner only. */
export function dashboardRoutes({ authenticate, today, now }: Deps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)
    app.get('/dashboard', { preHandler: requireRole('owner', 'admin') }, async (request) => {
      const auth = getAuth(request)
      return getDashboard(auth.db, auth.role, today(), now())
    })
  }
}
