import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  ErrorCode,
  formatPaise,
  isValidIsoDate,
  ptExpiresOn,
  ptPurchaseStatus,
  type IsoDate,
  type PtPackage,
  type PtPackageInput,
  type PtPurchaseView,
  type TrainerClient,
  type ptAdjustSchema,
  type ptPackageUpdateSchema,
  type ptSaleSchema,
  type recordPaymentSchema,
} from '@onthec/shared'
import type { TenantDb, TenantTx } from '../db/tenant'
import { AppError } from '../errors'
import { fromDbDate, toDbDate } from '../lib/dates'
import { isUniqueViolation } from '../lib/prisma-errors'
import { takeDeskPaymentInTx } from './desk-payments'

export interface Actor {
  gymId: string
  userId: string
}

// Serializable: balances and dues are checked and changed in the same transaction.
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }

function notFound(what: string) {
  return new AppError(404, ErrorCode.NOT_FOUND, `${what} not found`)
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

const packageSelect = {
  id: true,
  name: true,
  sessionCount: true,
  validityDays: true,
  pricePaise: true,
  description: true,
  active: true,
} as const

function nameTaken() {
  return new AppError(409, ErrorCode.PLAN_NAME_TAKEN, 'A PT package with this name already exists.')
}

export async function listPtPackages(db: TenantDb): Promise<PtPackage[]> {
  return db.ptPackage.findMany({
    select: packageSelect,
    orderBy: [{ active: 'desc' }, { sessionCount: 'asc' }, { name: 'asc' }],
  })
}

export async function createPtPackage(db: TenantDb, gymId: string, input: PtPackageInput): Promise<PtPackage> {
  try {
    return await db.ptPackage.create({ data: { ...input, gymId }, select: packageSelect })
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

/** Changes apply to new sales only: purchases keep what they were sold with. */
export async function updatePtPackage(
  db: TenantDb,
  id: string,
  input: z.infer<typeof ptPackageUpdateSchema>,
): Promise<PtPackage> {
  try {
    return await db.ptPackage.update({ where: { id }, data: input, select: packageSelect })
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

// ---------------------------------------------------------------------------
// Purchases and the ledger
// ---------------------------------------------------------------------------

export const purchaseInclude = {
  trainer: { select: { id: true, name: true } },
  ledger: { orderBy: { createdAt: 'asc' }, include: { createdBy: { select: { name: true } } } },
  payments: { where: { status: 'paid' }, select: { amountPaise: true } },
} as const satisfies Prisma.PtPurchaseInclude

export type PurchaseRow = Prisma.PtPurchaseGetPayload<{ include: typeof purchaseInclude }>

export function toPurchaseView(row: PurchaseRow, today: IsoDate): PtPurchaseView {
  const sessionsLeft = row.ledger.reduce((sum, entry) => sum + entry.change, 0)
  const expiresOn = fromDbDate(row.expiresOn)
  const paidPaise = row.payments.reduce((sum, p) => sum + p.amountPaise, 0)
  return {
    id: row.id,
    memberId: row.memberId,
    packageName: row.packageName,
    sessionCount: row.sessionCount,
    sessionsLeft,
    startDate: fromDbDate(row.startDate),
    expiresOn,
    status: ptPurchaseStatus({ sessionsLeft, expiresOn }, today),
    trainer: row.trainer,
    pricePaise: row.pricePaise,
    listPricePaise: row.listPricePaise,
    discountReason: row.discountReason,
    paidPaise,
    duePaise: Math.max(0, row.pricePaise - paidPaise),
    ledger: row.ledger.map((entry) => ({
      id: entry.id,
      change: entry.change,
      reason: entry.reason,
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
      createdByName: entry.createdBy?.name ?? null,
    })),
  }
}

async function loadPurchase(tx: TenantTx | TenantDb, id: string): Promise<PurchaseRow> {
  const row = await tx.ptPurchase.findUnique({ where: { id }, include: purchaseInclude })
  if (!row) throw notFound('PT package')
  return row
}

/**
 * Sells a PT package to a member with a trainer: copies the package, writes the "+N bought" ledger
 * line, and takes the desk payment (with invoice) unless it's "pay later".
 */
export async function sellPtPackage(
  db: TenantDb,
  actor: Actor,
  memberId: string,
  input: z.infer<typeof ptSaleSchema>,
  today: IsoDate,
): Promise<PtPurchaseView> {
  return db.$transaction(async (tx) => {
    const member = await tx.member.findUnique({ where: { id: memberId }, select: { id: true } })
    if (!member) throw notFound('Member')
    const pkg = await tx.ptPackage.findUnique({ where: { id: input.packageId } })
    if (!pkg) throw notFound('PT package')
    if (!pkg.active) throw new AppError(409, ErrorCode.PLAN_INACTIVE, 'This PT package is no longer offered.')
    const trainer = await tx.user.findUnique({ where: { id: input.trainerId }, select: { role: true, deletedAt: true } })
    if (!trainer || trainer.deletedAt || trainer.role !== 'trainer') {
      throw new AppError(400, ErrorCode.NOT_A_TRAINER, 'Choose one of the gym’s trainers.')
    }

    const price = input.pricePaise ?? pkg.pricePaise
    if (price > pkg.pricePaise) {
      throw new AppError(
        400,
        ErrorCode.PRICE_ABOVE_PLAN,
        `The price can't be more than the package price (${formatPaise(pkg.pricePaise)}).`,
      )
    }
    const discounted = price < pkg.pricePaise
    if (discounted && !input.discountReason) {
      throw new AppError(400, ErrorCode.DISCOUNT_REASON_REQUIRED, 'Please give a reason for the discount.')
    }

    const purchase = await tx.ptPurchase.create({
      data: {
        gymId: actor.gymId,
        memberId,
        trainerId: input.trainerId,
        packageId: pkg.id,
        packageName: pkg.name,
        sessionCount: pkg.sessionCount,
        validityDays: pkg.validityDays,
        pricePaise: price,
        listPricePaise: pkg.pricePaise,
        discountReason: discounted ? input.discountReason : null,
        startDate: toDbDate(today),
        expiresOn: toDbDate(ptExpiresOn(today, pkg.validityDays)),
        createdById: actor.userId,
      },
    })
    await tx.ptSessionLedger.create({
      data: {
        gymId: actor.gymId,
        purchaseId: purchase.id,
        change: pkg.sessionCount,
        reason: 'purchase',
        createdById: actor.userId,
      },
    })
    if (input.payment && price > 0) {
      await takeDeskPaymentInTx(
        tx,
        actor,
        {
          memberId,
          ptPurchaseId: purchase.id,
          amountPaise: price,
          method: input.payment.method,
          reference: input.payment.reference,
        },
        today,
      )
    }
    return toPurchaseView(await loadPurchase(tx, purchase.id), today)
  }, SERIALIZABLE)
}

export async function getPtPurchase(db: TenantDb, id: string, today: IsoDate): Promise<PtPurchaseView> {
  return toPurchaseView(await loadPurchase(db, id), today)
}

/** Money received later for a PT package with an amount due (part payments allowed). */
export async function recordPtPayment(
  db: TenantDb,
  actor: Actor,
  purchaseId: string,
  input: z.infer<typeof recordPaymentSchema>,
  today: IsoDate,
): Promise<PtPurchaseView> {
  return db.$transaction(async (tx) => {
    const row = await loadPurchase(tx, purchaseId)
    const { duePaise } = toPurchaseView(row, today)
    if (duePaise === 0) throw new AppError(409, ErrorCode.NOTHING_DUE, 'Nothing is due on this PT package.')
    if (input.amountPaise > duePaise) {
      throw new AppError(400, ErrorCode.OVERPAYMENT, `Only ${formatPaise(duePaise)} is due.`)
    }
    await takeDeskPaymentInTx(
      tx,
      actor,
      {
        memberId: row.memberId,
        ptPurchaseId: row.id,
        amountPaise: input.amountPaise,
        method: input.method,
        reference: input.reference,
        note: input.note,
      },
      today,
    )
    return toPurchaseView(await loadPurchase(tx, row.id), today)
  }, SERIALIZABLE)
}

/** Adds or removes sessions by hand (with a reason). The balance can never go below zero. */
export async function adjustPtSessions(
  db: TenantDb,
  actor: Actor,
  purchaseId: string,
  input: z.infer<typeof ptAdjustSchema>,
  today: IsoDate,
): Promise<PtPurchaseView> {
  return db.$transaction(async (tx) => {
    const row = await loadPurchase(tx, purchaseId)
    const { sessionsLeft } = toPurchaseView(row, today)
    if (sessionsLeft + input.change < 0) {
      throw new AppError(
        409,
        ErrorCode.PT_BALANCE_NEGATIVE,
        `Only ${sessionsLeft} session${sessionsLeft === 1 ? '' : 's'} left; you can't remove ${-input.change}.`,
      )
    }
    await tx.ptSessionLedger.create({
      data: {
        gymId: actor.gymId,
        purchaseId: row.id,
        change: input.change,
        reason: 'adjustment',
        note: input.note,
        createdById: actor.userId,
      },
    })
    return toPurchaseView(await loadPurchase(tx, row.id), today)
  }, SERIALIZABLE)
}

/** Moves the "use by" date later, e.g. after an injury. Never earlier. */
export async function extendPtPurchase(
  db: TenantDb,
  purchaseId: string,
  expiresOn: IsoDate,
  today: IsoDate,
): Promise<PtPurchaseView> {
  if (!isValidIsoDate(expiresOn)) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Enter a valid date')
  return db.$transaction(async (tx) => {
    const row = await loadPurchase(tx, purchaseId)
    if (expiresOn <= fromDbDate(row.expiresOn)) {
      throw new AppError(400, ErrorCode.PT_EXPIRY_EARLIER, 'The new date must be after the current one.')
    }
    await tx.ptPurchase.update({ where: { id: row.id }, data: { expiresOn: toDbDate(expiresOn) } })
    return toPurchaseView(await loadPurchase(tx, row.id), today)
  }, SERIALIZABLE)
}

// ---------------------------------------------------------------------------
// Member and trainer views
// ---------------------------------------------------------------------------

/** Active packages first (most sessions left), then the rest, newest first. */
export function sortPurchases(views: PtPurchaseView[]): PtPurchaseView[] {
  const rank = { active: 0, used_up: 1, expired: 2 } as const
  return [...views].sort(
    (a, b) => rank[a.status] - rank[b.status] || b.startDate.localeCompare(a.startDate),
  )
}

export async function getMyPtPurchases(db: TenantDb, userId: string, today: IsoDate): Promise<PtPurchaseView[]> {
  const member = await db.member.findUnique({ where: { userId }, select: { id: true } })
  if (!member) return []
  const rows = await db.ptPurchase.findMany({ where: { memberId: member.id }, include: purchaseInclude })
  return sortPurchases(rows.map((r) => toPurchaseView(r, today)))
}

/** A trainer's clients: members with PT packages assigned to them, active clients first. */
export async function getTrainerClients(db: TenantDb, trainerId: string, today: IsoDate): Promise<TrainerClient[]> {
  const rows = await db.ptPurchase.findMany({
    where: { trainerId },
    include: { ...purchaseInclude, member: { include: { user: { select: { name: true, phone: true } } } } },
  })
  const clients = new Map<string, TrainerClient>()
  for (const row of rows) {
    const client = clients.get(row.memberId) ?? {
      memberId: row.memberId,
      name: row.member.user.name,
      phone: row.member.user.phone,
      purchases: [],
    }
    client.purchases.push(toPurchaseView(row, today))
    clients.set(row.memberId, client)
  }
  const active = (c: TrainerClient) => c.purchases.some((p) => p.status === 'active')
  return [...clients.values()]
    .map((c) => ({ ...c, purchases: sortPurchases(c.purchases) }))
    .sort((a, b) => Number(active(b)) - Number(active(a)) || a.name.localeCompare(b.name))
}
