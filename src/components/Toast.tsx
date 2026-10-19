import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface ToastData {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

type Show = (text: string, action?: ToastData['action']) => void

const ToastContext = createContext<Show>(() => {})

/** Krótki komunikat na dole ekranu, opcjonalnie z „Cofnij”. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null)
  const timer = useRef<number>(undefined)

  const show = useCallback<Show>((text, action) => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), text, action })
    timer.current = window.setTimeout(() => setToast(null), action ? 6000 : 3000)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.text}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.run()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
