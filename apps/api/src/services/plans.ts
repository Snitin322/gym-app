import { z } from 'zod'
import { ErrorCode, type MembershipPlan, type PlanInput, type planUpdateSchema } from '@onthec/shared'
import type { TenantDb } from '../db/tenant'
import { AppError } from '../errors'
import { isUniqueViolation } from '../lib/prisma-errors'

const planSelect = {
  id: true,
  name: true,
  durationMonths: true,
  pricePaise: true,
  maxFreezeDays: true,
  description: true,
  active: true,
} as const

function nameTaken() {
  return new AppError(409, ErrorCode.PLAN_NAME_TAKEN, 'A plan with this name already exists.')
}

export async function listPlans(db: TenantDb): Promise<MembershipPlan[]> {
  return db.membershipPlan.findMany({
    select: planSelect,
    orderBy: [{ active: 'desc' }, { durationMonths: 'asc' }, { name: 'asc' }],
  })
}

export async function createPlan(db: TenantDb, gymId: string, input: PlanInput): Promise<MembershipPlan> {
  try {
    return await db.membershipPlan.create({ data: { ...input, gymId }, select: planSelect })
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

/** Price changes apply to new sales only: memberships keep the price they were sold at. */
export async function updatePlan(
  db: TenantDb,
  id: string,
  input: z.infer<typeof planUpdateSchema>,
): Promise<MembershipPlan> {
  try {
    return await db.membershipPlan.update({ where: { id }, data: input, select: planSelect })
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}
