import { isoWeekday, todayInIndia, workoutDayFor } from '@onthec/shared'
import { useMyPt } from '../../api/admin'
import { useMyWorkoutPlan } from '../../api/workouts'
import { InstallHint } from '../../InstallHint'
import { errorMessage } from '../../lib/format'
import { PageHeader } from '../../ui/AppShell'
import { Card } from '../../ui/Form'
import { useView } from '../../lib/use-view'
import { Segmented } from '../../ui/Segmented'
import { ErrorText } from '../../ui/Screen'
import { MyWorkoutCalendar } from '../../ui/WorkoutCalendar'
import { WorkoutDayView, WorkoutWeekView } from '../../ui/WorkoutWeekView'
import { MyMembershipCard } from '../MyMembershipCard'
import { MyPtCard } from '../MyPtCard'
import { MyPtSessions } from '../MyPtSessions'
import { AccountCard, LogOutButton } from '../AccountBits'
import { MemberShell } from './MemberShell'

const WORKOUT_VIEWS = ['today', 'week', 'plan'] as const
const PT_VIEWS = ['upcoming', 'book', 'history'] as const
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Workout tab: today's workout, the week to tick off, and the full plan, one view at a time. */
export function MemberWorkoutPage() {
  const query = useMyWorkoutPlan()
  const [view, setView] = useView(WORKOUT_VIEWS, 'today')
  const plan = query.data?.plan
  const today = todayInIndia()
  return (
    <MemberShell>
      <PageHeader title="Workout" subtitle={plan?.name} />
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {query.data && !plan && (
        <Card>
          <p className="font-semibold">No workout plan yet</p>
          <p className="mt-1 text-sm text-muted">Ask the front desk or your trainer for a plan.</p>
        </Card>
      )}
      {plan && (
        <>
          <Segmented
            label="Workout view"
            value={view}
            onChange={setView}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'My week' },
              { value: 'plan', label: 'Full plan' },
            ]}
          />
          {view === 'today' && (
            <section aria-label="Today’s workout" className="flex flex-col gap-3">
              <WorkoutDayView
                label={DAY_NAMES[isoWeekday(today) - 1] as string}
                day={workoutDayFor(plan.week, today)}
                exercises={plan.exercises}
              />
              {plan.notes && <p className="text-sm text-muted">{plan.notes}</p>}
              <p className="text-sm text-muted">Done for the day? Tick it in My week.</p>
            </section>
          )}
          {view === 'week' && <MyWorkoutCalendar />}
          {view === 'plan' && <WorkoutWeekView week={plan.week} exercises={plan.exercises} />}
        </>
      )}
    </MemberShell>
  )
}

/** PT tab: upcoming sessions (and ones to confirm), booking on a package, and recent sessions. */
export function MemberPtPage() {
  const pt = useMyPt()
  const [view, setView] = useView(PT_VIEWS, 'upcoming')
  return (
    <MemberShell>
      <PageHeader title="Personal training" />
      {pt.data?.length === 0 && (
        <Card>
          <p className="font-semibold">No PT package yet</p>
          <p className="mt-1 text-sm text-muted">
            Ask at the front desk about personal training with one of our trainers.
          </p>
        </Card>
      )}
      {(pt.data?.length ?? 0) > 0 && (
        <>
          <Segmented
            label="PT view"
            value={view}
            onChange={setView}
            options={[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'book', label: 'Book' },
              { value: 'history', label: 'History' },
            ]}
          />
          {view === 'upcoming' && <MyPtSessions show="upcoming" />}
          {view === 'book' && <MyPtCard />}
          {view === 'history' && <MyPtSessions show="history" />}
        </>
      )}
    </MemberShell>
  )
}

/** Profile tab: membership details, renew, payments and invoices, account, install and log out. */
export function MemberProfilePage() {
  return (
    <MemberShell>
      <PageHeader title="Profile" />
      <AccountCard />
      <MyMembershipCard />
      <InstallHint />
      <LogOutButton />
    </MemberShell>
  )
}
