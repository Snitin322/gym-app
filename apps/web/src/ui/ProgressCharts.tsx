import { useId, useState } from 'react'
import {
  MEASUREMENTS,
  MEASUREMENT_LABELS,
  addDays,
  progressSeries,
  todayInIndia,
  type CheckInView,
  type ProgressMetric,
  type ProgressPoint,
  type TrainingProgress,
} from '@onthec/shared'
import { formatDate } from '../lib/format'
import { changeLabel } from '../lib/progress'
import { Segmented } from './Segmented'

const RANGES = [
  { value: '1m', label: '1M', days: 31 },
  { value: '3m', label: '3M', days: 92 },
  { value: '6m', label: '6M', days: 183 },
  { value: 'all', label: 'All', days: Infinity },
] as const
type Range = (typeof RANGES)[number]['value']

const METRICS: { metric: ProgressMetric; label: string; unit: string }[] = [
  { metric: 'weightKg', label: 'Body weight', unit: 'kg' },
  { metric: 'bodyFatPct', label: 'Body fat', unit: '%' },
  ...MEASUREMENTS.map((m) => ({ metric: m, label: MEASUREMENT_LABELS[m], unit: 'cm' })),
]

/** One graph: a body measurement (olive) or a lift's heaviest set each week (orange). */
interface Series {
  key: string
  label: string
  unit: string
  tone: 'body' | 'strength'
  points: ProgressPoint[]
}

const COLOR = { body: 'var(--color-accent)', strength: 'var(--color-strength)' } as const
const TEXT = { body: 'text-accent', strength: 'text-[var(--color-strength)]' } as const

function allSeries(checkIns: CheckInView[], training?: TrainingProgress): Series[] {
  const body = METRICS.map((m) => ({
    key: m.metric,
    label: m.label,
    unit: m.unit,
    tone: 'body' as const,
    points: progressSeries(checkIns, m.metric),
  }))
  const lifts = (training?.lifts ?? []).map((l) => ({
    key: `lift:${l.exerciseId}`,
    label: l.name,
    unit: 'kg',
    tone: 'strength' as const,
    points: l.points.map((p) => ({ date: p.date, value: p.weightKg })),
  }))
  return [...body, ...lifts].filter((x) => x.points.length > 0)
}

/**
 * Progress at a glance, in the style of Apple Health: one large graph (body weight first) with a
 * time range, then small cards with a trend line for every other measurement and for the member's
 * main lifts (heaviest set each week), and their workouts per week. Tapping a card makes it the
 * large graph.
 */
export function ProgressCharts({ checkIns, training }: { checkIns: CheckInView[]; training?: TrainingProgress }) {
  const [selected, setSelected] = useState<string>('weightKg')
  const [range, setRange] = useState<Range>('3m')
  const available = allSeries(checkIns, training)
  const hero = available.find((x) => x.key === selected) ?? available[0]
  const showWorkouts = Boolean(training && (training.plannedPerWeek || training.weeks.some((w) => w.done > 0)))
  if (!hero && !showWorkouts) return null

  return (
    <div className="flex flex-col gap-3">
      {hero && <HeroGraph series={hero} range={range} onRange={setRange} />}
      <div className="grid grid-cols-2 gap-3">
        {showWorkouts && training && <WorkoutsCard training={training} />}
        {available
          .filter((x) => x.key !== hero?.key)
          .map((x) => {
            const last = x.points[x.points.length - 1] as ProgressPoint
            const diff = changeLabel(last.value, x.points[0]?.value, x.unit)
            return (
              <button
                key={x.key}
                type="button"
                onClick={() => setSelected(x.key)}
                aria-label={`Show ${x.label.toLowerCase()} graph`}
                className="min-w-0 rounded-2xl bg-surface p-3 text-left ring-1 ring-line/70 hover:bg-surface-2"
              >
                <span className="block truncate text-sm text-muted">{x.label}</span>
                <span className="block text-xl font-bold">
                  {last.value} <span className="text-sm font-semibold text-muted">{x.unit}</span>
                </span>
                {x.points.length > 1 && diff && (
                  <span className={`block text-xs font-semibold ${TEXT[x.tone]}`}>{diff}</span>
                )}
                <Sparkline points={x.points} color={COLOR[x.tone]} />
              </button>
            )
          })}
      </div>
    </div>
  )
}

