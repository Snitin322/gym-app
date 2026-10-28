import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  ErrorCode,
  addDays,
  disputeUntil,
  freeCancelUntil,
  generateSlots,
  indiaDateTime,
  ptConfirmation,
  ptRulesFromSettings,
  todayInIndia,
  undoUntil,
  type AvailabilityInput,
  type IsoDate,
  type PtRules,
  type PtSessionView,
  type PtSlotsResponse,
  type Role,
  type TimeOffResult,
  type TimeOffView,
  type TrainerAvailabilityView,
  type ptRulesUpdateSchema,
  type timeOffInputSchema,
} from '@onthec/shared'
import type { TenantDb, TenantTx } from '../db/tenant'
import { AppError } from '../errors'
import { fromDbDate } from '../lib/dates'

/** Who is acting. The same rules apply whether a member, their trainer or the desk makes the change. */
export interface Viewer {
  gymId: string
  userId: string
  role: Role
}

// Serializable: a booking checks the balance and free time, then writes, in one consistent view.
export const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
const DEFAULT_SESSION_MINUTES = 60
const DAY_MS = 24 * 60 * 60_000

export const isManager = (viewer: Viewer) => viewer.role === 'admin' || viewer.role === 'owner'

export function notFound(what: string) {
  return new AppError(404, ErrorCode.NOT_FOUND, `${what} not found`)
}

function slotTaken() {
  return new AppError(409, ErrorCode.PT_SLOT_UNAVAILABLE, 'That time is no longer available. Please pick another slot.')
}

/** The database refused an overlapping booking (see the exclusion constraints in the migration). */
function isOverlapViolation(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return message.includes('pt_sessions_no_trainer_overlap') || message.includes('pt_sessions_no_member_overlap')
}

/** Runs a booking change, turning a lost race for the same time into a friendly "slot taken". */
async function guardOverlap<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (isOverlapViolation(error)) throw slotTaken()
    throw error
  }
}

// ---------------------------------------------------------------------------
// Gym rules
// ---------------------------------------------------------------------------

export async function loadRules(db: TenantDb | TenantTx): Promise<PtRules> {
  const gym = await db.gym.findFirstOrThrow({ select: { settings: true } })
  return ptRulesFromSettings(gym.settings)
}

export async function getPtRules(db: TenantDb): Promise<PtRules> {
  return loadRules(db)
}

export async function updatePtRules(
  db: TenantDb,
  gymId: string,
  input: z.infer<typeof ptRulesUpdateSchema>,
): Promise<PtRules> {
  return db.$transaction(async (tx) => {
    const gym = await tx.gym.findUniqueOrThrow({ where: { id: gymId }, select: { settings: true } })
    const settings = (gym.settings ?? {}) as Prisma.JsonObject
    const ptRules = { ...ptRulesFromSettings(settings), ...input }
    await tx.gym.update({ where: { id: gymId }, data: { settings: { ...settings, ptRules } } })
    return ptRules
  })
}

// ---------------------------------------------------------------------------
// Trainer availability and time off
// ---------------------------------------------------------------------------

/** Trainers manage their own hours; owners and admins manage everyone's. */
async function loadTrainer(db: TenantDb | TenantTx, viewer: Viewer, trainerId: string) {
  const allowed = isManager(viewer) || (viewer.role === 'trainer' && viewer.userId === trainerId)
  if (!allowed) throw notFound('Trainer')
  const user = await db.user.findUnique({
    where: { id: trainerId },
    select: { id: true, name: true, role: true, deletedAt: true },
  })
  if (!user || user.role !== 'trainer' || user.deletedAt) throw notFound('Trainer')
  return user
}

function toTimeOffView(row: { id: string; startsAt: Date; endsAt: Date; reason: string | null }): TimeOffView {
  return { id: row.id, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), reason: row.reason }
}

async function sessionMinutesOf(db: TenantDb | TenantTx, trainerId: string) {
  const profile = await db.trainerProfile.findUnique({ where: { userId: trainerId }, select: { sessionMinutes: true } })
  return profile?.sessionMinutes ?? DEFAULT_SESSION_MINUTES
}

