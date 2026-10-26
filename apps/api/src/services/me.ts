import { CURRENT_NOTICE_VERSION, type SessionUser } from '@onthec/shared'
import type { TenantDb } from '../db/tenant'

/** Purposes a member must accept before using the app. */
const REQUIRED_CONSENTS = ['terms', 'privacy'] as const

export async function getSessionUser(db: TenantDb, userId: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, phone: true, role: true, deletedAt: true, gym: { select: { id: true, name: true } } },
  })
  if (!user || user.deletedAt) return null

  const accepted = await db.consent.count({
    where: {
      userId,
      noticeVersion: CURRENT_NOTICE_VERSION,
      purpose: { in: [...REQUIRED_CONSENTS] },
      withdrawnAt: null,
    },
  })

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    gym: user.gym,
    consentRequired: accepted < REQUIRED_CONSENTS.length,
  }
}

export async function recordConsent(db: TenantDb, gymId: string, userId: string) {
  await db.consent.createMany({
    data: REQUIRED_CONSENTS.map((purpose) => ({ gymId, userId, purpose, noticeVersion: CURRENT_NOTICE_VERSION })),
  })
}
