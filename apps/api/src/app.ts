import Fastify, { type FastifyServerOptions } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { ErrorCode, todayInIndia } from '@onthec/shared'
import type { Db } from './db/unscoped'
import type { Env } from './env'
import { AppError, registerErrorHandling } from './errors'
import { createAuthenticate } from './plugins/auth'
import { authRoutes } from './routes/auth'
import { dashboardRoutes } from './routes/dashboard'
import { gymRoutes } from './routes/gym'
import { healthRoutes } from './routes/health'
import { invoicesRoutes } from './routes/invoices'
import { onlineRoutes } from './routes/online'
import { ptAdminRoutes, ptSelfRoutes } from './routes/pt'
import { ptSessionRoutes } from './routes/pt-sessions'
import { workoutRoutes } from './routes/workouts'
import { webhooksRoutes } from './routes/webhooks'
import { createRazorpayGateway, type RazorpayGateway } from './services/razorpay'
import { meRoutes } from './routes/me'
import { membersRoutes } from './routes/members'
import { plansRoutes } from './routes/plans'
import { usersRoutes } from './routes/users'
import type { OtpSender } from './services/auth/senders'

export interface AppDeps {
  env: Env
  db: Db
  otpSender: OtpSender
  /** Current time; tests pass a fixed clock to check date rules. */
  now?: () => Date
  /** Razorpay; defaults to the one configured in env (null = desk payments only). */
  razorpay?: RazorpayGateway | null
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
  const now = deps.now ?? (() => new Date())
  /** Today's date at the gym, for all membership date rules. */
  const today = () => todayInIndia(now())

  await app.register(healthRoutes(db), { prefix: API_PREFIX })
  await app.register(authRoutes(deps), { prefix: `${API_PREFIX}/auth` })
  // Routes below only ever see the tenant-scoped client, via request.auth.db.
  await app.register(meRoutes({ authenticate, today }), { prefix: API_PREFIX })
  await app.register(usersRoutes({ authenticate }), { prefix: API_PREFIX })
  await app.register(plansRoutes({ authenticate }), { prefix: API_PREFIX })
  await app.register(membersRoutes({ authenticate, today }), { prefix: API_PREFIX })
  await app.register(gymRoutes({ authenticate }), { prefix: API_PREFIX })
  await app.register(invoicesRoutes({ authenticate, today }), { prefix: API_PREFIX })
  await app.register(ptAdminRoutes({ authenticate, today }), { prefix: API_PREFIX })
  await app.register(ptSelfRoutes({ authenticate, today }), { prefix: API_PREFIX })
  await app.register(ptSessionRoutes({ authenticate, now }), { prefix: API_PREFIX })
  await app.register(workoutRoutes({ authenticate, today }), { prefix: API_PREFIX })
  await app.register(dashboardRoutes({ authenticate, today, now }), { prefix: API_PREFIX })

  const gateway = deps.razorpay === undefined ? createRazorpayGateway(env) : deps.razorpay
  await app.register(onlineRoutes({ authenticate, gateway, today }), { prefix: API_PREFIX })
  await app.register(webhooksRoutes({ db, gateway, today }), { prefix: API_PREFIX })

  return app
}
