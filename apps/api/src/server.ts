import { buildApp } from './app'
import { createDb } from './db/unscoped'
import { loadEnv } from './env'
import { consoleOtpSender } from './services/auth/sms'

if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile()
  } catch {
    // No .env file: rely on variables already set in the environment.
  }
}

const env = loadEnv()
const db = createDb()
const app = await buildApp({ env, db, otpSender: consoleOtpSender })

if (env.SMS_PROVIDER === 'console') {
  app.log.warn('SMS_PROVIDER=console: login codes are written to this log, not sent by SMS.')
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
