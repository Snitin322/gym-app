import { useState } from 'react'
import { Link } from 'react-router'
import { Building2, ClipboardList, Dumbbell, IdCard, Megaphone, Salad, UserPlus } from 'lucide-react'
import { CheckInsToReview } from '../MemberProgress'
import { useStaff } from '../../api/admin'
import { usePtDisputes, useUnmarkedSessions } from '../../api/pt-booking'
import { useSignedInUser } from '../../auth/AuthContext'
import { InstallHint } from '../../InstallHint'
import { ROLE_LABELS, errorMessage } from '../../lib/format'
import { unmarkedSessions } from '../../lib/pt'
import { greeting } from '../../lib/time'
import { useView } from '../../lib/use-view'
import { AdminLayout, DeskShell, LoadingText } from '../../ui/AdminLayout'
import { Card } from '../../ui/Form'
import { ErrorText, Logo } from '../../ui/Screen'
import { Segmented } from '../../ui/Segmented'
import { AccountCard, LinkRow, LogOutButton } from '../AccountBits'
import { TrainerSchedule } from '../TrainerSchedule'
import { Dashboard } from '../admin/Dashboard'
import { PtPackagesView } from '../admin/PtPackagesView'
import { PtToResolve } from '../admin/PtToResolve'

/** Today tab for the owner/admin: greeting, a quick "Add member", then the dashboard. */
export function DeskToday() {
  const user = useSignedInUser()
  return (
    <DeskShell>
      <header className="flex items-center gap-3">
        <span className="lg:hidden">
          <Logo size={44} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted">{greeting()}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">{user.name.split(' ')[0]}</h1>
          <p className="truncate text-xs text-muted">
            {ROLE_LABELS[user.role]} · {user.gym.name}
          </p>
        </div>
        {/* Just the icon on small phones, so the greeting keeps its room. */}
        <Link
          to="/admin/members/new"
          aria-label="Add member"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-3 font-semibold text-accent-ink min-[400px]:px-4"
        >
          <UserPlus aria-hidden="true" size={18} />
          <span className="hidden min-[400px]:inline">Add member</span>
        </Link>
      </header>
      {/* The owner coaches too: their clients' check-ins waiting for a reply. */}
      {user.role === 'owner' && <CheckInsToReview linkTo={(id) => `/admin/members/${id}/progress`} />}
      <Dashboard />
    </DeskShell>
  )
}

const PT_VIEWS = ['sessions', 'resolve', 'packages'] as const

/** PT tab: each trainer's next two weeks, disputes and unmarked sessions, and the packages on sale. */
export function DeskPtPage() {
  const [view, setView] = useView(PT_VIEWS, 'sessions')
  const disputes = usePtDisputes().data?.length ?? 0
  const unmarked = unmarkedSessions(useUnmarkedSessions().data ?? []).length
  const toResolve = disputes + unmarked

  return (
    <AdminLayout title="Personal training">
      <Segmented
        label="PT view"
        value={view}
        onChange={setView}
        options={[
          { value: 'sessions', label: 'Sessions' },
          { value: 'resolve', label: toResolve > 0 ? `To resolve · ${toResolve}` : 'To resolve' },
          { value: 'packages', label: 'Packages' },
        ]}
      />
      {view === 'sessions' && <TrainerSchedules />}
      {view === 'resolve' && <PtToResolve />}
      {view === 'packages' && <PtPackagesView />}
    </AdminLayout>
  )
}

function TrainerSchedules() {
  const staff = useStaff()
  const trainers = staff.data?.filter((u) => u.role === 'trainer') ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const trainer = trainers.find((t) => t.id === picked) ?? trainers[0]

  if (staff.isPending) return <LoadingText />
  if (!staff.data) return <ErrorText>{errorMessage(staff.error)}</ErrorText>
  if (!trainer) {
    return (
      <Card>
        <p className="text-muted">
          No trainers yet. Add one on the{' '}
          <Link to="/admin/staff" className="text-accent underline">
            Staff
          </Link>{' '}
          screen.
        </p>
      </Card>
    )
  }
  return (
    <>
      {trainers.length > 1 && (
        <div
          role="group"
          aria-label="Trainer"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        >
          {trainers.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={t.id === trainer.id}
              onClick={() => setPicked(t.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
                t.id === trainer.id ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted">{trainer.name}’s sessions in the next two weeks.</p>
      <TrainerSchedule key={trainer.id} trainerId={trainer.id} desk label={`${trainer.name}’s schedule`} />
    </>
  )
}

/** More tab: the screens the desk uses less often, and the signed-in account. */
export function DeskMorePage() {
  const user = useSignedInUser()
  const icon = (Icon: typeof Megaphone) => <Icon aria-hidden="true" size={20} />
  return (
    <AdminLayout title="More">
      <nav aria-label="More screens" className="flex flex-col gap-2">
        <LinkRow to="/admin/leads" title="Leads" text="Enquiries and follow-ups" icon={icon(Megaphone)} />
        <LinkRow to="/admin/plans" title="Plans" text="Prices, lengths, freeze limits" icon={icon(ClipboardList)} />
        <LinkRow to="/admin/workouts" title="Workouts" text="Exercise library and weekly plans" icon={icon(Dumbbell)} />
        <LinkRow to="/admin/diet" title="Diet" text="Food list and diet templates" icon={icon(Salad)} />
        <LinkRow to="/admin/staff" title="Staff" text="Trainers, admins and their hours" icon={icon(IdCard)} />
        {user.role === 'owner' && (
          <LinkRow to="/admin/gym" title="Gym details" text="Address, GSTIN, invoices" icon={icon(Building2)} />
        )}
      </nav>
      <AccountCard />
      <InstallHint />
      <LogOutButton />
    </AdminLayout>
  )
}
