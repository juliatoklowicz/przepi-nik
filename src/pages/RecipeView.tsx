import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import Icon from '../components/Icon'
import MacroSummary from '../components/MacroSummary'
import { useToast } from '../components/Toast'
import { clearProgress, loadProgress, saveProgress } from '../lib/cooking'
import { computeNutrition, displayIngredient, scaleMacros } from '../lib/ingredients'
import { store } from '../lib/store'
import { categoryOf, type Ingredient, type Recipe } from '../lib/types'

const GRAMS_KEY = 'przepisnik.showGrams'
const WEIGHT_UNITS = ['g', 'kg', 'dag', 'mg']

function sourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('tiktok')) return 'TikTok'
    if (host.includes('instagram')) return 'Instagram'
    return host
  } catch {
    return 'źródło'
  }
}

export function gramsHint(ing: Ingredient, factor: number): string | null {
  if (ing.grams == null || (ing.unit && WEIGHT_UNITS.includes(ing.unit))) return null
  return `≈ ${Math.round(ing.grams * factor)} g`
}

export default function RecipeView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)
  const [servings, setServings] = useState(1)
  const [showGrams, setShowGrams] = useState(() => {
    try {
      return localStorage.getItem(GRAMS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    store.get(id!).then(
      (r) => {
        setRecipe(r ?? null)
        if (!r) return
        const p = loadProgress(r.id)
        setServings(p.servings ?? (r.servings || 1))
        setChecked(new Set(p.checked))
      },
      () => setRecipe(null),
    )
  }, [id])

  useEffect(() => {
    try {
      localStorage.setItem(GRAMS_KEY, showGrams ? '1' : '0')
    } catch {
      /* ignoruj */
    }
  }, [showGrams])

  if (recipe === undefined)
    return (
      <div className="page recipe" aria-busy="true">
        <div className="skeleton-block tall" />
        <div className="skeleton-line wide" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    )
  if (recipe === null)
    return (
      <div className="page">
        <div className="empty">
          <h1 className="empty-title">Nie ma takiego przepisu</h1>
          <p>Mógł zostać usunięty albo link jest niepełny.</p>
          <Link to="/" className="btn primary">
            Wróć do listy
          </Link>
        </div>
      </div>
    )

  const base = recipe.servings || 1
  const factor = servings / base
  const { total, missing } = computeNutrition(recipe.ingredients)
  const perServing = scaleMacros(total, 1 / base)
  const cat = categoryOf(recipe.category)
  const title = recipe.title || 'Bez nazwy'
  const hasIngredients = recipe.ingredients.some((i) => !i.header)

  function changeServings(next: number) {
    const s = Math.min(50, Math.max(1, next))
    setServings(s)
    saveProgress(recipe!.id, { servings: s === base ? null : s })
  }

  function toggle(ingId: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(ingId)) next.delete(ingId)
      else next.add(ingId)
      saveProgress(recipe!.id, { checked: [...next] })
      return next
    })
  }

  function resetChecks() {
    setChecked(new Set())
    clearProgress(recipe!.id)
    setServings(base)
  }

  async function remove() {
    setConfirmDelete(false)
    try {
      await store.remove(recipe!.id)
      clearProgress(recipe!.id)
      toast(`Usunięto „${title}”`)
      navigate('/', { replace: true })
    } catch {
      toast('Nie udało się usunąć – sprawdź połączenie i spróbuj ponownie.')
    }
  }

  return (
    <div className="page recipe has-action-bar">
      {recipe.imageUrl ? (
        <div className="hero">
          <img src={recipe.imageUrl} alt="" />
          <div className="hero-bar">
            <button className="icon-btn on-image" onClick={() => navigate('/')} aria-label="Wróć do listy">
              <Icon name="back" />
            </button>
          </div>
        </div>
      ) : (
        <header className="top-bar plain">
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="Wróć do listy">
            <Icon name="back" />
          </button>
        </header>
      )}

      <div className="recipe-head">
        <span className="tag">
          <span aria-hidden="true">{cat.emoji}</span> {cat.label}
        </span>
        <h1 className={title.length > 48 ? 'long' : ''}>{title}</h1>
        <div className="meta-row">
          {recipe.prepMinutes ? (
            <span>
              <Icon name="clock" size={16} /> {recipe.prepMinutes} min
            </span>
          ) : null}
          {recipe.sourceUrl && (
            <a className="source-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
              <Icon name="external" size={16} /> {sourceLabel(recipe.sourceUrl)}
            </a>
          )}
        </div>
      </div>

      {total.kcal > 0 && (
        <section className="panel" aria-label="Wartości odżywcze">
          <MacroSummary macros={perServing} label="na porcję" />
          {missing.length > 0 ? (
            <p className="hint warn-text">
              Bez: {missing.map((m) => m.text || m.name).join(', ')}.{' '}
              <Link to={`/przepis/${recipe.id}/edytuj`}>Uzupełnij w edycji</Link>, żeby wynik był pełny.
            </p>
          ) : (
            <p className="hint">Wartości szacunkowe.</p>
          )}
        </section>
      )}

      {hasIngredients && (
        <section aria-labelledby="ing-head">
          <div className="section-head">
            <h2 id="ing-head">Składniki</h2>
            <div className="stepper" role="group" aria-label="Liczba porcji">
              <button onClick={() => changeServings(servings - 1)} disabled={servings <= 1} aria-label="Mniej porcji">
                <Icon name="minus" size={18} />
              </button>
              <span aria-live="polite">
                <Icon name="users" size={16} /> {servings}
                <span className="visually-hidden"> {servings === 1 ? 'porcja' : servings < 5 ? 'porcje' : 'porcji'}</span>
              </span>
              <button onClick={() => changeServings(servings + 1)} disabled={servings >= 50} aria-label="Więcej porcji">
                <Icon name="plus" size={18} />
              </button>
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" role="switch" checked={showGrams} onChange={(e) => setShowGrams(e.target.checked)} />
            <span>Pokaż wagę w gramach</span>
          </label>
          <ul className="ingredients">
            {recipe.ingredients.map((ing) => {
              if (ing.header)
                return (
                  <li key={ing.id} className="ing-header">
                    {ing.text}
                  </li>
                )
              const g = showGrams ? gramsHint(ing, factor) : null
              return (
                <li key={ing.id}>
                  <label className={`check-row ${checked.has(ing.id) ? 'done' : ''}`}>
                    <input type="checkbox" className="check-input" checked={checked.has(ing.id)} onChange={() => toggle(ing.id)} />
                    <span className="check" aria-hidden="true">
                      <Icon name="check" size={14} />
                    </span>
                    <span className="check-text">
                      {displayIngredient(ing, factor)}
                      {g && <span className="grams"> {g}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="ing-foot">
            {factor !== 1 && total.kcal > 0 ? (
              <p className="hint">
                Całość dla {servings} porcji: {Math.round(total.kcal * factor)} kcal
              </p>
            ) : (
              <span />
            )}
            {(checked.size > 0 || factor !== 1) && (
              <button className="link-btn" onClick={resetChecks}>
                Zacznij od nowa
              </button>
            )}
          </div>
        </section>
      )}

      {recipe.steps.length > 0 && (
        <section aria-labelledby="steps-head">
          <h2 id="steps-head">Przygotowanie</h2>
          <ol className="steps">
            {recipe.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <section aria-labelledby="notes-head">
          <h2 id="notes-head">Notatki</h2>
          <p className="notes">{recipe.notes}</p>
        </section>
      )}

      <div className="danger-zone">
        <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" size={18} /> Usuń przepis
        </button>
      </div>

      <div className="action-bar">
        <Link to={`/przepis/${recipe.id}/edytuj`} className="btn">
          <Icon name="edit" size={18} /> Edytuj
        </Link>
        {(recipe.steps.length > 0 || hasIngredients) && (
          <Link to={`/przepis/${recipe.id}/gotuj`} className="btn primary">
            <Icon name="pot" size={20} /> Gotuj
          </Link>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Usunąć przepis?"
          message={`„${title}” zniknie na dobre – tego nie da się cofnąć.`}
          confirmLabel="Usuń przepis"
          danger
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