async function weeklyHours(db: TenantDb | TenantTx, trainerId: string) {
  return db.trainerAvailability.findMany({
    where: { trainerId },
    select: { weekday: true, startMinute: true, endMinute: true },
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
  })
}

export async function getAvailability(
  db: TenantDb,
  viewer: Viewer,
  trainerId: string,
  now: Date,
): Promise<TrainerAvailabilityView> {
  const trainer = await loadTrainer(db, viewer, trainerId)
  const [sessionMinutes, windows, timeOff] = await Promise.all([
    sessionMinutesOf(db, trainerId),
    weeklyHours(db, trainerId),
    db.trainerTimeOff.findMany({ where: { trainerId, endsAt: { gt: now } }, orderBy: { startsAt: 'asc' } }),
  ])
  return { trainerId, trainerName: trainer.name, sessionMinutes, windows, timeOff: timeOff.map(toTimeOffView) }
}

/** Replaces the trainer's weekly hours and session length. Sessions already booked stay as they are. */
export async function setAvailability(
  db: TenantDb,
  viewer: Viewer,
  trainerId: string,
  input: AvailabilityInput,
  now: Date,
): Promise<TrainerAvailabilityView> {
  await db.$transaction(async (tx) => {
    await loadTrainer(tx, viewer, trainerId)
    await tx.trainerProfile.upsert({
      where: { userId: trainerId },
      create: { gymId: viewer.gymId, userId: trainerId, sessionMinutes: input.sessionMinutes },
      update: { sessionMinutes: input.sessionMinutes },
    })
    await tx.trainerAvailability.deleteMany({ where: { trainerId } })
    if (input.windows.length > 0) {
      await tx.trainerAvailability.createMany({
        data: input.windows.map((w) => ({ ...w, gymId: viewer.gymId, trainerId })),
      })
    }
  })
  return getAvailability(db, viewer, trainerId, now)
}

/** Adds time off. Sessions booked inside it are cancelled for free (no session is used up). */
export async function addTimeOff(
  db: TenantDb,
  viewer: Viewer,
  trainerId: string,
  input: z.infer<typeof timeOffInputSchema>,
  now: Date,
): Promise<TimeOffResult> {
  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  return db.$transaction(async (tx) => {
    await loadTrainer(tx, viewer, trainerId)
    const timeOff = await tx.trainerTimeOff.create({
      data: { gymId: viewer.gymId, trainerId, startsAt, endsAt, reason: input.reason, createdById: viewer.userId },
    })
    const clashing = await tx.ptSession.findMany({
      where: { trainerId, status: 'booked', startsAt: { lt: endsAt, gte: now }, endsAt: { gt: startsAt } },
      select: { id: true },
    })
    const ids = clashing.map((s) => s.id)
    if (ids.length > 0) {
      await tx.ptSession.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'cancelled',
          cancelledAt: now,
          cancelledById: viewer.userId,
          cancelReason: input.reason ? `Trainer time off: ${input.reason}` : 'Trainer time off',
        },
      })
    }
    const rules = await loadRules(tx)
    const cancelled = await tx.ptSession.findMany({ where: { id: { in: ids } }, include: sessionInclude, orderBy: { startsAt: 'asc' } })
    return { timeOff: toTimeOffView(timeOff), cancelledSessions: cancelled.map((s) => toSessionView(s, rules, now)) }
  }, SERIALIZABLE)
}

