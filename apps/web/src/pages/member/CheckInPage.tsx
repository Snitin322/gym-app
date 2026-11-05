import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import {
  CHECK_IN_POSES,
  MEASUREMENTS,
  MEASUREMENT_LABELS,
  POSE_LABELS,
  type CheckInPose,
  type CheckInView,
  type Measurement,
  type MyCheckIns,
} from '@onthec/shared'
import { useMyCheckIns, useSendCheckIn } from '../../api/check-ins'
import { errorMessage, formatDate } from '../../lib/format'
import { resizePhoto } from '../../lib/photo'
import { PageHeader, SectionTitle } from '../../ui/AppShell'
import { Button } from '../../ui/Button'
import { CheckInCard } from '../../ui/CheckInCard'
import { Field, TextArea, TextInput } from '../../ui/Form'
import { ErrorText } from '../../ui/Screen'
import { useToast } from '../../ui/toast-context'
import { MemberShell } from './MemberShell'

/** Check-in tab: this week's check-in (or the three steps to send it), then earlier weeks. */
export function CheckInPage() {
  const query = useMyCheckIns()
  const [editing, setEditing] = useState(false)
  const data = query.data
  const current = data?.current ?? null

  return (
    <MemberShell>
      <PageHeader title="Check-in" subtitle={data && `Week of ${formatDate(data.weekOf)}`} />
      {query.isPending && (
        <div aria-busy="true" aria-label="Loading" className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      )}
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {data && (!current || editing) && (
        <CheckInSteps
          data={data}
          current={current}
          onDone={() => setEditing(false)}
          onCancel={current ? () => setEditing(false) : undefined}
        />
      )}
      {data && current && !editing && (
        <>
          <CheckInCard checkIn={current} previous={data.history[1]} coachName={data.coach?.name} />
          {!current.reviewedAt && (
            <>
              <p className="text-sm text-muted">
                Sent. {data.coach ? `${data.coach.name.split(' ')[0]} will reply here.` : 'Your coach will reply here.'}{' '}
                You can still change it until then.
              </p>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Update this week’s check-in
              </Button>
            </>
          )}
        </>
      )}
      {data && data.history.filter((c) => c.id !== current?.id).length > 0 && (
        <section aria-labelledby="earlier-heading" className="flex flex-col gap-3">
          <SectionTitle>
            <span id="earlier-heading">Earlier weeks</span>
          </SectionTitle>
          {data.history
            .filter((c) => c.id !== current?.id)
            .map((c) => (
              <CheckInCard
                key={c.id}
                checkIn={c}
                previous={data.history[data.history.indexOf(c) + 1]}
                coachName={data.coach?.name}
              />
            ))}
        </section>
      )}
    </MemberShell>
  )
}

type Step = 'weight' | 'photos' | 'note'

