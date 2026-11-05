import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  COACH_ROLES,
  CURRENT_NOTICE_VERSION,
  ErrorCode,
  type ClientProfile,
  type ClientProfileView,
  type Role,
  type clientProfileInputSchema,
  type myClientProfileInputSchema,
} from '@onthec/shared'
import type { TenantDb, TenantTx } from '../db/tenant'
import { AppError } from '../errors'
import { fromDbDate, toDbDate } from '../lib/dates'
import { notFound } from './workouts'

export interface Viewer {
  gymId: string
  userId: string
  role: Role
}

const memberSelect = {
  id: true,
  userId: true,
  coachId: true,
  user: { select: { name: true } },
  coach: { select: { id: true, name: true } },
  clientProfile: { include: { updatedBy: { select: { name: true } } } },
} as const satisfies Prisma.MemberSelect

type MemberRow = Prisma.MemberGetPayload<{ select: typeof memberSelect }>

/**
 * Health details are private: the member, their coach and the owner. Admins and other trainers
 * (including a PT-only trainer) get "not found", the same as another gym's member.
 */
function canSeeHealth(viewer: Viewer, member: { userId: string; coachId: string | null }) {
  return viewer.role === 'owner' || member.coachId === viewer.userId || member.userId === viewer.userId
}

async function loadForViewer(db: TenantDb | TenantTx, viewer: Viewer, memberId: string): Promise<MemberRow> {
  const member = await db.member.findUnique({ where: { id: memberId }, select: memberSelect })
  if (!member || !canSeeHealth(viewer, member)) throw notFound('Member')
  return member
}

async function healthConsentAt(db: TenantDb | TenantTx, userId: string): Promise<Date | null> {
  const consent = await db.consent.findFirst({
    where: { userId, purpose: 'health', withdrawnAt: null },
    orderBy: { grantedAt: 'desc' },
    select: { grantedAt: true },
  })
  return consent?.grantedAt ?? null
}

function toProfile(row: NonNullable<MemberRow['clientProfile']>): ClientProfile {
  return {
    dateOfBirth: row.dateOfBirth ? fromDbDate(row.dateOfBirth) : null,
    sex: row.sex,
    heightCm: row.heightCm,
    startWeightKg: row.startWeightKg,
    bodyFatPct: row.bodyFatPct,
    goal: row.goal,
    dietPreference: row.dietPreference,
    medicalConditions: row.medicalConditions,
    injuries: row.injuries,
    foodAllergies: row.foodAllergies,
    medicines: row.medicines,
    lifestyle: row.lifestyle,
    trainingExperience: row.trainingExperience,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy.name,
  }
}

async function toView(db: TenantDb | TenantTx, member: MemberRow): Promise<ClientProfileView> {
  const consentAt = await healthConsentAt(db, member.userId)
  return {
    member: { id: member.id, name: member.user.name },
    coach: member.coach,
    profile: member.clientProfile ? toProfile(member.clientProfile) : null,
    healthConsentAt: consentAt?.toISOString() ?? null,
  }
}

export async function getClientProfile(db: TenantDb, viewer: Viewer, memberId: string): Promise<ClientProfileView> {
  return toView(db, await loadForViewer(db, viewer, memberId))
}

type ProfileInput = z.output<typeof clientProfileInputSchema>

async function upsertProfile(tx: TenantTx, viewer: Viewer, memberId: string, input: ProfileInput) {
  const data = {
    ...input,
    dateOfBirth: input.dateOfBirth ? toDbDate(input.dateOfBirth) : null,
    updatedById: viewer.userId,
  }
  await tx.clientProfile.upsert({
    where: { memberId },
    create: { gymId: viewer.gymId, memberId, ...data },
    update: data,
  })
}

/** The coach or the owner saves a client's profile (details the client gave them). */
export async function saveClientProfile(
  db: TenantDb,
  viewer: Viewer,
  memberId: string,
  input: ProfileInput,
): Promise<ClientProfileView> {
  await db.$transaction(async (tx) => {
    await loadForViewer(tx, viewer, memberId)
    await upsertProfile(tx, viewer, memberId, input)
  })
  return getClientProfile(db, viewer, memberId)
}

async function ownMemberId(db: TenantDb | TenantTx, userId: string): Promise<string> {
  const member = await db.member.findUnique({ where: { userId }, select: { id: true } })
  if (!member) throw new AppError(404, ErrorCode.NOT_A_MEMBER, 'Only members have a health profile.')
  return member.id
}

export async function getMyClientProfile(db: TenantDb, viewer: Viewer): Promise<ClientProfileView> {
  return getClientProfile(db, viewer, await ownMemberId(db, viewer.userId))
}

/** A member saves their own details. The first save needs their agreement to share health details. */
export async function saveMyClientProfile(
  db: TenantDb,
  viewer: Viewer,
  input: z.output<typeof myClientProfileInputSchema>,
): Promise<ClientProfileView> {
  const { healthConsent, ...profile } = input
  const memberId = await ownMemberId(db, viewer.userId)
  await db.$transaction(async (tx) => {
    if (!(await healthConsentAt(tx, viewer.userId))) {
      if (!healthConsent) {
        throw new AppError(
          400,
          ErrorCode.HEALTH_CONSENT_REQUIRED,
          'Agree to share these details with your coach to save them.',
        )
      }
      await tx.consent.create({
        data: { gymId: viewer.gymId, userId: viewer.userId, purpose: 'health', noticeVersion: CURRENT_NOTICE_VERSION },
      })
    }
    await upsertProfile(tx, viewer, memberId, profile)
  })
  return getClientProfile(db, viewer, memberId)
}

/** A member withdraws their agreement: the health profile is deleted and the consent marked withdrawn. */
export async function withdrawMyHealthDetails(db: TenantDb, viewer: Viewer): Promise<ClientProfileView> {
  const memberId = await ownMemberId(db, viewer.userId)
  await db.$transaction(async (tx) => {
    await tx.clientProfile.deleteMany({ where: { memberId } })
    await tx.consent.updateMany({
      where: { userId: viewer.userId, purpose: 'health', withdrawnAt: null },
      data: { withdrawnAt: new Date() },
    })
  })
  return getClientProfile(db, viewer, memberId)
}

/** Sets or clears a member's coach (a trainer or the owner of this gym). Desk only. */
export async function setCoach(db: TenantDb, memberId: string, coachId: string | null) {
  await db.$transaction(async (tx) => {
    const member = await tx.member.findUnique({ where: { id: memberId }, select: { id: true } })
    if (!member) throw notFound('Member')
    if (coachId) {
      const coach = await tx.user.findUnique({ where: { id: coachId }, select: { role: true, deletedAt: true } })
      if (!coach || coach.deletedAt || !(COACH_ROLES as readonly string[]).includes(coach.role)) {
        throw new AppError(400, ErrorCode.NOT_A_COACH, 'Pick a trainer or the owner as the coach.')
      }
    }
    await tx.member.update({ where: { id: memberId }, data: { coachId } })
  })
}
