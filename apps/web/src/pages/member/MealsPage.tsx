import { useMyDietPlan } from '../../api/diet'
import { errorMessage } from '../../lib/format'
import { useTodaysDietDay } from '../../lib/diet'
import { DietPlanView as DietView } from '../../ui/DietPlanView'
import { Card } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'

/** The member's meals and supplements, opened on today's kind of day (Plan tab → Meals). */
export function MealsView() {
  const query = useMyDietPlan()
  const today = useTodaysDietDay()
  const plan = query.data?.plan

  return (
    <>
      {query.isPending && (
        <div aria-busy="true" aria-label="Loading" className="h-32 animate-pulse rounded-2xl bg-surface-2" />
      )}
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {query.data && !plan && (
        <Card>
          <p className="text-muted">No diet plan yet. Your coach will add one here.</p>
        </Card>
      )}
      {plan && (
        <>
          <p className="text-sm text-muted">{plan.name}</p>
          <DietView key={today} plan={plan} day={plan.plan.rest ? today : 'training'} />
        </>
      )}
    </>
  )
}
