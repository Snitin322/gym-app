import { createContext, useContext } from 'react'

export const ToastContext = createContext<(text: string) => void>(() => {})

/** Shows a short confirmation, e.g. toast('Payment saved'). */
export function useToast() {
  return useContext(ToastContext)
}
