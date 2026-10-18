import { useEffect, useMemo, useState } from 'react'
import { searchFoods, toFoodRef } from '../lib/ingredients'
import type { FoodRef } from '../lib/types'
import Icon from './Icon'

interface Props {
  initialQuery: string
  onPick: (food: FoodRef | null) => void
  onClose: () => void
}

type OffItem = Omit<FoodRef, 'source'>

export default function FoodPicker({ initialQuery, onPick, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [off, setOff] = useState<OffItem[] | null>(null)
  const [offState, setOffState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [manual, setManual] = useState(false)
  const [custom, setCustom] = useState({ name: initialQuery, kcal: '', protein: '', fat: '', carbs: '' })

  const local = useMemo(() => searchFoods(query, 8), [query])

  useEffect(() => {
    setOff(null)
    setOffState('idle')
  }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function searchOff() {
    setOffState('loading')
    try {
      const res = await fetch(`/api/food?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOff(data.items)
      setOffState('idle')
    } catch {
      setOffState('error')
    }
  }

  function saveCustom() {
    const num = (s: string) => Math.max(0, parseFloat(s.replace(',', '.')) || 0)
    onPick({
      id: `manual:${Date.now()}`,
      name: custom.name.trim() || query,
      kcal: num(custom.kcal),
      protein: num(custom.protein),
      fat: num(custom.fat),
      carbs: num(custom.carbs),
      source: 'manual',
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Wybierz produkt" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Wybierz produkt</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Zamknij">
            <Icon name="x" />
          </button>
        </div>

        {!manual ? (
          <>
            <label className="search">
              <Icon name="search" size={18} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="np. mąka pszenna" />
            </label>

            <ul className="pick-list">
              {local.map((f) => (
                <li key={f.id}>
                  <button onClick={() => onPick(toFoodRef(f))}>
                    <strong>{f.name}</strong>
                    <small>
                      {f.kcal} kcal · B {f.protein} · T {f.fat} · W {f.carbs} <em>/100 g</em>
                    </small>
                  </button>
                </li>
              ))}
              {local.length === 0 && <li className="muted small">Brak w wbudowanej bazie.</li>}
            </ul>

            <div className="pick-section">
              <div className="pick-section-head">
                <span>Open Food Facts</span>
                {off === null && (
                  <button className="btn small" onClick={searchOff} disabled={offState === 'loading' || !query.trim()}>
                    {offState === 'loading' ? 'Szukam…' : 'Szukaj w bazie produktów'}
                  </button>
                )}
              </div>
              {offState === 'error' && <p className="small error-text">Baza nie odpowiada – spróbuj za chwilę.</p>}
              {off && (
                <ul className="pick-list">
                  {off.map((f) => (
                    <li key={f.id}>
                      <button onClick={() => onPick({ ...f, source: 'off' })}>
                        <strong>{f.name}</strong>
                        <small>
                          {f.kcal} kcal · B {f.protein} · T {f.fat} · W {f.carbs} <em>/100 g</em>
                        </small>
                      </button>
                    </li>
                  ))}
                  {off.length === 0 && <li className="muted small">Nic nie znaleziono.</li>}
                </ul>
              )}
            </div>

            <div className="modal-foot">
              <button className="btn ghost" onClick={() => onPick(null)}>
                Nie licz tego składnika
              </button>
              <button className="btn" onClick={() => setManual(true)}>
                <Icon name="pen" size={16} /> Wpisz wartości ręcznie
              </button>
            </div>
          </>
        ) : (
          <div className="form-grid">
            <label className="field full">
              <span>Nazwa</span>
              <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            </label>
            <p className="hint full">Wartości na 100 g – znajdziesz je na etykiecie produktu.</p>
            {(
              [
                ['kcal', 'Kalorie (kcal)'],
                ['protein', 'Białko (g)'],
                ['fat', 'Tłuszcz (g)'],
                ['carbs', 'Węglowodany (g)'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="field">
                <span>{label}</span>
                <input inputMode="decimal" value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} />
              </label>
            ))}
            <div className="modal-foot full">
              <button className="btn ghost" onClick={() => setManual(false)}>
                Wróć
              </button>
              <button className="btn primary" onClick={saveCustom} disabled={!custom.kcal}>
                Zapisz produkt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
