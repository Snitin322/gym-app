import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { addDays, formatPaise, ptExpiresOn, type IsoDate, type MemberDetail, type PtPurchaseView } from '@onthec/shared'
import { useAdjustPt, useExtendPt, usePtPackages, useRecordPtPayment, useSellPt, useStaff } from '../../api/admin'
import { useBookSession, useMemberSessions } from '../../api/pt-booking'
import { errorMessage, formatDate, plural } from '../../lib/format'
import { bookingBlockedReason, pastSessions, ptBookingLabel, sessionsToAnswer, upcomingSessions } from '../../lib/pt'
import { initialSale, saleToInput, type SaleState } from '../../lib/sale'
import { Button } from '../../ui/Button'
import { Field, SelectInput, TextInput } from '../../ui/Form'
import { PtPurchaseCard } from '../../ui/PtPurchaseCard'
import { PtSessionCard } from '../../ui/PtSessionCard'
import { ErrorText } from '../../ui/Screen'
import { SlotPicker } from '../../ui/SlotPicker'
import { PanelButtons, PanelCard, RecordPaymentPanel } from './panels'
import { SaleFields } from './SaleFields'

type PtAction = 'pay' | 'adjust' | 'extend' | 'book'
type PtPanel = 'sell' | { action: PtAction; purchase: PtPurchaseView } | null

/** Personal training on the member page: their packages, selling a new one, and booking sessions. */
export function PtSection({ member, today }: { member: MemberDetail; today: IsoDate }) {
  const [panel, setPanel] = useState<PtPanel>(null)
  const close = () => setPanel(null)
  const idle = panel === null
  const open = (action: PtAction, purchase: PtPurchaseView) => setPanel({ action, purchase })
  const openFor = (purchase: PtPurchaseView) =>
    typeof panel === 'object' && panel?.purchase.id === purchase.id ? panel.action : null

  return (
    <section className="flex flex-col gap-3" aria-labelledby="pt-heading">
      <div className="mt-2 flex items-center justify-between gap-3">
        <h2 id="pt-heading" className="font-semibold">
          Personal training
        </h2>
        {idle && (
          <Button variant="secondary" className="w-auto" onClick={() => setPanel('sell')}>
            Sell PT package
          </Button>
        )}
      </div>

      {panel === 'sell' && <SellPtPanel member={member} today={today} onDone={close} />}
      {member.ptPurchases.length === 0 && panel !== 'sell' && <p className="text-sm text-muted">No PT packages yet.</p>}

      {member.ptPurchases.map((p) => {
        const blocked = bookingBlockedReason(p)
        return (
          <div key={p.id} className="flex flex-col gap-3">
            <PtPurchaseCard purchase={p} today={today} showLedger>
              <p className="mt-2 text-sm text-muted">
                {formatPaise(p.pricePaise)}
                {p.listPricePaise > p.pricePaise &&
                  ` (${formatPaise(p.listPricePaise - p.pricePaise)} off${p.discountReason ? ` · ${p.discountReason}` : ''})`}{' '}
                · bought {formatDate(p.startDate)}
              </p>
              {p.status === 'active' && <p className="mt-1 text-sm text-muted">{ptBookingLabel(p)}</p>}
              {p.duePaise > 0 ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-warn">
                    {formatPaise(p.duePaise)} due{p.paidPaise > 0 && ` · ${formatPaise(p.paidPaise)} paid`}
                  </p>
                  {idle && (
                    <Button className="w-auto" onClick={() => open('pay', p)}>
                      Record payment
                    </Button>
                  )}
                </div>
              ) : (
                p.paidPaise > 0 && <p className="mt-1 text-sm text-accent">Paid {formatPaise(p.paidPaise)}</p>
              )}
              {idle && p.status !== 'used_up' && (
                <div className="mt-4 flex flex-col gap-2">
                  <Button disabled={blocked !== null} onClick={() => open('book', p)}>
                    Book session
                  </Button>
                  {blocked && <p className="text-sm text-muted">{blocked}</p>}
                </div>
              )}
              {idle && (
                <div className="mt-3 flex gap-3">
                  <Button variant="secondary" onClick={() => open('adjust', p)}>
                    Adjust sessions
                  </Button>
                  <Button variant="secondary" onClick={() => open('extend', p)}>
                    Extend
                  </Button>
                </div>
              )}
            </PtPurchaseCard>
            {openFor(p) === 'pay' && <PtPayPanel member={member} purchase={p} onDone={close} />}
            {openFor(p) === 'adjust' && <AdjustPanel member={member} purchase={p} onDone={close} />}
            {openFor(p) === 'extend' && <ExtendPanel member={member} purchase={p} today={today} onDone={close} />}
            {openFor(p) === 'book' && <BookPanel purchase={p} onDone={close} />}
          </div>
        )
      })}

      {member.ptPurchases.length > 0 && <MemberSessions memberId={member.id} />}
    </section>
  )
}

