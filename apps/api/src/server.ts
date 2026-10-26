import { buildApp } from './app'
import { createDb } from './db'
import { loadEnv } from './env'

if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile()
  } catch {
    // No .env file: rely on variables already set in the environment.
  }
}

const env = loadEnv()
const db = createDb()
const app = await buildApp({ env, db })

async function shutdown(signal: NodeJS.Signals) {
  app.log.info(`${signal} received, shutting down`)
  await app.close()
  await db.$disconnect()
  process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

await app.listen({ host: env.HOST, port: env.PORT })
