import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CalendarClock, ChevronRight, CircleAlert, ClipboardList, Dumbbell, Moon } from 'lucide-react'
import { formatPaise, inclusiveDays, todayInIndia, workoutDayFor } from '@onthec/shared'
import { useMyMembership, useMyPt } from '../../api/admin'
import { useMyProfile } from '../../api/coaching'
import { useMySessions } from '../../api/pt-booking'
import { useMyWorkoutPlan } from '../../api/workouts'
import { useSignedInUser } from '../../auth/AuthContext'
import { STATUS_BADGES, membershipSummary } from '../../lib/membership'
import { formatDate, plural } from '../../lib/format'
import { sessionsToAnswer, upcomingSessions } from '../../lib/pt'
import { formatWhen, greeting } from '../../lib/time'
import { Logo } from '../../ui/Screen'
import { MemberShell } from './MemberShell'

/** The member's home: membership at a glance, today's workout and the next PT session. Details live in the tabs. */
export function MemberHome() {
  const user = useSignedInUser()
  return (
    <MemberShell>
      <header className="flex items-center gap-3">
        <Logo size={44} />
        <div className="min-w-0">
          <p className="text-sm text-muted">{greeting()}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">{user.name.split(' ')[0]}</h1>
        </div>
      </header>
      <MembershipGlance />
      <CoachGlance />
      <WorkoutGlance />
      <PtGlance />
    </MemberShell>
  )
}

/** A tappable summary card that opens a tab. */
function GlanceCard({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line/70 hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
    </Link>
  )
}

function Skeleton() {
  return <div aria-hidden="true" className="h-24 animate-pulse rounded-2xl bg-surface-2" />
}

/** A member with a coach but no health details yet: ask them to fill them in. */
function CoachGlance() {
  const query = useMyProfile()
  const coach = query.data?.coach
  if (!coach || query.data?.profile) return null
  return (
    <GlanceCard to="/profile/health" label="Health details">
      <p className="flex items-center gap-2 font-semibold">
        <ClipboardList aria-hidden="true" size={18} className="text-accent" /> Tell {coach.name.split(' ')[0]} about you
      </p>
      <p className="text-sm text-muted">Your body, goal, health and food, so your plan suits you.</p>
    </GlanceCard>
  )
}

function MembershipGlance() {
  const query = useMyMembership()
  const today = todayInIndia()
  if (query.isPending) return <Skeleton />
  const data = query.data
  const current = data?.current
  if (!current) {
    return (
      <GlanceCard to="/profile" label="Your membership">
        <p className="font-semibold">No membership yet</p>
        <p className="text-sm text-muted">Start a plan at the front desk, or see the options in your profile.</p>
      </GlanceCard>
    )
  }
  const total = inclusiveDays(current.startDate, current.endDate)
  const used = Math.min(total, Math.max(0, total - current.daysLeft))
  return (
    <section aria-label="Your membership" className="rounded-2xl bg-accent p-5 text-accent-ink">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm opacity-80">{current.planName}</p>
        <span className="rounded-full bg-accent-ink/15 px-2.5 py-0.5 text-xs font-semibold">
          {STATUS_BADGES[current.status].label}
        </span>
      </div>
      <p className="mt-1 text-3xl font-extrabold tracking-tight">{membershipSummary(current, today)}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent-ink/20">
        <div className="h-full rounded-full bg-accent-ink" style={{ width: `${Math.round((used / total) * 100)}%` }} />
      </div>
      <p className="mt-2 text-xs opacity-80">Ends {formatDate(current.endDate)}</p>
      {(data?.duePaise ?? 0) > 0 && (
        <Link
          to="/profile"
          className="mt-3 flex items-center gap-2 rounded-xl bg-accent-ink/15 px-3 py-2 text-sm font-semibold"
        >
          <CircleAlert aria-hidden="true" size={18} />
          {formatPaise(data?.duePaise ?? 0)} due · pay at the front desk
        </Link>
      )}
    </section>
  )
}

function WorkoutGlance() {
  const query = useMyWorkoutPlan()
  if (query.isPending) return <Skeleton />
  const plan = query.data?.plan
  if (!plan) {
    return (
      <GlanceCard to="/workout" label="Today’s workout">
        <p className="flex items-center gap-2 font-semibold">
          <Dumbbell aria-hidden="true" size={18} className="text-accent" /> Workout plan
        </p>
        <p className="text-sm text-muted">Ask the front desk or your trainer for a plan.</p>
      </GlanceCard>
    )
  }
  const day = workoutDayFor(plan.week, todayInIndia())
  const done = !day.rest && day.items.length > 0
  return (
    <GlanceCard to="/workout" label="Today’s workout">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Today</p>
      <p className="flex items-center gap-2 text-lg font-bold">
        {day.rest ? (
          <Moon aria-hidden="true" size={18} className="text-accent" />
        ) : (
          <Dumbbell aria-hidden="true" size={18} className="text-accent" />
        )}
        {day.rest ? 'Rest day' : day.title || (done ? 'Workout' : 'Nothing planned')}
      </p>
      {done && <p className="text-sm text-muted">{plural(day.items.length, 'exercise')}</p>}
    </GlanceCard>
  )
}

function PtGlance() {
  const pt = useMyPt()
  const hasPt = (pt.data?.length ?? 0) > 0
  const sessions = useMySessions(hasPt)
  if (pt.isPending || !hasPt) return null
  const all = sessions.data ?? []
  const next = upcomingSessions(all)[0]
  const toAnswer = sessionsToAnswer(all).length
  const active = pt.data?.find((p) => p.status === 'active')
  return (
    <>
      {toAnswer > 0 && (
        <Link
          to="/pt"
          className="flex items-center gap-2 rounded-2xl bg-warn/10 px-4 py-3 text-sm font-semibold text-warn"
        >
          <CircleAlert aria-hidden="true" size={18} />
          {plural(toAnswer, 'session')} to confirm
        </Link>
      )}
      <GlanceCard to="/pt" label="Personal training">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Next PT session</p>
        <p className="flex items-center gap-2 text-lg font-bold">
          <CalendarClock aria-hidden="true" size={18} className="text-accent" />
          {next ? formatWhen(next.startsAt) : 'Nothing booked'}
        </p>
        {active && (
          <p className="text-sm text-muted">
            with {active.trainer.name} · {plural(active.sessionsLeft, 'session')} left
          </p>
        )}
      </GlanceCard>
    </>
  )
}
