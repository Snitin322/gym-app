import { useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import {
  addDays,
  formatPaise,
  inclusiveDays,
  membershipEndDate,
  normalizePhone,
  todayInIndia,
  type MemberDetail,
  type MembershipView,
} from '@onthec/shared'
import {
  useAddMembership,
  useCancelMembership,
  useFreeze,
  useMember,
  usePlans,
  useUnfreeze,
  useUpdateMember,
} from '../../api/admin'
import { errorMessage, formatDate, formatPhone, plural } from '../../lib/format'
import { membershipRange, membershipSummary, monthsLabel, planOptionLabel } from '../../lib/membership'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Button } from '../../ui/Button'
import { Card, Field, PhoneInput, SelectInput, TextArea, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'
import { StatusBadge } from '../../ui/StatusBadge'

type Panel = 'renew' | 'freeze' | 'cancel' | 'edit' | null

export function MemberPage() {
  const { id = '' } = useParams()
  const member = useMember(id)
  const [panel, setPanel] = useState<Panel>(null)
  const today = todayInIndia()
  const back = { to: '/admin/members', label: 'Members' }

  if (member.isPending) return <AdminLayout title="Member" back={back}><LoadingText /></AdminLayout>
  if (!member.data) {
    return (
      <AdminLayout title="Member" back={back}>
        <ErrorText>{errorMessage(member.error) ?? 'Member not found'}</ErrorText>
      </AdminLayout>
    )
  }

  const m = member.data
  const current = m.current
  const live = current && (current.status === 'active' || current.status === 'frozen' || current.status === 'upcoming')
  const canFreeze = live && current.maxFreezeDays - current.freezeDaysUsed > 0
  const canUnfreeze = live && current.freezes.some((f) => f.toDate >= today)
  const close = () => setPanel(null)

  return (
    <AdminLayout title={m.name} back={back} action={<StatusBadge status={m.status} />}>
      <p className="-mt-3 text-muted">
        <a href={`tel:${m.phone}`} className="hover:text-ink">
          {formatPhone(m.phone)}
        </a>{' '}
        · Joined {formatDate(m.joinedOn)}
      </p>

      {current ? (
        <MembershipCard membership={current} today={today} highlight />
      ) : (
        <Card>
          <p className="text-muted">No membership yet.</p>
        </Card>
      )}

      {panel === null && (
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => setPanel('renew')}>{current ? 'Renew' : 'Add membership'}</Button>
          {canFreeze && (
            <Button variant="secondary" onClick={() => setPanel('freeze')}>
              Freeze
            </Button>
          )}
          {canUnfreeze && <UnfreezeButton member={m} membership={current} />}
          {live && (
            <Button variant="secondary" onClick={() => setPanel('cancel')}>
              Cancel membership
            </Button>
          )}
          <Button variant="secondary" onClick={() => setPanel('edit')}>
            Edit details
          </Button>
        </div>
      )}

      {panel === 'renew' && <RenewPanel member={m} today={today} onDone={close} />}
      {panel === 'freeze' && current && <FreezePanel member={m} membership={current} today={today} onDone={close} />}
      {panel === 'cancel' && current && <CancelPanel member={m} membership={current} onDone={close} />}
      {panel === 'edit' && <EditPanel member={m} onDone={close} />}

      {(m.emergencyContactName || m.emergencyContactPhone || m.notes) && (
        <Card className="text-sm">
          {(m.emergencyContactName || m.emergencyContactPhone) && (
            <p>
              <span className="text-muted">Emergency contact: </span>
              {[m.emergencyContactName, m.emergencyContactPhone && formatPhone(m.emergencyContactPhone)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {m.notes && <p className="mt-2 whitespace-pre-line text-muted">{m.notes}</p>}
        </Card>
      )}

      {m.memberships.length > 1 && (
        <section className="flex flex-col gap-2">
          <h2 className="mt-2 font-semibold">All memberships</h2>
          {m.memberships.map((ms) => (
            <MembershipCard key={ms.id} membership={ms} today={today} />
          ))}
        </section>
      )}
    </AdminLayout>
  )
}

function MembershipCard({
  membership: ms,
  today,
  highlight = false,
}: {
  membership: MembershipView
  today: string
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? 'border border-line' : 'py-4'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={highlight ? 'text-lg font-bold' : 'font-semibold'}>{ms.planName}</p>
          <p className="text-sm text-muted">{membershipRange(ms)}</p>
        </div>
        <StatusBadge status={ms.status} />
      </div>
      {highlight && <p className="mt-3 text-2xl font-extrabold">{membershipSummary(ms, today)}</p>}
      <p className="mt-2 text-sm text-muted">
        {formatPaise(ms.pricePaise)} · {monthsLabel(ms.durationMonths)}
        {ms.maxFreezeDays > 0 && ` · Freeze ${ms.freezeDaysUsed} of ${plural(ms.maxFreezeDays, 'day')} used`}
      </p>
      {ms.freezes.length > 0 && (
        <ul className="mt-2 text-sm text-muted">
          {ms.freezes.map((f) => (
            <li key={f.id}>
              Frozen {formatDate(f.fromDate, { short: true })} – {formatDate(f.toDate, { short: true })}
              {f.reason && ` (${f.reason})`}
            </li>
          ))}
        </ul>
      )}
      {ms.cancelReason && <p className="mt-2 text-sm text-muted">Cancelled: {ms.cancelReason}</p>}
    </Card>
  )
}

function PanelCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 border border-accent/40">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </Card>
  )
}

function PanelButtons({ onCancel, submitLabel, loading, danger = false }: {
  onCancel: () => void
  submitLabel: string
  loading: boolean
  danger?: boolean
}) {
  return (
    <div className="flex gap-3">
      <Button variant="secondary" onClick={onCancel}>
        Back
      </Button>
      <Button type="submit" loading={loading} className={danger ? '!bg-danger !text-bg' : ''}>
        {submitLabel}
      </Button>
    </div>
  )
}

/** Same default as the server: the day after the latest running/queued membership, or today. */
function defaultStart(member: MemberDetail, today: string) {
  const ends = member.memberships.filter((m) => m.status !== 'cancelled' && m.endDate >= today).map((m) => m.endDate)
  const latest = ends.sort().at(-1)
  return latest ? addDays(latest, 1) : today
}

function RenewPanel({ member, today, onDone }: { member: MemberDetail; today: string; onDone: () => void }) {
  const plans = usePlans()
  const add = useAddMembership(member.id)
  const activePlans = plans.data?.filter((p) => p.active) ?? []
  const [planId, setPlanId] = useState('')
  const [startDate, setStartDate] = useState(defaultStart(member, today))
  const plan = activePlans.find((p) => p.id === (planId || activePlans[0]?.id))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (plan) add.mutate({ planId: plan.id, startDate }, { onSuccess: onDone })
  }

  return (
    <PanelCard title={member.current ? 'Renew membership' : 'Add membership'}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {plans.data && activePlans.length === 0 && <p className="text-muted">Add a plan first on the Plans screen.</p>}
        <Field label="Plan">
          {(id) => (
            <SelectInput id={id} value={plan?.id ?? ''} onChange={(e) => setPlanId(e.target.value)}>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {planOptionLabel(p)}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field
          label="Starts on"
          hint={plan && startDate ? `Ends ${formatDate(membershipEndDate(startDate, plan.durationMonths))}.` : undefined}
        >
          {(id) => <TextInput id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
        </Field>
        <p className="text-sm text-muted">No payment is recorded yet (payments come in the next update).</p>
        <ErrorText>{errorMessage(add.error)}</ErrorText>
        <PanelButtons onCancel={onDone} submitLabel="Add membership" loading={add.isPending} />
      </form>
    </PanelCard>
  )
}

function FreezePanel({ member, membership, today, onDone }: {
  member: MemberDetail
  membership: MembershipView
  today: string
  onDone: () => void
}) {
  const freeze = useFreeze(member.id)
  const firstDay = membership.startDate > today ? membership.startDate : today
  const remaining = membership.maxFreezeDays - membership.freezeDaysUsed
  const [fromDate, setFromDate] = useState(firstDay)
  const [toDate, setToDate] = useState(addDays(firstDay, Math.min(remaining, 7) - 1))
  const [reason, setReason] = useState('')
  const days = fromDate && toDate && toDate >= fromDate ? inclusiveDays(fromDate, toDate) : 0
  const tooLong = days > remaining

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (days > 0 && !tooLong) {
      freeze.mutate({ membershipId: membership.id, fromDate, toDate, reason: reason || undefined }, { onSuccess: onDone })
    }
  }

  return (
    <PanelCard title="Freeze membership">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {plural(remaining, 'freeze day')} left. Frozen days are added to the end date.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            {(id) => <TextInput id={id} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />}
          </Field>
          <Field label="To (inclusive)">
            {(id) => <TextInput id={id} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />}
          </Field>
        </div>
        <p className={`text-sm ${tooLong ? 'text-danger' : 'text-muted'}`}>
          {days === 0
            ? 'The end must be on or after the start.'
            : tooLong
              ? `${plural(days, 'day')} is more than the ${remaining} left.`
              : `${plural(days, 'day')} · new end date ${formatDate(addDays(membership.endDate, days))}`}
        </p>
        <Field label="Reason (optional)">
          {(id) => <TextInput id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Travel" />}
        </Field>
        <ErrorText>{errorMessage(freeze.error)}</ErrorText>
        <PanelButtons onCancel={onDone} submitLabel="Freeze" loading={freeze.isPending} />
      </form>
    </PanelCard>
  )
}

function UnfreezeButton({ member, membership }: { member: MemberDetail; membership: MembershipView }) {
  const unfreeze = useUnfreeze(member.id)
  return (
    <div className="contents">
      <Button variant="secondary" loading={unfreeze.isPending} onClick={() => unfreeze.mutate(membership.id)}>
        Unfreeze
      </Button>
      {unfreeze.error && (
        <div className="col-span-2">
          <ErrorText>{errorMessage(unfreeze.error)}</ErrorText>
        </div>
      )}
    </div>
  )
}

function CancelPanel({ member, membership, onDone }: {
  member: MemberDetail
  membership: MembershipView
  onDone: () => void
}) {
  const cancel = useCancelMembership(member.id)
  const [reason, setReason] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    cancel.mutate({ membershipId: membership.id, reason: reason || undefined }, { onSuccess: onDone })
  }

  return (
    <PanelCard title="Cancel membership?">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-muted">
          {membership.planName} ({membershipRange(membership)}) will stop immediately. This can't be undone.
        </p>
        <Field label="Reason (optional)">
          {(id) => <TextInput id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <ErrorText>{errorMessage(cancel.error)}</ErrorText>
        <PanelButtons onCancel={onDone} submitLabel="Yes, cancel it" loading={cancel.isPending} danger />
      </form>
    </PanelCard>
  )
}

function EditPanel({ member, onDone }: { member: MemberDetail; onDone: () => void }) {
  const update = useUpdateMember(member.id)
  const [name, setName] = useState(member.name)
  const [phone, setPhone] = useState(formatPhone(member.phone).replace('+91 ', ''))
  const [joinedOn, setJoinedOn] = useState(member.joinedOn)
  const [emergencyName, setEmergencyName] = useState(member.emergencyContactName ?? '')
  const [emergencyPhone, setEmergencyPhone] = useState(
    member.emergencyContactPhone ? formatPhone(member.emergencyContactPhone).replace('+91 ', '') : '',
  )
  const [notes, setNotes] = useState(member.notes ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = normalizePhone(phone)
    if (name.trim().length < 2) return setProblem('Enter the member’s name')
    if (!normalized) return setProblem('Enter a valid 10-digit Indian mobile number')
    if (emergencyPhone && !normalizePhone(emergencyPhone)) return setProblem('Emergency contact number is not valid')
    setProblem(null)
    update.mutate(
      {
        name: name.trim(),
        phone: normalized,
        joinedOn,
        emergencyContactName: emergencyName,
        emergencyContactPhone: emergencyPhone,
        notes,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <PanelCard title="Edit details">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Full name">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Mobile number" hint="Changing it changes the number they log in with.">
          {(id) => <PhoneInput id={id} value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
        <Field label="Joined the gym on">
          {(id) => <TextInput id={id} type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} />}
        </Field>
        <Field label="Emergency contact name">
          {(id) => <TextInput id={id} value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />}
        </Field>
        <Field label="Emergency contact number">
          {(id) => <PhoneInput id={id} value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />}
        </Field>
        <Field label="Notes">{(id) => <TextArea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <ErrorText>{problem ?? errorMessage(update.error)}</ErrorText>
        <PanelButtons onCancel={onDone} submitLabel="Save" loading={update.isPending} />
      </form>
    </PanelCard>
  )
}