function HeroGraph({ series, range, onRange }: { series: Series; range: Range; onRange: (r: Range) => void }) {
  const days = RANGES.find((r) => r.value === range)?.days ?? Infinity
  const from = Number.isFinite(days) ? addDays(todayInIndia(), -days) : ''
  const points = series.points.filter((p) => p.date >= from)
  const shown = points.length > 0 ? points : series.points.slice(-1)
  const latest = shown[shown.length - 1] as ProgressPoint
  const first = shown[0] as ProgressPoint
  const change = changeLabel(latest.value, first.value, series.unit)
  const strength = series.tone === 'strength'

  return (
    <section aria-label={series.label} className="rounded-2xl bg-surface p-4 ring-1 ring-line/70">
      <p className="text-sm font-semibold text-muted">
        {series.label}
        {strength && ' · heaviest set'}
      </p>
      <p className="text-3xl font-extrabold tracking-tight">
        {latest.value} <span className="text-base font-semibold text-muted">{series.unit}</span>
      </p>
      <p className={`text-sm font-semibold ${TEXT[series.tone]}`}>
        {shown.length > 1 && change
          ? `${change} since ${formatDate(first.date, { short: true })}`
          : strength
            ? 'Your first week with a weight'
            : 'Your first check-in'}
      </p>
      <LineChart points={shown} label={`${series.label} over time`} color={COLOR[series.tone]} />
      <Segmented
        label="Time range"
        value={range}
        onChange={onRange}
        options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
      />
    </section>
  )
}

/** Workouts ticked off this week (of the plan's training days), with bars for the last weeks. */
function WorkoutsCard({ training }: { training: TrainingProgress }) {
  const thisWeek = training.weeks[training.weeks.length - 1]
  const planned = training.plannedPerWeek
  const top = Math.max(planned ?? 0, ...training.weeks.map((w) => w.done), 1)
  return (
    <section aria-label="Workouts" className="col-span-2 rounded-2xl bg-surface p-3 ring-1 ring-line/70">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted">Workouts this week</span>
        <span className="text-xs text-muted">Last {training.weeks.length} weeks</span>
      </div>
      <p className="text-xl font-bold">
        {thisWeek?.done ?? 0}
        {planned ? <span className="text-sm font-semibold text-muted"> of {planned}</span> : null}
      </p>
      <div className="mt-2 flex h-12 items-end gap-1.5" aria-hidden="true">
        {training.weeks.map((w, i) => (
          <span
            key={w.weekOf}
            className="flex-1 rounded-t-md"
            style={{
              height: `${Math.max(6, (w.done / top) * 100)}%`,
              background: w.done ? 'var(--color-strength)' : 'var(--color-line)',
              opacity: i === training.weeks.length - 1 ? 1 : 0.6,
            }}
          />
        ))}
      </div>
    </section>
  )
}

const W = 320
const H = 150
const PAD = { top: 12, right: 34, bottom: 22, left: 6 }

/** Nice round y-axis limits around the values, with some room above and below. */
function yRange(values: number[]) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 1)
  return { low: Math.floor(min - span * 0.25), high: Math.ceil(max + span * 0.25) }
}

function LineChart({ points, label, color }: { points: ProgressPoint[]; label: string; color: string }) {
  const fill = useId()
  const { low, high } = yRange(points.map((p) => p.value))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => PAD.top + (1 - (v - low) / (high - low)) * innerH
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const ticks = [high, Math.round(((high + low) / 2) * 10) / 10, low]
  const first = points[0] as ProgressPoint
  const last = points[points.length - 1] as ProgressPoint

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="my-2 w-full">
      <title>{`${label}: ${points.map((p) => `${formatDate(p.date, { short: true })} ${p.value}`).join(', ')}`}</title>
      <defs>
        <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={W - PAD.right + 4} y={y(t) + 4} fontSize="11" fill="var(--color-muted)">
            {t}
          </text>
        </g>
      ))}
      {points.length > 1 && (
        <>
          <polygon
            points={`${x(0)},${PAD.top + innerH} ${line} ${x(points.length - 1)},${PAD.top + innerH}`}
            fill={`url(#${fill})`}
          />
          <polyline
            points={line}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      {points.length <= 20 &&
        points.map((p, i) => <circle key={p.date} cx={x(i)} cy={y(p.value)} r="3" fill={color} />)}
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="5.5" fill={color} />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="2.5" fill="var(--color-surface)" />
      <text x={PAD.left} y={H - 4} fontSize="11" fill="var(--color-muted)">
        {formatDate(first.date, { short: true })}
      </text>
      {points.length > 1 && (
        <text x={W - PAD.right} y={H - 4} fontSize="11" fill="var(--color-muted)" textAnchor="end">
          {formatDate(last.date, { short: true })}
        </text>
      )}
    </svg>
  )
}

function Sparkline({ points, color }: { points: ProgressPoint[]; color: string }) {
  if (points.length < 2) return <span className="mt-2 block h-7" />
  const { low, high } = yRange(points.map((p) => p.value))
  const line = points
    .map(
      (p, i) =>
        `${((i / (points.length - 1)) * 96 + 2).toFixed(1)},${(26 - ((p.value - low) / (high - low)) * 22).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg viewBox="0 0 100 28" aria-hidden="true" className="mt-2 h-7 w-full">
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
