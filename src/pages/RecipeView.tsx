import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import MacroSummary from '../components/MacroSummary'
import { computeNutrition, displayIngredient, scaleMacros } from '../lib/ingredients'
import { store } from '../lib/store'
import { categoryOf, type Recipe } from '../lib/types'

const GRAMS_KEY = 'przepisnik.showGrams'

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

export default function RecipeView() {
  const { id } = useParams()
  const navigate = useNavigate()
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

  useEffect(() => {
    store.get(id!).then((r) => {
      setRecipe(r ?? null)
      if (r) setServings(r.servings || 1)
    })
  }, [id])

  useEffect(() => {
    try {
      localStorage.setItem(GRAMS_KEY, showGrams ? '1' : '0')
    } catch {
      /* ignoruj */
    }
  }, [showGrams])

  if (recipe === undefined) return <div className="page" />
  if (recipe === null)
    return (
      <div className="page">
        <p className="muted center">Nie znaleziono przepisu.</p>
        <Link to="/" className="btn">
          Wróć do listy
        </Link>
      </div>
    )

  const base = recipe.servings || 1
  const factor = servings / base
  const { total, missing } = computeNutrition(recipe.ingredients)
  const perServing = scaleMacros(total, 1 / base)
  const cat = categoryOf(recipe.category)

  async function remove() {
    if (!confirm(`Usunąć przepis „${recipe!.title || 'Bez nazwy'}”? Tej operacji nie można cofnąć.`)) return
    await store.remove(recipe!.id)
    navigate('/', { replace: true })
  }

  function toggle(ingId: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(ingId)) next.delete(ingId)
      else next.add(ingId)
      return next
    })
  }

  return (
    <div className="page recipe">
      <div className={`hero ${recipe.imageUrl ? '' : 'hero-empty'}`}>
        {recipe.imageUrl ? <img src={recipe.imageUrl} alt="" /> : <span aria-hidden="true">{cat.emoji}</span>}
        <div className="hero-bar">
          <button className="icon-btn on-image" onClick={() => navigate('/')} aria-label="Wróć">
            <Icon name="back" />
          </button>
          <div className="row">
            <Link to={`/przepis/${recipe.id}/edytuj`} className="icon-btn on-image" aria-label="Edytuj">
              <Icon name="edit" />
            </Link>
            <button className="icon-btn on-image" onClick={remove} aria-label="Usuń">
              <Icon name="trash" />
            </button>
          </div>
        </div>
      </div>

      <div className="recipe-head">
        <span className="tag">
          {cat.emoji} {cat.label}
        </span>
        <h1>{recipe.title || 'Bez nazwy'}</h1>
        <div className="meta-row">
          {recipe.prepMinutes ? (
            <span>
              <Icon name="clock" size={16} /> {recipe.prepMinutes} min
            </span>
          ) : null}
          {recipe.sourceUrl && (
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
              <Icon name="external" size={16} /> {sourceLabel(recipe.sourceUrl)}
            </a>
          )}
        </div>
      </div>

      {total.kcal > 0 && (
        <section className="panel">
          <MacroSummary macros={perServing} label="na porcję" />
          {missing.length > 0 && (
            <p className="hint">
              Bez {missing.length} skł. ({missing.map((m) => m.name || m.text).join(', ')}) – uzupełnij je w edycji, żeby wynik był pełny.
            </p>
          )}
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Składniki</h2>
          <div className="stepper" aria-label="Liczba porcji">
            <button onClick={() => setServings((s) => Math.max(1, s - 1))} aria-label="Mniej porcji">
              <Icon name="minus" size={18} />
            </button>
            <span>
              <Icon name="users" size={16} /> {servings}
            </span>
            <button onClick={() => setServings((s) => Math.min(50, s + 1))} aria-label="Więcej porcji">
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={showGrams} onChange={(e) => setShowGrams(e.target.checked)} />
          <span>Pokaż wagę w gramach</span>
        </label>
        <ul className="ingredients">
          {recipe.ingredients.map((ing) =>
            ing.header ? (
              <li key={ing.id} className="ing-header">
                {ing.text}
              </li>
            ) : (
              <li key={ing.id} className={checked.has(ing.id) ? 'done' : ''} onClick={() => toggle(ing.id)}>
                <span className="check" aria-hidden="true">
                  {checked.has(ing.id) && <Icon name="check" size={14} />}
                </span>
                <span>
                  {displayIngredient(ing, factor)}
                  {showGrams && ing.grams != null && !(ing.unit && ['g', 'kg', 'dag', 'mg'].includes(ing.unit)) && (
                    <span className="grams"> ≈ {Math.round(ing.grams * factor)} g</span>
                  )}
                </span>
              </li>
            ),
          )}
        </ul>
        {factor !== 1 && total.kcal > 0 && (
          <p className="hint">
            Całość dla {servings} porcji: {Math.round(total.kcal * factor)} kcal
          </p>
        )}
      </section>

      {recipe.steps.length > 0 && (
        <section>
          <h2>Przygotowanie</h2>
          <ol className="steps">
            {recipe.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <section>
          <h2>Notatki</h2>
          <p className="notes">{recipe.notes}</p>
        </section>
      )}
    </div>
  )
}
