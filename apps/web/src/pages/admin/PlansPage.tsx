import { useState, type FormEvent } from 'react'
import { formatPaise, rupeesToPaise, suggestedMaxFreezeDays, type MembershipPlan } from '@onthec/shared'
import { usePlans, useSavePlan } from '../../api/admin'
import { errorMessage, paiseToRupeesInput, plural } from '../../lib/format'
import { monthsLabel } from '../../lib/membership'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Button } from '../../ui/Button'
import { Card, Field, RupeeInput, SelectInput, TextArea, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'

const MONTH_OPTIONS = [1, 2, 3, 4, 6, 9, 12, 18, 24]


export function PlansPage() {
  const plans = usePlans()
  const [editing, setEditing] = useState<'new' | string | null>(null)

  return (
    <AdminLayout
      title="Plans"
      back={{ to: '/home', label: 'Home' }}
      action={
        editing === null && (
          <Button className="w-auto" onClick={() => setEditing('new')}>
            Add plan
          </Button>
        )
      }
    >
      {editing === 'new' && <PlanForm onDone={() => setEditing(null)} />}

      {plans.isPending && <LoadingText />}
      <ErrorText>{errorMessage(plans.error)}</ErrorText>
      {plans.data?.length === 0 && editing === null && (
        <Card>
          <p className="text-muted">No plans yet. Add your first plan, e.g. “1 month”, “3 months”, “12 months”.</p>
        </Card>
      )}

      <ul className="flex flex-col gap-3">
        {plans.data?.map((plan) =>
          editing === plan.id ? (
            <li key={plan.id}>
              <PlanForm plan={plan} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={plan.id}>
              <PlanCard plan={plan} onEdit={() => setEditing(plan.id)} />
            </li>
          ),
        )}
      </ul>
    </AdminLayout>
  )
}

function PlanCard({ plan, onEdit }: { plan: MembershipPlan; onEdit: () => void }) {
  const save = useSavePlan()
  return (
    <Card className={plan.active ? '' : 'opacity-60'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">
            {plan.name}
            {!plan.active && <span className="ml-2 text-xs font-semibold text-muted uppercase">Inactive</span>}
          </h2>
          <p className="text-muted">
            {monthsLabel(plan.durationMonths)} · <span className="text-ink">{formatPaise(plan.pricePaise)}</span> incl.
            GST
          </p>
          <p className="text-sm text-muted">
            {plan.maxFreezeDays === 0 ? 'No freezing' : `Freeze up to ${plural(plan.maxFreezeDays, 'day')}`}
          </p>
          {plan.description && <p className="mt-1 text-sm text-muted">{plan.description}</p>}
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="secondary"
          loading={save.isPending}
          onClick={() => save.mutate({ id: plan.id, active: !plan.active })}
        >
          {plan.active ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
      <ErrorText>{errorMessage(save.error)}</ErrorText>
    </Card>
  )
}

function PlanForm({ plan, onDone }: { plan?: MembershipPlan; onDone: () => void }) {
  const save = useSavePlan()
  const [name, setName] = useState(plan?.name ?? '')
  const [months, setMonths] = useState(plan?.durationMonths ?? 1)
  const [price, setPrice] = useState(plan ? paiseToRupeesInput(plan.pricePaise) : '')
  const [freezeDays, setFreezeDays] = useState(String(plan?.maxFreezeDays ?? suggestedMaxFreezeDays(1)))
  // Follow the suggested freeze limit until the user types their own value.
  const [freezeEdited, setFreezeEdited] = useState(Boolean(plan))
  const [description, setDescription] = useState(plan?.description ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const changeMonths = (value: number) => {
    setMonths(value)
    if (!freezeEdited) setFreezeDays(String(suggestedMaxFreezeDays(value)))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const pricePaise = rupeesToPaise(price)
    const maxFreezeDays = Number(freezeDays)
    if (name.trim().length < 2) return setProblem('Enter a plan name')
    if (!pricePaise) return setProblem('Enter a valid price, e.g. 4500')
    if (!Number.isInteger(maxFreezeDays) || maxFreezeDays < 0) return setProblem('Freeze days must be 0 or more')
    setProblem(null)
    save.mutate(
      { id: plan?.id, name: name.trim(), durationMonths: months, pricePaise, maxFreezeDays, description },
      { onSuccess: onDone },
    )
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">{plan ? `Edit ${plan.name}` : 'New plan'}</h2>
        <Field label="Plan name">
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="3 months" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Length">
            {(id) => (
              <SelectInput id={id} value={months} onChange={(e) => changeMonths(Number(e.target.value))}>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {monthsLabel(m)}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Price (incl. GST)">
            {(id) => <RupeeInput id={id} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="4500" />}
          </Field>
        </div>
        <Field
          label="Max freeze days"
          hint={plan ? 'Changes apply to new memberships only.' : 'Suggested for this length. 0 = no freezing.'}
        >
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              value={freezeDays}
              onChange={(e) => {
                setFreezeEdited(true)
                setFreezeDays(e.target.value)
              }}
            />
          )}
        </Field>
        <Field label="Description (optional)">
          {(id) => (
            <TextArea
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Includes locker"
            />
          )}
        </Field>
        {plan && <p className="text-sm text-muted">Price changes apply to new sales only.</p>}
        <ErrorText>{problem ?? errorMessage(save.error)}</ErrorText>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {plan ? 'Save' : 'Add plan'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
