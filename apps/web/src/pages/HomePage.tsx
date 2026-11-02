import { useSignedInUser } from '../auth/AuthContext'
import { DeskToday } from './desk/DeskApp'
import { MemberHome } from './member/MemberHome'
import { TrainerToday } from './trainer/TrainerApp'

/** /home is the first tab of each role's app. */
export function HomePage() {
  const user = useSignedInUser()
  if (user.role === 'member') return <MemberHome />
  if (user.role === 'trainer') return <TrainerToday />
  return <DeskToday />
}
