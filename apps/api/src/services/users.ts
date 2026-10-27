import { z } from 'zod'
import { ErrorCode, type Role, type UserSummary, type createStaffSchema } from '@onthec/shared'
import type { TenantDb } from '../db/tenant'
import { AppError } from '../errors'
import { isUniqueViolation } from '../lib/prisma-errors'

const summary = { id: true, name: true, phone: true, role: true } as const

const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, trainer: 2, member: 3 }

/** All users of the gym, or only staff (owner, admins, trainers) ordered by role then name. */
export async function listUsers(db: TenantDb, kind: 'all' | 'staff' = 'all'): Promise<UserSummary[]> {
  const users = await db.user.findMany({
    where: { deletedAt: null, ...(kind === 'staff' ? { role: { in: ['owner', 'admin', 'trainer'] } } : {}) },
    select: summary,
    orderBy: { name: 'asc' },
  })
  return kind === 'staff' ? users.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) : users
}

export async function getUser(db: TenantDb, id: string): Promise<UserSummary | null> {
  return db.user.findFirst({ where: { id, deletedAt: null }, select: summary })
}

export function phoneTaken() {
  return new AppError(409, ErrorCode.PHONE_TAKEN, 'Someone at this gym already uses this phone number.')
}

/** Owners can add trainers and admins; admins can add trainers only. */
export async function createStaff(
  db: TenantDb,
  gymId: string,
  actorRole: Role,
  input: z.infer<typeof createStaffSchema>,
): Promise<UserSummary> {
  if (input.role === 'admin' && actorRole !== 'owner') {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the owner can add admins.')
  }
  try {
    return await db.user.create({ data: { ...input, gymId }, select: summary })
  } catch (error) {
    if (isUniqueViolation(error)) throw phoneTaken()
    throw error
  }
}