export async function removeTimeOff(db: TenantDb, viewer: Viewer, trainerId: string, timeOffId: string) {
  await loadTrainer(db, viewer, trainerId)
  const { count } = await db.trainerTimeOff.deleteMany({ where: { id: timeOffId, trainerId } })
  if (count === 0) throw notFound('Time off')
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const sessionInclude = {
  purchase: { select: { packageName: true } },
  trainer: { select: { id: true, name: true } },
  member: { select: { id: true, user: { select: { name: true, phone: true } } } },
  bookedBy: { select: { name: true } },
  cancelledBy: { select: { name: true } },
  markedBy: { select: { name: true } },
  resolvedBy: { select: { name: true } },
} as const satisfies Prisma.PtSessionInclude

export type SessionRow = Prisma.PtSessionGetPayload<{ include: typeof sessionInclude }>

export function toSessionView(row: SessionRow, rules: PtRules, now: Date): PtSessionView {
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    packageName: row.purchase.packageName,
    trainer: row.trainer,
    member: { id: row.member.id, name: row.member.user.name, phone: row.member.user.phone },
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    lateCancel: row.lateCancel,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    cancelledByName: row.cancelledBy?.name ?? null,
    bookedByName: row.bookedBy.name,
    freeCancelUntil: freeCancelUntil(row.startsAt, rules).toISOString(),
    trainerNotes: row.trainerNotes,
    markedAt: row.markedAt?.toISOString() ?? null,
    markedByName: row.markedBy?.name ?? null,
    confirmation: ptConfirmation(row, now),
    disputeUntil: row.markedAt ? disputeUntil(row.markedAt).toISOString() : null,
    undoUntil: row.markedAt ? undoUntil(row.markedAt).toISOString() : null,
    disputedAt: row.disputedAt?.toISOString() ?? null,
    disputeReason: row.disputeReason,
    resolution: row.resolution,
    resolutionNote: row.resolutionNote,
    resolvedByName: row.resolvedBy?.name ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  }
}

/**
 * A PT package as seen by someone allowed to book on it: the member who owns it, its trainer,
 * or the desk. Anyone else gets "not found" (we don't reveal it exists).
 */
async function loadPurchaseFor(tx: TenantTx | TenantDb, viewer: Viewer, purchaseId: string) {
  const purchase = await tx.ptPurchase.findUnique({
    where: { id: purchaseId },
    include: {
      trainer: { select: { id: true, name: true } },
      member: { select: { userId: true } },
      ledger: { select: { change: true } },
      sessions: { where: { status: 'booked' }, select: { id: true } },
    },
  })
  const allowed =
    purchase &&
    (isManager(viewer) ||
      (viewer.role === 'trainer' && purchase.trainerId === viewer.userId) ||
      purchase.member.userId === viewer.userId)
  if (!allowed) throw notFound('PT package')
  return purchase
}

type PurchaseForBooking = Awaited<ReturnType<typeof loadPurchaseFor>>

/** Open slots for a package: its trainer's hours, minus their time off and bookings, and the member's other bookings. */
async function openSlots(
  tx: TenantTx | TenantDb,
  purchase: PurchaseForBooking,
  rules: PtRules,
  now: Date,
  ignoreSessionId?: string,
) {
  const until = indiaDateTime(addDays(todayInIndia(now), rules.bookingHorizonDays + 1), 0)
  const overlapsWindow = { startsAt: { lt: until }, endsAt: { gt: now } }
  const [sessionMinutes, windows, timeOff, booked] = await Promise.all([
    sessionMinutesOf(tx, purchase.trainerId),
    weeklyHours(tx, purchase.trainerId),
    tx.trainerTimeOff.findMany({ where: { trainerId: purchase.trainerId, ...overlapsWindow }, select: { startsAt: true, endsAt: true } }),
    tx.ptSession.findMany({
      where: {
        status: 'booked',
        OR: [{ trainerId: purchase.trainerId }, { memberId: purchase.memberId }],
        ...(ignoreSessionId ? { id: { not: ignoreSessionId } } : {}),
        ...overlapsWindow,
      },
      select: { startsAt: true, endsAt: true },
    }),
  ])
  const slots = generateSlots({
    windows,
    sessionMinutes,
    busy: [...timeOff, ...booked],
    now,
    rules,
    lastDay: fromDbDate(purchase.expiresOn),
  })
  return { sessionMinutes, slots }
}

export async function getSlots(db: TenantDb, viewer: Viewer, purchaseId: string, now: Date): Promise<PtSlotsResponse> {
  const purchase = await loadPurchaseFor(db, viewer, purchaseId)
  const rules = await loadRules(db)
  const { sessionMinutes, slots } = await openSlots(db, purchase, rules, now)
  return { purchaseId, trainer: purchase.trainer, sessionMinutes, rules, slots }
}

