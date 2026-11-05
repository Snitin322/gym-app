import { useMyDietPlan } from '../../api/diet'
import { errorMessage } from '../../lib/format'
import { PageHeader } from '../../ui/AppShell'
import { useTodaysDietDay } from '../../lib/diet'
import { DietPlanView as DietView } from '../../ui/DietPlanView'
import { Card } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'
import { MemberShell } from './MemberShell'

/** The member's meals and supplements, opened on today's kind of day. */
export function MealsPage() {
  const query = useMyDietPlan()
  const today = useTodaysDietDay()
  const plan = query.data?.plan

  return (
    <MemberShell>
      <PageHeader title="Meals" subtitle={plan?.name} back={{ to: '/home', label: 'Home' }} />
      {query.isPending && (
        <div aria-busy="true" aria-label="Loading" className="h-32 animate-pulse rounded-2xl bg-surface-2" />
      )}
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {query.data && !plan && (
        <Card>
          <p className="text-muted">No diet plan yet. Your coach will add one here.</p>
        </Card>
      )}
      {plan && <DietView key={today} plan={plan} day={plan.plan.rest ? today : 'training'} />}
    </MemberShell>
  )
}
