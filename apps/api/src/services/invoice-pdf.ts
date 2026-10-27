import PDFDocument from 'pdfkit'
import { PAYMENT_METHOD_LABELS, amountInWords, type PaymentMethod } from '@onthec/shared'
import { fromDbDate } from '../lib/dates'
import type { InvoiceBuyer, InvoiceRow, InvoiceSeller } from './invoices'

// Built-in Helvetica has no ₹ glyph, so amounts print as "Rs. 4,500.00" (standard on Indian invoices).
function money(paise: number) {
  return `Rs. ${new Intl.NumberFormat('en-IN').format(Math.floor(paise / 100))}.${String(paise % 100).padStart(2, '0')}`
}

function longDate(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  )
}

/** Plain-data view of everything printed, kept separate from drawing so it can be tested. */
export function invoiceLines(invoice: InvoiceRow) {
  const seller = invoice.seller as unknown as InvoiceSeller
  const buyer = invoice.buyer as unknown as InvoiceBuyer
  const taxInvoice = invoice.kind === 'tax_invoice'
  const half = invoice.gstRatePercent / 2
  const place = seller.stateName ? `${seller.stateName}${seller.stateCode ? ` (${seller.stateCode})` : ''}` : null

  return {
    title: taxInvoice ? 'TAX INVOICE' : 'RECEIPT',
    seller: [
      seller.name,
      ...(seller.tradeName && seller.tradeName !== seller.name ? [`(${seller.tradeName})`] : []),
      ...(seller.address ? seller.address.split('\n') : []),
      [seller.city, seller.pincode].filter(Boolean).join(' - '),
      ...(place ? [`State: ${place}`] : []),
      ...(seller.gstin ? [`GSTIN: ${seller.gstin}`] : []),
      [seller.phone, seller.email].filter(Boolean).join('  ·  '),
    ].filter((line) => line.trim() !== ''),
    meta: [
      [taxInvoice ? 'Invoice no.' : 'Receipt no.', invoice.number],
      ['Date', longDate(fromDbDate(invoice.issuedOn))],
      ...(taxInvoice && place ? [['Place of supply', place]] : []),
    ] as [string, string][],
    buyer: [buyer.name, buyer.phone],
    item: {
      description: invoice.description,
      sac: invoice.sacCode ?? '',
      amount: money(invoice.taxablePaise),
    },
    totals: (taxInvoice
      ? [
          ['Taxable value', money(invoice.taxablePaise)],
          [`CGST @ ${half}%`, money(invoice.cgstPaise)],
          [`SGST @ ${half}%`, money(invoice.sgstPaise)],
          ['Total (incl. GST)', money(invoice.totalPaise)],
        ]
      : [['Total', money(invoice.totalPaise)]]) as [string, string][],
    inWords: amountInWords(invoice.totalPaise),
    payment: `Paid by ${PAYMENT_METHOD_LABELS[invoice.paymentMethod as PaymentMethod] ?? invoice.paymentMethod}${
      invoice.paymentRef ? `  ·  Ref: ${invoice.paymentRef}` : ''
    }`,
    footer: taxInvoice
      ? 'Prices include GST. This is a computer-generated invoice and needs no signature.'
      : 'GST not charged: the supplier is not registered under GST. This is a computer-generated receipt.',
  }
}

/** Renders an issued invoice as an A4 PDF. */
export function renderInvoicePdf(invoice: InvoiceRow): Promise<Buffer> {
  const lines = invoiceLines(invoice)
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${lines.title} ${invoice.number}` } })
  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const left = 48
  const right = doc.page.width - 48
  const width = right - left
  const ink = '#111827'
  const muted = '#6b7280'

  // Header: seller on the left, title and invoice details on the right.
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(15).text(lines.seller[0] ?? '', left, 48, { width: width * 0.6 })
  doc.font('Helvetica').fontSize(9).fillColor(muted)
  for (const line of lines.seller.slice(1)) doc.text(line, { width: width * 0.6 })
  const headerBottom = doc.y

  doc.font('Helvetica-Bold').fontSize(16).fillColor(ink).text(lines.title, left, 48, { width, align: 'right' })
  // Invoice details as two right-aligned columns: labels, then values.
  const valueWidth = 120
  const labelWidth = 90
  let metaY = doc.y + 6
  doc.fontSize(9)
  for (const [label, value] of lines.meta) {
    doc.font('Helvetica').fillColor(muted).text(label, right - valueWidth - labelWidth - 8, metaY, {
      width: labelWidth,
      align: 'right',
    })
    doc.font('Helvetica-Bold').fillColor(ink).text(value, right - valueWidth, metaY, { width: valueWidth, align: 'right' })
    metaY = doc.y + 3
  }

  // Bill to
  let y = Math.max(headerBottom, doc.y) + 20
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5e7eb').stroke()
  y += 12
  doc.font('Helvetica').fontSize(9).fillColor(muted).text('Bill to', left, y)
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(lines.buyer[0] ?? '')
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(lines.buyer[1] ?? '')

  // Item table
  y = doc.y + 18
  const cols = { desc: left, sac: left + width * 0.62, amount: left + width * 0.75 }
  doc.rect(left, y, width, 20).fill('#f3f4f6')
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(9)
  doc.text('Description', cols.desc + 8, y + 6)
  doc.text('SAC', cols.sac, y + 6)
  doc.text('Amount', cols.amount, y + 6, { width: right - cols.amount - 8, align: 'right' })
  y += 28
  doc.font('Helvetica').fontSize(10)
  doc.text(lines.item.description, cols.desc + 8, y, { width: cols.sac - cols.desc - 16 })
  const rowBottom = doc.y
  doc.text(lines.item.sac, cols.sac, y)
  doc.text(lines.item.amount, cols.amount, y, { width: right - cols.amount - 8, align: 'right' })
  y = Math.max(rowBottom, doc.y) + 10
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5e7eb').stroke()

  // Totals
  y += 10
  lines.totals.forEach(([label, value], index) => {
    const last = index === lines.totals.length - 1
    doc.font(last ? 'Helvetica-Bold' : 'Helvetica').fontSize(last ? 11 : 10).fillColor(ink)
    doc.text(label, left + width * 0.5, y, { width: width * 0.25 })
    doc.text(value, cols.amount, y, { width: right - cols.amount - 8, align: 'right' })
    y = doc.y + 4
  })

  doc.moveDown(1).font('Helvetica-Oblique').fontSize(9).fillColor(ink).text(lines.inWords, left, doc.y, { width })
  doc.moveDown(0.6).font('Helvetica').fillColor(muted).text(lines.payment, { width })
  doc.moveDown(2).fontSize(8).text(lines.footer, { width, align: 'center' })

  doc.end()
  return done
}
