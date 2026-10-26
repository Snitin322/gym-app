import type { Db } from './db'

export const ONTHEC_GYM_SLUG = 'onthec'

/** Idempotent: safe to run any number of times. */
export async function seedDatabase(db: Db) {
  const gym = await db.gym.upsert({
    where: { slug: ONTHEC_GYM_SLUG },
    update: {},
    create: { slug: ONTHEC_GYM_SLUG, name: 'Onthec Gym' },
  })
  return { gym }
}
