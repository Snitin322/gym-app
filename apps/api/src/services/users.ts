import type { UserSummary } from '@onthec/shared'
import type { TenantDb } from '../db/tenant'

const summary = { id: true, name: true, phone: true, role: true } as const

export async function listUsers(db: TenantDb): Promise<UserSummary[]> {
  return db.user.findMany({ where: { deletedAt: null }, select: summary, orderBy: { name: 'asc' } })
}

export async function getUser(db: TenantDb, id: string): Promise<UserSummary | null> {
  return db.user.findFirst({ where: { id, deletedAt: null }, select: summary })
}