function SellPtPanel({ member, today, onDone }: { member: MemberDetail; today: IsoDate; onDone: () => void }) {
  const packages = usePtPackages()
  const staff = useStaff()
  const sell = useSellPt(member.id)
  const activePackages = packages.data?.filter((p) => p.active) ?? []
  const trainers = staff.data?.filter((u) => u.role === 'trainer') ?? []
  const [packageId, setPackageId] = useState('')
  const [trainerId, setTrainerId] = useState('')
  const pkg = activePackages.find((p) => p.id === (packageId || activePackages[0]?.id))
  const trainer = trainers.find((t) => t.id === (trainerId || trainers[0]?.id))
  // Price follows the chosen package until the desk changes it.
  const [sale, setSale] = useState<SaleState | null>(null)
  const currentSale = sale ?? initialSale(pkg)
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!pkg || !trainer) return
    const checked = saleToInput(pkg, currentSale)
    if ('error' in checked) return setProblem(checked.error.replace('plan price', 'package price'))
    setProblem(null)
    sell.mutate({ packageId: pkg.id, trainerId: trainer.id, ...checked.input }, { onSuccess: onDone })
  }

  return (
    <PanelCard title="Sell PT package">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {packages.data && activePackages.length === 0 && (
          <p className="text-muted">
            Add a package first on the{' '}
            <Link to="/admin/pt-packages" className="text-accent underline">
              PT packages
            </Link>{' '}
            screen.
          </p>
        )}
        {staff.data && trainers.length === 0 && (
          <p className="text-muted">
            Add a trainer first on the{' '}
            <Link to="/admin/staff" className="text-accent underline">
              Staff
            </Link>{' '}
            screen.
          </p>
        )}
        <Field
          label="Package"
          hint={pkg ? `Valid till ${formatDate(ptExpiresOn(today, pkg.validityDays))}.` : undefined}
        >
          {(id) => (
            <SelectInput
              id={id}
              value={pkg?.id ?? ''}
              onChange={(e) => {
                setPackageId(e.target.value)
                setSale(null)
              }}
            >
              {activePackages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {plural(p.sessionCount, 'session')} · {formatPaise(p.pricePaise)}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Trainer">
          {(id) => (
            <SelectInput id={id} value={trainer?.id ?? ''} onChange={(e) => setTrainerId(e.target.value)}>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        {pkg && <SaleFields plan={pkg} value={currentSale} onChange={setSale} />}
        <ErrorText>{problem ?? errorMessage(sell.error ?? packages.error ?? staff.error)}</ErrorText>
        <PanelButtons onCancel={onDone} submitLabel="Sell package" loading={sell.isPending} />
      </form>
    </PanelCard>
  )
}

function BookPanel({ purchase, onDone }: { purchase: PtPurchaseView; onDone: () => void }) {
  const book = useBookSession()
  return (
    <PanelCard title={`Book a session · ${purchase.packageName}`}>
      <SlotPicker
        purchaseId={purchase.id}
        confirmLabel="Book session"
        pending={book.isPending}
        error={book.error}
        onConfirm={(startsAt) => book.mutate({ purchaseId: purchase.id, startsAt }, { onSuccess: onDone })}
        onCancel={onDone}
      />
    </PanelCard>
  )
}

/**
 * The member's PT sessions: upcoming ones (the desk can move or cancel them, never using up a session),
 * then the last 30 days with how each was marked, the member's answer, and disputes to resolve.
 */
function MemberSessions({ memberId }: { memberId: string }) {
  const sessions = useMemberSessions(memberId)
  const all = sessions.data ?? []
  const upcoming = upcomingSessions(all)
  const recent = [...sessionsToAnswer(all), ...pastSessions(all)]
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">Upcoming PT sessions</h3>
      <ErrorText>{errorMessage(sessions.error)}</ErrorText>
      {sessions.data && upcoming.length === 0 && <p className="text-sm text-muted">No sessions booked.</p>}
      <ul className="flex flex-col gap-2">
        {upcoming.map((s) => (
          <li key={s.id}>
            <PtSessionCard session={s} viewer="staff" desk showTrainer />
          </li>
        ))}
      </ul>
      {recent.length > 0 && (
        <>
          <h3 className="mt-2 font-semibold">Recent PT sessions</h3>
          <ul className="flex flex-col gap-2">
            {recent.map((s) => (
              <li key={s.id}>
                <PtSessionCard session={s} viewer="staff" desk showTrainer />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function PtPayPanel({
  member,
  purchase,
  onDone,
}: {
  member: MemberDetail
  purchase: PtPurchaseView
  onDone: () => void
}) {
  const record = useRecordPtPayment(member.id)
  return (
    <RecordPaymentPanel
      label={`${purchase.packageName} (PT)`}
      duePaise={purchase.duePaise}
      pending={record.isPending}
      error={record.error}
      onSubmit={(values) => record.mutate({ purchaseId: purchase.id, ...values }, { onSuccess: onDone })}
      onCancel={onDone}
    />
  )
}

function AdjustPanel({
  member,
  purchase,
  onDone,
}: {
  member: MemberDetail
  purchase: PtPurchaseView
  onDone: () => void
}) {
  const adjust = useAdjustPt(member.id)
  const [direction, setDirection] = useState<'remove' | 'add'>('remove')
  const [count, setCount] = useState('1')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const n = Number(count)
    if (!Number.isInteger(n) || n < 1 || n > 50) return setProblem('Enter 1 to 50 sessions')
    if (direction === 'remove' && n > purchase.sessionsLeft) {
      return setProblem(`Only ${plural(purchase.sessionsLeft, 'session')} left`)
    }
    if (note.trim().length < 3) return setProblem('Give a reason for the change')
    setProblem(null)
    adjust.mutate(
      { purchaseId: purchase.id, change: direction === 'remove' ? -n : n, note: note.trim() },
      { onSuccess: onDone },
    )
  }

  return (
    <PanelCard title="Adjust sessions">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-muted">
          {purchase.packageName} · {plural(purchase.sessionsLeft, 'session')} left. Use this to correct the balance,
          e.g. sessions taken before the app. Every change is kept in the history.
        </p>
        <div role="radiogroup" aria-label="Change" className="flex flex-wrap gap-2">
          {(['remove', 'add'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={direction === d}
              onClick={() => setDirection(d)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                direction === d ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted'
              }`}
            >
              {d === 'remove' ? 'Remove sessions' : 'Add sessions'}
            </button>
          ))}
        </div>
        <Field label="Sessions">
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          )}
        </Field>
        <Field label="Reason">
          {(id) => (
            <TextInput
              id={id}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Sessions taken before the app"
            />
          )}
        </Field>
        <ErrorText>{problem ?? errorMessage(adjust.error)}</ErrorText>
        <PanelButtons onCancel={onDone} submitLabel="Save change" loading={adjust.isPending} />
      </form>
    </PanelCard>
  )
}

function ExtendPanel({
  member,
  purchase,
  today,
  onDone,
}: {
  member: MemberDetail
  purchase: PtPurchaseView
  today: IsoDate
  onDone: () => void
}) {
  const extend = useExtendPt(member.id)
  // Suggest two more weeks from the later of the current use-by date and today.
  const [expiresOn, setExpiresOn] = useState(addDays(purchase.expiresOn > today ? purchase.expiresOn : today, 14))
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!expiresOn) return setProblem('Pick a date')
    if (expiresOn <= purchase.expiresOn) return setProblem(`Pick a date after ${formatDate(purchase.expiresOn)}`)
    setProblem(null)
    extend.mutate({ purchaseId: purchase.id, expiresOn }, { onSuccess: onDone })
  }

  return (
    <PanelCard title="Extend validity">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-muted">
          {purchase.packageName} · currently {purchase.status === 'expired' ? 'expired on' : 'valid till'}{' '}
          {formatDate(purchase.expiresOn)}.
        </p>
        <Field label="New use-by date">
          {(id) => <TextInput id={id} type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />}
        </Field>
        <ErrorText>{problem ?? errorMessage(extend.error)}</ErrorText>
        <PanelButtons onCancel={onDone} submitLabel="Extend" loading={extend.isPending} />
      </form>
    </PanelCard>
  )
}
