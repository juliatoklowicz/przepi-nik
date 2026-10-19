import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './store'

interface AuthState {
  session: Session | null
  loading: boolean
  /** Wejście z linku „ustaw nowe hasło” z e-maila. */
  recovery: boolean
}

const AuthContext = createContext<AuthState & { endRecovery: () => void }>({ session: null, loading: false, recovery: false, endRecovery: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: !!supabase, recovery: false })

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setState((s) => ({ ...s, session: data.session, loading: false })))
    const { data } = supabase.auth.onAuthStateChange((event, session) =>
      setState((s) => ({ session, loading: false, recovery: event === 'PASSWORD_RECOVERY' ? true : s.recovery })),
    )
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ ...state, endRecovery: () => setState((s) => ({ ...s, recovery: false })) }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
