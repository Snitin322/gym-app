import { useState, type FormEvent } from 'react'
import { INDIAN_STATES, isValidGstin, type GymDetails } from '@onthec/shared'
import { useGymDetails, useSaveGymDetails } from '../../api/admin'
import { errorMessage, formatPhone } from '../../lib/format'
import { AdminLayout, LoadingText } from '../../ui/AdminLayout'
import { Button } from '../../ui/Button'
import { Card, Field, PhoneInput, SelectInput, TextArea, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'

/** Owner-only: the business details printed on invoices. */
export function GymDetailsPage() {
  const gym = useGymDetails()
  return (
    <AdminLayout title="Gym details" back={{ to: '/home', label: 'Home' }}>
      {gym.isPending && <LoadingText />}
      <ErrorText>{errorMessage(gym.error)}</ErrorText>
      {gym.data && <GymForm gym={gym.data} />}
    </AdminLayout>
  )
}

function GymForm({ gym }: { gym: GymDetails }) {
  const save = useSaveGymDetails()
  const [form, setForm] = useState({
    name: gym.name,
    legalName: gym.legalName ?? '',
    address: gym.address ?? '',
    city: gym.city ?? '',
    pincode: gym.pincode ?? '',
    stateCode: gym.stateCode ?? '',
    gstin: gym.gstin ?? '',
    sacCode: gym.sacCode,
    invoicePrefix: gym.invoicePrefix,
    contactPhone: gym.contactPhone ? formatPhone(gym.contactPhone).replace('+91 ', '') : '',
    email: gym.email ?? '',
  })
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const set = (key: keyof typeof form) => (value: string) => {
    setSaved(false)
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (form.gstin && !isValidGstin(form.gstin)) return setProblem('This GSTIN is not valid. Check for typos.')
    setProblem(null)
    save.mutate(form, { onSuccess: () => setSaved(true) })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Business</h2>
        <Field label="Gym name (shown in the app)">
          {(id) => <TextInput id={id} value={form.name} onChange={(e) => set('name')(e.target.value)} />}
        </Field>
        <Field label="Legal name (on invoices)" hint="Leave empty to use the gym name.">
          {(id) => <TextInput id={id} value={form.legalName} onChange={(e) => set('legalName')(e.target.value)} />}
        </Field>
        <Field label="Address">
          {(id) => <TextArea id={id} value={form.address} onChange={(e) => set('address')(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            {(id) => <TextInput id={id} value={form.city} onChange={(e) => set('city')(e.target.value)} />}
          </Field>
          <Field label="PIN code">
            {(id) => (
              <TextInput
                id={id}
                inputMode="numeric"
                maxLength={6}
                value={form.pincode}
                onChange={(e) => set('pincode')(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="State">
          {(id) => (
            <SelectInput id={id} value={form.stateCode} onChange={(e) => set('stateCode')(e.target.value)}>
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Contact number">
          {(id) => <PhoneInput id={id} value={form.contactPhone} onChange={(e) => set('contactPhone')(e.target.value)} />}
        </Field>
        <Field label="Email">
          {(id) => <TextInput id={id} type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />}
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">GST and invoices</h2>
        <Field
          label="GSTIN"
          hint={
            form.gstin
              ? 'Invoices will be GST tax invoices (CGST 9% + SGST 9%, included in prices).'
              : 'Leave empty if the gym is not GST-registered: receipts will show no GST.'
          }
        >
          {(id) => (
            <TextInput
              id={id}
              value={form.gstin}
              maxLength={15}
              autoCapitalize="characters"
              placeholder="27ABCDE1234F1Z5"
              onChange={(e) => set('gstin')(e.target.value.toUpperCase())}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SAC code" hint="Confirm with your CA.">
            {(id) => (
              <TextInput
                id={id}
                inputMode="numeric"
                maxLength={6}
                value={form.sacCode}
                onChange={(e) => set('sacCode')(e.target.value)}
              />
            )}
          </Field>
          <Field label="Invoice prefix" hint={`e.g. ${form.invoicePrefix || 'INV'}/26-27/0001`}>
            {(id) => (
              <TextInput
                id={id}
                maxLength={5}
                autoCapitalize="characters"
                value={form.invoicePrefix}
                onChange={(e) => set('invoicePrefix')(e.target.value.toUpperCase())}
              />
            )}
          </Field>
        </div>
      </Card>

      <ErrorText>{problem ?? errorMessage(save.error)}</ErrorText>
      {saved && (
        <p role="status" className="text-sm text-accent">
          Saved.
        </p>
      )}
      <Button type="submit" loading={save.isPending}>
        Save
      </Button>
    </form>
  )
}
