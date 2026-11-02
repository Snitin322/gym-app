import { useSearchParams } from 'react-router'

/** The selected segment, kept in the address (?view=…) so Back returns to it. */
export function useView<T extends string>(values: readonly T[], fallback: T): [T, (value: T) => void] {
  const [params, setParams] = useSearchParams()
  const current = params.get('view') as T | null
  const value = current && values.includes(current) ? current : fallback
  const set = (next: T) =>
    setParams(
      (p) => {
        const copy = new URLSearchParams(p)
        if (next === fallback) copy.delete('view')
        else copy.set('view', next)
        return copy
      },
      { replace: true },
    )
  return [value, set]
}
