import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { normalizePhone, type GymSummary, type OtpChannel, type SessionResponse } from '@onthec/shared'
import { requestOtp, selectGym, verifyOtp } from '../api/auth'
import { homePathFor, useAuth } from '../auth/AuthContext'
import { errorMessage, formatPhone } from '../lib/format'
import { Button } from '../ui/Button'
import { ErrorText, Logo, Screen } from '../ui/Screen'

type Step =
  | { name: 'phone' }
  | { name: 'code'; phone: string; channel: OtpChannel }
  | { name: 'gym'; selectionToken: string; gyms: GymSummary[] }

const RESEND_AFTER_SECONDS = 30

export function LoginPage() {
  const { state, signIn } = useAuth()
  const [step, setStep] = useState<Step>({ name: 'phone' })
  const [phoneInput, setPhoneInput] = useState('')

  if (state.status === 'authenticated') return <Navigate to={homePathFor(state.user)} replace />

  const restart = () => setStep({ name: 'phone' })

  return (
    <Screen centered>
      <header className="mb-2 flex flex-col items-center gap-3 text-center">
        <Logo />
        <h1 className="text-2xl font-extrabold tracking-tight">
          {step.name === 'gym' ? 'Choose your gym' : 'Log in'}
        </h1>
      </header>

      {step.name === 'phone' && (
        <PhoneStep
          value={phoneInput}
          onChange={setPhoneInput}
          onSent={(phone, channel) => setStep({ name: 'code', phone, channel })}
        />
      )}
      {step.name === 'code' && (
        <CodeStep
          phone={step.phone}
          channel={step.channel}
          onChangeNumber={restart}
          onAuthenticated={signIn}
          onSelectGym={(selectionToken, gyms) => setStep({ name: 'gym', selectionToken, gyms })}
        />
      )}
      {step.name === 'gym' && (
        <GymStep selectionToken={step.selectionToken} gyms={step.gyms} onSelected={signIn} onRestart={restart} />
      )}
    </Screen>
  )
}

function PhoneStep({
  value,
  onChange,
  onSent,
}: {
  value: string
  onChange: (value: string) => void
  onSent: (phone: string, channel: OtpChannel) => void
}) {
  const [invalid, setInvalid] = useState(false)
  const send = useMutation({
    mutationFn: requestOtp,
    onSuccess: (response, phone) => onSent(phone, response.channel),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const phone = normalizePhone(value)
    setInvalid(!phone)
    if (phone) send.mutate(phone)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <label htmlFor="phone" className="text-sm font-medium text-muted">
        Mobile number
      </label>
      <div className="-mt-2 flex min-h-12 items-center rounded-xl border border-line bg-surface focus-within:border-accent">
        <span className="pl-4 pr-2 text-muted">+91</span>
        <input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          maxLength={16}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent py-3 pr-4 text-lg tracking-wide outline-none"
        />
      </div>
      <ErrorText>{invalid ? 'Enter a valid 10-digit Indian mobile number' : errorMessage(send.error)}</ErrorText>
      <Button type="submit" loading={send.isPending}>
        Send code
      </Button>
      <p className="text-center text-sm text-muted">Only members registered at the gym can log in.</p>
    </form>
  )
}

function CodeStep({
  phone,
  channel,
  onChangeNumber,
  onAuthenticated,
  onSelectGym,
}: {
  phone: string
  channel: OtpChannel
  onChangeNumber: () => void
  onAuthenticated: (session: SessionResponse) => void
  onSelectGym: (selectionToken: string, gyms: GymSummary[]) => void
}) {
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(RESEND_AFTER_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const verify = useMutation({
    mutationFn: (value: string) => verifyOtp(phone, value),
    onSuccess: (result) => {
      if (result.status === 'authenticated') onAuthenticated(result)
      else onSelectGym(result.selectionToken, result.gyms)
    },
    onError: () => setCode(''),
  })
  const resend = useMutation({
    mutationFn: () => requestOtp(phone),
    onSuccess: () => {
      setCooldown(RESEND_AFTER_SECONDS)
      verify.reset()
    },
  })

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    // Submit as soon as 6 digits are in, including when pasted or autofilled.
    if (digits.length === 6 && !verify.isPending) verify.mutate(digits)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (code.length === 6) verify.mutate(code)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-center text-muted">
        {channel === 'whatsapp' ? (
          <>
            We sent a 6-digit code to your <strong className="text-ink">WhatsApp</strong> on{' '}
            <strong className="text-ink">{formatPhone(phone)}</strong>.
          </>
        ) : (
          <>
            Development mode: the code for <strong className="text-ink">{formatPhone(phone)}</strong> is in the API
            terminal.
          </>
        )}
      </p>
      <label htmlFor="code" className="sr-only">
        6-digit code
      </label>
      <input
        id="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="••••••"
        autoFocus
        value={code}
        onChange={(event) => onCodeChange(event.target.value)}
        className="min-h-14 rounded-xl border border-line bg-surface text-center text-2xl tracking-[0.5em] outline-none focus:border-accent"
      />
      <ErrorText>{errorMessage(verify.error) ?? errorMessage(resend.error)}</ErrorText>
      <Button type="submit" loading={verify.isPending} disabled={code.length !== 6}>
        Verify
      </Button>
      <div className="flex justify-between gap-4">
        <Button variant="ghost" className="w-auto" onClick={onChangeNumber}>
          Change number
        </Button>
        <Button
          variant="ghost"
          className="w-auto"
          disabled={cooldown > 0}
          loading={resend.isPending}
          onClick={() => resend.mutate()}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
      </div>
    </form>
  )
}

function GymStep({
  selectionToken,
  gyms,
  onSelected,
  onRestart,
}: {
  selectionToken: string
  gyms: GymSummary[]
  onSelected: (session: SessionResponse) => void
  onRestart: () => void
}) {
  const choose = useMutation({
    mutationFn: (gymId: string) => selectGym(selectionToken, gymId),
    onSuccess: onSelected,
  })

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-muted">Your number is registered at more than one gym.</p>
      {gyms.map((gym) => (
        <Button
          key={gym.id}
          variant="secondary"
          disabled={choose.isPending}
          onClick={() => choose.mutate(gym.id)}
        >
          {gym.name}
        </Button>
      ))}
      <ErrorText>{errorMessage(choose.error)}</ErrorText>
      {choose.error && (
        <Button variant="ghost" onClick={onRestart}>
          Start again
        </Button>
      )}
    </div>
  )
}
