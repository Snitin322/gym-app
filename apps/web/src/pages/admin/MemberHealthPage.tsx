import { useParams } from 'react-router'
import { useClientProfile } from '../../api/coaching'
import { AdminLayout } from '../../ui/AdminLayout'
import { ClientProfileSection } from '../ClientProfile'
import { MemberProgress } from '../MemberProgress'

/** A member's health details at the desk: the owner, or the member's coach. */
export function MemberHealthPage() {
  const { id = '' } = useParams()
  const profile = useClientProfile(id)
  return (
    <AdminLayout
      title="Health details"
      back={{ to: `/admin/members/${id}`, label: profile.data?.member.name ?? 'Member' }}
    >
      <ClientProfileSection memberId={id} />
    </AdminLayout>
  )
}

/** A member's progress graphs and weekly check-ins at the desk: the owner, or the member's coach. */
export function MemberProgressPage() {
  const { id = '' } = useParams()
  const profile = useClientProfile(id)
  return (
    <AdminLayout title="Progress" back={{ to: `/admin/members/${id}`, label: profile.data?.member.name ?? 'Member' }}>
      <MemberProgress memberId={id} />
    </AdminLayout>
  )
}
