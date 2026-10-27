import { todayInIndia } from '@onthec/shared'
import { useTrainerClients } from '../api/admin'
import { errorMessage, formatPhone } from '../lib/format'
import { Card } from '../ui/Form'
import { PtPurchaseCard } from '../ui/PtPurchaseCard'
import { ErrorText } from '../ui/Screen'

/** The trainer's PT clients and how many sessions each has left. */
export function TrainerClients() {
  const query = useTrainerClients()
  const today = todayInIndia()

  return (
    <section aria-labelledby="clients-heading" className="flex flex-col gap-3">
      <h2 id="clients-heading" className="text-xl font-bold">
        My clients
      </h2>
      {query.isPending && (
        <Card>
          <div aria-busy="true" aria-label="Loading your clients" className="h-20 animate-pulse rounded-xl bg-surface-2" />
        </Card>
      )}
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {query.data?.length === 0 && (
        <Card>
          <p className="text-muted">No PT clients yet. Members appear here when the desk sells them a package with you.</p>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {query.data?.map((client) => (
          <li key={client.memberId} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <p className="font-semibold">{client.name}</p>
              <a href={`tel:${client.phone}`} className="text-sm text-muted hover:text-ink">
                {formatPhone(client.phone)}
              </a>
            </div>
            {client.purchases.map((p) => (
              <PtPurchaseCard key={p.id} purchase={p} today={today} showTrainer={false} />
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
