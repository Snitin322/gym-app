import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClientProfileInput, ClientProfileView } from '@onthec/shared'
import { queryKeys } from './admin'
import { api } from './client'

export const coachingKeys = {
  profile: (memberId: string) => ['client-profile', memberId] as const,
  myProfile: ['me', 'profile'] as const,
}

/** A client's health profile (their coach or the owner). */
export function useClientProfile(memberId: string) {
  return useQuery({
    queryKey: coachingKeys.profile(memberId),
    queryFn: () => api<ClientProfileView>(`/members/${memberId}/profile`),
  })
}

export function useSaveClientProfile(memberId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: ClientProfileInput) =>
      api<ClientProfileView>(`/members/${memberId}/profile`, { method: 'PUT', body: input }),
    onSuccess: (view) => client.setQueryData(coachingKeys.profile(memberId), view),
  })
}

/** The signed-in member's own health profile. */
export function useMyProfile(enabled = true) {
  return useQuery({
    queryKey: coachingKeys.myProfile,
    queryFn: () => api<ClientProfileView>('/me/profile'),
    enabled,
  })
}

export function useSaveMyProfile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: ClientProfileInput & { healthConsent?: boolean }) =>
      api<ClientProfileView>('/me/profile', { method: 'PUT', body: input }),
    onSuccess: (view) => client.setQueryData(coachingKeys.myProfile, view),
  })
}

export function useWithdrawMyProfile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api<ClientProfileView>('/me/profile', { method: 'DELETE' }),
    onSuccess: (view) => client.setQueryData(coachingKeys.myProfile, view),
  })
}

/** Desk: sets or clears a member's coach. */
export function useSetCoach(memberId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (coachId: string | null) =>
      api<void>(`/members/${memberId}/coach`, { method: 'PUT', body: { coachId } }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.member(memberId) }),
        client.invalidateQueries({ queryKey: ['members'] }),
        client.invalidateQueries({ queryKey: coachingKeys.profile(memberId) }),
      ]),
  })
}
