import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { useAuth } from '../lib/auth'
import { getAutoTranslate, setAutoTranslate } from '../lib/lang'
import { isCloud, store, supabase } from '../lib/store'
import type { Recipe } from '../lib/types'

export default function Settings() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [translate, setTranslate] = useState(getAutoTranslate)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function exportBackup() {
    const recipes = await store.list()
    const blob = new Blob([JSON.stringify({ app: 'przepisnik', version: 1, recipes }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `przepisnik-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importBackup(file: File | undefined) {
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as { recipes?: Recipe[] }
      if (!Array.isArray(data.recipes)) throw new Error('To nie jest kopia zapasowa Przepiśnika.')
      for (const r of data.recipes) await store.save(r)
      setMsg(`Wczytano ${data.recipes.length} przepisów.`)
    } catch (e) {
      setMsg(`Nie udało się wczytać pliku: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div className="page">
      <header className="top-bar">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Wróć">
          <Icon name="back" />
        </button>
        <h1>Ustawienia</h1>
        <span />
      </header>

      <section className="panel settings-list">
        <label className="switch">
          <input
            type="checkbox"
            checked={translate}
            onChange={(e) => {
              setTranslate(e.target.checked)
              setAutoTranslate(e.target.checked)
            }}
          />
          <span>
            Tłumacz przepisy na polski
            <small>Przepisy w innych językach są tłumaczone automatycznie przy dodawaniu (darmowy tłumacz MyMemory, limit ok. 5000 znaków dziennie).</small>
          </span>
        </label>
      </section>

      <section className="panel settings-list">
        <h2>Konto i dane</h2>
        {isCloud ? (
          <>
            <p>
              Zalogowana jako <strong>{session?.user.email}</strong>. Przepisy są zapisywane w chmurze i widoczne na każdym urządzeniu, na którym się zalogujesz.
            </p>
            <button className="btn" onClick={() => supabase!.auth.signOut()}>
              <Icon name="logout" size={18} /> Wyloguj się
            </button>
          </>
        ) : (
          <p className="notice">
            Tryb lokalny: przepisy są zapisane tylko w tej przeglądarce. Żeby mieć je na telefonie i komputerze, podłącz Supabase (instrukcja w pliku README).
          </p>
        )}
      </section>

      <section className="panel settings-list">
        <h2>Kopia zapasowa</h2>
        <p className="muted">Pobierz wszystkie przepisy do pliku albo wczytaj je z wcześniejszej kopii.</p>
        <div className="row wrap">
          <button className="btn" onClick={exportBackup}>
            <Icon name="download" size={18} /> Pobierz kopię
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Wczytaj kopię
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importBackup(e.target.files?.[0])} />
        </div>
        {msg && <p className="notice">{msg}</p>}
      </section>

      <p className="muted small center">
        Wartości odżywcze są szacunkowe: wbudowana baza składników i Open Food Facts.
      </p>
    </div>
  )
}
