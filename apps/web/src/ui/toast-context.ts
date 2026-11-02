import { createContext, useContext } from 'react'

export const ToastContext = createContext<(text: string) => void>(() => {})

/** Shows a short confirmation, e.g. toast('Payment saved'). */
export function useToast() {
  return useContext(ToastContext)
}

/** For an action panel: `done('Payment saved')` gives an onSuccess that confirms and closes the panel. */
export function useDoneToast(onDone: () => void) {
  const toast = useToast()
  return (message: string) => () => {
    toast(message)
    onDone()
  }
}
