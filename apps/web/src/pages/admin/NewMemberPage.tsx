import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { membershipEndDate, normalizePhone, todayInIndia } from '@onthec/shared'
import { useCreateMember, usePlans } from '../../api/admin'
import { errorMessage, formatDate } from '../../lib/format'
import { planOptionLabel } from '../../lib/membership'
import { initialSale, saleToInput, type SaleState } from '../../lib/sale'
import { SaleFields } from './SaleFields'
import { AdminLayout } from '../../ui/AdminLayout'
import { Button } from '../../ui/Button'
import { Card, Field, PhoneInput, SelectInput, TextArea, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'

export function NewMemberPage() {
  const navigate = useNavigate()
  const plans = usePlans()
  const create = useCreateMember()
  const today = todayInIndia()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [planId, setPlanId] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [joinedOn, setJoinedOn] = useState(today)
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [sale, setSale] = useState<SaleState>(initialSale())
  const [problem, setProblem] = useState<string | null>(null)

  const activePlans = plans.data?.filter((p) => p.active) ?? []
  const plan = activePlans.find((p) => p.id === planId)

  const choosePlan = (id: string) => {
    setPlanId(id)
    // Start each plan at its own price.
    setSale({ ...sale, price: initialSale(activePlans.find((p) => p.id === id)).price, discountReason: '' })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = normalizePhone(phone)
    if (name.trim().length < 2) return setProblem('Enter the member’s name')
    if (!normalized) return setProblem('Enter a valid 10-digit Indian mobile number')
    if (emergencyPhone && !normalizePhone(emergencyPhone)) return setProblem('Emergency contact number is not valid')
    const checked = plan ? saleToInput(plan, sale) : null
    if (checked && 'error' in checked) return setProblem(checked.error)
    setProblem(null)
    create.mutate(
      {
        name: name.trim(),
        phone: normalized,
        joinedOn,
        emergencyContactName: emergencyName || undefined,
        emergencyContactPhone: emergencyPhone || undefined,
        notes: notes || undefined,
        firstMembership: plan && checked ? { planId: plan.id, startDate, ...checked.input } : undefined,
      },
      { onSuccess: (member) => navigate(`/admin/members/${member.id}`, { replace: true }) },
    )
  }

  return (
    <AdminLayout title="Add member" back={{ to: '/admin/members', label: 'Members' }}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <Field label="Full name">
            {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
          </Field>
          <Field label="Mobile number" hint="They log in with this number.">
            {(id) => <PhoneInput id={id} value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Membership</h2>
          <Field label="Plan">
            {(id) => (
              <SelectInput id={id} value={planId} onChange={(e) => choosePlan(e.target.value)}>
                <option value="">No plan yet</option>
                {activePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {planOptionLabel(p)}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          {plan && (
            <>
              <Field
                label="Starts on"
                hint={`Ends ${formatDate(membershipEndDate(startDate || today, plan.durationMonths))}.`}
              >
                {(id) => (
                  <TextInput id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                )}
              </Field>
              <SaleFields plan={plan} value={sale} onChange={setSale} />
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">More details (optional)</h2>
          <Field label="Joined the gym on">
            {(id) => <TextInput id={id} type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} />}
          </Field>
          <Field label="Emergency contact name">
            {(id) => <TextInput id={id} value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />}
          </Field>
          <Field label="Emergency contact number">
            {(id) => <PhoneInput id={id} value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />}
          </Field>
          <Field label="Notes">
            {(id) => <TextArea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
        </Card>

        <ErrorText>{problem ?? errorMessage(create.error)}</ErrorText>
        <Button type="submit" loading={create.isPending}>
          Add member
        </Button>
      </form>
    </AdminLayout>
  )
}
