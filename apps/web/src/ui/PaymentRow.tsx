import { PAYMENT_METHOD_LABELS, formatPaise, type PaymentView } from '@onthec/shared'

/** One payment: what it was for, when and how, who took it, and the amount. */
export function PaymentRow({ payment: p }: { payment: PaymentView }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-semibold">{p.description}</p>
        <p className="text-muted">
          {p.paidAt ? formatDateTime(p.paidAt) : '—'} · {PAYMENT_METHOD_LABELS[p.method]}
          {p.reference && ` · ${p.reference}`}
        </p>
        {(p.recordedByName || p.note) && (
          <p className="text-muted">{[p.recordedByName && `By ${p.recordedByName}`, p.note].filter(Boolean).join(' · ')}</p>
        )}
      </div>
      <p className="shrink-0 font-bold">{formatPaise(p.amountPaise)}</p>
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
