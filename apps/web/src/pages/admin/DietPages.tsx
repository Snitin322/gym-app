import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { FOOD_UNIT_LABELS, emptyDietPlan, type Food } from '@onthec/shared'
import {
  useAddStarterFoods,
  useDeleteDietTemplate,
  useDietTemplate,
  useDietTemplates,
  useFoods,
  useSaveDietTemplate,
  useSaveFood,
} from '../../api/diet'
import { useMember } from '../../api/admin'
import { errorMessage } from '../../lib/format'
import { formatWhen } from '../../lib/time'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Button } from '../../ui/Button'
import { toDietEditor } from '../../lib/diet-editor'
import { DietPlanEditor, NewFoodForm } from '../../ui/DietPlanEditor'
import { Card, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'
import { Sheet } from '../../ui/Sheet'
import { useDoneToast } from '../../ui/toast-context'
import { MemberDietPlan } from '../MemberDietPlan'

/** Owner/admin: diet templates, and a link to the food list. */
export function DietPage() {
  const templates = useDietTemplates()
  return (
    <AdminLayout
      title="Diet"
      back={{ to: '/admin/more', label: 'More' }}
      action={
        <Link
          to="/admin/diet/templates/new"
          className="flex min-h-12 items-center rounded-xl bg-accent px-4 font-bold text-accent-ink"
        >
          New template
        </Link>
      }
    >
      <Link
        to="/admin/diet/foods"
        className="flex items-center justify-between rounded-2xl bg-surface p-4 hover:bg-surface-2"
      >
        <span>
          <span className="block font-bold">Food list →</span>
          <span className="text-sm text-muted">Foods with protein, carbs, fat and calories</span>
        </span>
      </Link>

      <h2 className="mt-2 font-semibold">Diet templates</h2>
      {templates.isPending && <LoadingText />}
      <ErrorText>{errorMessage(templates.error)}</ErrorText>
      {templates.data?.length === 0 && (
        <Card>
          <p className="text-muted">
            No templates yet. Make ready-made diets, e.g. “Fat loss 1,800 kcal (veg)”, and give clients their own copy
            to adjust.
          </p>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {templates.data?.map((t) => (
          <li key={t.id}>
            <Link
              to={`/admin/diet/templates/${t.id}`}
              className="flex flex-col rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2"
            >
              <span className="font-bold">{t.name}</span>
              <span className="text-sm text-muted">
                {t.kcal.toLocaleString('en-IN')} kcal on training days · version {t.version} · by {t.updatedByName}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminLayout>
  )
}

export function DietTemplatePage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const template = useDietTemplate(isNew ? undefined : id)
  const foods = useFoods()
  const save = useSaveDietTemplate()
  const back = { to: '/admin/diet', label: 'Diet' }

  if ((!isNew && template.isPending) || foods.isPending) {
    return (
      <AdminLayout title="Diet template" back={back}>
        <LoadingText />
      </AdminLayout>
    )
  }
  const loadError = errorMessage(template.error ?? foods.error)
  if (loadError || !foods.data || (!isNew && !template.data)) {
    return (
      <AdminLayout title="Diet template" back={back}>
        <ErrorText>{loadError ?? 'Template not found'}</ErrorText>
      </AdminLayout>
    )
  }

  const plan = template.data
  return (
    <AdminLayout title={plan ? plan.name : 'New diet template'} back={back}>
      {plan && (
        <p className="-mt-3 text-sm text-muted">
          Version {plan.version} · saved {formatWhen(plan.updatedAt)} by {plan.updatedByName}. Members who already got
          this diet keep their own copy.
        </p>
      )}
      {foods.data.length === 0 && (
        <Card>
          <p className="text-muted">
            The food list is empty. Add the common foods on the{' '}
            <Link to="/admin/diet/foods" className="font-semibold text-accent underline">
              Food list
            </Link>{' '}
            screen first, or add foods as you go.
          </p>
        </Card>
      )}
      <DietPlanEditor
        key={plan ? `${plan.id}-${plan.version}` : 'new'}
        initial={toDietEditor(plan ?? { name: '', plan: emptyDietPlan() })}
        foods={foods.data}
        saveLabel={plan ? 'Save new version' : 'Create template'}
        pending={save.isPending}
        error={errorMessage(save.error)}
        onSave={(input) =>
          save.mutate(plan ? { ...input, id: plan.id, version: plan.version } : input, {
            onSuccess: (saved) => {
              if (!plan) void navigate(`/admin/diet/templates/${saved.id}`, { replace: true })
            },
          })
        }
        onCancel={() => void navigate('/admin/diet')}
      />
      {plan && <DeleteTemplate id={plan.id} name={plan.name} />}
    </AdminLayout>
  )
}

function DeleteTemplate({ id, name }: { id: string; name: string }) {
  const remove = useDeleteDietTemplate()
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
          Keep
        </Button>
        <Button
          className="!bg-danger !text-bg"
          loading={remove.isPending}
          onClick={() => remove.mutate(id, { onSuccess: () => void navigate('/admin/diet', { replace: true }) })}
        >
          Delete
        </Button>
      </div>
    </Card>
  )
}

/** The gym's food list: search, add, edit, deactivate; "Add common foods" when it's empty. */
export function FoodListPage() {
  const foods = useFoods()
  const starter = useAddStarterFoods()
  const [editing, setEditing] = useState<'new' | Food | null>(null)
  const [search, setSearch] = useState('')
  const done = useDoneToast(() => setEditing(null))
  const q = search.trim().toLowerCase()
  const shown = (foods.data ?? []).filter((f) => !q || f.name.toLowerCase().includes(q))

  return (
    <AdminLayout
      title="Food list"
      back={{ to: '/admin/diet', label: 'Diet' }}
      action={
        <Button className="w-auto" onClick={() => setEditing('new')}>
          Add food
        </Button>
      }
    >
      {foods.isPending && <LoadingText />}
      <ErrorText>{errorMessage(foods.error)}</ErrorText>
      {foods.data?.length === 0 && (
        <Card className="flex flex-col gap-3">
          <p className="text-muted">
            No foods yet. Start with about 35 common Indian foods with typical values (edit them to match what your
            members eat), or add your own.
          </p>
          <Button loading={starter.isPending} onClick={() => starter.mutate()}>
            Add common foods
          </Button>
          <ErrorText>{errorMessage(starter.error)}</ErrorText>
        </Card>
      )}
      {(foods.data?.length ?? 0) > 0 && (
        <TextInput
          type="search"
          aria-label="Search foods"
          placeholder="Search foods"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <ul className="flex flex-col gap-2">
        {shown.map((f) => (
          <li key={f.id}>
            <FoodRow food={f} onEdit={() => setEditing(f)} />
          </li>
        ))}
      </ul>
      {editing && (
        <Sheet open title={editing === 'new' ? 'New food' : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <NewFoodForm
            food={editing === 'new' ? undefined : editing}
            onSaved={done(editing === 'new' ? 'Food added' : 'Food saved')}
            onCancel={() => setEditing(null)}
          />
        </Sheet>
      )}
    </AdminLayout>
  )
}

function FoodRow({ food: f, onEdit }: { food: Food; onEdit: () => void }) {
  const save = useSaveFood()
  const per = f.unit === 'piece' ? `per ${f.pieceName ?? 'piece'}` : FOOD_UNIT_LABELS[f.unit]
  return (
    <article className={`flex items-center gap-3 rounded-2xl bg-surface p-4 ${f.active ? '' : 'opacity-60'}`}>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" aria-label={`Edit ${f.name}`}>
        <span className="block font-bold">
          {f.name}
          {!f.active && <span className="ml-2 text-xs font-semibold text-muted uppercase">Inactive</span>}
        </span>
        <span className="block text-sm text-muted">
          {f.kcal} kcal {per} · P&nbsp;{f.proteinG} · C&nbsp;{f.carbsG} · F&nbsp;{f.fatG}
        </span>
      </button>
      <Button
        variant="ghost"
        className="w-auto shrink-0 text-sm"
        loading={save.isPending}
        onClick={() => save.mutate({ ...f, active: !f.active })}
      >
        {f.active ? 'Hide' : 'Show'}
      </Button>
    </article>
  )
}

/** A member's diet at the desk (from the Coach card). */
export function MemberDietPage() {
  const { id = '' } = useParams()
  const member = useMember(id)
  return (
    <AdminLayout title="Diet plan" back={{ to: `/admin/members/${id}`, label: member.data?.name ?? 'Member' }}>
      <MemberDietPlan memberId={id} />
    </AdminLayout>
  )
}
