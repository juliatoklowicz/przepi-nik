import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { computeNutrition, stripDiacritics } from '../lib/ingredients'
import { store } from '../lib/store'
import { CATEGORIES, categoryOf, type Category, type Recipe } from '../lib/types'

const FILTER_KEY = 'przepisnik.filter'

type Filter = Category | 'all' | 'fix'

function readFilter(): Filter {
  try {
    return (sessionStorage.getItem(FILTER_KEY) as Filter | null) ?? 'all'
  } catch {
    return 'all'
  }
}

const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many

interface Row {
  recipe: Recipe
  kcal: number
  protein: number
  missing: number
}

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>(readFilter)

  const load = () => {
    setError(false)
    store.list().then(setRecipes, () => setError(true))
  }
  useEffect(load, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_KEY, filter)
    } catch {
      /* ignoruj */
    }
  }, [filter])

  const rows = useMemo<Row[]>(
    () =>
      (recipes ?? []).map((r) => {
        const { total, missing } = computeNutrition(r.ingredients)
        const per = r.servings || 1
        return { recipe: r, kcal: total.kcal / per, protein: total.protein / per, missing: missing.length }
      }),
    [recipes],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const { recipe } of rows) c[recipe.category] = (c[recipe.category] ?? 0) + 1
    return c
  }, [rows])

  const toFix = rows.filter((r) => r.missing > 0).length
  const usedCategories = CATEGORIES.filter((c) => counts[c.id] || filter === c.id)

  const visible = useMemo(() => {
    const q = stripDiacritics(query.trim())
    return rows.filter(({ recipe: r, missing }) => {
      if (filter === 'fix' && !missing) return false
      if (filter !== 'all' && filter !== 'fix' && r.category !== filter) return false
      if (!q) return true
      const hay = stripDiacritics([r.title, ...r.ingredients.map((i) => i.text)].join(' '))
      return q.split(/\s+/).every((w) => hay.includes(w))
    })
  }, [rows, query, filter])

  const clearAll = () => {
    setQuery('')
    setFilter('all')
  }

  return (
    <div className="page home">
      <header className="home-header">
        <h1 className="brand">
          <img src="/favicon.svg" alt="" width={34} height={34} />
          Przepiśnik
        </h1>
        <Link to="/ustawienia" className="icon-btn" aria-label="Ustawienia">
          <Icon name="settings" />
        </Link>
      </header>

      {recipes && recipes.length > 0 && (
        <>
          <label className="search">
            <Icon name="search" size={18} />
            <span className="visually-hidden">Szukaj</span>
            <input type="search" placeholder="Szukaj przepisu lub składnika…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>

          {usedCategories.length > 1 && (
            <nav className="chips home-chips" aria-label="Kategorie">
              <button className={`chip ${filter === 'all' ? 'active' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                Wszystkie <span className="chip-count">{recipes.length}</span>
              </button>
              {usedCategories.map((c) => (
                <button key={c.id} className={`chip ${filter === c.id ? 'active' : ''}`} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
                  <span aria-hidden="true">{c.emoji}</span> {c.label}
                  {counts[c.id] ? <span className="chip-count">{counts[c.id]}</span> : null}
                </button>
              ))}
            </nav>
          )}

          {toFix > 0 && filter !== 'fix' && (
            <button className="fix-strip" onClick={() => setFilter('fix')}>
              <span className="fix-dot" aria-hidden="true" />
              <span>
                <strong>
                  {toFix} {plural(toFix, 'przepis ma', 'przepisy mają', 'przepisów ma')} niepoliczone składniki
                </strong>
                <small>Kalorie są przez to zaniżone – sprawdź je w kilka sekund.</small>
              </span>
              <Icon name="next" size={18} />
            </button>
          )}
          {filter === 'fix' && (
            <div className="filter-note">
              <span>Do poprawienia: przepisy z niepoliczonymi składnikami</span>
              <button className="link-btn" onClick={() => setFilter('all')}>
                Pokaż wszystkie
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="notice error" role="alert">
          <p>Nie udało się wczytać przepisów. Sprawdź połączenie z internetem.</p>
          <button className="btn small" onClick={load}>
            Spróbuj ponownie
          </button>
        </div>
      )}

      {recipes === null && !error ? (
        <div className="grid" aria-busy="true" aria-label="Wczytywanie przepisów">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card skeleton" />
          ))}
        </div>
      ) : recipes && recipes.length === 0 ? (
        <div className="empty">
          <img className="empty-mark" src="/favicon.svg" alt="" width={72} height={72} />
          <h2>Twój przepiśnik jest pusty</h2>
          <p>
            Wklej link z TikToka, Instagrama albo bloga, dodaj zrzut ekranu lub wpisz przepis sama. <strong>Kalorie i makro policzą się same.</strong>
          </p>
          <Link to="/dodaj" className="btn primary">
            <Icon name="plus" /> Dodaj pierwszy przepis
          </Link>
        </div>
      ) : recipes && visible.length === 0 ? (
        <div className="empty small-empty">
          <p>
            {query.trim() ? (
              <>
                Nic nie pasuje do „<strong>{query.trim()}</strong>”
                {filter !== 'all' ? ' w tej kategorii' : ''}.
              </>
            ) : (
              'Brak przepisów w tej kategorii.'
            )}
          </p>
          <button className="btn" onClick={clearAll}>
            Wyczyść wyszukiwanie i filtr
          </button>
        </div>
      ) : (
        <ul className="grid" aria-label="Przepisy">
          {visible.map((row) => (
            <li key={row.recipe.id}>
              <RecipeCard row={row} />
            </li>
          ))}
        </ul>
      )}

      {recipes && recipes.length > 0 && (
        <Link to="/dodaj" className="fab">
          <Icon name="plus" size={22} />
          <span>Dodaj przepis</span>
        </Link>
      )}
    </div>
  )
}

function RecipeCard({ row }: { row: Row }) {
  const { recipe, kcal, protein, missing } = row
  const cat = categoryOf(recipe.category)
  const title = recipe.title || 'Bez nazwy'
  return (
    <Link to={`/przepis/${recipe.id}`} className={`card ${recipe.imageUrl ? '' : `card-text cat-${recipe.category}`}`}>
      {recipe.imageUrl ? (
        <>
          <div className="card-img">
            <img src={recipe.imageUrl} alt="" loading="lazy" />
          </div>
          <h2 className="card-title">{title}</h2>
        </>
      ) : (
        <div className="card-cover">
          <span className="card-emoji" aria-hidden="true">
            {cat.emoji}
          </span>
          <h2 className="card-title">{title}</h2>
        </div>
      )}
      <p className="card-meta">
        {kcal > 0 && (
          <span>
            <strong>{Math.round(kcal)}</strong> kcal
          </span>
        )}
        {protein >= 1 && <span>{Math.round(protein)} g białka</span>}
        {recipe.prepMinutes ? <span>{recipe.prepMinutes} min</span> : null}
        {missing > 0 && <span className="card-warn">niepełne</span>}
      </p>
    </Link>
  )
}
