import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { MEMBER_FILTERS, todayInIndia, type MemberFilter, type MemberSummary } from '@onthec/shared'
import { useMembers } from '../../api/admin'
import { errorMessage, formatPhone } from '../../lib/format'
import { membershipSummary } from '../../lib/membership'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Card, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'
import { StatusBadge } from '../../ui/StatusBadge'

const FILTER_LABELS: Record<MemberFilter, string> = {
  all: 'All',
  active: 'Active',
  expiring: 'Expiring',
  expired: 'Expired',
  none: 'No plan',
}

export function MembersPage() {
  const [params, setParams] = useSearchParams()
  const filter = (MEMBER_FILTERS as readonly string[]).includes(params.get('filter') ?? '')
    ? (params.get('filter') as MemberFilter)
    : 'all'
  const q = params.get('q') ?? ''
  const [search, setSearch] = useState(q)

  // Search after the user pauses typing, and keep it in the URL so Back restores the list.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() === q) return
      setParams((current) => {
        const next = new URLSearchParams(current)
        if (search.trim()) next.set('q', search.trim())
        else next.delete('q')
        return next
      }, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [search, q, setParams])

  const members = useMembers(filter, q)
  const today = todayInIndia()

  const chooseFilter = (value: MemberFilter) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value === 'all') next.delete('filter')
      else next.set('filter', value)
      return next
    }, { replace: true })

  return (
    <AdminLayout
      title="Members"
      back={{ to: '/home', label: 'Home' }}
      action={
        <Link
          to="/admin/members/new"
          className="flex min-h-11 items-center rounded-xl bg-accent px-4 font-bold text-accent-ink"
        >
          Add member
        </Link>
      }
    >
      <TextInput
        type="search"
        aria-label="Search members"
        placeholder="Search by name or phone"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div role="group" aria-label="Filter members" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {MEMBER_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => chooseFilter(value)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
              filter === value ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted'
            }`}
          >
            {FILTER_LABELS[value]}
          </button>
        ))}
      </div>

      {members.isPending && <LoadingText />}
      <ErrorText>{errorMessage(members.error)}</ErrorText>
      {members.data?.length === 0 && (
        <Card>
          <p className="text-muted">{q || filter !== 'all' ? 'No members match.' : 'No members yet. Add your first member.'}</p>
        </Card>
      )}

      <ul className="flex flex-col gap-2">
        {members.data?.map((member) => (
          <li key={member.id}>
            <MemberRow member={member} today={today} />
          </li>
        ))}
      </ul>
      {members.data && members.data.length > 0 && (
        <p className="text-center text-sm text-muted">
          {members.data.length} member{members.data.length === 1 ? '' : 's'}
        </p>
      )}
    </AdminLayout>
  )
}

function MemberRow({ member, today }: { member: MemberSummary; today: string }) {
  return (
    <Link
      to={`/admin/members/${member.id}`}
      className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 hover:bg-surface-2"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold">{member.name}</p>
        <p className="truncate text-sm text-muted">
          {member.current
            ? `${member.current.planName} · ${membershipSummary(member.current, today)}`
            : formatPhone(member.phone)}
        </p>
      </div>
      <StatusBadge status={member.status} />
    </Link>
  )
}