/** Checks the time is one of the open slots and returns its end. */
function matchSlot(slots: { startsAt: string; endsAt: string }[], startsAt: Date) {
  const slot = slots.find((s) => Date.parse(s.startsAt) === startsAt.getTime())
  if (!slot) throw slotTaken()
  return new Date(slot.endsAt)
}

export async function loadSessionView(tx: TenantTx | TenantDb, id: string, rules: PtRules, now: Date) {
  return toSessionView(await tx.ptSession.findUniqueOrThrow({ where: { id }, include: sessionInclude }), rules, now)
}

/**
 * Books one session on a package. Allowed while the package is valid on that day and
 * sessions left − sessions already booked ≥ 1.
 */
export async function bookSession(
  db: TenantDb,
  viewer: Viewer,
  purchaseId: string,
  startsAtIso: string,
  now: Date,
): Promise<PtSessionView> {
  const startsAt = new Date(startsAtIso)
  return guardOverlap(() =>
    db.$transaction(async (tx) => {
      const purchase = await loadPurchaseFor(tx, viewer, purchaseId)
      if (todayInIndia(now) > fromDbDate(purchase.expiresOn)) {
        throw new AppError(409, ErrorCode.PT_PACKAGE_EXPIRED, 'This PT package has expired. Ask the front desk to extend it.')
      }
      const left = purchase.ledger.reduce((sum, line) => sum + line.change, 0)
      const booked = purchase.sessions.length
      if (left - booked < 1) {
        throw new AppError(
          409,
          ErrorCode.PT_NO_SESSIONS_LEFT,
          booked > 0
            ? `No sessions left to book: ${left} left and ${booked} already booked.`
            : 'No sessions left on this package.',
        )
      }
      const rules = await loadRules(tx)
      const { slots } = await openSlots(tx, purchase, rules, now)
      const endsAt = matchSlot(slots, startsAt)
      const session = await tx.ptSession.create({
        data: {
          gymId: viewer.gymId,
          purchaseId: purchase.id,
          trainerId: purchase.trainerId,
          memberId: purchase.memberId,
          startsAt,
          endsAt,
          bookedById: viewer.userId,
        },
      })
      return loadSessionView(tx, session.id, rules, now)
    }, SERIALIZABLE),
  )
}

/** A booked session as seen by its member, its trainer or the desk. */
async function loadSessionFor(tx: TenantTx, viewer: Viewer, sessionId: string) {
  const session = await tx.ptSession.findUnique({
    where: { id: sessionId },
    include: { member: { select: { userId: true } } },
  })
  const byStaff = isManager(viewer) || (viewer.role === 'trainer' && session?.trainerId === viewer.userId)
  const byMember = session?.member.userId === viewer.userId
  if (!session || (!byStaff && !byMember)) throw notFound('Session')
  if (session.status !== 'booked') {
    throw new AppError(409, ErrorCode.PT_SESSION_NOT_BOOKED, 'This session is no longer booked.')
  }
  return { session, byMember: byMember && !byStaff }
}

/**
 * Cancels a booked session. A member cancelling after the free-cancel time uses up the session
 * (one "late cancellation" ledger line); the trainer or desk cancelling never does.
 */
export async function cancelSession(
  db: TenantDb,
  viewer: Viewer,
  sessionId: string,
  reason: string | undefined,
  now: Date,
): Promise<PtSessionView> {
  return db.$transaction(async (tx) => {
    const { session, byMember } = await loadSessionFor(tx, viewer, sessionId)
    const rules = await loadRules(tx)
    if (byMember && session.startsAt <= now) {
      throw new AppError(409, ErrorCode.PT_SESSION_STARTED, 'This session has already started. Please speak to your trainer.')
    }
    const late = byMember && now > freeCancelUntil(session.startsAt, rules)
    await tx.ptSession.update({
      where: { id: session.id },
      data: { status: 'cancelled', cancelledAt: now, cancelledById: viewer.userId, cancelReason: reason, lateCancel: late },
    })
    if (late) {
      const balance = await tx.ptSessionLedger.aggregate({ where: { purchaseId: session.purchaseId }, _sum: { change: true } })
      // Never below zero (e.g. if sessions were removed by hand after booking).
      if ((balance._sum.change ?? 0) > 0) {
        await tx.ptSessionLedger.create({
          data: {
            gymId: viewer.gymId,
            purchaseId: session.purchaseId,
            sessionId: session.id,
            change: -1,
            reason: 'late_cancel',
            createdById: viewer.userId,
          },
        })
      }
    }
    return loadSessionView(tx, session.id, rules, now)
  }, SERIALIZABLE)
}

