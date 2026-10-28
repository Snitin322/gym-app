import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  ErrorCode,
  OPEN_LEAD_STATUSES,
  type DashboardLead,
  type IsoDate,
  type LeadDuplicate,
  type LeadFilter,
  type LeadView,
  type leadInputSchema,
  type leadUpdateSchema,
} from '@onthec/shared'
import type { TenantDb, TenantTx } from '../db/tenant'
import { AppError } from '../errors'
import { fromDbDate, toDbDate } from '../lib/dates'

export interface Actor {
  gymId: string
  userId: string
}

const leadInclude = { createdBy: { select: { name: true } } } as const satisfies Prisma.LeadInclude
type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>

const STATUS_WHERE: Record<LeadFilter, Prisma.LeadWhereInput> = {
  open: { status: { in: [...OPEN_LEAD_STATUSES] } },
  joined: { status: 'joined' },
  lost: { status: 'lost' },
  all: {},
}

function notFound() {
  return new AppError(404, ErrorCode.NOT_FOUND, 'Lead not found')
}

/** For each phone: members and other leads that already have it. */
async function duplicatesFor(db: TenantDb | TenantTx, phones: string[]) {
  const unique = [...new Set(phones)]
  if (unique.length === 0) return new Map<string, LeadDuplicate[]>()
  const [members, leads] = await Promise.all([
    db.member.findMany({
      where: { user: { phone: { in: unique }, deletedAt: null } },
      select: { id: true, user: { select: { name: true, phone: true } } },
    }),
    db.lead.findMany({ where: { phone: { in: unique } }, select: { id: true, name: true, phone: true } }),
  ])
  const byPhone = new Map<string, LeadDuplicate[]>()
  const add = (phone: string, d: LeadDuplicate) => byPhone.set(phone, [...(byPhone.get(phone) ?? []), d])
  for (const m of members) add(m.user.phone, { kind: 'member', id: m.id, name: m.user.name })
  for (const l of leads) add(l.phone, { kind: 'lead', id: l.id, name: l.name })
  return byPhone
}

function toView(row: LeadRow, duplicates: Map<string, LeadDuplicate[]>): LeadView {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    source: row.source,
    interest: row.interest,
    note: row.note,
    followUpOn: row.followUpOn ? fromDbDate(row.followUpOn) : null,
    status: row.status,
    lostReason: row.lostReason,
    memberId: row.memberId,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdBy.name,
    // Itself doesn't count; neither does the member it became.
    duplicates: (duplicates.get(row.phone) ?? []).filter(
      (d) => !(d.kind === 'lead' && d.id === row.id) && !(d.kind === 'member' && d.id === row.memberId),
    ),
  }
}

async function withDuplicates(db: TenantDb | TenantTx, rows: LeadRow[]) {
  const dupes = await duplicatesFor(
    db,
    rows.map((r) => r.phone),
  )
  return rows.map((r) => toView(r, dupes))
}

/** Open leads by follow-up date (soonest first, no date last); others newest first. */
export async function listLeads(db: TenantDb, { filter, q }: { filter: LeadFilter; q?: string }): Promise<LeadView[]> {
  const digits = q?.replace(/\D/g, '') ?? ''
  const search: Prisma.LeadWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      }
    : {}
  const rows = await db.lead.findMany({
    where: { ...STATUS_WHERE[filter], ...search },
    include: leadInclude,
    orderBy:
      filter === 'open'
        ? [{ followUpOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }]
        : [{ updatedAt: 'desc' }],
    take: 500,
  })
  return withDuplicates(db, rows)
}

/** Who already has this number, so the desk doesn't add the same person twice. */
export async function checkPhone(db: TenantDb, phone: string): Promise<LeadDuplicate[]> {
  return (await duplicatesFor(db, [phone])).get(phone) ?? []
}

export async function createLead(
  db: TenantDb,
  actor: Actor,
  input: z.infer<typeof leadInputSchema>,
): Promise<LeadView> {
  const row = await db.lead.create({
    data: {
      gymId: actor.gymId,
      name: input.name,
      phone: input.phone,
      source: input.source,
      interest: input.interest,
      note: input.note,
      followUpOn: input.followUpOn ? toDbDate(input.followUpOn) : null,
      createdById: actor.userId,
    },
    include: leadInclude,
  })
  return (await withDuplicates(db, [row]))[0] as LeadView
}

export async function updateLead(db: TenantDb, id: string, input: z.infer<typeof leadUpdateSchema>): Promise<LeadView> {
  const current = await db.lead.findUnique({ where: { id }, select: { status: true } })
  if (!current) throw notFound()
  if (current.status === 'joined') {
    throw new AppError(409, ErrorCode.CONFLICT, 'This person has already joined. Open their member page instead.')
  }
  const reopening = input.status !== undefined && input.status !== 'lost'
  const row = await db.lead.update({
    where: { id },
    data: {
      name: input.name,
      phone: input.phone,
      source: input.source,
      interest: input.interest,
      note: input.note,
      followUpOn: input.followUpOn === undefined ? undefined : input.followUpOn ? toDbDate(input.followUpOn) : null,
      status: input.status,
      // A lost reason only belongs to a lost lead.
      lostReason: input.status === 'lost' ? input.lostReason : reopening ? null : undefined,
    },
    include: leadInclude,
  })
  return (await withDuplicates(db, [row]))[0] as LeadView
}

/**
 * Called when a member is added: open leads with the same phone become "joined" and point to them.
 * Runs inside the member's transaction.
 */
export async function markLeadsJoined(tx: TenantTx, phone: string, memberId: string) {
  await tx.lead.updateMany({
    where: { phone, status: { in: [...OPEN_LEAD_STATUSES] } },
    data: { status: 'joined', memberId, followUpOn: null },
  })
}

/** For the dashboard: open leads and the follow-ups due today or overdue. */
export async function leadsForDashboard(
  db: TenantDb,
  today: IsoDate,
): Promise<{ open: number; followUps: DashboardLead[] }> {
  const [open, due] = await Promise.all([
    db.lead.count({ where: STATUS_WHERE.open }),
    db.lead.findMany({
      where: { ...STATUS_WHERE.open, followUpOn: { lte: toDbDate(today) } },
      orderBy: { followUpOn: 'asc' },
      take: 100,
    }),
  ])
  return {
    open,
    followUps: due.map((l) => ({
      leadId: l.id,
      name: l.name,
      phone: l.phone,
      status: l.status,
      interest: l.interest,
      followUpOn: fromDbDate(l.followUpOn as Date),
    })),
  }
}
