import type { ImportResult } from '../../api/[action]'
import { fetchRemoteImage } from './image'
import { computeNutrition, makeIngredient } from './ingredients'
import { detectLang, getAutoTranslate, LANG_NAMES, translateTexts } from './lang'
import { findMinutes, findServings, parseRecipeText } from './recipeText'
import { emptyRecipe, type Recipe } from './types'

export interface Draft {
  recipe: Recipe
  /** Zdjęcie czekające na zapis (wgrywane dopiero po kliknięciu „Zapisz”). */
  imageBlob?: Blob
  notices: string[]
}

// Szkic przekazywany z ekranu importu do edytora.
let pendingDraft: Draft | null = null
export function setPendingDraft(d: Draft) {
  pendingDraft = d
}
export function peekPendingDraft(): Draft | null {
  return pendingDraft
}
export function clearPendingDraft() {
  pendingDraft = null
}

export async function fetchFromUrl(url: string): Promise<ImportResult> {
  const res = await fetch(`/api/import?url=${encodeURIComponent(url)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Nie udało się pobrać strony')
  return data as ImportResult
}

interface Parts {
  title: string
  ingredients: string[]
  steps: string[]
  notes: string
}

/** Tłumaczy tytuł, składniki, kroki i notatki jednym zapytaniem (jeśli trzeba). */
async function maybeTranslate(parts: Parts, notices: string[]): Promise<Parts> {
  const sample = [parts.title, ...parts.ingredients, ...parts.steps].join('\n')
  const lang = detectLang(sample)
  if (lang === 'pl') return parts
  if (!getAutoTranslate()) {
    notices.push(`Przepis jest w języku: ${LANG_NAMES[lang] ?? lang}. Automatyczne tłumaczenie jest wyłączone w ustawieniach.`)
    return parts
  }
  const all = [parts.title, ...parts.ingredients, ...parts.steps, parts.notes]
  try {
    const t = await translateTexts(all, lang)
    const ni = parts.ingredients.length
    const ns = parts.steps.length
    notices.push(`Przetłumaczono automatycznie z języka: ${LANG_NAMES[lang] ?? lang}. Sprawdź, czy wszystko brzmi dobrze.`)
    return {
      title: t[0] || parts.title,
      ingredients: t.slice(1, 1 + ni).map((s, i) => s || parts.ingredients[i]),
      steps: t.slice(1 + ni, 1 + ni + ns).map((s, i) => s || parts.steps[i]),
      notes: t[1 + ni + ns] ?? parts.notes,
    }
  } catch (e) {
    notices.push(`Nie udało się przetłumaczyć: ${e instanceof Error ? e.message : e}. Zostawiam oryginał.`)
    return parts
  }
}

export interface Source {
  text?: string
  structured?: ImportResult['structured']
  title?: string
  imageUrl?: string
  sourceUrl?: string
}

export async function buildDraft(src: Source): Promise<Draft> {
  const notices: string[] = []
  const recipe = emptyRecipe()
  recipe.sourceUrl = src.sourceUrl ?? ''

  let parts: Parts
  if (src.structured && src.structured.ingredients.length) {
    const s = src.structured
    parts = { title: s.name ?? src.title ?? '', ingredients: s.ingredients, steps: s.steps, notes: s.description ?? '' }
    recipe.servings = findServings(`${s.servings ?? ''} porcji`) ?? (parseInt(s.servings ?? '', 10) || recipe.servings)
    const iso = s.totalTime?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
    if (iso && (iso[1] || iso[2])) recipe.prepMinutes = parseInt(iso[1] ?? '0', 10) * 60 + parseInt(iso[2] ?? '0', 10)
  } else {
    const text = src.text ?? ''
    const parsed = parseRecipeText(text)
    parts = { title: parsed.title || src.title || '', ingredients: parsed.ingredients, steps: parsed.steps, notes: parsed.notes }
    if (parsed.servings) recipe.servings = parsed.servings
    recipe.prepMinutes = parsed.prepMinutes ?? findMinutes(text)
    if (!parsed.ingredients.length && !parsed.steps.length) {
      notices.push('Nie znaleziono składników ani kroków – uzupełnij przepis ręcznie (oryginalny tekst jest w notatkach).')
      parts.notes = text
    } else if (!parsed.ingredients.length) {
      notices.push('Nie znaleziono listy składników – dopisz je ręcznie.')
    }
  }

  parts = await maybeTranslate(parts, notices)
  recipe.title = parts.title
  recipe.ingredients = parts.ingredients.map(makeIngredient)
  recipe.steps = parts.steps
  recipe.notes = parts.notes

  let imageBlob: Blob | undefined
  if (src.imageUrl) {
    imageBlob = (await fetchRemoteImage(src.imageUrl)) ?? undefined
    if (imageBlob) recipe.imageUrl = URL.createObjectURL(imageBlob)
  }

  const unmatched = computeNutrition(recipe.ingredients).missing.length
  if (unmatched) notices.push(`${unmatched} skł. wymaga uzupełnienia wagi lub produktu, żeby policzyć kalorie.`)

  return { recipe, imageBlob, notices }
}
