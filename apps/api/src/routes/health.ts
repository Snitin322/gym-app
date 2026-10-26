import type { FastifyPluginAsync } from 'fastify'
import type { HealthResponse } from '@onthec/shared'
import type { Db } from '../db/unscoped'
import { assertDatabaseReachable } from '../services/health'

export function healthRoutes(db: Db): FastifyPluginAsync {
  return async (app) => {
    app.get('/health', async (): Promise<HealthResponse> => {
      await assertDatabaseReachable(db)
      return { status: 'ok', db: 'ok', time: new Date().toISOString() }
    })
  }
}
