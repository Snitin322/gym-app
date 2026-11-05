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

/**
 * Progress at a glance, in the style of Apple Health: one large graph (body weight first) with a
 * time range, then small cards with a trend line for every other measurement the member records.
 * Tapping a card makes it the large graph.
 */
export function ProgressCharts({ checkIns }: { checkIns: CheckInView[] }) {
  const [metric, setMetric] = useState<ProgressMetric>('weightKg')
  const [range, setRange] = useState<Range>('3m')
  const available = METRICS.filter((m) => progressSeries(checkIns, m.metric).length > 0)
  const hero = available.find((m) => m.metric === metric) ?? available[0]
  if (!hero) return null

  const all = progressSeries(checkIns, hero.metric)
  const days = RANGES.find((r) => r.value === range)?.days ?? Infinity
  const from = Number.isFinite(days) ? addDays(todayInIndia(), -days) : ''
  const points = all.filter((p) => p.date >= from)
  const shown = points.length > 0 ? points : all.slice(-1)
  const latest = shown[shown.length - 1] as ProgressPoint
  const change = changeLabel(latest.value, shown[0]?.value, hero.unit)

  return (
    <div className="flex flex-col gap-3">
      <section aria-label={hero.label} className="rounded-2xl bg-surface p-4 ring-1 ring-line/70">
        <p className="text-sm font-semibold text-muted">{hero.label}</p>
        <p className="text-3xl font-extrabold tracking-tight">
          {latest.value} <span className="text-base font-semibold text-muted">{hero.unit}</span>
        </p>
        <p className="text-sm font-semibold text-accent">
          {shown.length > 1 && change
            ? `${change} since ${formatDate(shown[0]!.date, { short: true })}`
            : 'Your first check-in'}
        </p>
        <LineChart points={shown} label={`${hero.label} over time`} />
        <Segmented
          label="Time range"
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
      </section>
      {available.length > 1 && (
        <div className="grid grid-cols-2 gap-3">
          {available
            .filter((m) => m.metric !== hero.metric)
            .map((m) => {
              const series = progressSeries(checkIns, m.metric)
              const last = series[series.length - 1] as ProgressPoint
              const diff = changeLabel(last.value, series[0]?.value, m.unit)
              return (
                <button
                  key={m.metric}
                  type="button"
                  onClick={() => setMetric(m.metric)}
                  aria-label={`Show ${m.label.toLowerCase()} graph`}
                  className="rounded-2xl bg-surface p-3 text-left ring-1 ring-line/70 hover:bg-surface-2"
                >
                  <span className="block text-sm text-muted">{m.label}</span>
                  <span className="block text-xl font-bold">
                    {last.value} <span className="text-sm font-semibold text-muted">{m.unit}</span>
                  </span>
                  {series.length > 1 && diff && <span className="block text-xs font-semibold text-accent">{diff}</span>}
                  <Sparkline points={series} />
                </button>
              )
            })}
        </div>
      )}
    </div>
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

function LineChart({ points, label }: { points: ProgressPoint[]; label: string }) {
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
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
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
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      {points.length <= 20 &&
        points.map((p, i) => <circle key={p.date} cx={x(i)} cy={y(p.value)} r="3" fill="var(--color-accent)" />)}
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="5.5" fill="var(--color-accent)" />
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

function Sparkline({ points }: { points: ProgressPoint[] }) {
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
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
