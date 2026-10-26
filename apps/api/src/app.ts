import Fastify, { type FastifyServerOptions } from 'fastify'
import cors from '@fastify/cors'
import type { Db } from './db'
import type { Env } from './env'
import { registerErrorHandling } from './errors'
import { healthRoutes } from './routes/health'

export interface AppDeps {
  env: Env
  db: Db
}

function loggerOptions(env: Env): FastifyServerOptions['logger'] {
  if (env.NODE_ENV === 'test') return false
  if (env.NODE_ENV === 'development') {
    return { level: env.LOG_LEVEL, transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
  }
  return { level: env.LOG_LEVEL }
}

/** Builds the Fastify app without listening, so tests can use `app.inject()`. */
export async function buildApp({ env, db }: AppDeps) {
  const app = Fastify({ logger: loggerOptions(env) })

  await app.register(cors, { origin: env.WEB_ORIGINS, credentials: true })
  registerErrorHandling(app)

  await app.register(healthRoutes(db), { prefix: '/api/v1' })

  return app
}
