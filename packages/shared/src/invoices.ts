import type { IsoDate } from './dates'

/** GST on gym services: 18% = CGST 9% + SGST 9% within the state. */
export const GST_RATE_PERCENT = 18

export interface GstSplit {
  /** Taxable value (price excluding GST). */
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  totalPaise: number
}

/**
 * Splits a GST-inclusive amount into taxable value, CGST and SGST, in whole paise, so the parts
 * always add up to the total exactly. ₹4,500 → ₹3,813.56 + ₹343.22 + ₹343.22.
 * (total × 100 is even and 118 × k + 59 is odd, so there is never a .5 to round.)
 */
export function splitGst(totalPaise: number, ratePercent = GST_RATE_PERCENT): GstSplit {
  const taxablePaise = Math.round((totalPaise * 100) / (100 + ratePercent))
  const tax = totalPaise - taxablePaise
  const cgstPaise = Math.floor(tax / 2)
  return { taxablePaise, cgstPaise, sgstPaise: tax - cgstPaise, totalPaise }
}

/** Indian financial year (April–March) of a date: 2027-03-31 → "2026-27", 2027-04-01 → "2027-28". */
export function financialYear(date: IsoDate): string {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const start = month >= 4 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** "OG", "2026-27", 42 → "OG/26-27/0042" (GST allows at most 16 characters). */
export function invoiceNumber(prefix: string, fy: string, sequence: number): string {
  return `${prefix}/${fy.slice(2)}/${String(sequence).padStart(4, '0')}`
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(n: number): string {
  if (n < 20) return ONES[n] as string
  const tens = TENS[Math.floor(n / 10)] as string
  return n % 10 ? `${tens} ${ONES[n % 10]}` : tens
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ')
}

/** Indian numbering: 1,23,45,678 → "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight". */
function indianWords(n: number): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(n / 10_000_000)
  const lakh = Math.floor((n % 10_000_000) / 100_000)
  const thousand = Math.floor((n % 100_000) / 1000)
  const rest = n % 1000
  if (crore) parts.push(`${indianWords(crore)} Crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (rest) parts.push(belowThousand(rest))
  return parts.join(' ')
}

/** 450050 → "Rupees Four Thousand Five Hundred and Fifty Paise Only" (for invoices). */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100)
  const rest = paise % 100
  return `Rupees ${indianWords(rupees)}${rest ? ` and ${belowHundred(rest)} Paise` : ''} Only`
}

export type InvoiceKind = 'tax_invoice' | 'receipt'

export interface InvoiceSummary {
  id: string
  number: string
  kind: InvoiceKind
  issuedOn: IsoDate
  totalPaise: number
}