/** Moves a booked session to another open slot. Members can do this only until the free-cancel time. */
export async function rescheduleSession(
  db: TenantDb,
  viewer: Viewer,
  sessionId: string,
  startsAtIso: string,
  now: Date,
): Promise<PtSessionView> {
  const startsAt = new Date(startsAtIso)
  return guardOverlap(() =>
    db.$transaction(async (tx) => {
      const { session, byMember } = await loadSessionFor(tx, viewer, sessionId)
      const rules = await loadRules(tx)
      if (session.startsAt <= now) {
        throw new AppError(409, ErrorCode.PT_SESSION_STARTED, 'This session has already started.')
      }
      if (byMember && now > freeCancelUntil(session.startsAt, rules)) {
        throw new AppError(
          409,
          ErrorCode.PT_TOO_LATE_TO_RESCHEDULE,
          `Sessions can be moved until ${rules.freeCancelHours} hours before they start. You can still cancel, but the session will be used up.`,
        )
      }
      const purchase = await loadPurchaseFor(tx, viewer, session.purchaseId)
      const { slots } = await openSlots(tx, purchase, rules, now, session.id)
      const endsAt = matchSlot(slots, startsAt)
      await tx.ptSession.update({
        where: { id: session.id },
        data: { status: 'cancelled', cancelledAt: now, cancelledById: viewer.userId, cancelReason: 'Rescheduled' },
      })
      const moved = await tx.ptSession.create({
        data: {
          gymId: viewer.gymId,
          purchaseId: session.purchaseId,
          trainerId: session.trainerId,
          memberId: session.memberId,
          startsAt,
          endsAt,
          bookedById: viewer.userId,
        },
      })
      return loadSessionView(tx, moved.id, rules, now)
    }, SERIALIZABLE),
  )
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** Recent history (last 30 days) and everything upcoming, oldest first. */
async function sessionsOfMember(db: TenantDb, memberId: string, now: Date): Promise<PtSessionView[]> {
  const [rules, rows] = await Promise.all([
    loadRules(db),
    db.ptSession.findMany({
      where: { memberId, startsAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      include: sessionInclude,
      orderBy: { startsAt: 'asc' },
    }),
  ])
  return rows.map((row) => toSessionView(row, rules, now))
}

export async function getMySessions(db: TenantDb, userId: string, now: Date): Promise<PtSessionView[]> {
  const member = await db.member.findUnique({ where: { userId }, select: { id: true } })
  return member ? sessionsOfMember(db, member.id, now) : []
}

export async function getMemberSessions(db: TenantDb, memberId: string, now: Date): Promise<PtSessionView[]> {
  const member = await db.member.findUnique({ where: { id: memberId }, select: { id: true } })
  if (!member) throw notFound('Member')
  return sessionsOfMember(db, member.id, now)
}

/** A trainer's schedule for `days` days from `from` (India dates), every status, oldest first. */
export async function getTrainerSessions(
  db: TenantDb,
  viewer: Viewer,
  trainerId: string,
  { from, days }: { from?: IsoDate; days: number },
  now: Date,
): Promise<PtSessionView[]> {
  await loadTrainer(db, viewer, trainerId)
  const first = from ?? todayInIndia(now)
  const [rules, rows] = await Promise.all([
    loadRules(db),
    db.ptSession.findMany({
      where: { trainerId, startsAt: { gte: indiaDateTime(first, 0), lt: indiaDateTime(addDays(first, days), 0) } },
      include: sessionInclude,
      orderBy: { startsAt: 'asc' },
    }),
  ])
  return rows.map((row) => toSessionView(row, rules, now))
}

