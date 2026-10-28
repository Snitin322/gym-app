import { useState } from 'react'
import type { WorkoutExercise, WorkoutPlanView } from '@onthec/shared'
import {
  useExercises,
  useMemberPlan,
  useMemberPlanVersions,
  useSaveMemberPlan,
  useStartMemberPlan,
  useWorkoutTemplates,
} from '../api/workouts'
import { errorMessage, plural } from '../lib/format'
import { formatWhen } from '../lib/time'
import { toEditor } from '../lib/workout-editor'
import { Button } from '../ui/Button'
import { Card, Field, SelectInput } from '../ui/Form'
import { ErrorText } from '../ui/Screen'
import { WorkoutPlanEditor } from '../ui/WorkoutPlanEditor'
import { WorkoutWeekView } from '../ui/WorkoutWeekView'

type Mode = 'view' | 'edit' | 'start'

/**
 * A member's own workout plan, for the desk and their trainer: give them one (a template copy or
 * blank), edit it (each save is a new version), see the week and earlier versions.
 */
export function MemberWorkoutPlan({ memberId }: { memberId: string }) {
  const query = useMemberPlan(memberId)
  const [mode, setMode] = useState<Mode>('view')
  const plan = query.data?.plan ?? null

  if (query.isPending) return <p className="text-sm text-muted">Loading the workout plan…</p>
  if (query.error) return <ErrorText>{errorMessage(query.error)}</ErrorText>

  if (!plan || mode === 'start') {
    return (
      <StartPlan
        memberId={memberId}
        replacing={plan}
        onDone={() => setMode('view')}
        onCancel={plan ? () => setMode('view') : undefined}
      />
    )
  }
  if (mode === 'edit') return <EditPlan memberId={memberId} plan={plan} onDone={() => setMode('view')} />
  return <PlanSummary memberId={memberId} plan={plan} onEdit={() => setMode('edit')} onStart={() => setMode('start')} />
}

function PlanSummary({
  memberId,
  plan,
  onEdit,
  onStart,
}: {
  memberId: string
  plan: WorkoutPlanView
  onEdit: () => void
  onStart: () => void
}) {
  const [showWeek, setShowWeek] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-2">
        <p className="font-bold">{plan.name}</p>
        <p className="text-sm text-muted">
          {plural(plan.trainingDays, 'training day')} a week · version {plan.version} · saved{' '}
          {formatWhen(plan.updatedAt)} by {plan.updatedByName}
        </p>
        {plan.notes && <p className="text-sm text-muted">{plan.notes}</p>}
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Button onClick={onEdit}>Edit plan</Button>
          <Button variant="secondary" onClick={() => setShowWeek(!showWeek)} aria-expanded={showWeek}>
            {showWeek ? 'Hide week' : 'Show week'}
          </Button>
        </div>
        <Button variant="ghost" onClick={onStart}>
          Start again from a template
        </Button>
      </Card>
      {showWeek && <WorkoutWeekView week={plan.week} exercises={plan.exercises} />}
      <PlanHistory memberId={memberId} exercises={plan.exercises} />
    </div>
  )
}

function StartPlan({
  memberId,
  replacing,
  onDone,
  onCancel,
}: {
  memberId: string
  replacing: WorkoutPlanView | null
  onDone: () => void
  onCancel?: () => void
}) {
  const templates = useWorkoutTemplates()
  const start = useStartMemberPlan(memberId)
  const [templateId, setTemplateId] = useState('')

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-muted">
        {replacing
          ? `The current plan (“${replacing.name}”) is kept in the history.`
          : 'No workout plan yet. Start from a template (the member gets their own copy) or a blank week.'}
      </p>
      <Field label="Start from">
        {(id) => (
          <SelectInput id={id} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Blank week</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {plural(t.trainingDays, 'day')}
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
          {replacing ? 'Replace plan' : 'Give plan'}
        </Button>
      </div>
    </Card>
  )
}

function EditPlan({ memberId, plan, onDone }: { memberId: string; plan: WorkoutPlanView; onDone: () => void }) {
  const exercises = useExercises(true)
  const save = useSaveMemberPlan(memberId)
  if (exercises.isPending) return <p className="text-sm text-muted">Loading exercises…</p>
  if (!exercises.data) return <ErrorText>{errorMessage(exercises.error)}</ErrorText>
  return (
    <WorkoutPlanEditor
      key={`${plan.id}-${plan.version}`}
      initial={toEditor(plan)}
      exercises={exercises.data}
      saveLabel="Save new version"
      pending={save.isPending}
      error={errorMessage(save.error)}
      onSave={(input) => save.mutate({ ...input, version: plan.version }, { onSuccess: onDone })}
      onCancel={onDone}
    />
  )
}

function PlanHistory({ memberId, exercises }: { memberId: string; exercises: WorkoutExercise[] }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<number | null>(null)
  const versions = useMemberPlanVersions(memberId, open)
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide earlier versions' : 'Earlier versions'}
      </Button>
      {open && versions.data?.length === 0 && <p className="text-sm text-muted">No earlier versions yet.</p>}
      {open &&
        versions.data?.map((v) => (
          <div key={v.version} className="rounded-2xl bg-surface p-4">
            <button
              type="button"
              aria-expanded={shown === v.version}
              onClick={() => setShown(shown === v.version ? null : v.version)}
              className="w-full text-left"
            >
              <span className="font-semibold">Version {v.version}</span>
              <span className="text-sm text-muted">
                {' '}
                · {v.name} · saved {formatWhen(v.savedAt)} by {v.savedByName}
              </span>
            </button>
            {shown === v.version && (
              <div className="mt-3">
                <WorkoutWeekView week={v.week} exercises={exercises} />
              </div>
            )}
          </div>
        ))}
      <ErrorText>{errorMessage(versions.error)}</ErrorText>
    </div>
  )
}
