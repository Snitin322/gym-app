import { useState } from 'react'
import type { DietPlanView as Plan } from '@onthec/shared'
import {
  useDietTemplates,
  useFoods,
  useMemberDietPlan,
  useSaveMemberDietPlan,
  useStartMemberDietPlan,
} from '../api/diet'
import { errorMessage } from '../lib/format'
import { formatWhen } from '../lib/time'
import { Button } from '../ui/Button'
import { toDietEditor } from '../lib/diet-editor'
import { DietPlanEditor } from '../ui/DietPlanEditor'
import { DietPlanView } from '../ui/DietPlanView'
import { Card, Field, SelectInput } from '../ui/Form'
import { ErrorText } from '../ui/Screen'
import { useDoneToast } from '../ui/toast-context'

type Mode = 'view' | 'edit' | 'start'

/**
 * A member's own diet plan, for their coach, PT trainer and the desk: give them one (a template copy
 * or the usual four meals), edit it (each save is a new version), and see it as the member does.
 */
export function MemberDietPlan({ memberId }: { memberId: string }) {
  const query = useMemberDietPlan(memberId)
  const [mode, setMode] = useState<Mode>('view')
  const plan = query.data?.plan ?? null

  if (query.isPending) return <p className="text-sm text-muted">Loading the diet plan…</p>
  if (query.error) return <ErrorText>{errorMessage(query.error)}</ErrorText>

  if (!plan || mode === 'start') {
    return (
      <StartDiet
        memberId={memberId}
        replacing={plan}
        onDone={() => setMode(plan ? 'view' : 'edit')}
        onCancel={plan ? () => setMode('view') : undefined}
      />
    )
  }
  if (mode === 'edit') return <EditDiet memberId={memberId} plan={plan} onDone={() => setMode('view')} />
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-2">
        <p className="font-bold">{plan.name}</p>
        <p className="text-sm text-muted">
          Version {plan.version} · saved {formatWhen(plan.updatedAt)} by {plan.updatedByName}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Button onClick={() => setMode('edit')}>Edit diet</Button>
          <Button variant="secondary" onClick={() => setMode('start')}>
            Use a template
          </Button>
        </div>
      </Card>
      <DietPlanView plan={plan} />
    </div>
  )
}

function StartDiet({
  memberId,
  replacing,
  onDone,
  onCancel,
}: {
  memberId: string
  replacing: Plan | null
  onDone: () => void
  onCancel?: () => void
}) {
  const templates = useDietTemplates()
  const start = useStartMemberDietPlan(memberId)
  const [templateId, setTemplateId] = useState('')

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-muted">
        {replacing
          ? `The current diet (“${replacing.name}”) is kept as an earlier version.`
          : 'No diet plan yet. Start from a template (the member gets their own copy) or from the usual four meals.'}
      </p>
      <Field label="Start from">
        {(id) => (
          <SelectInput id={id} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Breakfast, lunch, snack, dinner</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.kcal.toLocaleString('en-IN')} kcal
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      <ErrorText>{errorMessage(start.error ?? templates.error)}</ErrorText>
      <div className="flex gap-3">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button loading={start.isPending} onClick={() => start.mutate(templateId || undefined, { onSuccess: onDone })}>
          {replacing ? 'Replace diet' : 'Start diet'}
        </Button>
      </div>
    </Card>
  )
}

function EditDiet({ memberId, plan, onDone }: { memberId: string; plan: Plan; onDone: () => void }) {
  const foods = useFoods()
  const save = useSaveMemberDietPlan(memberId)
  const done = useDoneToast(onDone)
  if (foods.isPending) return <p className="text-sm text-muted">Loading foods…</p>
  if (!foods.data) return <ErrorText>{errorMessage(foods.error)}</ErrorText>
  return (
    <DietPlanEditor
      key={`${plan.id}-${plan.version}`}
      initial={toDietEditor(plan)}
      foods={foods.data}
      saveLabel="Save diet"
      pending={save.isPending}
      error={errorMessage(save.error)}
      onSave={(input) => save.mutate({ ...input, version: plan.version }, { onSuccess: done('Diet saved') })}
      onCancel={onDone}
    />
  )
}
