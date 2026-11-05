import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  CHECK_IN_POSES,
  ErrorCode,
  MAX_PHOTO_BYTES,
  weekOf,
  type CheckInPose,
  type CheckInToReview,
  type CheckInView,
  type IsoDate,
  type MemberCheckIns,
  type MyCheckIns,
  type Role,
  type checkInInputSchema,
} from '@onthec/shared'
import type { TenantDb, TenantTx } from '../db/tenant'
import { AppError } from '../errors'
import { fromDbDate, toDbDate } from '../lib/dates'
import type { PhotoStore } from '../storage'
import { notFound } from './workouts'

export interface Viewer {
  gymId: string
  userId: string
  role: Role
}

/** Photo links last long enough to look through a check-in, then stop working. */
const PHOTO_LINK_SECONDS = 15 * 60

const PHOTO_FIELD = { front: 'frontPhoto', left: 'leftPhoto', right: 'rightPhoto' } as const

const checkInInclude = { reviewedBy: { select: { name: true } } } as const satisfies Prisma.CheckInInclude
type CheckInRow = Prisma.CheckInGetPayload<{ include: typeof checkInInclude }>

async function toView(row: CheckInRow, store: PhotoStore | null): Promise<CheckInView> {
  const photos: CheckInView['photos'] = {}
  if (store) {
    for (const pose of CHECK_IN_POSES) {
      const key = row[PHOTO_FIELD[pose]]
      if (key) photos[pose] = await store.signedUrl(key, PHOTO_LINK_SECONDS)
    }
  }
  return {
    id: row.id,
    memberId: row.memberId,
    weekOf: fromDbDate(row.weekOf),
    submittedAt: row.updatedAt.toISOString(),
    weightKg: row.weightKg,
    bodyFatPct: row.bodyFatPct,
    waistCm: row.waistCm,
    chestCm: row.chestCm,
    hipsCm: row.hipsCm,
    armCm: row.armCm,
    thighCm: row.thighCm,
    note: row.note,
    photos,
    coachReply: row.coachReply,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedByName: row.reviewedBy?.name ?? null,
  }
}

async function listFor(db: TenantDb, memberId: string, store: PhotoStore | null) {
  const rows = await db.checkIn.findMany({ where: { memberId }, include: checkInInclude, orderBy: { weekOf: 'desc' } })
  return Promise.all(rows.map((r) => toView(r, store)))
}

/** Like health details: the member, their coach and the owner. Anyone else gets "not found". */
async function loadMemberFor(db: TenantDb | TenantTx, viewer: Viewer, memberId: string) {
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { id: true, userId: true, coachId: true, user: { select: { name: true } } },
  })
  if (!member) throw notFound('Member')
  const allowed = viewer.role === 'owner' || member.coachId === viewer.userId || member.userId === viewer.userId
  if (!allowed) throw notFound('Member')
  return member
}

async function ownMember(db: TenantDb | TenantTx, userId: string) {
  const member = await db.member.findUnique({
    where: { userId },
    select: { id: true, coach: { select: { id: true, name: true } } },
  })
  if (!member) throw new AppError(404, ErrorCode.NOT_A_MEMBER, 'Only members send check-ins.')
  return member
}

// ---------------------------------------------------------------------------
// The member
// ---------------------------------------------------------------------------

export async function getMyCheckIns(
  db: TenantDb,
  userId: string,
  store: PhotoStore | null,
  today: IsoDate,
): Promise<MyCheckIns> {
  const member = await ownMember(db, userId)
  const history = await listFor(db, member.id, store)
  const week = weekOf(today)
  return {
    weekOf: week,
    current: history.find((c) => c.weekOf === week) ?? null,
    history,
    coach: member.coach,
    photosEnabled: store !== null,
  }
}

function lockedIfReviewed(row: { reviewedAt: Date | null } | null) {
  if (row?.reviewedAt) {
    throw new AppError(
      409,
      ErrorCode.CHECK_IN_REVIEWED,
      'Your coach has already replied to this week’s check-in, so it can’t be changed.',
    )
  }
}

