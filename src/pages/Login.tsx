import type { AuthError } from '@supabase/supabase-js'
import { useState } from 'react'
import Icon from '../components/Icon'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/store'

type Msg = { text: string; error?: boolean } | null

function authMessage(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Nieprawidłowy e-mail lub hasło.'
    case 'user_already_exists':
    case 'email_exists':
      return 'To konto już istnieje – zaloguj się.'
    case 'weak_password':
      return 'Hasło jest za słabe. Użyj co najmniej 6 znaków.'
    case 'email_not_confirmed':
      return 'Najpierw potwierdź adres – kliknij link w e-mailu od Przepiśnika.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Za dużo prób naraz. Odczekaj minutę i spróbuj ponownie.'
  }
  if (/invalid login/i.test(error.message)) return 'Nieprawidłowy e-mail lub hasło.'
  if (/already registered/i.test(error.message)) return 'To konto już istnieje – zaloguj się.'
  if (/fetch|network/i.test(error.message)) return 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.'
  return `Nie udało się: ${error.message}`
}

function PasswordField({ value, onChange, autoComplete, label = 'Hasło' }: { value: string; onChange: (v: string) => void; autoComplete: string; label?: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="field">
      <label htmlFor="password">{label}</label>
      <div className="password">
        <input id="password" type={visible ? 'text' : 'password'} autoComplete={autoComplete} required minLength={6} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="icon-btn" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Ukryj hasło' : 'Pokaż hasło'} aria-pressed={visible}>
          <Icon name={visible ? 'eye-off' : 'eye'} />
        </button>
      </div>
    </div>
  )
}

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    if (mode === 'reset') {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      setBusy(false)
      setMsg(error ? { text: authMessage(error), error: true } : { text: 'Link do ustawienia nowego hasła jest w drodze. Sprawdź skrzynkę (także spam).' })
      return
    }
    const { data, error } =
      mode === 'login' ? await supabase!.auth.signInWithPassword({ email, password }) : await supabase!.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMsg({ text: authMessage(error), error: true })
    else if (mode === 'signup' && !data.session) {
      setMsg({ text: 'Konto utworzone. Sprawdź skrzynkę e-mail i kliknij link potwierdzający, a potem się zaloguj.' })
      setMode('login')
    }
  }

  const switchMode = (m: typeof mode) => {
    setMode(m)
    setMsg(null)
  }

  return (
    <main className="page login">
      <div className="login-card">
        <img className="login-mark" src="/favicon.svg" alt="" width={72} height={72} />
        <h1 className="brand">Przepiśnik</h1>
        <p className="muted">Przepisy z TikToka, Instagrama i blogów – z kaloriami, na każdym urządzeniu.</p>
        <form onSubmit={submit}>
          {mode === 'reset' && <p className="hint">Podaj e-mail konta, a wyślemy link do ustawienia nowego hasła.</p>}
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== 'reset' && <PasswordField value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />}
          {msg && (
            <p className={`notice ${msg.error ? 'error' : ''}`} role={msg.error ? 'alert' : 'status'}>
              {msg.text}
            </p>
          )}
          <button className="btn primary block" disabled={busy}>
            {busy ? 'Chwileczkę…' : mode === 'login' ? 'Zaloguj się' : mode === 'signup' ? 'Załóż konto' : 'Wyślij link'}
          </button>
        </form>
        <div className="login-links">
          {mode === 'login' && (
            <button className="link-btn" onClick={() => switchMode('reset')}>
              Nie pamiętasz hasła?
            </button>
          )}
          <button className="link-btn" onClick={() => switchMode(mode === 'signup' ? 'login' : mode === 'reset' ? 'login' : 'signup')}>
            {mode === 'login' ? 'Nie masz konta? Załóż je' : 'Wróć do logowania'}
          </button>
        </div>
      </div>
    </main>
  )
}

/** Ekran po kliknięciu linku resetującego hasło. */
export function NewPassword() {
  const { endRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.auth.updateUser({ password })
    setBusy(false)
    if (error) setMsg({ text: authMessage(error), error: true })
    else endRecovery()
  }

  return (
    <main className="page login">
      <div className="login-card">
        <img className="login-mark" src="/favicon.svg" alt="" width={72} height={72} />
        <h1 className="brand">Nowe hasło</h1>
        <form onSubmit={submit}>
          <PasswordField value={password} onChange={setPassword} autoComplete="new-password" label="Nowe hasło (min. 6 znaków)" />
          {msg && (
            <p className="notice error" role="alert">
              {msg.text}
            </p>
          )}
          <button className="btn primary block" disabled={busy}>
            {busy ? 'Zapisuję…' : 'Ustaw hasło'}
          </button>
        </form>
      </div>
    </main>
  )
}
