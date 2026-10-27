import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  IsoDate,
  MemberDetail,
  MemberFilter,
  MemberSummary,
  MembershipPlan,
  MembershipView,
  MyMembership,
  PlanInput,
} from '@onthec/shared'
import { api } from './client'

export const queryKeys = {
  plans: ['plans'] as const,
  members: (filter: MemberFilter, q: string) => ['members', filter, q] as const,
  member: (id: string) => ['member', id] as const,
  myMembership: ['me', 'membership'] as const,
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

export interface NewMemberInput {
  name: string
  phone: string
  joinedOn?: IsoDate
  emergencyContactName?: string
  emergencyContactPhone?: string
  notes?: string
  firstMembership?: { planId: string; startDate?: IsoDate }
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
  return useMemberMutation(memberId, (input: { planId: string; startDate?: IsoDate }) =>
    api<MembershipView>(`/members/${memberId}/memberships`, { method: 'POST', body: input }),
  )
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

// --- Member's own view -------------------------------------------------------

export function useMyMembership() {
  return useQuery({ queryKey: queryKeys.myMembership, queryFn: () => api<MyMembership>('/me/membership') })
}
