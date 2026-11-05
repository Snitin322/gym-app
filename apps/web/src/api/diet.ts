import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  DietPlanInput,
  DietPlanSummary,
  DietPlanView,
  Food,
  FoodInput,
  MemberDietPlan,
  MyDietPlan,
} from '@onthec/shared'
import { api } from './client'

export const dietKeys = {
  foods: ['foods'] as const,
  templates: ['diet-templates'] as const,
  template: (id: string) => ['diet-templates', id] as const,
  memberPlan: (memberId: string) => ['member-diet-plan', memberId] as const,
  myPlan: ['me', 'diet-plan'] as const,
}

// --- Food list -------------------------------------------------------------------------

/** All foods, including deactivated ones (shown greyed out; they stay readable in plans). */
export function useFoods() {
  return useQuery({ queryKey: dietKeys.foods, queryFn: () => api<Food[]>('/foods?all=1') })
}

export function useSaveFood() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: FoodInput & { id?: string; active?: boolean }) =>
      id
        ? api<Food>(`/foods/${id}`, { method: 'PUT', body: { ...input, active: input.active ?? true } })
        : api<Food>('/foods', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: dietKeys.foods }),
  })
}

export function useAddStarterFoods() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api<Food[]>('/foods/starter', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: dietKeys.foods }),
  })
}

// --- Templates -------------------------------------------------------------------------

export function useDietTemplates() {
  return useQuery({ queryKey: dietKeys.templates, queryFn: () => api<DietPlanSummary[]>('/diet-templates') })
}

export function useDietTemplate(id: string | undefined) {
  return useQuery({
    queryKey: dietKeys.template(id ?? ''),
    queryFn: () => api<DietPlanView>(`/diet-templates/${id}`),
    enabled: Boolean(id),
  })
}

/** Creates a template (no id) or saves a new version of one (id + the version the editor started from). */
export function useSaveDietTemplate() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: DietPlanInput & { id?: string; version?: number }) =>
      id
        ? api<DietPlanView>(`/diet-templates/${id}`, { method: 'PUT', body: input })
        : api<DietPlanView>('/diet-templates', { method: 'POST', body: input }),
    onSuccess: async (plan) => {
      client.setQueryData(dietKeys.template(plan.id), plan)
      await client.invalidateQueries({ queryKey: dietKeys.templates })
    },
  })
}

export function useDeleteDietTemplate() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/diet-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: dietKeys.templates }),
  })
}

// --- Members' own plans --------------------------------------------------------------

export function useMemberDietPlan(memberId: string) {
  return useQuery({
    queryKey: dietKeys.memberPlan(memberId),
    queryFn: () => api<MemberDietPlan>(`/members/${memberId}/diet-plan`),
  })
}

/** Gives the member a copy of a template (or a blank plan); an existing plan moves to the history. */
export function useStartMemberDietPlan(memberId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string | undefined) =>
      api<MemberDietPlan>(`/members/${memberId}/diet-plan`, { method: 'POST', body: templateId ? { templateId } : {} }),
    onSuccess: (data) => client.setQueryData(dietKeys.memberPlan(memberId), data),
  })
}

export function useSaveMemberDietPlan(memberId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: DietPlanInput & { version: number }) =>
      api<MemberDietPlan>(`/members/${memberId}/diet-plan`, { method: 'PUT', body: input }),
    onSuccess: (data) => client.setQueryData(dietKeys.memberPlan(memberId), data),
  })
}

export function useMyDietPlan() {
  return useQuery({ queryKey: dietKeys.myPlan, queryFn: () => api<MyDietPlan>('/me/diet-plan') })
}
