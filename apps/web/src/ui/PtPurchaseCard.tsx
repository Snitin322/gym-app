import type { ReactNode } from 'react'
import { PT_LEDGER_LABELS, todayInIndia, type IsoDate, type PtPurchaseView } from '@onthec/shared'
import { formatDate } from '../lib/format'
import { ptExpiringSoon, ptSessionsLabel, ptUseByLabel } from '../lib/pt'
import { Card } from './Form'
import { PtStatusBadge } from './StatusBadge'

/** One PT package: sessions left, use-by date and trainer. Admin, member and trainer screens add their own bits. */
export function PtPurchaseCard({
  purchase: p,
  today,
  title = p.packageName,
  showTrainer = true,
  showLedger = false,
  children,
}: {
  purchase: PtPurchaseView
  today: IsoDate
  title?: string
  showTrainer?: boolean
  showLedger?: boolean
  children?: ReactNode
}) {
  return (
    <Card className={p.status === 'active' ? 'border border-line' : 'py-4 opacity-80'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{title}</p>
          {showTrainer && <p className="text-sm text-muted">with {p.trainer.name}</p>}
        </div>
        <PtStatusBadge status={p.status} />
      </div>
      <p className="mt-3 text-2xl font-extrabold">{ptSessionsLabel(p)}</p>
      <p className={`mt-1 text-sm ${ptExpiringSoon(p, today) ? 'font-semibold text-warn' : 'text-muted'}`}>
        {ptUseByLabel(p, today)}
      </p>
      {children}
      {showLedger && p.ledger.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Session history</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {p.ledger.map((line) => (
              <li key={line.id} className="flex justify-between gap-3">
                <span>
                  {formatDate(todayInIndia(new Date(line.createdAt)), { short: true })} · {PT_LEDGER_LABELS[line.reason]}
                  {line.note && <span className="text-muted"> · {line.note}</span>}
                  {line.createdByName && <span className="text-muted"> · {line.createdByName}</span>}
                </span>
                <span className={`font-semibold ${line.change > 0 ? 'text-accent' : 'text-ink'}`}>
                  {line.change > 0 ? `+${line.change}` : line.change}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}
