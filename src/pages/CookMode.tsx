import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { useToast } from '../components/Toast'
import { canKeepScreenOn, clearProgress, keepScreenOn, loadProgress, saveProgress } from '../lib/cooking'
import { displayIngredient, ingredientsInStep } from '../lib/ingredients'
import { store } from '../lib/store'
import type { Recipe } from '../lib/types'
import { gramsHint } from './RecipeView'

/**
 * Tryb gotowania: jeden krok na ekran, duże litery, ekran nie gaśnie,
 * przy każdym kroku jego składniki w ilościach dla wybranej liczby porcji.
 */
export default function CookMode() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [screen, setScreen] = useState(0)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [servings, setServings] = useState(1)
  const [note, setNote] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const touchX = useRef<number | null>(null)

  useEffect(() => {
    store.get(id!).then((r) => {
      if (!r) return navigate('/', { replace: true })
      const p = loadProgress(r.id)
      setRecipe(r)
      setChecked(new Set(p.checked))
      setServings(p.servings ?? (r.servings || 1))
      setScreen(p.step)
    })
  }, [id, navigate])

  useEffect(() => keepScreenOn(), [])

  const hasIngredients = !!recipe?.ingredients.some((i) => !i.header)
  const first = hasIngredients ? 0 : 1
  const last = (recipe?.steps.length ?? 0) + 1 // ekran końcowy
  const current = Math.min(Math.max(screen, first), last)

  useEffect(() => {
    if (recipe) saveProgress(recipe.id, { step: current })
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [current, recipe])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input')) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setScreen((s) => Math.min(s + 1, last))
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setScreen((s) => Math.max(s - 1, first))
      if (e.key === 'Escape') navigate(`/przepis/${id}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [first, last, id, navigate])

  if (!recipe) return <div className="cook" aria-busy="true" />

  const factor = servings / (recipe.servings || 1)
  const stepCount = recipe.steps.length
  const go = (d: number) => setScreen(Math.min(Math.max(current + d, first), last))

  function toggle(ingId: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(ingId)) next.delete(ingId)
      else next.add(ingId)
      saveProgress(recipe!.id, { checked: [...next] })
      return next
    })
  }

  async function finish(withNote: boolean) {
    const text = note.trim()
    if (withNote && text) {
      const date = new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' })
      try {
        await store.save({ ...recipe!, notes: [recipe!.notes, `${date}: ${text}`].filter(Boolean).join('\n') })
        toast('Notatka dodana do przepisu')
      } catch {
        toast('Nie udało się zapisać notatki – sprawdź połączenie.')
        return
      }
    }
    clearProgress(recipe!.id)
    navigate(`/przepis/${recipe!.id}`, { replace: true })
  }

  const stepIndex = current - 1
  const stepIngredients = current >= 1 && current <= stepCount ? ingredientsInStep(recipe.steps[stepIndex], recipe.ingredients) : []
  const label = current === 0 ? 'Składniki' : current === last ? 'Gotowe' : `Krok ${current} z ${stepCount}`

  return (
    <div
      className="cook"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1)
      }}
    >
      <header className="cook-top">
        <button className="icon-btn" onClick={() => navigate(`/przepis/${recipe.id}`)} aria-label="Zakończ gotowanie">
          <Icon name="x" />
        </button>
        <div className="cook-title">
          <span className="cook-recipe">{recipe.title}</span>
          <span className="cook-progress-label">{label}</span>
        </div>
        <span className="cook-servings" title="Liczba porcji">
          <Icon name="users" size={16} /> {servings}
        </span>
      </header>
      <div className="cook-progress" aria-hidden="true">
        {Array.from({ length: last - first + 1 }, (_, i) => (
          <span key={i} className={i + first <= current ? 'on' : ''} />
        ))}
      </div>

      <main className="cook-body" aria-live="polite">
        {current === 0 && (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="cook-heading">
              Przygotuj składniki
            </h1>
            <ul className="cook-ingredients">
              {recipe.ingredients.map((ing) =>
                ing.header ? (
                  <li key={ing.id} className="ing-header">
                    {ing.text}
                  </li>
                ) : (
                  <li key={ing.id}>
                    <label className={`check-row ${checked.has(ing.id) ? 'done' : ''}`}>
                      <input type="checkbox" className="check-input" checked={checked.has(ing.id)} onChange={() => toggle(ing.id)} />
                      <span className="check" aria-hidden="true">
                        <Icon name="check" size={16} />
                      </span>
                      <span className="check-text">
                        {displayIngredient(ing, factor)}
                        {gramsHint(ing, factor) && <span className="grams"> {gramsHint(ing, factor)}</span>}
                      </span>
                    </label>
                  </li>
                ),
              )}
            </ul>
          </>
        )}

        {current >= 1 && current <= stepCount && (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="visually-hidden">
              Krok {current} z {stepCount}
            </h1>
            <p className="cook-step">{recipe.steps[stepIndex]}</p>
            {stepIngredients.length > 0 && (
              <div className="cook-uses">
                <h2>W tym kroku</h2>
                <ul>
                  {stepIngredients.map((ing) => (
                    <li key={ing.id}>{displayIngredient(ing, factor)}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {current === last && (
          <div className="cook-done">
            <h1 ref={headingRef} tabIndex={-1} className="cook-heading">
              Smacznego!
            </h1>
            <label className="field">
              <span>Co zmienić następnym razem? (opcjonalnie)</span>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="np. mniej soli, piec 5 minut krócej" />
            </label>
          </div>
        )}
      </main>

      <footer className="cook-nav">
        {canKeepScreenOn && current !== last && (
          <p className="cook-wake">
            <Icon name="sun" size={14} /> Ekran nie zgaśnie podczas gotowania
          </p>
        )}
        <div className="cook-buttons">
          {current === last ? (
            <>
              <button className="btn" onClick={() => go(-1)}>
                Wstecz
              </button>
              <button className="btn primary" onClick={() => void finish(true)}>
                {note.trim() ? 'Zapisz notatkę i zakończ' : 'Zakończ'}
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => go(-1)} disabled={current === first} aria-label="Poprzedni krok">
                <Icon name="back" /> Wstecz
              </button>
              <button className="btn primary" onClick={() => go(1)}>
                {current === stepCount || (current === 0 && stepCount === 0) ? 'Gotowe' : current === 0 ? 'Zaczynamy' : 'Dalej'} <Icon name="next" />
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  )
}
