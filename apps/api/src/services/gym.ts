import { z } from 'zod'
import { ErrorCode, type GymDetails, type gymDetailsSchema } from '@onthec/shared'
import type { TenantDb } from '../db/tenant'
import { AppError } from '../errors'

const gymSelect = {
  id: true,
  name: true,
  legalName: true,
  address: true,
  city: true,
  pincode: true,
  stateCode: true,
  gstin: true,
  sacCode: true,
  invoicePrefix: true,
  contactPhone: true,
  email: true,
} as const

/** The session's own gym (the tenant client can't see any other). */
export async function getGymDetails(db: TenantDb, gymId: string): Promise<GymDetails> {
  return db.gym.findUniqueOrThrow({ where: { id: gymId }, select: gymSelect })
}

export async function updateGymDetails(
  db: TenantDb,
  gymId: string,
  input: z.infer<typeof gymDetailsSchema>,
): Promise<GymDetails> {
  const current = await getGymDetails(db, gymId)
  const gstin = input.gstin === undefined ? current.gstin : input.gstin
  let stateCode = input.stateCode === undefined ? current.stateCode : input.stateCode

  // A GSTIN starts with its state code: fill the state in, or refuse a mismatch.
  if (gstin && !stateCode) stateCode = gstin.slice(0, 2)
  if (gstin && stateCode && gstin.slice(0, 2) !== stateCode) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'The GSTIN belongs to a different state than the one selected.',
    )
  }

  return db.gym.update({ where: { id: gymId }, data: { ...input, stateCode }, select: gymSelect })
}
