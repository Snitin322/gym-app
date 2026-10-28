import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  LEAD_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  formatPaise,
  whatsappLink,
  type DashboardMember,
} from '@onthec/shared'
import { useDashboard } from '../../api/dashboard'
import { useSignedInUser } from '../../auth/AuthContext'
import { errorMessage, formatDate, plural } from '../../lib/format'
import { Card } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'

/** How many people each "who to call" list shows before "See all". */
const LIST_SIZE = 5

const firstName = (name: string) => name.split(' ')[0] ?? name

/** Owner/admin home: who to call, money taken (owner), dues, PT this week and workout use. */
export function Dashboard() {
  const query = useDashboard()
  const gym = useSignedInUser().gym.name

  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading the dashboard" className="h-40 animate-pulse rounded-2xl bg-surface" />
    )
  }
  if (!query.data) return <ErrorText>{errorMessage(query.error)}</ErrorText>

  const d = query.data
  const expiringMessage = (m: DashboardMember) =>
    `Hi ${firstName(m.name)}, your ${gym} membership ends on ${formatDate(m.endDate)}. Renew at the front desk or in the app to keep training without a break.`
  const expiredMessage = (m: DashboardMember) =>
    `Hi ${firstName(m.name)}, we miss you at ${gym}! Your membership ended on ${formatDate(m.endDate)}. Renew at the front desk or in the app.`

  return (
    <section aria-label="Dashboard" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat to="/admin/members?filter=active" label="Active members" value={d.members.active}>
          {d.members.joinedThisMonth} joined this month
        </Stat>
        <Stat
          to="/admin/members?filter=expiring"
          label="Ending in 7 days"
          value={d.members.expiringSoon.length}
          tone="warn"
        />
        <Stat
          to="/admin/members?filter=expired"
          label="Expired (30 days)"
          value={d.members.recentlyExpired.length}
          tone="bad"
        />
        <Stat to="/admin/members?filter=none" label="No plan" value={d.members.noPlan}>
          {d.members.frozen > 0 && `${d.members.frozen} frozen`}
        </Stat>
      </div>

      {d.revenue && (
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold">Money taken</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted">Today</p>
              <p className="text-2xl font-extrabold">{formatPaise(d.revenue.todayPaise)}</p>
            </div>
            <div>
              <p className="text-sm text-muted">This month</p>
              <p className="text-2xl font-extrabold">{formatPaise(d.revenue.monthPaise)}</p>
            </div>
          </div>
          <p className="text-sm text-muted">Last month: {formatPaise(d.revenue.lastMonthPaise)}</p>
          {Object.keys(d.revenue.monthByMethod).length > 0 && (
            <ul aria-label="This month by payment method" className="flex flex-wrap gap-2 text-sm">
              {Object.entries(d.revenue.monthByMethod).map(([method, paise]) => (
                <li key={method} className="rounded-full bg-surface-2 px-3 py-1">
                  {PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method}:{' '}
                  {formatPaise(paise ?? 0)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <CallList
        title="Ending in the next 7 days"
        empty="Nobody’s membership ends this week."
        seeAll="/admin/members?filter=expiring"
        items={d.members.expiringSoon.map((m) => ({
          id: m.memberId,
          name: m.name,
          phone: m.phone,
          detail: `${m.planName} · ends ${formatDate(m.endDate, { short: true })}`,
          message: expiringMessage(m),
        }))}
      />
      <CallList
        title="Expired in the last 30 days"
        empty="No recent expiries."
        seeAll="/admin/members?filter=expired"
        items={d.members.recentlyExpired.map((m) => ({
          id: m.memberId,
          name: m.name,
          phone: m.phone,
          detail: `${m.planName} · ended ${formatDate(m.endDate, { short: true })}`,
          message: expiredMessage(m),
        }))}
      />
      <CallList
        title={`Dues · ${formatPaise(d.dues.totalPaise)}`}
        empty="Nothing due."
        seeAll="/admin/members?filter=dues"
        items={d.dues.members.map((m) => ({
          id: m.memberId,
          name: m.name,
          phone: m.phone,
          detail: `${formatPaise(m.duePaise)} due`,
          message: `Hi ${firstName(m.name)}, a quick reminder from ${gym}: ${formatPaise(m.duePaise)} is due. You can pay at the front desk.`,
        }))}
      />

      {d.leads.followUps.length > 0 && (
        <CallList
          title="Lead follow-ups due"
          empty=""
          seeAll="/admin/leads"
          items={d.leads.followUps.map((l) => ({
            id: l.leadId,
            href: '/admin/leads',
            name: l.name,
            phone: l.phone,
            detail: `${LEAD_STATUS_LABELS[l.status]}${l.interest ? ` · ${l.interest}` : ''} · ${
              l.followUpOn < d.today ? `overdue since ${formatDate(l.followUpOn, { short: true })}` : 'today'
            }`,
            message: `Hi ${firstName(l.name)}, this is ${gym}. Thanks for your interest! Would you like to come in for a free trial session this week?`,
          }))}
        />
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Personal training this week</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Mini label="Booked" value={d.pt.bookedThisWeek} />
          <Mini label="Completed" value={d.pt.completedThisWeek} />
          <Mini label="No-shows" value={d.pt.noShowsThisWeek} />
        </div>
        {(d.pt.openDisputes > 0 || d.pt.unmarked > 0) && (
          <Link to="/admin/pt-disputes" className="text-sm font-semibold text-warn underline">
            {[
              d.pt.openDisputes > 0 && plural(d.pt.openDisputes, 'open dispute'),
              d.pt.unmarked > 0 && `${plural(d.pt.unmarked, 'session')} not marked`,
            ]
              .filter(Boolean)
              .join(' · ')}{' '}
            →
          </Link>
        )}
      </Card>
      {d.pt.runningOut.length > 0 && (
        <CallList
          title="PT packages running out"
          empty=""
          items={d.pt.runningOut.map((p) => ({
            id: p.memberId,
            name: p.name,
            phone: p.phone,
            detail: `${plural(p.sessionsLeft, 'session')} left · use by ${formatDate(p.expiresOn, { short: true })} · ${p.trainerName}`,
            message: `Hi ${firstName(p.name)}, you have ${plural(p.sessionsLeft, 'PT session')} left with ${p.trainerName}, valid till ${formatDate(p.expiresOn)}. Book them in the app or renew at the front desk.`,
          }))}
        />
      )}

      <Card>
        <h2 className="font-semibold">Workouts</h2>
        <p className="mt-1 text-sm text-muted">
          {d.workouts.withPlan === 0
            ? 'No member has a workout plan yet.'
            : `${d.workouts.trackedThisWeek} of ${plural(d.workouts.withPlan, 'member')} with a plan ticked a workout this week.`}
        </p>
      </Card>
    </section>
  )
}

function Stat({
  to,
  label,
  value,
  tone,
  children,
}: {
  to: string
  label: string
  value: number
  tone?: 'warn' | 'bad'
  children?: ReactNode
}) {
  const color = tone === 'warn' && value > 0 ? 'text-warn' : tone === 'bad' && value > 0 ? 'text-danger' : ''
  return (
    <Link to={to} className="flex flex-col rounded-2xl bg-surface p-4 hover:bg-surface-2">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-3xl font-extrabold ${color}`}>{value}</span>
      {children && <span className="text-xs text-muted">{children}</span>}
    </Link>
  )
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-2 py-2">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

interface CallItem {
  id: string
  /** Where tapping the name goes (the member page by default). */
  href?: string
  name: string
  phone: string
  detail: string
  message: string
}

/** People to contact, each with Call and a pre-typed WhatsApp message. */
function CallList({
  title,
  empty,
  seeAll,
  items,
}: {
  title: string
  empty: string
  seeAll?: string
  items: CallItem[]
}) {
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {items.length === 0 && <p className="text-sm text-muted">{empty}</p>}
      <ul aria-label={title} className="flex flex-col divide-y divide-line">
        {items.slice(0, LIST_SIZE).map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 py-2">
            <Link to={item.href ?? `/admin/members/${item.id}`} className="min-w-0">
              <span className="block truncate font-semibold">{item.name}</span>
              <span className="block truncate text-xs text-muted">{item.detail}</span>
            </Link>
            <span className="flex shrink-0 gap-2">
              <a
                href={`tel:${item.phone}`}
                aria-label={`Call ${item.name}`}
                className="flex size-10 items-center justify-center rounded-xl border border-line"
              >
                📞
              </a>
              <a
                href={whatsappLink(item.phone, item.message)}
                target="_blank"
                rel="noreferrer"
                aria-label={`WhatsApp ${item.name}`}
                className="flex size-10 items-center justify-center rounded-xl border border-line"
              >
                💬
              </a>
            </span>
          </li>
        ))}
      </ul>
      {seeAll && items.length > LIST_SIZE && (
        <Link to={seeAll} className="text-sm font-semibold text-accent underline">
          See all {items.length} →
        </Link>
      )}
    </Card>
  )
}
