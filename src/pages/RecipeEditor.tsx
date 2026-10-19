import { useEffect, useId, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import FoodPicker from '../components/FoodPicker'
import Icon from '../components/Icon'
import MacroSummary from '../components/MacroSummary'
import { useToast } from '../components/Toast'
import { clearDraft, formatTime, loadDraft, saveDraft } from '../lib/drafts'
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

function insertAt<T>(list: T[], idx: number, item: T): T[] {
  const next = [...list]
  next.splice(Math.min(idx, next.length), 0, item)
  return next
}

const snapshot = (r: Recipe) => JSON.stringify({ ...r, updatedAt: '' })

export default function RecipeEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | undefined>()
  const [notices, setNotices] = useState<string[]>([])
  const [restored, setRestored] = useState<{ at: number; original: Recipe | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [titleError, setTitleError] = useState('')
  const [bulk, setBulk] = useState<string | null>(null)
  const [picker, setPicker] = useState<Ingredient | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const leaving = useRef(false)
  const titleErrId = useId()
  const parent = id ? `/przepis/${id}` : '/'

  useEffect(() => {
    let cancelled = false
    async function load() {
      const stored = loadDraft(id)
      if (id) {
        const original = (await store.get(id)) ?? emptyRecipe()
        if (cancelled) return
        setBaseline(snapshot(original))
        if (stored && snapshot(stored.recipe) !== snapshot(original) && stored.at > Date.parse(original.updatedAt || '0')) {
          setRecipe(stored.recipe)
          setRestored({ at: stored.at, original })
        } else {
          clearDraft(id)
          setRecipe(original)
        }
        return
      }
      const pending = peekPendingDraft()
      if (pending) {
        // Świeży import: niezapisany, więc od razu „zmieniony”.
        setRecipe(pending.recipe)
        setImageBlob(pending.imageBlob)
        setNotices(pending.notices)
        setBaseline(snapshot(emptyRecipe()))
      } else if (stored) {
        setRecipe(stored.recipe)
        setRestored({ at: stored.at, original: null })
        setBaseline(snapshot(emptyRecipe()))
      } else {
        const fresh = emptyRecipe()
        setRecipe(fresh)
        setBaseline(snapshot(fresh))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  const dirty = !!recipe && baseline != null && (snapshot(recipe) !== baseline || !!imageBlob)

  // Zapis szkicu na bieżąco.
  useEffect(() => {
    if (!recipe || !dirty) return
    const t = window.setTimeout(() => saveDraft(id, recipe), 500)
    return () => window.clearTimeout(t)
  }, [recipe, dirty, id])

  // Zamknięcie karty lub przeładowanie z niezapisanymi zmianami.
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname)

  if (!recipe)
    return (
      <div className="page editor" aria-busy="true">
        <div className="skeleton-line wide" />
        <div className="skeleton-block" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    )

  const update = (patch: Partial<Recipe>) => setRecipe((r) => (r ? { ...r, ...patch } : r))
  const setIngredients = (fn: (list: Ingredient[]) => Ingredient[]) => setRecipe((r) => (r ? { ...r, ingredients: fn(r.ingredients) } : r))
  const setSteps = (fn: (list: string[]) => string[]) => setRecipe((r) => (r ? { ...r, steps: fn(r.steps) } : r))
  const updateIngredient = (ingId: string, fn: (i: Ingredient) => Ingredient) => setIngredients((list) => list.map((i) => (i.id === ingId ? fn(i) : i)))

  const { total, missing } = computeNutrition(recipe.ingredients)
  const perServing = scaleMacros(total, 1 / (recipe.servings || 1))
  const hasExtras = !!(recipe.notes || recipe.sourceUrl)

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
    toast(`Dodano składniki: ${lines.length}`)
  }

  function removeIngredient(ing: Ingredient, idx: number) {
    setIngredients((list) => list.filter((i) => i.id !== ing.id))
    toast(`Usunięto „${ing.text || 'pusty składnik'}”`, { label: 'Cofnij', run: () => setIngredients((list) => insertAt(list, idx, ing)) })
  }

  function removeStep(idx: number) {
    const step = recipe!.steps[idx]
    setSteps((list) => list.filter((_, i) => i !== idx))
    toast(`Usunięto krok ${idx + 1}`, { label: 'Cofnij', run: () => setSteps((list) => insertAt(list, idx, step)) })
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

  function discardRestored() {
    if (!restored) return
    clearDraft(id)
    setRecipe(restored.original ?? emptyRecipe())
    setRestored(null)
  }

  async function save() {
    if (!recipe) return
    if (!recipe.title.trim()) {
      setTitleError('Podaj nazwę przepisu – bez niej trudno go będzie znaleźć.')
      titleRef.current?.focus()
      titleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
      clearDraft(id)
      leaving.current = true
      toast(id ? 'Zapisano zmiany' : 'Przepis zapisany')
      navigate(`/przepis/${saved.id}`, { replace: true })
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      setError(
        /fetch|network/i.test(detail)
          ? 'Nie udało się zapisać – brak połączenia. Zmiany są bezpieczne w szkicu na tym urządzeniu, spróbuj ponownie za chwilę.'
          : `Nie udało się zapisać (${detail}). Zmiany są bezpieczne w szkicu na tym urządzeniu.`,
      )
      setSaving(false)
    }
  }

  return (
    <div className="page editor">
      <header className="top-bar">
        <button className="icon-btn" onClick={() => navigate(parent)} aria-label="Wróć">
          <Icon name="back" />
        </button>
        <h1>{id ? 'Edytuj przepis' : 'Nowy przepis'}</h1>
        <span />
      </header>

      {restored && (
        <div className="notice restored" role="status">
          <p>Przywrócono niezapisane zmiany ({formatTime(restored.at)}).</p>
          <button className="link-btn" onClick={discardRestored}>
            Odrzuć je
          </button>
        </div>
      )}
      {notices.length > 0 && (
        <div className="notice">
          {notices.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      <div className="field">
        <label htmlFor="title">Nazwa</label>
        <input
          id="title"
          ref={titleRef}
          className="title-input"
          value={recipe.title}
          onChange={(e) => {
            update({ title: e.target.value })
            if (titleError) setTitleError('')
          }}
          placeholder="np. Makaron z kurczakiem"
          aria-invalid={!!titleError}
          aria-describedby={titleError ? titleErrId : undefined}
        />
        {titleError && (
          <p id={titleErrId} className="field-error" role="alert">
            {titleError}
          </p>
        )}
      </div>

      <div className="photo-field">
        {recipe.imageUrl ? (
          <>
            <img src={recipe.imageUrl} alt="" />
            <div className="photo-actions">
              <button className="btn small on-image" onClick={() => fileRef.current?.click()}>
                Zmień zdjęcie
              </button>
              <button
                className="btn small on-image"
                onClick={() => {
                  setImageBlob(undefined)
                  update({ imageUrl: '' })
                }}
              >
                Usuń
              </button>
            </div>
          </>
        ) : (
          <button className="photo-empty" onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={22} />
            <span>Dodaj zdjęcie (opcjonalnie)</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden aria-hidden="true" tabIndex={-1} onChange={(e) => pickImage(e.target.files?.[0])} />
      </div>

      <fieldset className="field">
        <legend>Kategoria</legend>
        <div className="chips wrap">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={`chip ${recipe.category === c.id ? 'active' : ''}`} aria-pressed={recipe.category === c.id} onClick={() => update({ category: c.id })}>
              <span aria-hidden="true">{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>
      </fieldset>

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
            placeholder="np. 30"
          />
        </label>
      </div>

      <section aria-labelledby="ing-head">
        <div className="section-head">
          <h2 id="ing-head">Składniki</h2>
          <button className="btn small ghost" onClick={() => setBulk(bulk === null ? '' : null)} aria-expanded={bulk !== null}>
            <Icon name="clipboard" size={16} /> Wklej listę
          </button>
        </div>
        <p className="hint">Wpisz np. „200 g mąki” lub „2 łyżki oliwy” – kalorie policzą się same. Żółte linie wymagają poprawki.</p>

        {bulk !== null && (
          <div className="bulk">
            <label className="visually-hidden" htmlFor="bulk">
              Lista składników, każdy w osobnej linii
            </label>
            <textarea id="bulk" rows={6} autoFocus value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Każdy składnik w osobnej linii:\n200 g mąki\n2 jajka\nszczypta soli'} />
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
              index={idx}
              count={recipe.ingredients.length}
              onText={(t) => updateIngredient(ing.id, (i) => ({ ...i, text: t }))}
              onCommit={() => updateIngredient(ing.id, (i) => reparseIngredient(i, i.text))}
              onGrams={(g) =>
                updateIngredient(ing.id, (i) =>
                  g == null ? { ...i, gramsManual: false, grams: computeGrams(i.amount, i.unit, i.food) } : { ...i, gramsManual: true, grams: g },
                )
              }
              onPickFood={() => setPicker(ing)}
              onMove={(d) => setIngredients((list) => move(list, idx, idx + d))}
              onRemove={() => removeIngredient(ing, idx)}
            />
          ))}
        </ul>
        <button className="btn add-btn" onClick={() => setIngredients((list) => [...list, { ...makeIngredient(''), text: '' }])}>
          <Icon name="plus" size={18} /> Dodaj składnik
        </button>
      </section>

      {total.kcal > 0 ? (
        <section className="panel" aria-label="Wartości odżywcze">
          <MacroSummary macros={perServing} label="na porcję" />
          {missing.length > 0 && (
            <p className="hint warn-text">
              Nie policzono: {missing.map((m) => m.text || m.name).join(', ')}. Uzupełnij produkt lub wagę w żółtych liniach.
            </p>
          )}
        </section>
      ) : recipe.ingredients.some((i) => i.text.trim()) ? (
        <p className="hint">Kalorie pojawią się, gdy przy składnikach będą produkt i waga.</p>
      ) : null}

      <section aria-labelledby="steps-head">
        <h2 id="steps-head">Przygotowanie</h2>
        <ol className="edit-steps">
          {recipe.steps.map((step, idx) => (
            <li key={idx}>
              <span className="step-num" aria-hidden="true">
                {idx + 1}
              </span>
              <div className="step-body">
                <textarea
                  aria-label={`Krok ${idx + 1}`}
                  rows={Math.min(6, Math.max(2, Math.ceil(step.length / 40)))}
                  value={step}
                  onChange={(e) => setSteps((list) => list.map((s, i) => (i === idx ? e.target.value : s)))}
                  placeholder="Opisz krok…"
                />
                <div className="row-tools">
                  <div className="row">
                    <button className="icon-btn small" onClick={() => setSteps((l) => move(l, idx, idx - 1))} disabled={idx === 0} aria-label={`Przesuń krok ${idx + 1} wyżej`}>
                      <Icon name="up" size={18} />
                    </button>
                    <button className="icon-btn small" onClick={() => setSteps((l) => move(l, idx, idx + 1))} disabled={idx === recipe.steps.length - 1} aria-label={`Przesuń krok ${idx + 1} niżej`}>
                      <Icon name="down" size={18} />
                    </button>
                  </div>
                  <button className="btn small ghost danger-text" onClick={() => removeStep(idx)}>
                    <Icon name="trash" size={16} /> Usuń krok
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button className="btn add-btn" onClick={() => setSteps((list) => [...list, ''])}>
          <Icon name="plus" size={18} /> Dodaj krok
        </button>
      </section>

      <details className="extras" open={hasExtras}>
        <summary>
          Notatki i źródło
          <Icon name="down" size={18} />
        </summary>
        <label className="field">
          <span>Notatki</span>
          <textarea rows={3} value={recipe.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="np. dać mniej cukru, piec 5 min dłużej" />
        </label>
        <label className="field">
          <span>Link do źródła</span>
          <input type="url" inputMode="url" value={recipe.sourceUrl} onChange={(e) => update({ sourceUrl: e.target.value })} placeholder="https://…" />
        </label>
      </details>

      <div className="save-bar">
        <span className="save-state" aria-live="polite">
          {dirty ? 'Szkic zapisany na tym urządzeniu' : ''}
        </span>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? 'Zapisuję…' : 'Zapisz przepis'}
        </button>
      </div>

      {picker && <FoodPicker ingredient={picker} onPick={pickFood} onClose={() => setPicker(null)} />}

      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Odrzucić zmiany?"
          message="Przepis nie został zapisany. Jeśli wyjdziesz teraz, zmiany przepadną."
          confirmLabel="Odrzuć zmiany"
          cancelLabel="Wróć do edycji"
          danger
          onConfirm={() => {
            clearDraft(id)
            clearPendingDraft()
            blocker.proceed()
          }}
          onCancel={() => blocker.reset()}
        />
      )}
    </div>
  )
}

interface RowProps {
  ing: Ingredient
  index: number
  count: number
  onText: (t: string) => void
  onCommit: () => void
  onGrams: (g: number | null) => void
  onPickFood: () => void
  onMove: (delta: number) => void
  onRemove: () => void
}

function IngredientRow({ ing, index, count, onText, onCommit, onGrams, onPickFood, onMove, onRemove }: RowProps) {
  const [open, setOpen] = useState(false)
  const [gramsText, setGramsText] = useState(ing.grams != null ? String(Math.round(ing.grams)) : '')
  useEffect(() => setGramsText(ing.grams != null ? String(Math.round(ing.grams)) : ''), [ing.grams])
  const detailsId = useId()
  const gramsId = useId()

  const kcal = ing.food && ing.grams != null ? Math.round((ing.food.kcal * ing.grams) / 100) : null
  const problem = !ing.header && ing.text.trim() && !isNegligible(ing) && (ing.food == null || ing.grams == null)
  const label = ing.text.trim() || `składnik ${index + 1}`

  return (
    <li className={`ing-edit ${problem ? 'warn' : ''}`}>
      <div className="ing-line">
        <input
          value={ing.text}
          aria-label={`Składnik ${index + 1}`}
          onChange={(e) => onText(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="np. 200 g mąki"
          autoFocus={!ing.text}
        />
        <button className="icon-btn small" onClick={() => setOpen((o) => !o)} aria-label={`Popraw: ${label}`} aria-expanded={open} aria-controls={detailsId}>
          <Icon name={open ? 'up' : 'down'} size={18} />
        </button>
      </div>
      {ing.text.trim() && (
        <div className="ing-info">
          {ing.header ? (
            <span>Nagłówek sekcji – nie liczy się do kalorii</span>
          ) : (
            <>
              <span className={ing.food ? '' : 'missing'}>{ing.food ? ing.food.name : 'nie rozpoznano produktu'}</span>
              <span className={ing.grams != null ? '' : 'missing'}>{ing.grams != null ? `${Math.round(ing.grams)} g` : 'brak wagi'}</span>
              {kcal != null && <span>{kcal} kcal</span>}
              {problem && (
                <button className="fix-btn" onClick={ing.food == null ? onPickFood : () => setOpen(true)}>
                  {ing.food == null ? 'Wybierz produkt' : 'Podaj wagę'}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {open && (
        <div className="ing-details" id={detailsId}>
          {!ing.header && (
            <>
              <div className="field inline">
                <label htmlFor={gramsId}>Waga (g)</label>
                <input
                  id={gramsId}
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
              </div>
              <div className="field inline">
                <span>Produkt</span>
                <button className="btn small" onClick={onPickFood}>
                  {ing.food ? `${ing.food.name} · ${ing.food.kcal} kcal/100 g` : 'Wybierz produkt'}
                </button>
              </div>
            </>
          )}
          <div className="row-tools">
            <div className="row">
              <button className="icon-btn small" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Przesuń wyżej: ${label}`}>
                <Icon name="up" size={18} />
              </button>
              <button className="icon-btn small" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Przesuń niżej: ${label}`}>
                <Icon name="down" size={18} />
              </button>
            </div>
            <button className="btn small ghost danger-text" onClick={onRemove} aria-label={`Usuń: ${label}`}>
              <Icon name="trash" size={16} /> Usuń
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
