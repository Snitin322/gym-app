import { useState } from 'react'
import { PAYMENT_METHOD_LABELS, formatPaise, type PaymentView } from '@onthec/shared'
import { downloadFile } from '../api/client'
import { errorMessage } from '../lib/format'

/**
 * One payment: what it was for, when and how, who took it, the amount, and its invoice.
 * `onCreateInvoice` (staff only) offers to issue an invoice for older payments without one.
 */
export function PaymentRow({
  payment: p,
  onCreateInvoice,
  creating = false,
}: {
  payment: PaymentView
  onCreateInvoice?: (paymentId: string) => void
  creating?: boolean
}) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    if (!p.invoice) return
    setDownloading(true)
    setError(null)
    try {
      await downloadFile(`/invoices/${p.invoice.id}/pdf`, `${p.invoice.number.replace(/\//g, '-')}.pdf`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="rounded-2xl bg-surface px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{p.description}</p>
          <p className="text-muted">
            {p.paidAt ? formatDateTime(p.paidAt) : '—'} · {PAYMENT_METHOD_LABELS[p.method]}
            {p.reference && ` · ${p.reference}`}
          </p>
          {(p.recordedByName || p.note) && (
            <p className="text-muted">
              {[p.recordedByName && `By ${p.recordedByName}`, p.note].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <p className="shrink-0 font-bold">{formatPaise(p.amountPaise)}</p>
      </div>
      {p.invoice ? (
        <button
          type="button"
          onClick={download}
          disabled={downloading}
          className="mt-2 cursor-pointer text-sm font-semibold text-accent underline-offset-4 hover:underline disabled:opacity-60"
        >
          {downloading ? 'Downloading…' : `Invoice ${p.invoice.number} ↓`}
        </button>
      ) : (
        onCreateInvoice && (
          <button
            type="button"
            onClick={() => onCreateInvoice(p.id)}
            disabled={creating}
            className="mt-2 cursor-pointer text-sm font-semibold text-accent underline-offset-4 hover:underline disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create invoice'}
          </button>
        )
      )}
      {error && <p className="mt-1 text-danger">{error}</p>}
    </div>
  )
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso))
}
