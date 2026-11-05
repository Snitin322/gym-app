import { useParams } from 'react-router'
import { useClientProfile } from '../../api/coaching'
import { AdminLayout } from '../../ui/AdminLayout'
import { ClientProfileSection } from '../ClientProfile'

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
