import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  EXPIRING_WITHIN_DAYS,
  ErrorCode,
  addDays,
  daysBetween,
  daysLeft,
  formatPaise,
  freezeDaysUsed,
  inclusiveDays,
  membershipEndDate,
  membershipStatus,
  type IsoDate,
  type MemberListStatus,
  type MembershipView,
  type freezeInputSchema,
  type newMembershipSchema,
  type recordPaymentSchema,
} from '@onthec/shared'
import type { TenantDb, TenantTx } from '../db/tenant'
import { AppError } from '../errors'
import { fromDbDate, toDbDate } from '../lib/dates'
import { takeDeskPaymentInTx } from './desk-payments'

/** Who is acting, and in which gym (always from the session). */
export interface Actor {
  gymId: string
  userId: string
}

// Serializable so two desk staff renewing or freezing the same member at once can't both win.
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }

export const membershipInclude = {
  freezes: { orderBy: { fromDate: 'asc' } },
  payments: { where: { status: 'paid' }, select: { amountPaise: true } },
} as const satisfies Prisma.MembershipInclude

export type MembershipRow = Prisma.MembershipGetPayload<{ include: typeof membershipInclude }>

function notFound(what: string) {
  return new AppError(404, ErrorCode.NOT_FOUND, `${what} not found`)
}

function formatDate(date: IsoDate) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

// ---------------------------------------------------------------------------
// Views and derived status
// ---------------------------------------------------------------------------

export function toMembershipView(row: MembershipRow, today: IsoDate): MembershipView {
  const freezes = row.freezes.map((f) => ({
    id: f.id,
    fromDate: fromDbDate(f.fromDate),
    toDate: fromDbDate(f.toDate),
    reason: f.reason,
  }))
  const dates = {
    startDate: fromDbDate(row.startDate),
    endDate: fromDbDate(row.endDate),
    cancelled: row.cancelledAt !== null,
    freezes,
  }
  const paidPaise = row.payments.reduce((sum, p) => sum + p.amountPaise, 0)
  // Nothing is owed on a cancelled membership or one settled before the app recorded payments.
  const duePaise = dates.cancelled || row.paidOutsideApp ? 0 : Math.max(0, row.pricePaise - paidPaise)
  return {
    id: row.id,
    planName: row.planName,
    durationMonths: row.durationMonths,
    pricePaise: row.pricePaise,
    listPricePaise: row.listPricePaise,
    discountReason: row.discountReason,
    paidPaise,
    duePaise,
    startDate: dates.startDate,
    endDate: dates.endDate,
    status: membershipStatus(dates, today),
    daysLeft: dates.cancelled ? 0 : daysLeft(dates, today),
    maxFreezeDays: row.maxFreezeDays,
    freezeDaysUsed: freezeDaysUsed(freezes),
    freezes,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
  }
}

/** The membership that matters today: running or frozen, else the next upcoming, else the latest ended. */
export function pickCurrent(views: MembershipView[]): MembershipView | null {
  const running = views.find((v) => v.status === 'active' || v.status === 'frozen')
  if (running) return running
  const upcoming = views.filter((v) => v.status === 'upcoming').sort((a, b) => a.startDate.localeCompare(b.startDate))
  if (upcoming[0]) return upcoming[0]
  const ended = views.filter((v) => v.status === 'expired').sort((a, b) => b.endDate.localeCompare(a.endDate))
  return ended[0] ?? null
}

/** Status shown in the members list; "expiring" means ≤ 7 days left with no renewal queued. */
export function memberListStatus(views: MembershipView[]): MemberListStatus {
  const current = pickCurrent(views)
  if (!current) return 'none'
  if (current.status === 'expired' || current.status === 'upcoming') return current.status
  const renewed = views.some((v) => v.status === 'upcoming')
  if (!renewed && current.daysLeft <= EXPIRING_WITHIN_DAYS) return 'expiring'
  return current.status === 'frozen' ? 'frozen' : 'active'
}

// ---------------------------------------------------------------------------
// Adding and renewing
// ---------------------------------------------------------------------------

/**
 * Adds a membership inside an existing transaction (also used when creating a member).
 * Default start: the day after the member's current membership ends, or today if none is running.
 */
