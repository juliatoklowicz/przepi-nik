import { useEffect, useMemo, useRef, useState } from 'react'
import { searchFoods, toFoodRef } from '../lib/ingredients'
import type { FoodRef, Ingredient } from '../lib/types'
import { useDialog } from '../lib/useDialog'
import Icon from './Icon'

interface Props {
  ingredient: Ingredient
  onPick: (food: FoodRef | null) => void
  onClose: () => void
}

type OffItem = Omit<FoodRef, 'source'>

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

function Values({ f }: { f: OffItem }) {
  return (
    <small>
      {Math.round(f.kcal)} kcal · białko {fmt(f.protein)} g · tłuszcz {fmt(f.fat)} g · węglowodany {fmt(f.carbs)} g <em>w 100 g</em>
    </small>
  )
}

export default function FoodPicker({ ingredient, onPick, onClose }: Props) {
  const initialQuery = ingredient.food?.name ?? (ingredient.name || ingredient.text)
  const [query, setQuery] = useState(initialQuery)
  const [off, setOff] = useState<OffItem[] | null>(null)
  const [offState, setOffState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [manual, setManual] = useState(false)
  const [custom, setCustom] = useState({ name: initialQuery, kcal: '', protein: '', fat: '', carbs: '' })
  const ref = useRef<HTMLDivElement>(null)
  useDialog(ref, onClose)

  const local = useMemo(() => searchFoods(query, 8), [query])

  // Gdy wbudowana baza nic nie zna, od razu pytamy Open Food Facts (z małym opóźnieniem przy pisaniu).
  useEffect(() => {
    setOff(null)
    setOffState('idle')
    const q = query.trim()
    if (local.length > 0 || q.length < 3) return
    const ctrl = new AbortController()
    const t = window.setTimeout(() => void searchOff(q, ctrl.signal), 450)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, local.length])

  async function searchOff(q = query.trim(), signal?: AbortSignal) {
    setOffState('loading')
    try {
      const res = await fetch(`/api/food?q=${encodeURIComponent(q)}`, { signal })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // „sosu gochujang” nic nie da? Spróbuj samego najdłuższego słowa.
      const longest = q.split(/\s+/).sort((a, b) => b.length - a.length)[0]
      if (!data.items.length && longest && longest !== q && longest.length >= 4) return searchOff(longest, signal)
      setOff(data.items)
      setOffState('idle')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setOffState('error')
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
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="picker-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="picker-title">Wybierz produkt</h2>
            <p className="modal-sub">dla: {ingredient.text}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Zamknij">
            <Icon name="x" />
          </button>
        </div>

        {!manual ? (
          <>
            <label className="search">
              <Icon name="search" size={18} />
              <span className="visually-hidden">Szukaj produktu</span>
              <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="np. mąka pszenna" />
            </label>

            {local.length > 0 && (
              <ul className="pick-list" aria-label="Wbudowana baza">
                {local.map((f) => (
                  <li key={f.id}>
                    <button onClick={() => onPick(toFoodRef(f))}>
                      <strong>{f.name}</strong>
                      <Values f={f} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="pick-section" aria-live="polite">
              <div className="pick-section-head">
                <span>
                  {local.length === 0 ? 'Nie ma tego we wbudowanej bazie – ' : ''}
                  produkty ze sklepów <span className="muted">(Open Food Facts)</span>
                </span>
                {off === null && offState !== 'loading' && local.length > 0 && (
                  <button className="btn small" onClick={() => void searchOff()} disabled={!query.trim()}>
                    Szukaj w sklepach
                  </button>
                )}
              </div>
              {offState === 'loading' && <p className="hint">Szukam w bazie produktów…</p>}
              {offState === 'error' && (
                <p className="hint error-text">
                  Baza produktów nie odpowiada.{' '}
                  <button className="link-btn" onClick={() => void searchOff()}>
                    Spróbuj ponownie
                  </button>
                </p>
              )}
              {off && (
                <ul className="pick-list">
                  {off.map((f) => (
                    <li key={f.id}>
                      <button onClick={() => onPick({ ...f, source: 'off' })}>
                        <strong>{f.name}</strong>
                        <Values f={f} />
                      </button>
                    </li>
                  ))}
                  {off.length === 0 && <li className="hint">Nic nie znaleziono. Spróbuj krótszej nazwy, np. „gochujang” zamiast „sosu gochujang”, albo wpisz wartości z etykiety.</li>}
                </ul>
              )}
            </div>

            <div className="modal-foot">
              <button className="btn" onClick={() => setManual(true)}>
                <Icon name="pen" size={16} /> Wpisz wartości z etykiety
              </button>
              <button className="btn ghost" onClick={() => onPick(null)}>
                Pomiń w kaloriach
              </button>
            </div>
            <p className="hint">„Pomiń” zostawia składnik w przepisie, ale nie dolicza go do kalorii (dobre np. dla przypraw).</p>
          </>
        ) : (
          <div className="form-grid">
            <label className="field full">
              <span>Nazwa</span>
              <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            </label>
            <p className="hint full">Wartości w 100 g – znajdziesz je w tabeli na opakowaniu.</p>
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
                Wróć do wyszukiwania
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
