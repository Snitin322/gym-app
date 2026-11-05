/** "−0.8 kg", "+1.2 kg", "no change" */
export function changeLabel(now: number, before: number | null | undefined, unit: string) {
  if (before === null || before === undefined) return null
  const diff = Math.round((now - before) * 10) / 10
  if (diff === 0) return 'no change'
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} ${unit}`
}
