import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { computeNutrition, stripDiacritics } from '../lib/ingredients'
import { store } from '../lib/store'
import { CATEGORIES, categoryOf, type Category, type Recipe } from '../lib/types'

const FILTER_KEY = 'przepisnik.filter'

function readFilter(): Category | 'all' {
  try {
    return (sessionStorage.getItem(FILTER_KEY) as Category | null) ?? 'all'
  } catch {
    return 'all'
  }
}

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Category | 'all'>(readFilter)

  useEffect(() => {
    store.list().then(setRecipes, (e) => setError(e.message ?? String(e)))
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_KEY, filter)
    } catch {
      /* ignoruj */
    }
  }, [filter])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of recipes ?? []) c[r.category] = (c[r.category] ?? 0) + 1
    return c
  }, [recipes])

  const visible = useMemo(() => {
    const q = stripDiacritics(query.trim())
    return (recipes ?? []).filter((r) => {
      if (filter !== 'all' && r.category !== filter) return false
      if (!q) return true
      const hay = stripDiacritics([r.title, ...r.ingredients.map((i) => i.text)].join(' '))
      return q.split(/\s+/).every((w) => hay.includes(w))
    })
  }, [recipes, query, filter])

  return (
    <div className="page">
      <header className="home-header">
        <h1 className="brand">Przepiśnik</h1>
        <Link to="/ustawienia" className="icon-btn" aria-label="Ustawienia">
          <Icon name="settings" />
        </Link>
      </header>

      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="Szukaj przepisu lub składnika…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      <nav className="chips home-chips" aria-label="Kategorie">
        <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Wszystkie
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip ${filter === c.id ? 'active' : ''}`} onClick={() => setFilter(c.id)}>
            <span aria-hidden="true">{c.emoji}</span> {c.label}
            {counts[c.id] ? <span className="chip-count">{counts[c.id]}</span> : null}
          </button>
        ))}
      </nav>

      {error && <p className="notice error">Nie udało się wczytać przepisów: {error}</p>}

      {recipes === null && !error ? (
        <div className="grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card skeleton" />
          ))}
        </div>
      ) : recipes && recipes.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji" aria-hidden="true">
            📖
          </div>
          <h2>Twój przepiśnik jest pusty</h2>
          <p>Wklej link z TikToka, Instagrama albo bloga, dodaj zrzut ekranu lub wpisz przepis sama.</p>
          <Link to="/dodaj" className="btn primary">
            <Icon name="plus" /> Dodaj pierwszy przepis
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <p className="muted center">Brak przepisów pasujących do wyszukiwania.</p>
      ) : (
        <div className="grid">
          {visible.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}

      <Link to="/dodaj" className="fab" aria-label="Dodaj przepis">
        <Icon name="plus" size={26} />
      </Link>
    </div>
  )
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const { total } = computeNutrition(recipe.ingredients)
  const perServing = total.kcal / (recipe.servings || 1)
  const cat = categoryOf(recipe.category)
  return (
    <Link to={`/przepis/${recipe.id}`} className="card">
      <div className="card-img">
        {recipe.imageUrl ? <img src={recipe.imageUrl} alt="" loading="lazy" /> : <span className="card-placeholder">{cat.emoji}</span>}
      </div>
      <div className="card-body">
        <h3>{recipe.title || 'Bez nazwy'}</h3>
        <p className="card-meta">
          {perServing > 0 && <span>{Math.round(perServing)} kcal/porcja</span>}
          {recipe.prepMinutes ? <span>{recipe.prepMinutes} min</span> : null}
        </p>
      </div>
    </Link>
  )
}
