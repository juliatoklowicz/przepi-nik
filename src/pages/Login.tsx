import { useState } from 'react'
import { supabase } from '../lib/store'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data, error } =
      mode === 'login'
        ? await supabase!.auth.signInWithPassword({ email, password })
        : await supabase!.auth.signUp({ email, password })
    setBusy(false)
    if (error) {
      const text = /invalid login/i.test(error.message)
        ? 'Nieprawidłowy e-mail lub hasło.'
        : /already registered/i.test(error.message)
          ? 'To konto już istnieje – zaloguj się.'
          : /password/i.test(error.message)
            ? 'Hasło musi mieć co najmniej 6 znaków.'
            : error.message
      setMsg({ text, error: true })
    } else if (mode === 'signup' && !data.session) {
      setMsg({ text: 'Konto utworzone. Sprawdź skrzynkę e-mail i kliknij link potwierdzający, a potem się zaloguj.' })
      setMode('login')
    }
  }

  return (
    <div className="page login">
      <div className="login-card">
        <div className="login-emoji" aria-hidden="true">
          📖
        </div>
        <h1 className="brand">Przepiśnik</h1>
        <p className="muted">Twoje przepisy na każdym urządzeniu.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>E-mail</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Hasło</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {msg && <p className={`notice ${msg.error ? 'error' : ''}`}>{msg.text}</p>}
          <button className="btn primary block" disabled={busy}>
            {busy ? 'Chwileczkę…' : mode === 'login' ? 'Zaloguj się' : 'Załóż konto'}
          </button>
        </form>
        <button className="link-btn" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Nie masz konta? Załóż je' : 'Masz już konto? Zaloguj się'}
        </button>
      </div>
    </div>
  )
}
