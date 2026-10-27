import { describe, expect, it } from 'vitest'
import { isValidGstin, stateName } from './gst'
import { gymDetailsSchema } from './payments'

describe('isValidGstin', () => {
  it('accepts GSTINs with a correct check digit, in any case', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true)
    expect(isValidGstin('29AAGCB7383J1Z4')).toBe(true)
    expect(isValidGstin(' 27aapfu0939f1zv ')).toBe(true)
  })

  it('rejects typos, wrong length and bad format', () => {
    expect(isValidGstin('27AAPFU0939F1ZW')).toBe(false) // last character changed
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false)
    expect(isValidGstin('2AAAPFU0939F1ZV')).toBe(false)
    expect(isValidGstin('')).toBe(false)
  })
})

describe('gymDetailsSchema', () => {
  it('normalises the GSTIN and prefix, and clears emptied fields', () => {
    const parsed = gymDetailsSchema.parse({ gstin: '27aapfu0939f1zv', stateCode: '27', invoicePrefix: 'og', email: '' })
    expect(parsed).toMatchObject({ gstin: '27AAPFU0939F1ZV', invoicePrefix: 'OG', email: null })
  })

  it('rejects a GSTIN from another state and a long prefix', () => {
    expect(gymDetailsSchema.safeParse({ gstin: '27AAPFU0939F1ZV', stateCode: '29' }).success).toBe(false)
    expect(gymDetailsSchema.safeParse({ invoicePrefix: 'ONTHEC' }).success).toBe(false)
  })

  it('names states by GST code', () => {
    expect(stateName('27')).toBe('Maharashtra')
    expect(stateName('99')).toBeNull()
  })
})
