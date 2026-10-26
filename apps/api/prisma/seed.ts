import { createDb } from '../src/db'
import { seedDatabase } from '../src/seed'

try {
  process.loadEnvFile()
} catch {
  // No .env file: rely on variables already set in the environment.
}

const db = createDb()
try {
  const { gym } = await seedDatabase(db)
  console.log(`Seeded gym "${gym.name}" (${gym.id})`)
} finally {
  await db.$disconnect()
}
