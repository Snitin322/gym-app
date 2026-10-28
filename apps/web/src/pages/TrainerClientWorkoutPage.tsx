import { useParams } from 'react-router'
import { useMemberPlan } from '../api/workouts'
import { AdminLayout } from '../ui/AdminLayout'
import { MemberWorkoutPlan } from './MemberWorkoutPlan'

/** Trainer: a PT client's workout plan. */
export function TrainerClientWorkoutPage() {
  const { memberId = '' } = useParams()
  const name = useMemberPlan(memberId).data?.member.name
  return (
    <AdminLayout title={name ? `${name}’s workout` : 'Workout plan'} back={{ to: '/home', label: 'Home' }}>
      <MemberWorkoutPlan memberId={memberId} />
    </AdminLayout>
  )
}
