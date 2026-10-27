/**
 * Money is always integer paise (₹1 = 100 paise). Never use floats for amounts.
 */

/** "4500" / "4,500" / "4500.50" / "₹ 4,500" → paise, or null if invalid. No floating point involved. */
export function rupeesToPaise(input: string): number | null {
  const compact = input.replace(/[₹,\s]/g, '')
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(compact)
  if (!match) return null
  const rupees = Number(match[1])
  const paise = Number((match[2] ?? '').padEnd(2, '0'))
  return rupees * 100 + paise
}

/** 450000 → "₹4,500"; 450050 → "₹4,500.50". Indian digit grouping (₹1,00,000). */
export function formatPaise(paise: number): string {
  const rupees = Math.floor(paise / 100)
  const rest = paise % 100
  const grouped = new Intl.NumberFormat('en-IN').format(rupees)
  return rest === 0 ? `₹${grouped}` : `₹${grouped}.${String(rest).padStart(2, '0')}`
}
