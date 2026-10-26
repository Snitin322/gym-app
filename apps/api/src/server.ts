import { buildApp } from './app'
import { createDb } from './db/unscoped'
import { loadEnv } from './env'
import { createOtpSender } from './services/auth/senders'

if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile()
  } catch {
    // No .env file: rely on variables already set in the environment.
  }
}

const env = loadEnv()
const db = createDb()
const app = await buildApp({ env, db, otpSender: createOtpSender(env) })

if (env.OTP_PROVIDER === 'console') {
  app.log.warn('OTP_PROVIDER=console: login codes are written to this log, not sent to phones.')
} else {
  app.log.info(`Login codes are sent by ${env.OTP_PROVIDER} (template "${env.WHATSAPP_OTP_TEMPLATE}").`)
}

async function shutdown(signal: NodeJS.Signals) {
  app.log.info(`${signal} received, shutting down`)
  await app.close()
  await db.$disconnect()
  process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

await app.listen({ host: env.HOST, port: env.PORT })
