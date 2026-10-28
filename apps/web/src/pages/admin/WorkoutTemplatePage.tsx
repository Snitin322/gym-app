import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { emptyWeek, type WorkoutExercise, type WorkoutPlanVersionView } from '@onthec/shared'
import {
  useDeleteTemplate,
  useExercises,
  useSaveTemplate,
  useTemplateVersions,
  useWorkoutTemplate,
} from '../../api/workouts'
import { errorMessage } from '../../lib/format'
import { formatWhen } from '../../lib/time'
import { toEditor } from '../../lib/workout-editor'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'
import { WorkoutPlanEditor } from '../../ui/WorkoutPlanEditor'
import { WorkoutWeekView } from '../../ui/WorkoutWeekView'

/** Owner/admin: create a template (`/new`) or edit one, with its earlier versions and delete. */
export function WorkoutTemplatePage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const template = useWorkoutTemplate(isNew ? undefined : id)
  // All exercises, so deactivated ones already in the plan still show their names.
  const exercises = useExercises(true)
  const save = useSaveTemplate()
  const back = { to: '/admin/workouts', label: 'Workouts' }

  if ((!isNew && template.isPending) || exercises.isPending) {
    return (
      <AdminLayout title="Workout template" back={back}>
        <LoadingText />
      </AdminLayout>
    )
  }
  const loadError = errorMessage(template.error ?? exercises.error)
  if (loadError || !exercises.data || (!isNew && !template.data)) {
    return (
      <AdminLayout title="Workout template" back={back}>
        <ErrorText>{loadError ?? 'Template not found'}</ErrorText>
      </AdminLayout>
    )
  }

  const plan = template.data
  const library = exercises.data
  return (
    <AdminLayout title={plan ? plan.name : 'New template'} back={back}>
      {plan && (
        <p className="-mt-3 text-sm text-muted">
          Version {plan.version} · saved {formatWhen(plan.updatedAt)} by {plan.updatedByName}. Members who already got
          this plan keep their own copy.
        </p>
      )}
      {library.length === 0 && (
        <Card>
          <p className="text-muted">
            The exercise library is empty. Add exercises first on the Exercise library screen.
          </p>
        </Card>
      )}
      <WorkoutPlanEditor
        // A new editor after each save, so it starts from the saved version.
        key={plan ? `${plan.id}-${plan.version}` : 'new'}
        initial={toEditor(plan ?? { name: '', week: emptyWeek() })}
        exercises={library}
        saveLabel={plan ? 'Save new version' : 'Create template'}
        pending={save.isPending}
        error={errorMessage(save.error)}
        onSave={(input) =>
          save.mutate(plan ? { ...input, id: plan.id, version: plan.version } : input, {
            onSuccess: (saved) => {
              if (!plan) void navigate(`/admin/workouts/templates/${saved.id}`, { replace: true })
            },
          })
        }
        onCancel={() => void navigate('/admin/workouts')}
      />
      {plan && <History templateId={plan.id} exercises={library} />}
      {plan && <DeleteTemplate id={plan.id} name={plan.name} />}
    </AdminLayout>
  )
}

function History({ templateId, exercises }: { templateId: string; exercises: WorkoutExercise[] }) {
  const versions = useTemplateVersions(templateId)
  const [open, setOpen] = useState<number | null>(null)
  if (!versions.data?.length) return null
  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-2">
      <h2 id="history-heading" className="mt-4 font-semibold">
        Earlier versions
      </h2>
      <ul className="flex flex-col gap-2">
        {versions.data.map((v: WorkoutPlanVersionView) => (
          <li key={v.version} className="rounded-2xl bg-surface p-4">
            <button
              type="button"
              aria-expanded={open === v.version}
              onClick={() => setOpen(open === v.version ? null : v.version)}
              className="w-full text-left"
            >
              <span className="font-semibold">Version {v.version}</span>
              <span className="text-sm text-muted">
                {' '}
                · {v.name} · saved {formatWhen(v.savedAt)} by {v.savedByName}
              </span>
            </button>
            {open === v.version && (
              <div className="mt-3">
                <WorkoutWeekView week={v.week} exercises={exercises} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function DeleteTemplate({ id, name }: { id: string; name: string }) {
  const remove = useDeleteTemplate()
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button variant="ghost" className="mt-4" onClick={() => setAsking(true)}>
        Delete template
      </Button>
    )
  }
  return (
    <Card className="mt-4 flex flex-col gap-3 border border-danger/40">
      <p>Delete “{name}”? Members who already have a copy keep theirs.</p>
      <ErrorText>{errorMessage(remove.error)}</ErrorText>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setAsking(false)}>
          Keep it
        </Button>
        <Button
          className="!bg-danger !text-bg"
          loading={remove.isPending}
          onClick={() => remove.mutate(id, { onSuccess: () => void navigate('/admin/workouts') })}
        >
          Delete
        </Button>
      </div>
    </Card>
  )
}
