import { DESK_PAYMENT_METHODS, PAYMENT_METHOD_LABELS, formatPaise, rupeesToPaise, type MembershipPlan } from '@onthec/shared'
import type { PayChoice, SaleState } from '../../lib/sale'
import { Field, RupeeInput, TextInput } from '../../ui/Form'

const METHOD_CHOICES = DESK_PAYMENT_METHODS.map((m) => ({ value: m as PayChoice, label: PAYMENT_METHOD_LABELS[m] }))

/** Cash / UPI / Card / Bank transfer (and optionally "Pay later") as tappable chips. */
export function PaymentMethodPicker({
  value,
  onChange,
  allowLater = false,
}: {
  value: PayChoice
  onChange: (value: PayChoice) => void
  allowLater?: boolean
}) {
  const choices = allowLater ? [...METHOD_CHOICES, { value: 'later' as const, label: 'Pay later' }] : METHOD_CHOICES
  return (
    <div role="radiogroup" aria-label="Payment" className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">Payment</span>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={value === choice.value}
            onClick={() => onChange(choice.value)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
              value === choice.value ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted'
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ReferenceField({
  method,
  value,
  onChange,
}: {
  method: PayChoice
  value: string
  onChange: (value: string) => void
}) {
  if (method !== 'upi' && method !== 'card' && method !== 'bank_transfer') return null
  return (
    <Field label="Reference (optional)" hint="UPI transaction ID, card slip or bank reference.">
      {(id) => <TextInput id={id} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  )
}

/** Price (with optional discount) and how the member paid at the desk. */
export function SaleFields({
  plan,
  value,
  onChange,
}: {
  plan: Pick<MembershipPlan, 'pricePaise'>
  value: SaleState
  onChange: (next: SaleState) => void
}) {
  const set = (patch: Partial<SaleState>) => onChange({ ...value, ...patch })
  const price = rupeesToPaise(value.price)
  const discounted = price !== null && price < plan.pricePaise

  return (
    <>
      <Field
        label="Price (incl. GST)"
        hint={discounted ? `Discount of ${formatPaise(plan.pricePaise - (price ?? 0))}` : 'Lower it to give a discount.'}
      >
        {(id) => <RupeeInput id={id} value={value.price} onChange={(e) => set({ price: e.target.value })} />}
      </Field>
      {discounted && (
        <Field label="Reason for discount">
          {(id) => (
            <TextInput
              id={id}
              value={value.discountReason}
              onChange={(e) => set({ discountReason: e.target.value })}
              placeholder="e.g. Diwali offer"
            />
          )}
        </Field>
      )}
      <PaymentMethodPicker value={value.method} onChange={(method) => set({ method })} allowLater />
      {value.method === 'later' && (
        <p className="-mt-2 text-sm text-warn">The amount will show as due until you record the payment.</p>
      )}
      <ReferenceField method={value.method} value={value.reference} onChange={(reference) => set({ reference })} />
    </>
  )
}
