import { describe, expect, it } from 'vitest'
import { maskPhone, normalizePhone, phoneSchema } from './phone'

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['(+91) 6123456789', '+916123456789'],
    // A 10-digit number that itself starts with 91 is not mistaken for a country code.
    ['9123456789', '+919123456789'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })

  it.each(['', '12345', '5876543210', '98765432101', '+1 9876543210', 'abcdefghij'])('rejects %j', (input) => {
    expect(normalizePhone(input)).toBeNull()
  })
})

describe('phoneSchema', () => {
  it('outputs E.164 and rejects invalid numbers with a readable message', () => {
    expect(phoneSchema.parse('98765 43210')).toBe('+919876543210')
    expect(phoneSchema.safeParse('123').error?.issues[0]?.message).toMatch(/10-digit Indian mobile/)
  })
})

describe('maskPhone', () => {
  it('keeps only the country code and last four digits', () => {
    expect(maskPhone('+919876543210')).toBe('+91******3210')
  })
})
