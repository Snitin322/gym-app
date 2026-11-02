import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleCheck } from 'lucide-react'
import { ToastContext } from './toast-context'

const SHOW_MS = 2500

/** Short confirmations ("Payment saved") that appear above the tab bar and fade away. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null)
  const show = useCallback((text: string) => setMessage({ text, id: Date.now() }), [])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), SHOW_MS)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          {message && (
            <p
              key={message.id}
              role="status"
              className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-bg shadow-lg animate-[fade-in_150ms_ease-out]"
            >
              <CircleCheck aria-hidden="true" size={18} />
              {message.text}
            </p>
          )}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
