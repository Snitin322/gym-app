import { useState, type FormEvent, type ReactNode } from 'react'
import { formatPaise, rupeesToPaise, type DeskPaymentMethod } from '@onthec/shared'
import { errorMessage, paiseToRupeesInput } from '../../lib/format'
import type { PayChoice } from '../../lib/sale'
import { Button } from '../../ui/Button'
import { Card, Field, RupeeInput, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'
import { PaymentMethodPicker, ReferenceField } from './SaleFields'

/** An inline action panel on the member page (Renew, Freeze, Record payment…). */
export function PanelCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 border border-accent/40">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </Card>
  )
}

export function PanelButtons({
  onCancel,
  submitLabel,
  loading,
  danger = false,
}: {
  onCancel: () => void
  submitLabel: string
  loading: boolean
  danger?: boolean
}) {
  return (
    <div className="flex gap-3">
      <Button variant="secondary" onClick={onCancel}>
        Back
      </Button>
      <Button type="submit" loading={loading} className={danger ? '!bg-danger !text-bg' : ''}>
        {submitLabel}
      </Button>
    </div>
  )
}

export interface RecordPaymentValues {
  amountPaise: number
  method: DeskPaymentMethod
  reference?: string
  note?: string
}

/** "Record payment" for anything with an amount due (membership or PT package); part payments allowed. */
export function RecordPaymentPanel({
  label,
  duePaise,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  label: string
  duePaise: number
  pending: boolean
  error: unknown
  onSubmit: (values: RecordPaymentValues) => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(paiseToRupeesInput(duePaise))
  const [method, setMethod] = useState<PayChoice>('cash')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const amountPaise = rupeesToPaise(amount)
    if (!amountPaise) return setProblem('Enter a valid amount')
    if (amountPaise > duePaise) return setProblem(`Only ${formatPaise(duePaise)} is due`)
    if (method === 'later') return
    setProblem(null)
    onSubmit({ amountPaise, method, reference: reference.trim() || undefined, note: note.trim() || undefined })
  }

  return (
    <PanelCard title="Record payment">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-muted">
          {label} · {formatPaise(duePaise)} due
        </p>
        <Field label="Amount received" hint="You can record part of the amount now and the rest later.">
          {(id) => <RupeeInput id={id} value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <PaymentMethodPicker value={method} onChange={setMethod} />
        <ReferenceField method={method} value={reference} onChange={setReference} />
        <Field label="Note (optional)">
          {(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <ErrorText>{problem ?? errorMessage(error)}</ErrorText>
        <PanelButtons onCancel={onCancel} submitLabel="Record payment" loading={pending} />
      </form>
    </PanelCard>
  )
}