/** Weight (and optional measurements) → photos → a note, one screen each. */
function CheckInSteps({
  data,
  current,
  onDone,
  onCancel,
}: {
  data: MyCheckIns
  current: CheckInView | null
  onDone: () => void
  onCancel?: () => void
}) {
  const send = useSendCheckIn()
  const toast = useToast()
  const steps: Step[] = data.photosEnabled ? ['weight', 'photos', 'note'] : ['weight', 'note']
  const [step, setStep] = useState<Step>('weight')
  const last = data.history.find((c) => c.id !== current?.id)
  const [weight, setWeight] = useState(current ? String(current.weightKg) : '')
  const [showMore, setShowMore] = useState(
    Boolean(current && (current.bodyFatPct ?? MEASUREMENTS.some((m) => current[m]))),
  )
  const [bodyFat, setBodyFat] = useState(current?.bodyFatPct ? String(current.bodyFatPct) : '')
  const [measures, setMeasures] = useState<Record<Measurement, string>>(
    () =>
      Object.fromEntries(MEASUREMENTS.map((m) => [m, current?.[m] ? String(current[m]) : ''])) as Record<
        Measurement,
        string
      >,
  )
  const [photos, setPhotos] = useState<Partial<Record<CheckInPose, Blob>>>({})
  const [note, setNote] = useState(current?.note ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const index = steps.indexOf(step)

  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const next = () => {
    if (step === 'weight') {
      const w = Number(weight)
      if (!(w >= 25 && w <= 300)) return setProblem('Enter your weight in kg, e.g. 72.5')
      const bad = [bodyFat, ...Object.values(measures)].some((v) => v.trim() !== '' && !(Number(v) > 0))
      if (bad) return setProblem('Measurements are numbers, e.g. 84')
    }
    setProblem(null)
    setStep(steps[index + 1] as Step)
  }
  const submit = () =>
    send.mutate(
      {
        input: {
          weightKg: Number(weight),
          bodyFatPct: num(bodyFat),
          ...(Object.fromEntries(MEASUREMENTS.map((m) => [m, num(measures[m])])) as Record<Measurement, number | null>),
          note,
        },
        photos,
      },
      {
        onSuccess: () => {
          toast('Check-in sent')
          onDone()
        },
      },
    )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-muted">
        Step {index + 1} of {steps.length}
      </p>

      {step === 'weight' && (
        <>
          <Field label="Your weight this morning (kg)" hint={last && `Last check-in: ${last.weightKg} kg`}>
            {(id) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="72.5"
                className="text-2xl font-bold"
              />
            )}
          </Field>
          {!showMore ? (
            <Button variant="ghost" onClick={() => setShowMore(true)}>
              Add body fat and measurements
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Body fat (%)">
                {(id) => (
                  <TextInput id={id} inputMode="decimal" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
                )}
              </Field>
              {MEASUREMENTS.map((m) => (
                <Field key={m} label={`${MEASUREMENT_LABELS[m]} (cm)`}>
                  {(id) => (
                    <TextInput
                      id={id}
                      inputMode="decimal"
                      value={measures[m]}
                      onChange={(e) => setMeasures({ ...measures, [m]: e.target.value })}
                    />
                  )}
                </Field>
              ))}
            </div>
          )}
        </>
      )}

      {step === 'photos' && (
        <>
          <p className="text-sm text-muted">
            Same place and light each week, in the morning before eating: front, then each side.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {CHECK_IN_POSES.map((pose) => (
              <PhotoTile
                key={pose}
                pose={pose}
                file={photos[pose]}
                existing={current?.photos[pose]}
                onPick={async (file) => {
                  const blob = await resizePhoto(file)
                  setPhotos((p) => ({ ...p, [pose]: blob }))
                }}
              />
            ))}
          </div>
        </>
      )}

      {step === 'note' && (
        <Field label="How was your week? (optional)">
          {(id) => (
            <TextArea
              id={id}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Energy, hunger, sleep, anything that was hard"
            />
          )}
        </Field>
      )}

      <ErrorText>{problem ?? errorMessage(send.error)}</ErrorText>
      <div className="flex gap-3">
        {index > 0 ? (
          <Button variant="secondary" onClick={() => setStep(steps[index - 1] as Step)}>
            Back
          </Button>
        ) : (
          onCancel && (
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )
        )}
        {step === 'note' ? (
          <Button loading={send.isPending} onClick={submit}>
            Send check-in
          </Button>
        ) : (
          <Button onClick={next}>
            {step === 'photos' && !Object.keys(photos).length && !current?.photos.front ? 'Skip photos' : 'Next'}
          </Button>
        )}
      </div>
    </div>
  )
}

/** One photo slot: tap to take or choose a photo; shows the new one (or this week's earlier one). */
function PhotoTile({
  pose,
  file,
  existing,
  onPick,
}: {
  pose: CheckInPose
  file?: Blob
  existing?: string
  onPick: (file: File) => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const src = preview ?? existing

  return (
    <label className="flex cursor-pointer flex-col gap-1 text-center">
      <span className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line/70">
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <Camera aria-hidden="true" size={24} className="text-muted" />
        )}
      </span>
      <span className="text-sm font-semibold">{POSE_LABELS[pose]}</span>
      <input
        type="file"
        accept="image/*"
        aria-label={`${src ? 'Change' : 'Add'} ${POSE_LABELS[pose].toLowerCase()} photo`}
        className="sr-only"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) onPick(picked)
          e.target.value = ''
        }}
      />
    </label>
  )
}
