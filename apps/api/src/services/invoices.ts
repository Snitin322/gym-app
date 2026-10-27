import type { Invoice } from '@prisma/client'
import {
  GST_RATE_PERCENT,
  financialYear,
  invoiceNumber,
  splitGst,
  stateName,
  type IsoDate,
} from '@onthec/shared'
import type { TenantTx } from '../db/tenant'
import { fromDbDate, toDbDate } from '../lib/dates'

/** What the invoice prints for the seller, copied from the gym at issue time. */
export interface InvoiceSeller {
  name: string
  tradeName: string
  address: string | null
  city: string | null
  pincode: string | null
  stateCode: string | null
  stateName: string | null
  gstin: string | null
  phone: string | null
  email: string | null
}

export interface InvoiceBuyer {
  name: string
  phone: string
}

function formatDate(date: IsoDate) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

/**
 * Issues the invoice for a paid payment, inside the payment's transaction. The number comes from
 * a per-gym, per-financial-year counter in the same transaction, so numbers are gap-free: if
 * anything fails, the payment and the number roll back together. Does nothing if already issued.
 */
export async function issueInvoiceInTx(tx: TenantTx, gymId: string, paymentId: string, today: IsoDate) {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: {
      membership: true,
      ptPurchase: { include: { trainer: { select: { name: true } } } },
      member: { include: { user: { select: { name: true, phone: true } } } },
      invoice: { select: { id: true } },
    },
  })
  if (payment.invoice || payment.status !== 'paid') return

  const gym = await tx.gym.findUniqueOrThrow({ where: { id: gymId } })
  const fy = financialYear(today)
  const { lastNumber } = await tx.invoiceSequence.upsert({
    where: { gymId_financialYear: { gymId, financialYear: fy } },
    create: { gymId, financialYear: fy, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  })

  // A GSTIN means a GST tax invoice (prices include 18% GST); without one, a plain receipt.
  const kind = gym.gstin ? 'tax_invoice' : 'receipt'
  const amount = payment.amountPaise
  const split = kind === 'tax_invoice' ? splitGst(amount) : { taxablePaise: amount, cgstPaise: 0, sgstPaise: 0 }

  const ms = payment.membership
  const pt = payment.ptPurchase
  const description = ms
    ? `${ms.planName} membership, ${formatDate(fromDbDate(ms.startDate))} – ${formatDate(fromDbDate(ms.endDate))}` +
      (amount < ms.pricePaise ? ' (part payment)' : '')
    : pt
      ? `${pt.packageName}: ${pt.sessionCount} personal training sessions with ${pt.trainer.name}, ` +
        `valid till ${formatDate(fromDbDate(pt.expiresOn))}` +
        (amount < pt.pricePaise ? ' (part payment)' : '')
      : 'Payment'

  const seller: InvoiceSeller = {
    name: gym.legalName ?? gym.name,
    tradeName: gym.name,
    address: gym.address,
    city: gym.city,
    pincode: gym.pincode,
    stateCode: gym.stateCode,
    stateName: stateName(gym.stateCode),
    gstin: gym.gstin,
    phone: gym.contactPhone,
    email: gym.email,
  }
  const buyer: InvoiceBuyer = { name: payment.member.user.name, phone: payment.member.user.phone }

  await tx.invoice.create({
    data: {
      gymId,
      paymentId: payment.id,
      memberId: payment.memberId,
      kind,
      number: invoiceNumber(gym.invoicePrefix, fy, lastNumber),
      financialYear: fy,
      sequence: lastNumber,
      issuedOn: toDbDate(today),
      totalPaise: amount,
      taxablePaise: split.taxablePaise,
      cgstPaise: split.cgstPaise,
      sgstPaise: split.sgstPaise,
      gstRatePercent: kind === 'tax_invoice' ? GST_RATE_PERCENT : 0,
      sacCode: kind === 'tax_invoice' ? gym.sacCode : null,
      description,
      seller: { ...seller },
      buyer: { ...buyer },
      paymentMethod: payment.method,
      paymentRef: payment.reference,
    },
  })
}

export type InvoiceRow = Invoice
