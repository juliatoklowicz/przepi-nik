import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FoodPicker from '../components/FoodPicker'
import Icon from '../components/Icon'
import MacroSummary from '../components/MacroSummary'
import { compressImage } from '../lib/image'
import { clearPendingDraft, peekPendingDraft } from '../lib/importer'
import { computeGrams, computeNutrition, isNegligible, makeIngredient, reparseIngredient, scaleMacros } from '../lib/ingredients'
import { store } from '../lib/store'
import { CATEGORIES, emptyRecipe, type FoodRef, type Ingredient, type Recipe } from '../lib/types'

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export default function RecipeEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | undefined>()
  const [notices, setNotices] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [bulk, setBulk] = useState<string | null>(null)
  const [picker, setPicker] = useState<Ingredient | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (id) {
      store.get(id).then((r) => setRecipe(r ?? emptyRecipe()))
    } else {
      const draft = peekPendingDraft()
      setRecipe(draft?.recipe ?? emptyRecipe())
      setImageBlob(draft?.imageBlob)
      setNotices(draft?.notices ?? [])
    }
  }, [id])

  if (!recipe) return <div className="page" />

  const update = (patch: Partial<Recipe>) => setRecipe((r) => (r ? { ...r, ...patch } : r))
  const setIngredients = (fn: (list: Ingredient[]) => Ingredient[]) => setRecipe((r) => (r ? { ...r, ingredients: fn(r.ingredients) } : r))
  const updateIngredient = (ingId: string, fn: (i: Ingredient) => Ingredient) => setIngredients((list) => list.map((i) => (i.id === ingId ? fn(i) : i)))

  const { total, missing } = computeNutrition(recipe.ingredients)
  const perServing = scaleMacros(total, 1 / (recipe.servings || 1))

  async function pickImage(file: File | undefined) {
    if (!file) return
    const blob = await compressImage(file)
    setImageBlob(blob)
    update({ imageUrl: URL.createObjectURL(blob) })
  }

  function addBulk() {
    const lines = (bulk ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    setIngredients((list) => [...list, ...lines.map(makeIngredient)])
    setBulk(null)
  }

  function pickFood(food: FoodRef | null) {
    if (!picker) return
    updateIngredient(picker.id, (i) => ({
      ...i,
      food,
      foodManual: true,
      grams: i.gramsManual ? i.grams : computeGrams(i.amount, i.unit, food),
    }))
    setPicker(null)
  }

  async function save() {
    if (!recipe) return
    if (!recipe.title.trim()) {
      setError('Podaj nazwę przepisu.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSaving(true)
    setError('')
    try {
      let imageUrl = recipe.imageUrl
      if (imageBlob) imageUrl = await store.uploadImage(imageBlob, recipe.id)
      if (imageUrl.startsWith('blob:')) imageUrl = ''
      const saved = await store.save({
        ...recipe,
        title: recipe.title.trim(),
        imageUrl,
        ingredients: recipe.ingredients.filter((i) => i.text.trim()),
        steps: recipe.steps.map((s) => s.trim()).filter(Boolean),
      })
      clearPendingDraft()
      navigate(`/przepis/${saved.id}`, { replace: true })
    } catch (e) {
      setError(`Nie udało się zapisać: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  return (
    <div className="page editor">
      <header className="top-bar">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Wróć">
          <Icon name="back" />
        </button>
        <h1>{id ? 'Edytuj przepis' : 'Nowy przepis'}</h1>
        <span />
      </header>

      {notices.length > 0 && (
        <div className="notice">
          {notices.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}
      {error && <p className="notice error">{error}</p>}

      <div className="photo-field">
        {recipe.imageUrl ? (
          <img src={recipe.imageUrl} alt="" />
        ) : (
          <button className="photo-empty" onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={28} />
            <span>Dodaj zdjęcie</span>
          </button>
        )}
        {recipe.imageUrl && (
          <div className="photo-actions">
            <button className="btn small" onClick={() => fileRef.current?.click()}>
              Zmień
            </button>
            <button
              className="btn small"
              onClick={() => {
                setImageBlob(undefined)
                update({ imageUrl: '' })
              }}
            >
              Usuń
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
      </div>

      <label className="field">
        <span>Nazwa</span>
        <input className="title-input" value={recipe.title} onChange={(e) => update({ title: e.target.value })} placeholder="np. Makaron z kurczakiem" />
      </label>

      <div className="field">
        <span>Kategoria</span>
        <div className="chips wrap">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={`chip ${recipe.category === c.id ? 'active' : ''}`} onClick={() => update({ category: c.id })}>
              <span aria-hidden="true">{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Liczba porcji</span>
          <input type="number" min={1} max={50} inputMode="numeric" value={recipe.servings} onChange={(e) => update({ servings: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
        </label>
        <label className="field">
          <span>Czas (min)</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={recipe.prepMinutes ?? ''}
            onChange={(e) => update({ prepMinutes: e.target.value ? parseInt(e.target.value, 10) : null })}
            placeholder="—"
          />
        </label>
      </div>

      <section>
        <div className="section-head">
          <h2>Składniki</h2>
          <button className="btn small ghost" onClick={() => setBulk(bulk === null ? '' : null)}>
            Wklej listę
          </button>
        </div>
        <p className="hint">Wpisz np. „200 g mąki” lub „2 łyżki oliwy”. Kalorie liczą się same, a gramy i produkt poprawisz pod każdą linią.</p>

        {bulk !== null && (
          <div className="bulk">
            <textarea rows={6} autoFocus value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Każdy składnik w osobnej linii:\n200 g mąki\n2 jajka\nszczypta soli'} />
            <div className="row end">
              <button className="btn ghost small" onClick={() => setBulk(null)}>
                Anuluj
              </button>
              <button className="btn primary small" onClick={addBulk} disabled={!bulk.trim()}>
                Dodaj składniki
              </button>
            </div>
          </div>
        )}

        <ul className="edit-list">
          {recipe.ingredients.map((ing, idx) => (
            <IngredientRow
              key={ing.id}
              ing={ing}
              onText={(t) => updateIngredient(ing.id, (i) => ({ ...i, text: t }))}
              onCommit={() => updateIngredient(ing.id, (i) => reparseIngredient(i, i.text))}
              onGrams={(g) =>
                updateIngredient(ing.id, (i) =>
                  g == null ? { ...i, gramsManual: false, grams: computeGrams(i.amount, i.unit, i.food) } : { ...i, gramsManual: true, grams: g },
                )
              }
              onPickFood={() => setPicker(ing)}
              onMove={(d) => setIngredients((list) => move(list, idx, idx + d))}
              onRemove={() => setIngredients((list) => list.filter((i) => i.id !== ing.id))}
            />
          ))}
        </ul>
        <button className="btn add-btn" onClick={() => setIngredients((list) => [...list, { ...makeIngredient(''), text: '' }])}>
          <Icon name="plus" size={18} /> Dodaj składnik
        </button>
      </section>

      <section className="panel">
        <MacroSummary macros={perServing} label="na porcję" />
        {missing.length > 0 && <p className="hint">Nie liczone: {missing.map((m) => m.name || m.text).join(', ')}.</p>}
      </section>

      <section>
        <h2>Przygotowanie</h2>
        <ol className="edit-steps">
          {recipe.steps.map((step, idx) => (
            <li key={idx}>
              <span className="step-num">{idx + 1}</span>
              <textarea
                rows={Math.min(6, Math.max(2, Math.ceil(step.length / 40)))}
                value={step}
                onChange={(e) => update({ steps: recipe.steps.map((s, i) => (i === idx ? e.target.value : s)) })}
                placeholder="Opisz krok…"
              />
              <div className="row-tools vertical">
                <button className="icon-btn small" onClick={() => update({ steps: move(recipe.steps, idx, idx - 1) })} aria-label="Przesuń wyżej">
                  <Icon name="up" size={16} />
                </button>
                <button className="icon-btn small" onClick={() => update({ steps: move(recipe.steps, idx, idx + 1) })} aria-label="Przesuń niżej">
                  <Icon name="down" size={16} />
                </button>
                <button className="icon-btn small" onClick={() => update({ steps: recipe.steps.filter((_, i) => i !== idx) })} aria-label="Usuń krok">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button className="btn add-btn" onClick={() => update({ steps: [...recipe.steps, ''] })}>
          <Icon name="plus" size={18} /> Dodaj krok
        </button>
      </section>

      <label className="field">
        <span>Notatki</span>
        <textarea rows={3} value={recipe.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="np. dać mniej cukru, piec 5 min dłużej" />
      </label>

      <label className="field">
        <span>Link do źródła</span>
        <input type="url" value={recipe.sourceUrl} onChange={(e) => update({ sourceUrl: e.target.value })} placeholder="https://…" />
      </label>

      <div className="save-bar">
        <button className="btn ghost" onClick={() => navigate(-1)}>
          Anuluj
        </button>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? 'Zapisuję…' : 'Zapisz przepis'}
        </button>
      </div>

      {picker && <FoodPicker initialQuery={picker.food?.name ?? (picker.name || picker.text)} onPick={pickFood} onClose={() => setPicker(null)} />}
    </div>
  )
}

interface RowProps {
  ing: Ingredient
  onText: (t: string) => void
  onCommit: () => void
  onGrams: (g: number | null) => void
  onPickFood: () => void
  onMove: (delta: number) => void
  onRemove: () => void
}

function IngredientRow({ ing, onText, onCommit, onGrams, onPickFood, onMove, onRemove }: RowProps) {
  const [open, setOpen] = useState(false)
  const [gramsText, setGramsText] = useState(ing.grams != null ? String(Math.round(ing.grams)) : '')
  useEffect(() => setGramsText(ing.grams != null ? String(Math.round(ing.grams)) : ''), [ing.grams])

  const kcal = ing.food && ing.grams != null ? Math.round((ing.food.kcal * ing.grams) / 100) : null
  const problem = !ing.header && ing.text.trim() && !isNegligible(ing) && (ing.food == null || ing.grams == null)

  return (
    <li className={`ing-edit ${problem ? 'warn' : ''}`}>
      <div className="ing-line">
        <input
          value={ing.text}
          onChange={(e) => onText(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="np. 200 g mąki"
          autoFocus={!ing.text}
        />
        <button className="icon-btn small" onClick={() => setOpen((o) => !o)} aria-label="Szczegóły" aria-expanded={open}>
          <Icon name={open ? 'up' : 'down'} size={16} />
        </button>
      </div>
      {ing.text.trim() && (
        <button className="ing-info" onClick={() => setOpen((o) => !o)}>
          {ing.header ? (
            <span className="muted">Nagłówek sekcji</span>
          ) : (
            <>
              <span className={ing.food ? '' : 'missing'}>{ing.food ? ing.food.name : 'nie rozpoznano produktu'}</span>
              <span className={ing.grams != null ? '' : 'missing'}>{ing.grams != null ? `${Math.round(ing.grams)} g` : 'brak wagi'}</span>
              {kcal != null && <span>{kcal} kcal</span>}
            </>
          )}
        </button>
      )}
      {open && (
        <div className="ing-details">
          {!ing.header && (
            <>
              <label className="field inline">
                <span>Waga (g)</span>
                <input
                  inputMode="decimal"
                  value={gramsText}
                  onChange={(e) => setGramsText(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(gramsText.replace(',', '.'))
                    onGrams(Number.isFinite(v) ? v : null)
                  }}
                  placeholder="?"
                />
                {ing.gramsManual && (
                  <button className="link-btn" onClick={() => onGrams(null)}>
                    przelicz automatycznie
                  </button>
                )}
              </label>
              <div className="field inline">
                <span>Produkt</span>
                <button className="btn small" onClick={onPickFood}>
                  {ing.food ? `${ing.food.name} · ${ing.food.kcal} kcal/100 g` : 'Wybierz produkt'}
                </button>
              </div>
            </>
          )}
          <div className="row-tools">
            <button className="icon-btn small" onClick={() => onMove(-1)} aria-label="Przesuń wyżej">
              <Icon name="up" size={16} />
            </button>
            <button className="icon-btn small" onClick={() => onMove(1)} aria-label="Przesuń niżej">
              <Icon name="down" size={16} />
            </button>
            <button className="icon-btn small danger" onClick={onRemove} aria-label="Usuń składnik">
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
