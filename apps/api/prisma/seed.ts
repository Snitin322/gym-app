import { normalizePhone } from '@onthec/shared'
import { createDb } from '../src/db/unscoped'
import { seedDatabase } from '../src/seed'

try {
  process.loadEnvFile()
} catch {
  // No .env file: rely on variables already set in the environment.
}

let owner: { phone: string; name: string } | undefined
if (process.env.SEED_OWNER_PHONE) {
  const phone = normalizePhone(process.env.SEED_OWNER_PHONE)
  if (!phone) throw new Error('SEED_OWNER_PHONE is not a valid Indian mobile number')
  owner = { phone, name: process.env.SEED_OWNER_NAME || 'Owner' }
}

const db = createDb()
try {
  const result = await seedDatabase(db, { owner })
  console.log(`Seeded gym "${result.gym.name}" (${result.gym.id})`)
  if (result.owner) console.log(`Owner: ${result.owner.name} (${result.owner.role})`)
  else console.log('No SEED_OWNER_PHONE set: skipped creating the owner account.')
} finally {
  await db.$disconnect()
}
