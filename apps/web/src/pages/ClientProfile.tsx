import { useState, type FormEvent, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  DIET_PREFERENCES,
  DIET_PREFERENCE_LABELS,
  SEXES,
  SEX_LABELS,
  ageOn,
  todayInIndia,
  type ClientProfile,
  type ClientProfileInput,
  type DietPreference,
  type Sex,
} from '@onthec/shared'
import { useClientProfile, useSaveClientProfile } from '../api/coaching'
import { errorMessage, formatDate } from '../lib/format'
import { indiaDateOf } from '../lib/time'
import { Button } from '../ui/Button'
import { Card, Field, SelectInput, TextArea, TextInput } from '../ui/Form'
import { ErrorText } from '../ui/Screen'
import { Sheet } from '../ui/Sheet'
import { useDoneToast } from '../ui/toast-context'

/** Staff view of a client's health profile (their coach or the owner), with Edit in a sheet. */
export function ClientProfileSection({ memberId }: { memberId: string }) {
  const query = useClientProfile(memberId)
  const save = useSaveClientProfile(memberId)
  const [editing, setEditing] = useState(false)
  const done = useDoneToast(() => setEditing(false))
  const view = query.data

  if (query.isPending) {
    return <div aria-busy="true" aria-label="Loading profile" className="h-32 animate-pulse rounded-2xl bg-surface-2" />
  }
  if (!view) return <ErrorText>{errorMessage(query.error)}</ErrorText>
  const first = view.member.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-3">
      <ProfileSummary profile={view.profile} />
      <p className="text-sm text-muted">
        {view.healthConsentAt
          ? `${first} agreed in the app to share health details on ${formatDate(indiaDateOf(view.healthConsentAt))}.`
          : `${first} hasn’t agreed in the app yet. Ask them to open Profile → Health details.`}
      </p>
      <Button variant="secondary" onClick={() => setEditing(true)}>
        {view.profile ? 'Edit details' : 'Add details'}
      </Button>
      {editing && (
        <Sheet open title={`${first}’s details`} onClose={() => setEditing(false)}>
          <ProfileForm
            initial={view.profile}
            loading={save.isPending}
            error={errorMessage(save.error)}
            onCancel={() => setEditing(false)}
            onSubmit={(input) => save.mutate(input, { onSuccess: done('Details saved') })}
          />
        </Sheet>
      )}
    </div>
  )
}

/** The profile at a glance: body facts, health flags first (a coach must not miss them), then the rest. */
export function ProfileSummary({ profile, emptyText }: { profile: ClientProfile | null; emptyText?: string }) {
  if (!profile) {
    return (
      <Card>
        <p className="text-muted">
          {emptyText ?? 'No details yet: age, height, weight, goal, health issues and food.'}
        </p>
      </Card>
    )
  }
  const today = todayInIndia()
  const facts: [string, string][] = []
  if (profile.dateOfBirth) facts.push(['Age', `${ageOn(profile.dateOfBirth, today)} years`])
  if (profile.sex) facts.push(['Sex', SEX_LABELS[profile.sex]])
  if (profile.heightCm) facts.push(['Height', `${profile.heightCm} cm`])
  if (profile.startWeightKg) facts.push(['Starting weight', `${profile.startWeightKg} kg`])
  if (profile.bodyFatPct) facts.push(['Body fat', `${profile.bodyFatPct}%`])
  if (profile.dietPreference) facts.push(['Diet', DIET_PREFERENCE_LABELS[profile.dietPreference]])

  const flags = (
    [
      ['Medical conditions', profile.medicalConditions],
      ['Injuries', profile.injuries],
      ['Food allergies', profile.foodAllergies],
      ['Medicines', profile.medicines],
    ] as const
  ).filter(([, value]) => value)
  const notes = (
    [
      ['Goal', profile.goal],
      ['Lifestyle', profile.lifestyle],
      ['Training experience', profile.trainingExperience],
    ] as const
  ).filter(([, value]) => value)

  return (
    <div className="flex flex-col gap-3">
      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-surface p-3 ring-1 ring-line/70">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Card>
        {flags.length > 0 ? (
          <section aria-label="Health">
            <p className="mb-2 flex items-center gap-2 font-semibold text-warn">
              <TriangleAlert aria-hidden="true" size={18} /> Keep in mind
            </p>
            <dl className="flex flex-col gap-2">
              {flags.map(([label, value]) => (
                <Row key={label} label={label}>
                  {value}
                </Row>
              ))}
            </dl>
          </section>
        ) : (
          <p className="text-sm text-muted">No health issues, allergies or medicines noted.</p>
        )}
      </Card>
      {notes.length > 0 && (
        <Card>
          <dl className="flex flex-col gap-2">
            {notes.map(([label, value]) => (
              <Row key={label} label={label}>
                {value}
              </Row>
            ))}
          </dl>
        </Card>
      )}
      <p className="text-xs text-muted">
        Updated {formatDate(indiaDateOf(profile.updatedAt))} by {profile.updatedByName}
      </p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  )
}

