import { CalendarClock, HeartPulse } from 'lucide-react'
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
import { AccountCard, LinkRow, LogOutButton } from '../AccountBits'
import { MealsView } from './MealsPage'
import { MemberShell } from './MemberShell'

const WORKOUT_VIEWS = ['today', 'week', 'meals', 'plan'] as const
const PT_VIEWS = ['upcoming', 'book', 'history'] as const
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Plan tab: today's workout, the week to tick off, meals and supplements, and the full workout plan. */
export function MemberWorkoutPage() {
  const query = useMyWorkoutPlan()
  const [view, setView] = useView(WORKOUT_VIEWS, 'today')
  const plan = query.data?.plan
  const today = todayInIndia()
  return (
    <MemberShell>
      <PageHeader title="Plan" subtitle={view !== 'meals' ? plan?.name : undefined} />
      <Segmented
        label="Plan view"
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'My week' },
          { value: 'meals', label: 'Meals' },
          { value: 'plan', label: 'Full plan' },
        ]}
      />
      {view === 'meals' && <MealsView />}
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {view !== 'meals' && query.data && !plan && (
        <Card>
          <p className="font-semibold">No workout plan yet</p>
          <p className="mt-1 text-sm text-muted">Ask the front desk or your trainer for a plan.</p>
        </Card>
      )}
      {view !== 'meals' && plan && (
        <>
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

/** Personal training (from Profile or Home): upcoming sessions and ones to confirm, booking, history. */
export function MemberPtPage() {
  const pt = useMyPt()
  const [view, setView] = useView(PT_VIEWS, 'upcoming')
  return (
    <MemberShell>
      <PageHeader title="Personal training" back={{ to: '/profile', label: 'Profile' }} />
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

/** Profile tab: account, health details, PT, membership details, renew, payments, install and log out. */
export function MemberProfilePage() {
  const pt = useMyPt()
  return (
    <MemberShell>
      <PageHeader title="Profile" />
      <AccountCard />
      <LinkRow
        to="/profile/health"
        title="Health details"
        text="Body, goal, health and food, for your coach"
        icon={<HeartPulse aria-hidden="true" size={20} />}
      />
      {(pt.data?.length ?? 0) > 0 && (
        <LinkRow
          to="/pt"
          title="Personal training"
          text="Book, see and confirm your sessions"
          icon={<CalendarClock aria-hidden="true" size={20} />}
        />
      )}
      <MyMembershipCard />
      <InstallHint />
      <LogOutButton />
    </MemberShell>
  )
}
