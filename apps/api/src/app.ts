import Fastify, { type FastifyServerOptions } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { ErrorCode } from '@onthec/shared'
import type { Db } from './db/unscoped'
import type { Env } from './env'
import { AppError, registerErrorHandling } from './errors'
import { createAuthenticate } from './plugins/auth'
import { authRoutes } from './routes/auth'
import { healthRoutes } from './routes/health'
import { meRoutes } from './routes/me'
import { usersRoutes } from './routes/users'
import type { OtpSender } from './services/auth/senders'

export interface AppDeps {
  env: Env
  db: Db
  otpSender: OtpSender
}

const API_PREFIX = '/api/v1'

function loggerOptions(env: Env): FastifyServerOptions['logger'] {
  if (env.NODE_ENV === 'test') return false
  if (env.NODE_ENV === 'development') {
    return { level: env.LOG_LEVEL, transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
  }
  return { level: env.LOG_LEVEL }
}

/** Builds the Fastify app without listening, so tests can use `app.inject()`. */
export async function buildApp(deps: AppDeps) {
  const { env, db } = deps
  const app = Fastify({ logger: loggerOptions(env), trustProxy: env.TRUST_PROXY })

  registerErrorHandling(app)
  await app.register(cors, { origin: env.WEB_ORIGINS, credentials: true })
  await app.register(cookie)
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new AppError(429, ErrorCode.RATE_LIMITED, `Too many requests. Please try again in ${context.after}.`),
  })
  app.decorateRequest('auth', null)

  const authenticate = createAuthenticate(env, db)

  await app.register(healthRoutes(db), { prefix: API_PREFIX })
  await app.register(authRoutes(deps), { prefix: `${API_PREFIX}/auth` })
  // Routes below only ever see the tenant-scoped client, via request.auth.db.
  await app.register(meRoutes({ authenticate }), { prefix: API_PREFIX })
  await app.register(usersRoutes({ authenticate }), { prefix: API_PREFIX })

  return app
}
