import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import {
  CalendarDays,
  CalendarCheck,
  ChevronRight,
  Clock,
  MessageCircle,
  Phone,
  UsersRound,
  UserRound,
} from 'lucide-react'
import { todayInIndia, whatsappLink, type TrainerClient } from '@onthec/shared'
import { useTrainerClients } from '../../api/admin'
import { useTrainerSessions } from '../../api/pt-booking'
import { useSignedInUser } from '../../auth/AuthContext'
import { InstallHint } from '../../InstallHint'
import { errorMessage, formatPhone, plural } from '../../lib/format'
import { ptSessionsLabel, ptUseByLabel, ptExpiringSoon, scheduleSessions } from '../../lib/pt'
import { indiaDateOf } from '../../lib/time'
import { useView } from '../../lib/use-view'
import { AppShell, Avatar, PageHeader, SectionTitle, type TabItem } from '../../ui/AppShell'
import { Card, TextInput } from '../../ui/Form'
import { PtPurchaseCard } from '../../ui/PtPurchaseCard'
import { PtSessionCard } from '../../ui/PtSessionCard'
import { ErrorText, Logo } from '../../ui/Screen'
import { Segmented } from '../../ui/Segmented'
import { MemberWorkoutCalendar } from '../../ui/WorkoutCalendar'
import { AccountCard, LinkRow, LogOutButton } from '../AccountBits'
import { MemberWorkoutPlan } from '../MemberWorkoutPlan'
import { TrainerSchedule } from '../TrainerSchedule'
import { UnmarkedSessions } from '../UnmarkedSessions'

const TRAINER_TABS: TabItem[] = [
  { to: '/home', label: 'Today', icon: CalendarCheck },
  { to: '/trainer/clients', label: 'Clients', icon: UsersRound },
  { to: '/trainer/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/trainer/profile', label: 'Profile', icon: UserRound },
]

export function TrainerShell({ children }: { children: ReactNode }) {
  return <AppShell tabs={TRAINER_TABS}>{children}</AppShell>
}

/** "Good morning" by the time in India. */
function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now),
  )
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

/** Today tab: sessions to mark, then today's sessions. */
export function TrainerToday() {
  const user = useSignedInUser()
  const sessions = useTrainerSessions(user.id)
  const today = todayInIndia()
  const todays = scheduleSessions(sessions.data ?? []).filter((s) => indiaDateOf(s.startsAt) === today)
  const later = scheduleSessions(sessions.data ?? []).filter((s) => indiaDateOf(s.startsAt) > today)

  return (
    <TrainerShell>
      <header className="flex items-center gap-3">
        <Logo size={44} />
        <div className="min-w-0">
          <p className="text-sm text-muted">{greeting()}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">{user.name.split(' ')[0]}</h1>
          <p className="text-xs text-muted">Trainer · {user.gym.name}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Sessions today" value={todays.filter((s) => s.status === 'booked').length} />
        <Stat label="Later this fortnight" value={later.length} />
      </div>

      <UnmarkedSessions />

      <section aria-labelledby="today-heading" className="flex flex-col gap-3">
        <SectionTitle>
          <span id="today-heading">Today’s sessions</span>
        </SectionTitle>
        <ErrorText>{errorMessage(sessions.error)}</ErrorText>
        {sessions.data && todays.length === 0 && (
          <Card>
            <p className="text-sm text-muted">No sessions today.</p>
            {later[0] && (
              <Link to="/trainer/schedule" className="mt-2 inline-block text-sm font-semibold text-accent underline">
                See your schedule
              </Link>
            )}
          </Card>
        )}
        <ul className="flex flex-col gap-3">
          {todays.map((s) => (
            <li key={s.id}>
              <PtSessionCard session={s} viewer="staff" showMember showDay={false} />
            </li>
          ))}
        </ul>
      </section>
    </TrainerShell>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line/70">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-3xl font-extrabold">{value}</p>
    </div>
  )
}

/** Clients tab: everyone with PT with this trainer, active first; tap for their plan, tracking and PT. */
export function TrainerClientsPage() {
  const query = useTrainerClients()
  const [q, setQ] = useState('')
  const today = todayInIndia()
  const needle = q.trim().toLowerCase()
  const shown = (query.data ?? []).filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || c.phone.includes(needle.replace(/\D/g, '') || '¬'),
  )

  return (
    <TrainerShell>
      <PageHeader title="My clients" subtitle={query.data && plural(query.data.length, 'client')} />
      {(query.data?.length ?? 0) > 5 && (
        <TextInput
          type="search"
          aria-label="Search clients"
          placeholder="Search by name or number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      {query.isPending && (
        <div
          aria-busy="true"
          aria-label="Loading your clients"
          className="h-24 animate-pulse rounded-2xl bg-surface-2"
        />
      )}
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {query.data?.length === 0 && (
        <Card>
          <p className="text-muted">
            No PT clients yet. Members appear here when the desk sells them a package with you.
          </p>
        </Card>
      )}
      <ul className="flex flex-col gap-2">
        {shown.map((client) => (
          <li key={client.memberId}>
            <ClientRow client={client} today={today} />
          </li>
        ))}
      </ul>
    </TrainerShell>
  )
}

