import { describe, expect, it } from 'vitest'
import { amountInWords, financialYear, invoiceNumber, splitGst } from './invoices'

describe('splitGst', () => {
  it('splits ₹4,500 into ₹3,813.56 + ₹343.22 + ₹343.22', () => {
    expect(splitGst(450000)).toEqual({ taxablePaise: 381356, cgstPaise: 34322, sgstPaise: 34322, totalPaise: 450000 })
  })

  it('always adds up exactly, and CGST and SGST differ by at most a paisa', () => {
    for (let total = 1; total <= 3_000_00; total += 37) {
      const { taxablePaise, cgstPaise, sgstPaise } = splitGst(total)
      expect(taxablePaise + cgstPaise + sgstPaise).toBe(total)
      expect(sgstPaise - cgstPaise).toBeGreaterThanOrEqual(0)
      expect(sgstPaise - cgstPaise).toBeLessThanOrEqual(1)
      // Taxable value is the closest paisa to total / 1.18.
      expect(Math.abs(taxablePaise - (total * 100) / 118)).toBeLessThanOrEqual(0.5)
    }
  })

  it.each([
    [118, 100, 9, 9],
    [100000, 84746, 7627, 7627],
    [150000, 127119, 11440, 11441],
  ])('%i paise → taxable %i, CGST %i, SGST %i', (total, taxable, cgst, sgst) => {
    expect(splitGst(total)).toMatchObject({ taxablePaise: taxable, cgstPaise: cgst, sgstPaise: sgst })
  })
})

describe('financialYear', () => {
  it('runs April to March', () => {
    expect(financialYear('2026-04-01')).toBe('2026-27')
    expect(financialYear('2027-03-31')).toBe('2026-27')
    expect(financialYear('2027-04-01')).toBe('2027-28')
    expect(financialYear('2099-12-31')).toBe('2099-00')
  })
})

describe('invoiceNumber', () => {
  it('is at most 16 characters with a 5-character prefix', () => {
    expect(invoiceNumber('OG', '2026-27', 42)).toBe('OG/26-27/0042')
    expect(invoiceNumber('ONTHE', '2026-27', 9999)).toHaveLength(16)
  })
})

describe('amountInWords', () => {
  it.each([
    [450000, 'Rupees Four Thousand Five Hundred Only'],
    [450050, 'Rupees Four Thousand Five Hundred and Fifty Paise Only'],
    [100, 'Rupees One Only'],
    [1500000, 'Rupees Fifteen Thousand Only'],
    [12345678_00, 'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only'],
    [11001, 'Rupees One Hundred Ten and One Paise Only'],
  ])('%i paise → %s', (paise, words) => {
    expect(amountInWords(paise)).toBe(words)
  })
})
