import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const control =
  'min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-muted/60 focus:border-accent disabled:opacity-60'

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (id: string) => ReactNode
}

/** Label + control + hint/error, wired up with a generated id. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-sm text-danger">{error}</p> : hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  )
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${control} ${className}`} {...props} />
}

export function SelectInput({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${control} ${className}`} {...props} />
}

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${control} min-h-24 py-3 ${className}`} {...props} />
}

/** "₹" prefixed amount input (rupees, converted to paise by the caller). */
export function RupeeInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex min-h-12 items-center rounded-xl border border-line bg-surface focus-within:border-accent">
      <span className="pr-1 pl-4 text-muted">₹</span>
      <input inputMode="decimal" className="min-w-0 flex-1 bg-transparent py-3 pr-4 text-base outline-none" {...props} />
    </div>
  )
}

/** Indian mobile input with a fixed +91 prefix. */
export function PhoneInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex min-h-12 items-center rounded-xl border border-line bg-surface focus-within:border-accent">
      <span className="pr-2 pl-4 text-muted">+91</span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        placeholder="98765 43210"
        maxLength={16}
        className="min-w-0 flex-1 bg-transparent py-3 pr-4 text-base outline-none"
        {...props}
      />
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-surface p-5 ${className}`}>{children}</section>
}
