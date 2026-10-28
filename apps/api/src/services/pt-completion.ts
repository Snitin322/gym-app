import { z } from 'zod'
import {
  ErrorCode,
  disputeUntil,
  undoUntil,
  type PtSessionView,
  type markSessionSchema,
  type resolveDisputeSchema,
} from '@onthec/shared'
import type { TenantDb, TenantTx } from '../db/tenant'
import { AppError } from '../errors'
import {
  SERIALIZABLE,
  isManager,
  loadRules,
  loadSessionView,
  notFound,
  sessionInclude,
  toSessionView,
  type Viewer,
} from './pt-booking'

/** A session and who is acting on it: its trainer or the desk ("staff"), or its member. */
async function loadSession(tx: TenantTx, viewer: Viewer, sessionId: string) {
  const session = await tx.ptSession.findUnique({
    where: { id: sessionId },
    include: { member: { select: { userId: true } } },
  })
  const byStaff = isManager(viewer) || (viewer.role === 'trainer' && session?.trainerId === viewer.userId)
  const byMember = session?.member.userId === viewer.userId
  if (!session || (!byStaff && !byMember)) throw notFound('Session')
  return { session, byStaff, byMember: byMember && !byStaff }
}

type LoadedSession = Awaited<ReturnType<typeof loadSession>>['session']

function requireMarked(session: LoadedSession) {
  if (!session.markedAt || (session.status !== 'completed' && session.status !== 'no_show')) {
    throw new AppError(409, ErrorCode.PT_SESSION_NOT_MARKED, 'This session hasn’t been marked yet.')
  }
  return session.markedAt
}

/** Sessions left on the package (sum of the ledger). */
async function balanceOf(tx: TenantTx, purchaseId: string) {
  const sum = await tx.ptSessionLedger.aggregate({ where: { purchaseId }, _sum: { change: true } })
  return sum._sum.change ?? 0
}

/** Net ledger change already written for this session (e.g. −1 after a mark). */
async function sessionNet(tx: TenantTx, sessionId: string) {
  const sum = await tx.ptSessionLedger.aggregate({ where: { sessionId }, _sum: { change: true } })
  return sum._sum.change ?? 0
}

/**
 * The trainer (or desk) marks a started session completed or no-show. Either uses up one session
 * (one −1 ledger line). Only a booked session can be marked, so a double tap charges once.
 */
export async function markSession(
  db: TenantDb,
  viewer: Viewer,
  sessionId: string,
  input: z.infer<typeof markSessionSchema>,
  now: Date,
): Promise<PtSessionView> {
  return db.$transaction(async (tx) => {
    const { session, byStaff } = await loadSession(tx, viewer, sessionId)
    if (!byStaff) throw notFound('Session')
    if (session.status !== 'booked') {
      throw new AppError(409, ErrorCode.PT_SESSION_NOT_BOOKED, 'This session is no longer booked.')
    }
    if (session.startsAt > now) {
      throw new AppError(409, ErrorCode.PT_SESSION_NOT_STARTED, 'You can mark a session once it has started.')
    }
    await tx.ptSession.update({
      where: { id: session.id },
      data: { status: input.outcome, markedAt: now, markedById: viewer.userId, trainerNotes: input.note ?? null },
    })
    // Never below zero (e.g. if sessions were removed by hand after booking).
    if ((await balanceOf(tx, session.purchaseId)) > 0) {
      await tx.ptSessionLedger.create({
        data: {
          gymId: viewer.gymId,
          purchaseId: session.purchaseId,
          sessionId: session.id,
          change: -1,
          reason: input.outcome === 'completed' ? 'session_completed' : 'no_show',
          note: input.note,
          createdById: viewer.userId,
        },
      })
    }
    return loadSessionView(tx, session.id, await loadRules(tx), now)
  }, SERIALIZABLE)
}

/**
 * Undoes a mark made by mistake: back to booked, and the session is given back.
 * The trainer who marked it can do this within an hour; the desk while the member hasn't
 * confirmed or disputed (and the 24 hours haven't passed).
 */
export async function undoMark(db: TenantDb, viewer: Viewer, sessionId: string, now: Date): Promise<PtSessionView> {
  return db.$transaction(async (tx) => {
    const { session, byStaff } = await loadSession(tx, viewer, sessionId)
    if (!byStaff) throw notFound('Session')
    const markedAt = requireMarked(session)
    const settled = session.confirmedAt || session.disputedAt || now > disputeUntil(markedAt)
    const allowed = isManager(viewer)
      ? !settled
      : session.markedById === viewer.userId && now <= undoUntil(markedAt) && !settled
    if (!allowed) {
      throw new AppError(
        409,
        ErrorCode.PT_UNDO_WINDOW_CLOSED,
        isManager(viewer)
          ? 'The member has already responded to this session. Use the dispute or an adjustment instead.'
          : 'You can undo a mark only within an hour. Please ask the front desk.',
      )
    }
    await tx.ptSession.update({
      where: { id: session.id },
      data: { status: 'booked', markedAt: null, markedById: null, trainerNotes: null },
    })
    const net = await sessionNet(tx, session.id)
    if (net < 0) {
      await tx.ptSessionLedger.create({
        data: {
          gymId: viewer.gymId,
          purchaseId: session.purchaseId,
          sessionId: session.id,
          change: -net,
          reason: 'adjustment',
          note: 'Mark undone',
          createdById: viewer.userId,
        },
      })
    }
    return loadSessionView(tx, session.id, await loadRules(tx), now)
  }, SERIALIZABLE)
}