type TextField =
  'goal' | 'medicalConditions' | 'injuries' | 'foodAllergies' | 'medicines' | 'lifestyle' | 'trainingExperience'

type FormValues = Record<
  'dateOfBirth' | 'sex' | 'heightCm' | 'startWeightKg' | 'bodyFatPct' | 'dietPreference' | TextField,
  string
>

function toForm(p: ClientProfile | null): FormValues {
  const str = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v))
  return {
    dateOfBirth: str(p?.dateOfBirth),
    sex: str(p?.sex),
    heightCm: str(p?.heightCm),
    startWeightKg: str(p?.startWeightKg),
    bodyFatPct: str(p?.bodyFatPct),
    dietPreference: str(p?.dietPreference),
    goal: str(p?.goal),
    medicalConditions: str(p?.medicalConditions),
    injuries: str(p?.injuries),
    foodAllergies: str(p?.foodAllergies),
    medicines: str(p?.medicines),
    lifestyle: str(p?.lifestyle),
    trainingExperience: str(p?.trainingExperience),
  }
}

function toInput(v: FormValues): ClientProfileInput {
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  return {
    dateOfBirth: v.dateOfBirth || null,
    sex: (v.sex || null) as Sex | null,
    heightCm: num(v.heightCm),
    startWeightKg: num(v.startWeightKg),
    bodyFatPct: num(v.bodyFatPct),
    dietPreference: (v.dietPreference || null) as DietPreference | null,
    goal: v.goal,
    medicalConditions: v.medicalConditions,
    injuries: v.injuries,
    foodAllergies: v.foodAllergies,
    medicines: v.medicines,
    lifestyle: v.lifestyle,
    trainingExperience: v.trainingExperience,
  }
}

/** The whole profile in one form, grouped so it reads like the coach's intake sheet. */
export function ProfileForm({
  initial,
  loading,
  error,
  onCancel,
  onSubmit,
  self = false,
  footer,
}: {
  initial: ClientProfile | null
  loading: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (input: ClientProfileInput) => void
  /** The member filling in their own details ("your" wording). */
  self?: boolean
  /** Extra content above the buttons, e.g. the consent box. */
  footer?: ReactNode
}) {
  const [v, setV] = useState(() => toForm(initial))
  const set = (key: keyof FormValues) => (e: { target: { value: string } }) => setV({ ...v, [key]: e.target.value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(toInput(v))
  }
  const text = (key: TextField, label: string, placeholder: string) => (
    <Field label={label}>
      {(id) => <TextArea id={id} rows={2} value={v[key]} onChange={set(key)} placeholder={placeholder} />}
    </Field>
  )

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Group title="Body">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth">
            {(id) => (
              <TextInput id={id} type="date" value={v.dateOfBirth} onChange={set('dateOfBirth')} max={todayInIndia()} />
            )}
          </Field>
          <Field label="Sex">
            {(id) => (
              <SelectInput id={id} value={v.sex} onChange={set('sex')}>
                <option value="">Not given</option>
                {SEXES.map((s) => (
                  <option key={s} value={s}>
                    {SEX_LABELS[s]}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Height (cm)">
            {(id) => (
              <TextInput id={id} inputMode="numeric" value={v.heightCm} onChange={set('heightCm')} placeholder="165" />
            )}
          </Field>
          <Field label="Weight (kg)">
            {(id) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={v.startWeightKg}
                onChange={set('startWeightKg')}
                placeholder="70.5"
              />
            )}
          </Field>
          <Field label="Body fat (%)">
            {(id) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={v.bodyFatPct}
                onChange={set('bodyFatPct')}
                placeholder="25"
              />
            )}
          </Field>
        </div>
      </Group>
      <Group title="Goal and food">
        {text('goal', self ? 'Your goal' : 'Goal', 'Lose 6 kg in 3 months')}
        <Field label="Diet">
          {(id) => (
            <SelectInput id={id} value={v.dietPreference} onChange={set('dietPreference')}>
              <option value="">Not given</option>
              {DIET_PREFERENCES.map((d) => (
                <option key={d} value={d}>
                  {DIET_PREFERENCE_LABELS[d]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        {text('foodAllergies', 'Food allergies', 'Peanuts, lactose')}
      </Group>
      <Group title="Health">
        {text('medicalConditions', 'Medical conditions', 'Thyroid, BP, diabetes, PCOS…')}
        {text('injuries', 'Injuries or pain', 'Lower back pain, old knee injury')}
        {text('medicines', 'Medicines', 'Name and dose')}
      </Group>
      <Group title="Lifestyle">
        {text('lifestyle', 'Work, sleep and activity', 'Desk job, sleeps 6 hours, walks 4,000 steps')}
        {text('trainingExperience', 'Training experience', 'New to the gym / 2 years of weights')}
      </Group>
      {footer}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" loading={loading}>
          Save
        </Button>
      </div>
    </form>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">{title}</legend>
      {children}
    </fieldset>
  )
}