export async function addMembershipInTx(
  tx: TenantTx,
  actor: Actor,
  memberId: string,
  input: z.infer<typeof newMembershipSchema>,
  today: IsoDate,
  /** For an online order that was already paid: honour it even if the plan was deactivated since. */
  { paidOrder = false }: { paidOrder?: boolean } = {},
): Promise<MembershipView> {
  const plan = await tx.membershipPlan.findUnique({ where: { id: input.planId } })
  if (!plan) throw notFound('Plan')
  if (!plan.active && !paidOrder) throw new AppError(409, ErrorCode.PLAN_INACTIVE, 'This plan is no longer offered.')

  const existing = (
    await tx.membership.findMany({ where: { memberId, cancelledAt: null }, select: { startDate: true, endDate: true } })
  ).map((m) => ({ start: fromDbDate(m.startDate), end: fromDbDate(m.endDate) }))

  const latestEnd = existing.reduce<IsoDate | null>((max, m) => (max === null || m.end > max ? m.end : max), null)
  const start = input.startDate ?? (latestEnd !== null && latestEnd >= today ? addDays(latestEnd, 1) : today)
  const end = membershipEndDate(start, plan.durationMonths)

  const clash = existing.find((m) => m.start <= end && m.end >= start)
  if (clash) {
    throw new AppError(
      409,
      ErrorCode.MEMBERSHIP_OVERLAP,
      `This would overlap the membership from ${formatDate(clash.start)} to ${formatDate(clash.end)}.`,
    )
  }

  // Discounts only go down from the plan price, and every discount needs a reason.
  const price = input.pricePaise ?? plan.pricePaise
  if (price > plan.pricePaise) {
    throw new AppError(400, ErrorCode.PRICE_ABOVE_PLAN, `The price can't be more than the plan price (${formatPaise(plan.pricePaise)}).`)
  }
  const discounted = price < plan.pricePaise
  if (discounted && !input.discountReason) {
    throw new AppError(400, ErrorCode.DISCOUNT_REASON_REQUIRED, 'Please give a reason for the discount.')
  }

  const row = await tx.membership.create({
    data: {
      gymId: actor.gymId,
      memberId,
      planId: plan.id,
      planName: plan.name,
      durationMonths: plan.durationMonths,
      pricePaise: price,
      listPricePaise: plan.pricePaise,
      discountReason: discounted ? input.discountReason : null,
      maxFreezeDays: plan.maxFreezeDays,
      startDate: toDbDate(start),
      endDate: toDbDate(end),
      createdById: actor.userId,
    },
  })

  // Paid at the desk now (always the full sale price); otherwise it stays due ("pay later").
  if (input.payment && price > 0) {
    await takeDeskPaymentInTx(
      tx,
      actor,
      {
        memberId,
        membershipId: row.id,
        amountPaise: price,
        method: input.payment.method,
        reference: input.payment.reference,
      },
      today,
    )
  }

  return toMembershipView(await loadMembership(tx, row.id), today)
}

/** Records money received at the desk against a membership that has an amount due. */
export async function recordPayment(
  db: TenantDb,
  actor: Actor,
  membershipId: string,
  input: z.infer<typeof recordPaymentSchema>,
  today: IsoDate,
): Promise<MembershipView> {
  return db.$transaction(async (tx) => {
    const row = await loadMembership(tx, membershipId)
    const { duePaise } = toMembershipView(row, today)
    if (duePaise === 0) throw new AppError(409, ErrorCode.NOTHING_DUE, 'Nothing is due on this membership.')
    if (input.amountPaise > duePaise) {
      throw new AppError(400, ErrorCode.OVERPAYMENT, `Only ${formatPaise(duePaise)} is due.`)
    }
    await takeDeskPaymentInTx(
      tx,
      actor,
      {
        memberId: row.memberId,
        membershipId: row.id,
        amountPaise: input.amountPaise,
        method: input.method,
        reference: input.reference,
        note: input.note,
      },
      today,
    )
    return toMembershipView(await loadMembership(tx, row.id), today)
  }, SERIALIZABLE)
}

export async function addMembership(
  db: TenantDb,
  actor: Actor,
  memberId: string,
  input: z.infer<typeof newMembershipSchema>,
  today: IsoDate,
): Promise<MembershipView> {
  return db.$transaction(async (tx) => {
    const member = await tx.member.findUnique({ where: { id: memberId }, select: { id: true } })
    if (!member) throw notFound('Member')
    return addMembershipInTx(tx, actor, memberId, input, today)
  }, SERIALIZABLE)
}

// ---------------------------------------------------------------------------
// Freezing
// ---------------------------------------------------------------------------

/**
 * Moves the member's later (queued) memberships by `days`, so a freeze on the current one
 * doesn't make it overlap the renewal that follows it.
 */
async function shiftLaterMemberships(tx: TenantTx, row: MembershipRow, oldEnd: IsoDate, days: number) {
  const later = await tx.membership.findMany({
    where: { memberId: row.memberId, id: { not: row.id }, cancelledAt: null, startDate: { gt: toDbDate(oldEnd) } },
    include: membershipInclude,
  })
  for (const next of later) {
    await tx.membership.update({
      where: { id: next.id },
      data: {
        startDate: toDbDate(addDays(fromDbDate(next.startDate), days)),
        endDate: toDbDate(addDays(fromDbDate(next.endDate), days)),
      },
    })
    for (const freeze of next.freezes) {
      await tx.membershipFreeze.update({
        where: { id: freeze.id },
        data: {
          fromDate: toDbDate(addDays(fromDbDate(freeze.fromDate), days)),
          toDate: toDbDate(addDays(fromDbDate(freeze.toDate), days)),
        },
      })
    }
  }
}

