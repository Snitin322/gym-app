import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  LEAD_FILTERS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  normalizePhone,
  todayInIndia,
  whatsappLink,
  type LeadDuplicate,
  type LeadFilter,
  type LeadSource,
  type LeadView,
} from '@onthec/shared'
import { checkLeadPhone, useLeads, useSaveLead } from '../../api/leads'
import { useSignedInUser } from '../../auth/AuthContext'
import { errorMessage, formatDate, formatPhone } from '../../lib/format'
import type { BadgeTone } from '../../lib/membership'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Button } from '../../ui/Button'
import { Card, Field, PhoneInput, SelectInput, TextArea, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'
import { Badge } from '../../ui/StatusBadge'

const FILTER_LABELS: Record<LeadFilter, string> = { open: 'Open', joined: 'Joined', lost: 'Lost', all: 'All' }
const STATUS_TONES: Record<LeadView['status'], BadgeTone> = {
  new: 'info',
  contacted: 'warn',
  trial: 'warn',
  joined: 'good',
  lost: 'muted',
}

/** Owner/admin: enquiries, their follow-ups, and turning them into members. */
export function LeadsPage() {
  const [filter, setFilter] = useState<LeadFilter>('open')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const leads = useLeads(filter, q.trim())

  return (
    <AdminLayout
      title="Leads"
      back={{ to: '/home', label: 'Home' }}
      action={
        !adding && (
          <Button className="w-auto" onClick={() => setAdding(true)}>
            Add lead
          </Button>
        )
      }
    >
      {adding && <LeadForm onDone={() => setAdding(false)} />}

      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {LEAD_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
              filter === f ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>
      <Field label="Search by name or phone">
        {(id) => <TextInput id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}
      </Field>

      {leads.isPending && <LoadingText />}
      <ErrorText>{errorMessage(leads.error)}</ErrorText>
      {leads.data?.length === 0 && (
        <Card>
          <p className="text-muted">
            {filter === 'open' && !q ? 'No open enquiries. Add one when someone calls or walks in.' : 'No leads found.'}
          </p>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {leads.data?.map((lead) => (
          <li key={lead.id}>
            <LeadCard lead={lead} />
          </li>
        ))}
      </ul>
    </AdminLayout>
  )
}

function DuplicateNote({ duplicates }: { duplicates: LeadDuplicate[] }) {
  if (duplicates.length === 0) return null
  return (
    <p role="status" className="text-sm text-warn">
      This number is already{' '}
      {duplicates.map((d, i) => (
        <span key={`${d.kind}-${d.id}`}>
          {i > 0 && ', '}
          {d.kind === 'member' ? (
            <Link to={`/admin/members/${d.id}`} className="underline">
              a member ({d.name})
            </Link>
          ) : (
            `an enquiry (${d.name})`
          )}
        </span>
      ))}
      .
    </p>
  )
}

function LeadCard({ lead }: { lead: LeadView }) {
  const [editing, setEditing] = useState(false)
  const navigate = useNavigate()
  const gym = useSignedInUser().gym.name
  const today = todayInIndia()
  const open = lead.status !== 'joined' && lead.status !== 'lost'
  const overdue = open && lead.followUpOn !== null && lead.followUpOn < today
  const firstName = lead.name.split(' ')[0] ?? lead.name

  return (
    <article aria-label={lead.name} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{lead.name}</p>
          <p className="text-sm text-muted">
            {formatPhone(lead.phone)} · {LEAD_SOURCE_LABELS[lead.source]}
          </p>
          {lead.interest && <p className="text-sm">{lead.interest}</p>}
        </div>
        <Badge label={LEAD_STATUS_LABELS[lead.status]} tone={STATUS_TONES[lead.status]} />
      </div>
      {lead.followUpOn && open && (
        <p
          className={`text-sm ${overdue ? 'font-semibold text-danger' : lead.followUpOn === today ? 'font-semibold text-warn' : 'text-muted'}`}
        >
          Follow up{' '}
          {lead.followUpOn === today ? 'today' : `${overdue ? 'was due ' : 'on '}${formatDate(lead.followUpOn)}`}
        </p>
      )}
      {lead.note && <p className="text-sm text-muted">{lead.note}</p>}
      {lead.lostReason && <p className="text-sm text-muted">Didn’t join: {lead.lostReason}</p>}
      {lead.memberId && (
        <Link to={`/admin/members/${lead.memberId}`} className="text-sm font-semibold text-accent underline">
          Open member page →
        </Link>
      )}
      <DuplicateNote duplicates={lead.duplicates} />

      {editing ? (
        <LeadForm lead={lead} onDone={() => setEditing(false)} />
      ) : (
        lead.status !== 'joined' && (
          <div className="flex flex-wrap gap-2">
            <a
              href={`tel:${lead.phone}`}
              aria-label={`Call ${lead.name}`}
              className="flex size-12 items-center justify-center rounded-xl border border-line"
            >
              📞
            </a>
            <a
              href={whatsappLink(
                lead.phone,
                `Hi ${firstName}, this is ${gym}. Thanks for your interest! Would you like to come in for a free trial session this week?`,
              )}
              target="_blank"
              rel="noreferrer"
              aria-label={`WhatsApp ${lead.name}`}
              className="flex size-12 items-center justify-center rounded-xl border border-line"
            >
              💬
            </a>
            <Button variant="secondary" className="w-auto flex-1" onClick={() => setEditing(true)}>
              Update
            </Button>
            {open && (
              <Button
                className="w-full"
                onClick={() =>
                  void navigate(`/admin/members/new?${new URLSearchParams({ name: lead.name, phone: lead.phone })}`)
                }
              >
                Convert to member
              </Button>
            )}
          </div>
        )
      )}
    </article>
  )
}

/** Add a lead, or update one (status, follow-up date, note, details). */
function LeadForm({ lead, onDone }: { lead?: LeadView; onDone: () => void }) {
  const save = useSaveLead()
  const [name, setName] = useState(lead?.name ?? '')
  const [phone, setPhone] = useState(lead?.phone.replace(/^\+91/, '') ?? '')
  const [source, setSource] = useState<LeadSource>(lead?.source ?? 'walk_in')
  const [interest, setInterest] = useState(lead?.interest ?? '')
  const [note, setNote] = useState(lead?.note ?? '')
  const [followUpOn, setFollowUpOn] = useState(lead?.followUpOn ?? '')
  const [status, setStatus] = useState<'new' | 'contacted' | 'trial' | 'lost'>(
    lead && lead.status !== 'joined' ? lead.status : 'new',
  )
  const [lostReason, setLostReason] = useState(lead?.lostReason ?? '')
  const [duplicates, setDuplicates] = useState<LeadDuplicate[]>([])
  const [problem, setProblem] = useState<string | null>(null)

  const check = async () => {
    const normalized = normalizePhone(phone)
    if (!normalized || normalized === lead?.phone) return setDuplicates([])
    try {
      setDuplicates((await checkLeadPhone(normalized)).duplicates)
    } catch {
      setDuplicates([])
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim().length < 2) return setProblem('Enter their name')
    if (!normalizePhone(phone)) return setProblem('Enter a valid 10-digit Indian mobile number')
    if (status === 'lost' && !lostReason.trim()) return setProblem('Say why they didn’t join')
    setProblem(null)
    const details = { name: name.trim(), phone, source, interest, note }
    save.mutate(
      lead
        ? {
            id: lead.id,
            ...details,
            followUpOn: followUpOn || null,
            status,
            lostReason: status === 'lost' ? lostReason : undefined,
          }
        : { ...details, followUpOn: followUpOn || undefined },
      { onSuccess: onDone },
    )
  }

  return (
    <Card className={lead ? 'border-t border-line !p-0 !pt-3' : 'border border-accent/40'}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {!lead && <h2 className="text-lg font-bold">New lead</h2>}
        {lead && (
          <Field label="Status">
            {(id) => (
              <SelectInput id={id} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                {(['new', 'contacted', 'trial', 'lost'] as const).map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        )}
        {status === 'lost' && (
          <Field label="Why didn’t they join?">
            {(id) => (
              <TextInput
                id={id}
                value={lostReason}
                maxLength={120}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="e.g. Too far from home"
              />
            )}
          </Field>
        )}
        <Field label="Name">
          {(id) => <TextInput id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Mobile number">
          {(id) => (
            <PhoneInput id={id} value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => void check()} />
          )}
        </Field>
        <DuplicateNote duplicates={duplicates} />
        <Field label="How did they hear about us?">
          {(id) => (
            <SelectInput id={id} value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABELS[s]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Interested in (optional)">
          {(id) => (
            <TextInput
              id={id}
              value={interest}
              maxLength={120}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="e.g. Weight loss, 3 months, PT"
            />
          )}
        </Field>
        <Field label="Follow up on (optional)">
          {(id) => <TextInput id={id} type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} />}
        </Field>
        <Field label="Note (optional)">
          {(id) => <TextArea id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <ErrorText>{problem ?? errorMessage(save.error)}</ErrorText>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {lead ? 'Save' : 'Add lead'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
