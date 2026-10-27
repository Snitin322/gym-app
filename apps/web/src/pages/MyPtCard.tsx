import { formatPaise, todayInIndia } from '@onthec/shared'
import { useMyPt } from '../api/admin'
import { errorMessage } from '../lib/format'
import { Card } from '../ui/Form'
import { PtPurchaseCard } from '../ui/PtPurchaseCard'
import { ErrorText } from '../ui/Screen'

/** The member's PT packages: sessions left, trainer and use-by date. Nothing shows if they've never bought PT. */
export function MyPtCard() {
  const query = useMyPt()
  const today = todayInIndia()

  if (query.isPending) return null
  if (query.error) {
    return (
      <Card>
        <ErrorText>{errorMessage(query.error)}</ErrorText>
      </Card>
    )
  }
  // Running packages, plus the most recent finished one so the member can see what they had.
  const running = query.data.filter((p) => p.status === 'active')
  const shown = running.length > 0 ? running : query.data.slice(0, 1)
  if (shown.length === 0) return null

  return (
    <section aria-label="Personal training" className="flex flex-col gap-3">
      {shown.map((p) => (
        <PtPurchaseCard key={p.id} purchase={p} today={today} title={`PT · ${p.packageName}`} showLedger>
          {p.duePaise > 0 && (
            <p className="mt-3 text-sm font-semibold text-warn">{formatPaise(p.duePaise)} due · pay at the front desk</p>
          )}
        </PtPurchaseCard>
      ))}
    </section>
  )
}