/** Sends (or updates) this week's check-in. Locked once the coach has replied. */
export async function saveMyCheckIn(
  db: TenantDb,
  viewer: Viewer,
  input: z.output<typeof checkInInputSchema>,
  store: PhotoStore | null,
  today: IsoDate,
): Promise<CheckInView> {
  const member = await ownMember(db, viewer.userId)
  const week = toDbDate(weekOf(today))
  const data = {
    weightKg: input.weightKg,
    bodyFatPct: input.bodyFatPct ?? null,
    waistCm: input.waistCm ?? null,
    chestCm: input.chestCm ?? null,
    hipsCm: input.hipsCm ?? null,
    armCm: input.armCm ?? null,
    thighCm: input.thighCm ?? null,
    note: input.note,
  }
  const row = await db.$transaction(async (tx) => {
    const existing = await tx.checkIn.findUnique({ where: { memberId_weekOf: { memberId: member.id, weekOf: week } } })
    lockedIfReviewed(existing)
    return existing
      ? tx.checkIn.update({ where: { id: existing.id }, data, include: checkInInclude })
      : tx.checkIn.create({
          data: { ...data, gymId: viewer.gymId, memberId: member.id, weekOf: week },
          include: checkInInclude,
        })
  })
  return toView(row, store)
}

/** JPEG, PNG or WebP, recognised by their first bytes (not just the declared type). */
function photoType(body: Uint8Array): string | null {
  const b = body
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  const text = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Adds or replaces one photo of this week's check-in. The old file is deleted. */
export async function saveMyPhoto(
  db: TenantDb,
  viewer: Viewer,
  checkInId: string,
  pose: CheckInPose,
  body: Uint8Array,
  store: PhotoStore | null,
  today: IsoDate,
): Promise<CheckInView> {
  if (!store) throw new AppError(503, ErrorCode.PHOTOS_NOT_SET_UP, 'Photo uploads aren’t set up yet.')
  const member = await ownMember(db, viewer.userId)
  const row = await db.checkIn.findFirst({ where: { id: checkInId, memberId: member.id } })
  if (!row) throw notFound('Check-in')
  if (fromDbDate(row.weekOf) !== weekOf(today)) {
    throw new AppError(409, ErrorCode.CHECK_IN_REVIEWED, 'Only this week’s check-in can have new photos.')
  }
  lockedIfReviewed(row)
  const type = photoType(body)
  if (!type || body.length > MAX_PHOTO_BYTES) {
    throw new AppError(400, ErrorCode.BAD_PHOTO, 'That photo couldn’t be used. Try another one (JPEG or PNG).')
  }

  const ext = type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1]
  // A new name each time, so a replaced photo never shows from a cache.
  const key = `${viewer.gymId}/check-ins/${row.id}/${pose}-${randomUUID()}.${ext}`
  await store.put(key, body, type)
  const field = PHOTO_FIELD[pose]
  const old = row[field]
  const saved = await db.checkIn.update({ where: { id: row.id }, data: { [field]: key }, include: checkInInclude })
  if (old) await store.delete(old).catch(() => undefined)
  return toView(saved, store)
}

// ---------------------------------------------------------------------------
// The coach (or the owner)
// ---------------------------------------------------------------------------

export async function getMemberCheckIns(
  db: TenantDb,
  viewer: Viewer,
  memberId: string,
  store: PhotoStore | null,
): Promise<MemberCheckIns> {
  const member = await loadMemberFor(db, viewer, memberId)
  return {
    member: { id: member.id, name: member.user.name },
    checkIns: await listFor(db, member.id, store),
    photosEnabled: store !== null,
  }
}

/** The coach's reply; the check-in is then reviewed (and locked for the member). Replies can be edited. */
export async function reviewCheckIn(
  db: TenantDb,
  viewer: Viewer,
  checkInId: string,
  reply: string,
  store: PhotoStore | null,
): Promise<CheckInView> {
  const row = await db.checkIn.findUnique({ where: { id: checkInId }, select: { memberId: true } })
  if (!row) throw notFound('Check-in')
  const member = await loadMemberFor(db, viewer, row.memberId)
  if (member.userId === viewer.userId) throw notFound('Check-in')
  const saved = await db.checkIn.update({
    where: { id: checkInId },
    data: { coachReply: reply, reviewedAt: new Date(), reviewedById: viewer.userId },
    include: checkInInclude,
  })
  return toView(saved, store)
}

/** Check-ins from the viewer's own coaching clients still waiting for a reply, oldest first. */
export async function checkInsToReview(
  db: TenantDb,
  viewer: Viewer,
  store: PhotoStore | null,
): Promise<CheckInToReview[]> {
  const rows = await db.checkIn.findMany({
    where: { reviewedAt: null, member: { coachId: viewer.userId } },
    include: { ...checkInInclude, member: { select: { id: true, user: { select: { name: true } } } } },
    orderBy: { updatedAt: 'asc' },
  })
  return Promise.all(
    rows.map(async (r) => ({ member: { id: r.member.id, name: r.member.user.name }, checkIn: await toView(r, store) })),
  )
}