async function loadMembership(tx: TenantTx, id: string): Promise<MembershipRow> {
  const row = await tx.membership.findUnique({ where: { id }, include: membershipInclude })
  if (!row) throw notFound('Membership')
  return row
}

/** Pauses a membership for an inclusive date range and pushes its end date back by that many days. */
export async function freezeMembership(
  db: TenantDb,
  actor: Actor,
  membershipId: string,
  input: z.infer<typeof freezeInputSchema>,
  today: IsoDate,
): Promise<MembershipView> {
  return db.$transaction(async (tx) => {
    const row = await loadMembership(tx, membershipId)
    const view = toMembershipView(row, today)
    const notFreezable = (message: string) => new AppError(409, ErrorCode.MEMBERSHIP_NOT_FREEZABLE, message)

    if (row.cancelledAt) throw notFreezable('Cancelled memberships cannot be frozen.')
    if (view.endDate < today) throw notFreezable('This membership has already ended.')
    if (input.fromDate < view.startDate || input.fromDate > view.endDate) {
      throw notFreezable(
        `The freeze must start between ${formatDate(view.startDate)} and ${formatDate(view.endDate)}.`,
      )
    }

    const days = inclusiveDays(input.fromDate, input.toDate)
    const remaining = row.maxFreezeDays - view.freezeDaysUsed
    if (days > remaining) {
      throw new AppError(
        409,
        ErrorCode.FREEZE_LIMIT_EXCEEDED,
        row.maxFreezeDays === 0
          ? 'This plan does not allow freezing.'
          : `Only ${remaining} freeze day${remaining === 1 ? '' : 's'} left on this membership (asked for ${days}).`,
      )
    }
    if (view.freezes.some((f) => f.fromDate <= input.toDate && f.toDate >= input.fromDate)) {
      throw new AppError(409, ErrorCode.FREEZE_OVERLAP, 'This overlaps an existing freeze.')
    }

    await tx.membershipFreeze.create({
      data: {
        gymId: actor.gymId,
        membershipId: row.id,
        fromDate: toDbDate(input.fromDate),
        toDate: toDbDate(input.toDate),
        reason: input.reason,
        createdById: actor.userId,
      },
    })
    await tx.membership.update({ where: { id: row.id }, data: { endDate: toDbDate(addDays(view.endDate, days)) } })
    await shiftLaterMemberships(tx, row, view.endDate, days)

    return toMembershipView(await loadMembership(tx, row.id), today)
  }, SERIALIZABLE)
}

/**
 * Ends the current freeze today (the member can come in today) or cancels a future one, and gives
 * back the unused days by pulling the end date forward again.
 */
export async function unfreezeMembership(
  db: TenantDb,
  membershipId: string,
  today: IsoDate,
): Promise<MembershipView> {
  return db.$transaction(async (tx) => {
    const row = await loadMembership(tx, membershipId)
    const view = toMembershipView(row, today)
    const freeze = [...view.freezes].reverse().find((f) => f.toDate >= today)
    if (row.cancelledAt || !freeze) {
      throw new AppError(409, ErrorCode.NOTHING_TO_UNFREEZE, 'There is no current or upcoming freeze to end.')
    }

    const newTo = addDays(today, -1)
    let returned: number
    if (newTo < freeze.fromDate) {
      // Not started yet, or started today: remove it completely.
      returned = inclusiveDays(freeze.fromDate, freeze.toDate)
      await tx.membershipFreeze.delete({ where: { id: freeze.id } })
    } else {
      returned = daysBetween(newTo, freeze.toDate)
      await tx.membershipFreeze.update({ where: { id: freeze.id }, data: { toDate: toDbDate(newTo) } })
    }

    await tx.membership.update({ where: { id: row.id }, data: { endDate: toDbDate(addDays(view.endDate, -returned)) } })
    await shiftLaterMemberships(tx, row, view.endDate, -returned)

    return toMembershipView(await loadMembership(tx, row.id), today)
  }, SERIALIZABLE)
}

export async function cancelMembership(
  db: TenantDb,
  membershipId: string,
  reason: string | undefined,
  today: IsoDate,
): Promise<MembershipView> {
  return db.$transaction(async (tx) => {
    const row = await loadMembership(tx, membershipId)
    if (row.cancelledAt) throw new AppError(409, ErrorCode.ALREADY_CANCELLED, 'This membership is already cancelled.')
    const updated = await tx.membership.update({
      where: { id: row.id },
      data: { cancelledAt: new Date(), cancelReason: reason ?? null },
      include: membershipInclude,
    })
    return toMembershipView(updated, today)
  }, SERIALIZABLE)
}
