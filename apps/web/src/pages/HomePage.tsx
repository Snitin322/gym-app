import { useState } from 'react'
import { Link } from 'react-router'
import { MANAGER_ROLES, useAuth, useSignedInUser } from '../auth/AuthContext'
import { InstallHint } from '../InstallHint'
import { ROLE_LABELS, formatPhone } from '../lib/format'
import { Button } from '../ui/Button'
import { Logo, Screen } from '../ui/Screen'
import { Dashboard } from './admin/Dashboard'
import { MyMembershipCard } from './MyMembershipCard'
import { MyPtCard } from './MyPtCard'
import { MyPtSessions } from './MyPtSessions'
import { TodaysWorkout } from './TodaysWorkout'
import { MyWorkoutCalendar } from '../ui/WorkoutCalendar'
import { TrainerClients } from './TrainerClients'
import { TrainerSchedule } from './TrainerSchedule'
import { UnmarkedSessions } from './UnmarkedSessions'
import { usePtDisputes } from '../api/pt-booking'
import { plural } from '../lib/format'

export function HomePage() {
  const user = useSignedInUser()
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  return (
    <Screen>
      <header className="flex items-center gap-3">
        <Logo size={44} />
        <div>
          <p className="text-sm text-muted">{user.gym.name}</p>
          <p className="text-xs font-semibold tracking-wide text-accent uppercase">{ROLE_LABELS[user.role]}</p>
        </div>
      </header>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Hi {user.name.split(' ')[0]}</h1>
      <p className="text-muted">
        You're logged in as the {ROLE_LABELS[user.role].toLowerCase()} at {user.gym.name}.
      </p>

      {MANAGER_ROLES.includes(user.role) ? (
        <>
          <Dashboard />
          <nav aria-label="Manage the gym" className="grid grid-cols-2 gap-3">
            <HomeLink to="/admin/members" title="Members" text="Add members, renew, freeze" />
            <HomeLink to="/admin/plans" title="Plans" text="Prices, lengths, freeze limits" />
            <HomeLink to="/admin/pt-packages" title="PT packages" text="Personal training sessions" />
            <DisputesLink />
            <HomeLink to="/admin/leads" title="Leads" text="Enquiries and follow-ups" />
            <HomeLink to="/admin/workouts" title="Workouts" text="Exercise library and weekly plans" />
            <HomeLink to="/admin/staff" title="Staff" text="Add trainers and admins" />
            {user.role === 'owner' && <HomeLink to="/admin/gym" title="Gym details" text="Address, GSTIN, invoices" />}
          </nav>
        </>
      ) : user.role === 'member' ? (
        <>
          <MyMembershipCard />
          <TodaysWorkout />
          <MyWorkoutCalendar />
          <MyPtCard />
          <MyPtSessions />
          <p className="text-center text-sm text-muted">Coming soon: your QR check-in pass.</p>
        </>
      ) : (
        <>
          <nav aria-label="Your work" className="grid grid-cols-1">
            <HomeLink
              to="/trainer/availability"
              title="My availability"
              text="Weekly hours, session length, time off"
            />
          </nav>
          <UnmarkedSessions />
          <TrainerSchedule trainerId={user.id} />
          <TrainerClients />
        </>
      )}

      <section className="rounded-2xl bg-surface p-5 text-sm">
        <h2 className="font-semibold">Your account</h2>
        <p className="mt-1 text-muted">{user.name}</p>
        <p className="text-muted">{formatPhone(user.phone)}</p>
      </section>

      <InstallHint />

      <Button
        variant="secondary"
        className="mt-auto"
        loading={signingOut}
        onClick={() => {
          setSigningOut(true)
          void signOut()
        }}
      >
        Log out
      </Button>
    </Screen>
  )
}

/** Owner/admin: open PT disputes, with a count when there are any. */
function DisputesLink() {
  const count = usePtDisputes().data?.length ?? 0
  return (
    <HomeLink
      to="/admin/pt-disputes"
      title="PT disputes"
      text={count > 0 ? `${plural(count, 'open dispute')} to resolve` : 'Disputed and unmarked sessions'}
    />
  )
}

function HomeLink({ to, title, text }: { to: string; title: string; text: string }) {
  return (
    <Link to={to} className="flex min-h-28 flex-col justify-between rounded-2xl bg-surface p-4 hover:bg-surface-2">
      <span className="text-lg font-bold">{title} →</span>
      <span className="text-sm text-muted">{text}</span>
    </Link>
  )
}
