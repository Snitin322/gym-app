import { Link } from 'react-router'
import { useWorkoutTemplates } from '../../api/workouts'
import { errorMessage, plural } from '../../lib/format'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Card } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'

/** Owner/admin: weekly plan templates, and a link to the exercise library. */
export function WorkoutsPage() {
  const templates = useWorkoutTemplates()

  return (
    <AdminLayout
      title="Workouts"
      back={{ to: '/home', label: 'Home' }}
      action={
        <Link
          to="/admin/workouts/templates/new"
          className="flex min-h-12 items-center rounded-xl bg-accent px-4 font-bold text-accent-ink"
        >
          New template
        </Link>
      }
    >
      <Link
        to="/admin/workouts/exercises"
        className="flex items-center justify-between rounded-2xl bg-surface p-4 hover:bg-surface-2"
      >
        <span>
          <span className="block font-bold">Exercise library →</span>
          <span className="text-sm text-muted">Exercises, how-to descriptions and video links</span>
        </span>
      </Link>

      <h2 className="mt-2 font-semibold">Plan templates</h2>
      {templates.isPending && <LoadingText />}
      <ErrorText>{errorMessage(templates.error)}</ErrorText>
      {templates.data?.length === 0 && (
        <Card>
          <p className="text-muted">
            No templates yet. Make ready-made weekly plans, e.g. “Beginner 6-day split”, and give members their own
            copy.
          </p>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {templates.data?.map((t) => (
          <li key={t.id}>
            <Link
              to={`/admin/workouts/templates/${t.id}`}
              className="flex flex-col rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2"
            >
              <span className="font-bold">{t.name}</span>
              <span className="text-sm text-muted">
                {plural(t.trainingDays, 'training day')} a week · version {t.version} · by {t.updatedByName}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminLayout>
  )
}
