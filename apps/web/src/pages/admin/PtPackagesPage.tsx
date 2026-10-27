import { useState, type FormEvent } from 'react'
import { formatPaise, rupeesToPaise, type PtPackage } from '@onthec/shared'
import { usePtPackages, useSavePtPackage } from '../../api/admin'
import { errorMessage, paiseToRupeesInput, plural } from '../../lib/format'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Button } from '../../ui/Button'
import { Card, Field, RupeeInput, TextArea, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'

export function PtPackagesPage() {
  const packages = usePtPackages()
  const [editing, setEditing] = useState<'new' | string | null>(null)

  return (
    <AdminLayout
      title="PT packages"
      back={{ to: '/home', label: 'Home' }}
      action={
        editing === null && (
          <Button className="w-auto" onClick={() => setEditing('new')}>
            Add package
          </Button>
        )
      }
    >
      {editing === 'new' && <PackageForm onDone={() => setEditing(null)} />}

      {packages.isPending && <LoadingText />}
      <ErrorText>{errorMessage(packages.error)}</ErrorText>
      {packages.data?.length === 0 && editing === null && (
        <Card>
          <p className="text-muted">
            No PT packages yet. Add one, e.g. “12 sessions” valid for 60 days. Sell them from a member’s page.
          </p>
        </Card>
      )}

      <ul className="flex flex-col gap-3">
        {packages.data?.map((pkg) => (
          <li key={pkg.id}>
            {editing === pkg.id ? (
              <PackageForm pkg={pkg} onDone={() => setEditing(null)} />
            ) : (
              <PackageCard pkg={pkg} onEdit={() => setEditing(pkg.id)} />
            )}
          </li>
        ))}
      </ul>
    </AdminLayout>
  )
}

function PackageCard({ pkg, onEdit }: { pkg: PtPackage; onEdit: () => void }) {
  const save = useSavePtPackage()
  return (
    <Card className={pkg.active ? '' : 'opacity-60'}>
      <h2 className="text-lg font-bold">
        {pkg.name}
        {!pkg.active && <span className="ml-2 text-xs font-semibold text-muted uppercase">Inactive</span>}
      </h2>
      <p className="text-muted">
        {plural(pkg.sessionCount, 'session')} · valid {plural(pkg.validityDays, 'day')} ·{' '}
        <span className="text-ink">{formatPaise(pkg.pricePaise)}</span> incl. GST
      </p>
      {pkg.description && <p className="mt-1 text-sm text-muted">{pkg.description}</p>}
      <div className="mt-4 flex gap-3">
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate({ id: pkg.id, active: !pkg.active })}>
          {pkg.active ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
      <ErrorText>{errorMessage(save.error)}</ErrorText>
    </Card>
  )
}

function PackageForm({ pkg, onDone }: { pkg?: PtPackage; onDone: () => void }) {
  const save = useSavePtPackage()
  const [name, setName] = useState(pkg?.name ?? '')
  const [sessions, setSessions] = useState(String(pkg?.sessionCount ?? 12))
  const [validity, setValidity] = useState(String(pkg?.validityDays ?? 60))
  const [price, setPrice] = useState(pkg ? paiseToRupeesInput(pkg.pricePaise) : '')
  const [description, setDescription] = useState(pkg?.description ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const sessionCount = Number(sessions)
    const validityDays = Number(validity)
    const pricePaise = rupeesToPaise(price)
    if (name.trim().length < 2) return setProblem('Enter a package name')
    if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 200) return setProblem('Sessions must be 1 to 200')
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 730) return setProblem('Valid for 1 to 730 days')
    if (!pricePaise) return setProblem('Enter a valid price, e.g. 12000')
    setProblem(null)
    save.mutate(
      { id: pkg?.id, name: name.trim(), sessionCount, validityDays, pricePaise, description },
      { onSuccess: onDone },
    )
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">{pkg ? `Edit ${pkg.name}` : 'New PT package'}</h2>
        <Field label="Package name">
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="12 sessions" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sessions">
            {(id) => (
              <TextInput id={id} type="number" inputMode="numeric" min={1} max={200} value={sessions} onChange={(e) => setSessions(e.target.value)} />
            )}
          </Field>
          <Field label="Valid for (days)">
            {(id) => (
              <TextInput id={id} type="number" inputMode="numeric" min={1} max={730} value={validity} onChange={(e) => setValidity(e.target.value)} />
            )}
          </Field>
        </div>
        <Field label="Price (incl. GST)">
          {(id) => <RupeeInput id={id} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="12000" />}
        </Field>
        <Field label="Description (optional)">
          {(id) => <TextArea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        {pkg && <p className="text-sm text-muted">Changes apply to new sales only.</p>}
        <ErrorText>{problem ?? errorMessage(save.error)}</ErrorText>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {pkg ? 'Save' : 'Add package'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
