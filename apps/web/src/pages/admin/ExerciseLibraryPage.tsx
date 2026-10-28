import { useState, type FormEvent } from 'react'
import { MUSCLE_GROUPS, WORKOUT_EXERCISE_KINDS, type WorkoutExercise, type WorkoutExerciseKind } from '@onthec/shared'
import { useAddStarterExercises, useExercises, useSaveExercise } from '../../api/workouts'
import { errorMessage } from '../../lib/format'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Button } from '../../ui/Button'
import { Card, Field, SelectInput, TextArea, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'

const KIND_LABELS: Record<WorkoutExerciseKind, string> = { strength: 'Strength', cardio: 'Cardio' }

/** Owner/admin: the gym's exercises (grouped by muscle group), with add, edit and deactivate. */
export function ExerciseLibraryPage() {
  const exercises = useExercises(true)
  const starter = useAddStarterExercises()
  const [editing, setEditing] = useState<'new' | string | null>(null)
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const shown = (exercises.data ?? []).filter((e) => !q || e.name.toLowerCase().includes(q))
  const groups = new Map<string, WorkoutExercise[]>()
  for (const e of shown) groups.set(e.muscleGroup ?? 'Other', [...(groups.get(e.muscleGroup ?? 'Other') ?? []), e])

  return (
    <AdminLayout
      title="Exercise library"
      back={{ to: '/admin/workouts', label: 'Workouts' }}
      action={
        editing === null && (
          <Button className="w-auto" onClick={() => setEditing('new')}>
            Add exercise
          </Button>
        )
      }
    >
      {editing === 'new' && <ExerciseForm onDone={() => setEditing(null)} />}
      {exercises.isPending && <LoadingText />}
      <ErrorText>{errorMessage(exercises.error)}</ErrorText>

      {exercises.data?.length === 0 && (
        <Card className="flex flex-col gap-3">
          <p className="text-muted">
            No exercises yet. Start with about 50 common ones (you can edit them), or add your own.
          </p>
          <Button loading={starter.isPending} onClick={() => starter.mutate()}>
            Add common exercises
          </Button>
          <ErrorText>{errorMessage(starter.error)}</ErrorText>
        </Card>
      )}

      {(exercises.data?.length ?? 0) > 0 && (
        <Field label="Search">
          {(id) => <TextInput id={id} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />}
        </Field>
      )}

      {[...groups].map(([group, list]) => (
        <section key={group} aria-label={group} className="flex flex-col gap-2">
          <h2 className="mt-2 font-semibold">{group}</h2>
          <ul className="flex flex-col gap-2">
            {list.map((e) => (
              <li key={e.id}>
                {editing === e.id ? (
                  <ExerciseForm exercise={e} onDone={() => setEditing(null)} />
                ) : (
                  <ExerciseRow exercise={e} onEdit={() => setEditing(e.id)} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </AdminLayout>
  )
}

function ExerciseRow({ exercise: e, onEdit }: { exercise: WorkoutExercise; onEdit: () => void }) {
  const save = useSaveExercise()
  return (
    <article className={`rounded-2xl bg-surface p-4 ${e.active ? '' : 'opacity-60'}`}>
      <p className="font-bold">
        {e.name}
        <span className="ml-2 text-xs font-semibold text-muted uppercase">
          {KIND_LABELS[e.kind]}
          {!e.active && ' · Inactive'}
        </span>
      </p>
      {e.description && <p className="mt-1 text-sm text-muted">{e.description}</p>}
      {e.videoUrl && (
        <a
          href={e.videoUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-sm text-accent underline"
        >
          Video
        </a>
      )}
      <div className="mt-3 flex gap-3">
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="secondary"
          loading={save.isPending}
          onClick={() => save.mutate({ id: e.id, active: !e.active })}
        >
          {e.active ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
      <ErrorText>{errorMessage(save.error)}</ErrorText>
    </article>
  )
}

function ExerciseForm({ exercise, onDone }: { exercise?: WorkoutExercise; onDone: () => void }) {
  const save = useSaveExercise()
  const [name, setName] = useState(exercise?.name ?? '')
  const [kind, setKind] = useState<WorkoutExerciseKind>(exercise?.kind ?? 'strength')
  const [muscleGroup, setMuscleGroup] = useState(exercise?.muscleGroup ?? '')
  const [description, setDescription] = useState(exercise?.description ?? '')
  const [videoUrl, setVideoUrl] = useState(exercise?.videoUrl ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim().length < 2) return setProblem('Enter the exercise name')
    if (videoUrl.trim() && !/^https:\/\/\S+$/.test(videoUrl.trim()))
      return setProblem('Video link must start with https://')
    setProblem(null)
    save.mutate(
      { id: exercise?.id, name: name.trim(), kind, muscleGroup, description, videoUrl: videoUrl.trim() },
      { onSuccess: onDone },
    )
  }

  return (
    <Card className="border border-accent/40">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">{exercise ? `Edit ${exercise.name}` : 'New exercise'}</h2>
        <Field label="Name">
          {(id) => <TextInput id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            {(id) => (
              <SelectInput id={id} value={kind} onChange={(e) => setKind(e.target.value as WorkoutExerciseKind)}>
                {WORKOUT_EXERCISE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Muscle group">
            {(id) => (
              <SelectInput id={id} value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
                <option value="">—</option>
                {MUSCLE_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
        <Field label="How to do it (optional)">
          {(id) => (
            <TextArea id={id} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>
        <Field label="Video link (optional)" hint="e.g. a YouTube link starting with https://">
          {(id) => <TextInput id={id} type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />}
        </Field>
        <ErrorText>{problem ?? errorMessage(save.error)}</ErrorText>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {exercise ? 'Save' : 'Add exercise'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