function ClientRow({ client, today }: { client: TrainerClient; today: string }) {
  const active = client.purchases.find((p) => p.status === 'active')
  const latest = active ?? client.purchases[0]
  return (
    <Link
      to={`/trainer/clients/${client.memberId}`}
      aria-label={client.name}
      className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line/70 hover:bg-surface-2"
    >
      <Avatar name={client.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{client.name}</span>
        {latest && (
          <span className="block truncate text-sm text-muted">
            {active ? ptSessionsLabel(active) : 'No active package'}
          </span>
        )}
        {active && (
          <span className={`block text-xs ${ptExpiringSoon(active, today) ? 'font-semibold text-warn' : 'text-muted'}`}>
            {ptUseByLabel(active, today)}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
    </Link>
  )
}

const CLIENT_VIEWS = ['plan', 'tracking', 'pt'] as const

/** A client: call or message them, and their plan, workout tracking and PT packages. */
export function TrainerClientPage() {
  const { memberId = '' } = useParams()
  const clients = useTrainerClients()
  const client = clients.data?.find((c) => c.memberId === memberId)
  const active = client?.purchases.some((p) => p.status === 'active') ?? false
  const [view, setView] = useView(CLIENT_VIEWS, active ? 'plan' : 'pt')
  const today = todayInIndia()

  return (
    <TrainerShell>
      <PageHeader title={client?.name ?? 'Client'} back={{ to: '/trainer/clients', label: 'Clients' }} />
      {clients.isPending && (
        <div aria-busy="true" aria-label="Loading" className="h-24 animate-pulse rounded-2xl bg-surface-2" />
      )}
      {clients.data && !client && <ErrorText>This member isn’t one of your PT clients.</ErrorText>}
      {client && (
        <>
          <div className="flex items-center gap-3">
            <Avatar name={client.name} size={48} />
            <p className="min-w-0 flex-1 text-sm text-muted">{formatPhone(client.phone)}</p>
            <a
              href={`tel:${client.phone}`}
              aria-label={`Call ${client.name}`}
              className="flex size-11 items-center justify-center rounded-xl bg-surface ring-1 ring-line/70"
            >
              <Phone aria-hidden="true" size={20} />
            </a>
            <a
              href={whatsappLink(client.phone, `Hi ${client.name.split(' ')[0]}, `)}
              target="_blank"
              rel="noreferrer"
              aria-label={`WhatsApp ${client.name}`}
              className="flex size-11 items-center justify-center rounded-xl bg-surface ring-1 ring-line/70"
            >
              <MessageCircle aria-hidden="true" size={20} />
            </a>
          </div>
          {active ? (
            <Segmented
              label="Client view"
              value={view}
              onChange={setView}
              options={[
                { value: 'plan', label: 'Plan' },
                { value: 'tracking', label: 'Tracking' },
                { value: 'pt', label: 'PT' },
              ]}
            />
          ) : (
            <Card>
              <p className="text-sm text-muted">
                Their PT package with you has ended, so their workout plan and tracking aren’t shared with you any more.
              </p>
            </Card>
          )}
          {active && view === 'plan' && <MemberWorkoutPlan memberId={client.memberId} showTracking={false} />}
          {active && view === 'tracking' && <MemberWorkoutCalendar memberId={client.memberId} />}
          {(view === 'pt' || !active) && (
            <ul className="flex flex-col gap-3">
              {client.purchases.map((p) => (
                <li key={p.id}>
                  <PtPurchaseCard purchase={p} today={today} showTrainer={false} showLedger />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </TrainerShell>
  )
}

/** Schedule tab: the next two weeks by day. */
export function TrainerSchedulePage() {
  const user = useSignedInUser()
  return (
    <TrainerShell>
      <PageHeader title="Schedule" subtitle="The next two weeks" />
      <TrainerSchedule trainerId={user.id} />
    </TrainerShell>
  )
}

/** Profile tab: account, weekly hours and time off, install, log out. */
export function TrainerProfilePage() {
  return (
    <TrainerShell>
      <PageHeader title="Profile" />
      <AccountCard />
      <LinkRow
        to="/trainer/availability"
        title="My availability"
        text="Weekly hours, session length, time off"
        icon={<Clock aria-hidden="true" size={20} />}
      />
      <InstallHint />
      <LogOutButton />
    </TrainerShell>
  )
}
