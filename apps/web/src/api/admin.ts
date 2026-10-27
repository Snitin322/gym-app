import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  DeskPaymentMethod,
  GymDetails,
  IsoDate,
  MemberDetail,
  MemberFilter,
  MemberSummary,
  MembershipPlan,
  MembershipView,
  MyMembership,
  PlanInput,
  UserSummary,
} from '@onthec/shared'
import { api } from './client'

export const queryKeys = {
  plans: ['plans'] as const,
  members: (filter: MemberFilter, q: string) => ['members', filter, q] as const,
  member: (id: string) => ['member', id] as const,
  myMembership: ['me', 'membership'] as const,
  staff: ['staff'] as const,
  gym: ['gym'] as const,
}

// --- Plans -----------------------------------------------------------------

export function usePlans() {
  return useQuery({ queryKey: queryKeys.plans, queryFn: () => api<MembershipPlan[]>('/plans') })
}

export function useSavePlan() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<PlanInput> & { id?: string; active?: boolean }) =>
      id
        ? api<MembershipPlan>(`/plans/${id}`, { method: 'PATCH', body: input })
        : api<MembershipPlan>('/plans', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.plans }),
  })
}

// --- Members ---------------------------------------------------------------

export function useMembers(filter: MemberFilter, q: string) {
  const params = new URLSearchParams({ filter, ...(q ? { q } : {}) })
  return useQuery({
    queryKey: queryKeys.members(filter, q),
    queryFn: () => api<MemberSummary[]>(`/members?${params}`),
    placeholderData: (previous) => previous,
  })
}

export function useMember(id: string) {
  return useQuery({ queryKey: queryKeys.member(id), queryFn: () => api<MemberDetail>(`/members/${id}`) })
}

/** A membership sale: plan, start, optional discount, and the desk payment (omit for "pay later"). */
export interface SaleInput {
  planId: string
  startDate?: IsoDate
  pricePaise?: number
  discountReason?: string
  payment?: { method: DeskPaymentMethod; reference?: string }
}

export interface NewMemberInput {
  name: string
  phone: string
  joinedOn?: IsoDate
  emergencyContactName?: string
  emergencyContactPhone?: string
  notes?: string
  firstMembership?: SaleInput
}

export function useCreateMember() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: NewMemberInput) => api<MemberDetail>('/members', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['members'] }),
  })
}

/** Any change to one member: refresh their page and every members list. */
function useMemberMutation<TInput>(memberId: string, request: (input: TInput) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.member(memberId) }),
        client.invalidateQueries({ queryKey: ['members'] }),
      ])
    },
  })
}

export function useUpdateMember(memberId: string) {
  return useMemberMutation(memberId, (input: Partial<Omit<NewMemberInput, 'firstMembership'>>) =>
    api<MemberDetail>(`/members/${memberId}`, { method: 'PATCH', body: input }),
  )
}

export function useAddMembership(memberId: string) {
  return useMemberMutation(memberId, (input: SaleInput) =>
    api<MembershipView>(`/members/${memberId}/memberships`, { method: 'POST', body: input }),
  )
}

export function useRecordPayment(memberId: string) {
  return useMemberMutation(
    memberId,
    ({
      membershipId,
      ...input
    }: {
      membershipId: string
      amountPaise: number
      method: DeskPaymentMethod
      reference?: string
      note?: string
    }) => api<MembershipView>(`/memberships/${membershipId}/payments`, { method: 'POST', body: input }),
  )
}

/** Issues the invoice for an older payment that doesn't have one yet. */
export function useCreateInvoice(memberId: string) {
  return useMemberMutation(memberId, (paymentId: string) =>
    api<{ id: string; number: string }>(`/payments/${paymentId}/invoice`, { method: 'POST' }),
  )
}

// --- Gym details -------------------------------------------------------------

export function useGymDetails() {
  return useQuery({ queryKey: queryKeys.gym, queryFn: () => api<GymDetails>('/gym') })
}

export function useSaveGymDetails() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Record<keyof GymDetails, string>>) =>
      api<GymDetails>('/gym', { method: 'PATCH', body: input }),
    onSuccess: (gym) => client.setQueryData(queryKeys.gym, gym),
  })
}

export function useFreeze(memberId: string) {
  return useMemberMutation(
    memberId,
    ({ membershipId, ...input }: { membershipId: string; fromDate: IsoDate; toDate: IsoDate; reason?: string }) =>
      api<MembershipView>(`/memberships/${membershipId}/freeze`, { method: 'POST', body: input }),
  )
}

export function useUnfreeze(memberId: string) {
  return useMemberMutation(memberId, (membershipId: string) =>
    api<MembershipView>(`/memberships/${membershipId}/unfreeze`, { method: 'POST' }),
  )
}

export function useCancelMembership(memberId: string) {
  return useMemberMutation(memberId, ({ membershipId, reason }: { membershipId: string; reason?: string }) =>
    api<MembershipView>(`/memberships/${membershipId}/cancel`, { method: 'POST', body: { reason } }),
  )
}

// --- Staff ---------------------------------------------------------------------

export function useStaff() {
  return useQuery({ queryKey: queryKeys.staff, queryFn: () => api<UserSummary[]>('/users?kind=staff') })
}

export function useAddStaff() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; phone: string; role: 'trainer' | 'admin' }) =>
      api<UserSummary>('/users', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.staff }),
  })
}

// --- Member's own view -------------------------------------------------------

export function useMyMembership() {
  return useQuery({ queryKey: queryKeys.myMembership, queryFn: () => api<MyMembership>('/me/membership') })
}