/** Checks the member may still respond: marked, not answered yet, within 24 hours. */
function requireOpenForMember(session: LoadedSession, now: Date) {
  const markedAt = requireMarked(session)
  if (session.confirmedAt) throw new AppError(409, ErrorCode.PT_ALREADY_CONFIRMED, 'You already confirmed this session.')
  if (session.disputedAt) throw new AppError(409, ErrorCode.PT_ALREADY_DISPUTED, 'You already disputed this session.')
  if (now > disputeUntil(markedAt)) {
    throw new AppError(
      409,
      ErrorCode.PT_DISPUTE_WINDOW_CLOSED,
      'Sessions can be confirmed or disputed within 24 hours. Please speak to the front desk.',
    )
  }
}

export async function confirmSession(db: TenantDb, viewer: Viewer, sessionId: string, now: Date): Promise<PtSessionView> {
  return db.$transaction(async (tx) => {
    const { session, byMember } = await loadSession(tx, viewer, sessionId)
    if (!byMember) throw notFound('Session')
    requireOpenForMember(session, now)
    await tx.ptSession.update({ where: { id: session.id }, data: { confirmedAt: now } })
    return loadSessionView(tx, session.id, await loadRules(tx), now)
  }, SERIALIZABLE)
}

export async function disputeSession(
  db: TenantDb,
  viewer: Viewer,
  sessionId: string,
  reason: string,
  now: Date,
): Promise<PtSessionView> {
  return db.$transaction(async (tx) => {
    const { session, byMember } = await loadSession(tx, viewer, sessionId)
    if (!byMember) throw notFound('Session')
    requireOpenForMember(session, now)
    await tx.ptSession.update({ where: { id: session.id }, data: { disputedAt: now, disputeReason: reason } })
    return loadSessionView(tx, session.id, await loadRules(tx), now)
  }, SERIALIZABLE)
}

/** The desk decides a dispute once: upheld gives the session back (+1), rejected keeps it used. */
export async function resolveDispute(
  db: TenantDb,
  viewer: Viewer,
  sessionId: string,
  input: z.infer<typeof resolveDisputeSchema>,
  now: Date,
): Promise<PtSessionView> {
  return db.$transaction(async (tx) => {
    const session = await tx.ptSession.findUnique({ where: { id: sessionId } })
    if (!session) throw notFound('Session')
    if (!session.disputedAt) throw new AppError(409, ErrorCode.PT_NOT_DISPUTED, 'This session isn’t disputed.')
    if (session.resolution) throw new AppError(409, ErrorCode.PT_ALREADY_RESOLVED, 'This dispute is already closed.')
    await tx.ptSession.update({
      where: { id: session.id },
      data: { resolution: input.resolution, resolutionNote: input.note, resolvedAt: now, resolvedById: viewer.userId },
    })
    // Give back what this session actually took (nothing if it was never charged).
    const net = await sessionNet(tx, session.id)
    if (input.resolution === 'upheld' && net < 0) {
      await tx.ptSessionLedger.create({
        data: {
          gymId: viewer.gymId,
          purchaseId: session.purchaseId,
          sessionId: session.id,
          change: -net,
          reason: 'dispute_refund',
          note: input.note,
          createdById: viewer.userId,
        },
      })
    }
    return loadSessionView(tx, session.id, await loadRules(tx), now)
  }, SERIALIZABLE)
}

/** Open disputes, oldest first (owner/admin). */
export async function listDisputes(db: TenantDb, now: Date): Promise<PtSessionView[]> {
  const [rules, rows] = await Promise.all([
    loadRules(db),
    db.ptSession.findMany({
      where: { disputedAt: { not: null }, resolution: null },
      include: sessionInclude,
      orderBy: { disputedAt: 'asc' },
    }),
  ])
  return rows.map((row) => toSessionView(row, rules, now))
}

/**
 * Sessions that have started but nobody marked: still booked, so still reserved.
 * Trainers see their own; the desk sees everyone's.
 */
export async function listUnmarked(db: TenantDb, viewer: Viewer, now: Date): Promise<PtSessionView[]> {
  if (!isManager(viewer) && viewer.role !== 'trainer') return []
  const [rules, rows] = await Promise.all([
    loadRules(db),
    db.ptSession.findMany({
      where: {
        status: 'booked',
        startsAt: { lte: now },
        ...(isManager(viewer) ? {} : { trainerId: viewer.userId }),
      },
      include: sessionInclude,
      orderBy: { startsAt: 'asc' },
    }),
  ])
  return rows.map((row) => toSessionView(row, rules, now))
}
