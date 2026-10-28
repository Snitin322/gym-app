import type { Db } from './db/unscoped'
import { STARTER_EXERCISES } from './services/workout-starter'

export const ONTHEC_GYM_SLUG = 'onthec'

export interface SeedOptions {
  /** Creates (or keeps) this person as the gym's owner. Phone in E.164. */
  owner?: { phone: string; name: string }
}

/** Idempotent: safe to run any number of times. */
export async function seedDatabase(db: Db, options: SeedOptions = {}) {
  const gym = await db.gym.upsert({
    where: { slug: ONTHEC_GYM_SLUG },
    update: {},
    create: { slug: ONTHEC_GYM_SLUG, name: 'Onthec Gym' },
  })

  const owner = options.owner
    ? await db.user.upsert({
        where: { gymId_phone: { gymId: gym.id, phone: options.owner.phone } },
        update: {},
        create: { gymId: gym.id, phone: options.owner.phone, name: options.owner.name, role: 'owner' },
      })
    : null

  // Common exercises for the workout library (names already there are skipped).
  await db.workoutExercise.createMany({
    data: STARTER_EXERCISES.map((e) => ({ ...e, gymId: gym.id })),
    skipDuplicates: true,
  })

  return { gym, owner }
}
