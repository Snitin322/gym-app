import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  ErrorCode,
  type IsoDate,
  type MemberDetail,
  type MemberFilter,
  type MemberSummary,
  type MyMembership,
  type PaymentView,
  type createMemberSchema,
  type updateMemberSchema,
} from '@onthec/shared'
import type { TenantDb } from '../db/tenant'
import { AppError } from '../errors'
import { fromDbDate, toDbDate } from '../lib/dates'
import { isUniqueViolation } from '../lib/prisma-errors'
import {
  addMembershipInTx,
  memberListStatus,
  membershipInclude,
  pickCurrent,
  toMembershipView,
  type Actor,
} from './memberships'
import { purchaseInclude, sortPurchases, toPurchaseView } from './pt'
import { phoneTaken } from './users'

const memberInclude = {
  user: { select: { id: true, name: true, phone: true } },
  memberships: { include: membershipInclude, orderBy: { startDate: 'desc' } },
  ptPurchases: { include: purchaseInclude },
} as const satisfies Prisma.MemberInclude

/** Detail adds the payment history (paid payments, newest first). */
const memberDetailInclude = {
  ...memberInclude,
  payments: {
    where: { status: 'paid' },
    include: {
      membership: { select: { planName: true } },
      ptPurchase: { select: { packageName: true } },
      recordedBy: { select: { name: true } },
      invoice: { select: { id: true, number: true } },
    },
    orderBy: { paidAt: 'desc' },
  },
} as const satisfies Prisma.MemberInclude

type MemberRow = Prisma.MemberGetPayload<{ include: typeof memberInclude }>
type MemberDetailRow = Prisma.MemberGetPayload<{ include: typeof memberDetailInclude }>

function toSummary(row: MemberRow, today: IsoDate): MemberSummary {
  const views = row.memberships.map((m) => toMembershipView(m, today))
  return {
    id: row.id,
    userId: row.user.id,
    name: row.user.name,
    phone: row.user.phone,
    status: memberListStatus(views),
    current: pickCurrent(views),
    // Dues across memberships and PT packages.
    duePaise:
      views.reduce((sum, v) => sum + v.duePaise, 0) +
      row.ptPurchases.reduce((sum, p) => sum + toPurchaseView(p, today).duePaise, 0),
  }
}

function toPaymentView(p: MemberDetailRow['payments'][number]): PaymentView {
  return {
    id: p.id,
    amountPaise: p.amountPaise,
    method: p.method,
    status: p.status,
    reference: p.reference,
    note: p.note,
    paidAt: p.paidAt?.toISOString() ?? null,
    membershipId: p.membershipId,
    ptPurchaseId: p.ptPurchaseId,
    description: p.membership?.planName ?? (p.ptPurchase ? `${p.ptPurchase.packageName} (PT)` : 'Payment'),
    recordedByName: p.recordedBy?.name ?? null,
    invoice: p.invoice,
  }
}

function toDetail(row: MemberDetailRow, today: IsoDate): MemberDetail {
  return {
    ...toSummary(row, today),
    joinedOn: fromDbDate(row.joinedOn),
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    notes: row.notes,
    memberships: row.memberships.map((m) => toMembershipView(m, today)),
    ptPurchases: sortPurchases(row.ptPurchases.map((p) => toPurchaseView(p, today))),
    payments: row.payments.map(toPaymentView),
  }
}

const FILTERS: Record<MemberFilter, (member: MemberSummary) => boolean> = {
  all: () => true,
  // Paying members: running, frozen, ending soon, or starting soon.
  active: ({ status: s }) => s === 'active' || s === 'frozen' || s === 'expiring' || s === 'upcoming',
  expiring: ({ status }) => status === 'expiring',
  expired: ({ status }) => status === 'expired',
  none: ({ status }) => status === 'none',
  dues: ({ duePaise }) => duePaise > 0,
}

/**
 * Members of the session's gym, filtered by status and searched by name or phone.
 * Status depends on today's date, so filtering happens after loading (fine for one gym's members).
 */
export async function listMembers(
  db: TenantDb,
  { filter, q }: { filter: MemberFilter; q?: string },
  today: IsoDate,
): Promise<MemberSummary[]> {
  const digits = q?.replace(/\D/g, '') ?? ''
  const where: Prisma.MemberWhereInput = q
    ? {
        user: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          ],
        },
      }
    : {}

  const rows = await db.member.findMany({
    where: { ...where, user: { ...(where.user as object), deletedAt: null } },
    include: memberInclude,
    orderBy: { user: { name: 'asc' } },
  })
  return rows.map((row) => toSummary(row, today)).filter(FILTERS[filter])
}

export async function getMember(db: TenantDb, id: string, today: IsoDate): Promise<MemberDetail | null> {
  const row = await db.member.findUnique({ where: { id }, include: memberDetailInclude })
  return row ? toDetail(row, today) : null
}

/** Creates the member's login account and profile, plus their first membership if given. */
export async function createMember(
  db: TenantDb,
  actor: Actor,
  input: z.infer<typeof createMemberSchema>,
  today: IsoDate,
): Promise<MemberDetail> {
  try {
    const memberId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { gymId: actor.gymId, phone: input.phone, name: input.name, role: 'member' },
      })
      const member = await tx.member.create({
        data: {
          gymId: actor.gymId,
          userId: user.id,
          joinedOn: toDbDate(input.joinedOn ?? today),
          emergencyContactName: input.emergencyContactName,
          emergencyContactPhone: input.emergencyContactPhone,
          notes: input.notes,
        },
      })
      if (input.firstMembership) await addMembershipInTx(tx, actor, member.id, input.firstMembership, today)
      return member.id
      // Serializable: a first payment allocates an invoice number from the shared counter.
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return (await getMember(db, memberId, today)) as MemberDetail
  } catch (error) {
    if (isUniqueViolation(error)) throw phoneTaken()
    throw error
  }
}

export async function updateMember(
  db: TenantDb,
  id: string,
  input: z.infer<typeof updateMemberSchema>,
  today: IsoDate,
): Promise<MemberDetail> {
  try {
    await db.$transaction(async (tx) => {
      const member = await tx.member.findUnique({ where: { id }, select: { userId: true } })
      if (!member) throw new AppError(404, ErrorCode.NOT_FOUND, 'Member not found')
      if (input.name !== undefined || input.phone !== undefined) {
        await tx.user.update({ where: { id: member.userId }, data: { name: input.name, phone: input.phone } })
      }
      await tx.member.update({
        where: { id },
        data: {
          joinedOn: input.joinedOn ? toDbDate(input.joinedOn) : undefined,
          emergencyContactName: input.emergencyContactName,
          emergencyContactPhone: input.emergencyContactPhone,
          notes: input.notes,
        },
      })
    })
    return (await getMember(db, id, today)) as MemberDetail
  } catch (error) {
    if (isUniqueViolation(error)) throw phoneTaken()
    throw error
  }
}

/** The signed-in member's own memberships. Staff without a member profile get an empty result. */
export async function getMyMembership(db: TenantDb, userId: string, today: IsoDate): Promise<MyMembership> {
  const row = await db.member.findUnique({ where: { userId }, include: memberDetailInclude })
  if (!row) return { current: null, history: [], duePaise: 0, payments: [] }
  const detail = toDetail(row, today)
  return {
    current: detail.current,
    history: detail.memberships.filter((v) => v.id !== detail.current?.id),
    duePaise: detail.duePaise,
    payments: detail.payments,
  }
}
