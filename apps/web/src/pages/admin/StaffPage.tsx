import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { normalizePhone, type Role, type UserSummary } from '@onthec/shared'
import { useAddStaff, useStaff } from '../../api/admin'
import { useSignedInUser } from '../../auth/AuthContext'
import { ROLE_LABELS, errorMessage, formatPhone } from '../../lib/format'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Button } from '../../ui/Button'
import { Card, Field, PhoneInput, SelectInput, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including adding admins.',
  admin: 'Members, plans and staff (can add trainers).',
  trainer: 'Their own clients, hours and PT sessions.',
  member: '',
}

export function StaffPage() {
  const staff = useStaff()
  const [adding, setAdding] = useState(false)

  return (
    <AdminLayout
      title="Staff"
      back={{ to: '/home', label: 'Home' }}
      action={
        !adding && (
          <Button className="w-auto" onClick={() => setAdding(true)}>
            Add staff
          </Button>
        )
      }
    >
      {adding && <AddStaffForm onDone={() => setAdding(false)} />}

      {staff.isPending && <LoadingText />}
      <ErrorText>{errorMessage(staff.error)}</ErrorText>

      <ul className="flex flex-col gap-2">
        {staff.data?.map((person) => (
          <li key={person.id}>
            <StaffRow person={person} />
          </li>
        ))}
      </ul>
      <p className="text-center text-sm text-muted">Staff log in with their own mobile number, like members.</p>
    </AdminLayout>
  )
}

function StaffRow({ person }: { person: UserSummary }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{person.name}</p>
        <p className="truncate text-sm text-muted">{formatPhone(person.phone)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {person.role === 'trainer' && (
          <Link
            to={`/admin/trainers/${person.id}/availability`}
            aria-label={`${person.name}'s hours`}
            className="text-sm font-semibold text-accent hover:underline"
          >
            Hours →
          </Link>
        )}
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-accent">
          {ROLE_LABELS[person.role]}
        </span>
      </div>
    </div>
  )
}

function AddStaffForm({ onDone }: { onDone: () => void }) {
  const me = useSignedInUser()
  const add = useAddStaff()
  // Only the owner can add admins; admins add trainers.
  const roles: ('trainer' | 'admin')[] = me.role === 'owner' ? ['trainer', 'admin'] : ['trainer']
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'trainer' | 'admin'>('trainer')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = normalizePhone(phone)
    if (name.trim().length < 2) return setProblem('Enter their name')
    if (!normalized) return setProblem('Enter a valid 10-digit Indian mobile number')
    setProblem(null)
    add.mutate({ name: name.trim(), phone: normalized, role }, { onSuccess: onDone })
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Add staff</h2>
        <Field label="Full name">
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Mobile number" hint="They log in with this number.">
          {(id) => <PhoneInput id={id} value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
        <Field label="Role" hint={ROLE_HELP[role]}>
          {(id) => (
            <SelectInput id={id} value={role} onChange={(e) => setRole(e.target.value as 'trainer' | 'admin')}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <ErrorText>{problem ?? errorMessage(add.error)}</ErrorText>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={add.isPending}>
            Add {ROLE_LABELS[role].toLowerCase()}
          </Button>
        </div>
      </form>
    </Card>
  )
}
