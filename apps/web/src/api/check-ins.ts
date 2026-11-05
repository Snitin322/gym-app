import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CheckInInput,
  CheckInPose,
  CheckInToReview,
  CheckInView,
  MemberCheckIns,
  MyCheckIns,
} from '@onthec/shared'
import { api } from './client'

export const checkInKeys = {
  mine: ['me', 'check-ins'] as const,
  member: (memberId: string) => ['member-check-ins', memberId] as const,
  toReview: ['coach', 'check-ins'] as const,
}

export function useMyCheckIns() {
  return useQuery({ queryKey: checkInKeys.mine, queryFn: () => api<MyCheckIns>('/me/check-ins') })
}

/** Sends this week's numbers, then each new photo (already resized), one at a time. */
export function useSendCheckIn() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ input, photos }: { input: CheckInInput; photos: Partial<Record<CheckInPose, Blob>> }) => {
      let saved = await api<CheckInView>('/me/check-ins/current', { method: 'PUT', body: input })
      for (const [pose, file] of Object.entries(photos)) {
        saved = await api<CheckInView>(`/me/check-ins/${saved.id}/photos/${pose}`, { method: 'PUT', file })
      }
      return saved
    },
    onSettled: () => client.invalidateQueries({ queryKey: checkInKeys.mine }),
  })
}

export function useMemberCheckIns(memberId: string) {
  return useQuery({
    queryKey: checkInKeys.member(memberId),
    queryFn: () => api<MemberCheckIns>(`/members/${memberId}/check-ins`),
  })
}

export function useCheckInsToReview(enabled = true) {
  return useQuery({
    queryKey: checkInKeys.toReview,
    queryFn: () => api<CheckInToReview[]>('/coach/check-ins'),
    enabled,
  })
}

export function useReviewCheckIn(memberId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) =>
      api<CheckInView>(`/check-ins/${id}/review`, { method: 'POST', body: { reply } }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: checkInKeys.member(memberId) }),
        client.invalidateQueries({ queryKey: checkInKeys.toReview }),
      ]),
  })
}
