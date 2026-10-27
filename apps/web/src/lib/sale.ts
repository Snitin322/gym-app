import { formatPaise, rupeesToPaise, type DeskPaymentMethod, type MembershipPlan } from '@onthec/shared'
import type { SaleInput } from '../api/admin'
import { paiseToRupeesInput } from './format'

export type PayChoice = DeskPaymentMethod | 'later'

export interface SaleState {
  price: string
  discountReason: string
  method: PayChoice
  reference: string
}

export function initialSale(plan?: Pick<MembershipPlan, 'pricePaise'>): SaleState {
  return { price: plan ? paiseToRupeesInput(plan.pricePaise) : '', discountReason: '', method: 'cash', reference: '' }
}

/** Turns the form into the API's sale fields, or explains what's wrong. */
export function saleToInput(
  plan: Pick<MembershipPlan, 'pricePaise'>,
  sale: SaleState,
): { error: string } | { input: Omit<SaleInput, 'planId' | 'startDate'> } {
  const price = rupeesToPaise(sale.price)
  if (price === null) return { error: 'Enter a valid price' }
  if (price > plan.pricePaise) return { error: `The price can't be more than the plan price (${formatPaise(plan.pricePaise)})` }
  const discounted = price < plan.pricePaise
  if (discounted && !sale.discountReason.trim()) return { error: 'Give a reason for the discount' }
  return {
    input: {
      ...(discounted ? { pricePaise: price, discountReason: sale.discountReason.trim() } : {}),
      ...(sale.method === 'later' || price === 0
        ? {}
        : { payment: { method: sale.method, reference: sale.reference.trim() || undefined } }),
    },
  }
}
