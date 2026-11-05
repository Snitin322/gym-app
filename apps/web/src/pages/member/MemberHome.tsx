import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  CalendarClock,
  Camera,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Dumbbell,
  MessageSquareText,
  Moon,
  Salad,
} from 'lucide-react'
import { dayMacros, formatPaise, inclusiveDays, todayInIndia, workoutDayFor } from '@onthec/shared'
import { useMyMembership, useMyPt } from '../../api/admin'
import { useMyCheckIns } from '../../api/check-ins'
import { useMyProfile } from '../../api/coaching'
import { useMyDietPlan } from '../../api/diet'
import { useMySessions } from '../../api/pt-booking'
import { useMyWorkoutPlan } from '../../api/workouts'
import { useSignedInUser } from '../../auth/AuthContext'
import { useTodaysDietDay } from '../../lib/diet'
import { STATUS_BADGES, membershipSummary } from '../../lib/membership'
import { formatDate, plural } from '../../lib/format'
import { sessionsToAnswer, upcomingSessions } from '../../lib/pt'
import { formatWhen, greeting } from '../../lib/time'
import { Card } from '../../ui/Form'
import { ProgressCharts } from '../../ui/ProgressCharts'
import { Logo } from '../../ui/Screen'
import { MemberShell } from './MemberShell'

/**
 * Progress tab (the member's home): their progress graphs first, then this week's check-in, and today's
 * workout, meals and PT at a glance. Details live in the other tabs.
 */
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
      <ProgressGlance />
      <CoachGlance />
      <WorkoutGlance />
      <MealsGlance />
      <PtGlance />
      <MembershipGlance />
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

/** Graphs once there are check-ins; before that, an invitation to send the first one. */
function ProgressGlance() {
  const query = useMyCheckIns()
  if (query.isPending) return <Skeleton />
  const data = query.data
  if (!data) return null
  if (data.history.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-lg font-bold">Your progress starts here</p>
        <p className="text-sm text-muted">
          Send a check-in each week (weight and photos) and your graphs appear here: weight, body fat and measurements
          over time.
        </p>
        <Link
          to="/check-in"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-bold text-accent-ink"
        >
          <Camera aria-hidden="true" size={18} /> Send your first check-in
        </Link>
      </Card>
    )
  }
  const current = data.current
  return (
    <>
      <ProgressCharts checkIns={data.history} />
      {!current && (
        <GlanceCard to="/check-in" label="Weekly check-in">
          <p className="flex items-center gap-2 font-semibold">
            <Camera aria-hidden="true" size={18} className="text-accent" /> Weekly check-in
          </p>
          <p className="text-sm text-muted">Due by Sunday: weight, photos and how the week went.</p>
        </GlanceCard>
      )}
      {current?.coachReply && (
        <GlanceCard to="/check-in" label="Your coach replied">
          <p className="flex items-center gap-2 font-semibold">
            <MessageSquareText aria-hidden="true" size={18} className="text-accent" />{' '}
            {current.reviewedByName?.split(' ')[0] ?? 'Your coach'} replied
          </p>
          <p className="line-clamp-2 text-sm text-muted">{current.coachReply}</p>
        </GlanceCard>
      )}
    </>
  )
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

/** Today's meals at a glance: calories and protein (shown once the member has a diet plan). */
function MealsGlance() {
  const query = useMyDietPlan()
  const kind = useTodaysDietDay()
  const plan = query.data?.plan
  if (!plan) return null
  const day = (kind === 'rest' && plan.plan.rest) || plan.plan.training
  const totals = dayMacros(day, new Map(plan.foods.map((f) => [f.id, f])))
  return (
    <GlanceCard to="/workout?view=meals" label="Today’s meals">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Today’s meals</p>
      <p className="flex items-center gap-2 text-lg font-bold">
        <Salad aria-hidden="true" size={18} className="text-accent" />
        {totals.kcal.toLocaleString('en-IN')} kcal · {Math.round(totals.proteinG)} g protein
      </p>
      <p className="text-sm text-muted">
        {plural(day.meals.length, 'meal')}
        {plan.plan.supplements.length > 0 && ` · ${plural(plan.plan.supplements.length, 'supplement')}`}
      </p>
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
