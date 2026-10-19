import type { Recipe } from './types'

// Szkic edytowanego przepisu, zapisywany na bieżąco w tej przeglądarce.
// Chroni pracę przy zamknięciu karty, braku sieci czy przypadkowym „Wstecz”.

export interface StoredDraft {
  recipe: Recipe
  at: number
}

const key = (id: string | undefined) => `przepisnik.draft.${id ?? 'new'}`

export function loadDraft(id: string | undefined): StoredDraft | null {
  try {
    const raw = localStorage.getItem(key(id))
    return raw ? (JSON.parse(raw) as StoredDraft) : null
  } catch {
    return null
  }
}

export function saveDraft(id: string | undefined, recipe: Recipe) {
  try {
    // Adres blob: nie przeżyje przeładowania – zdjęcie trzeba wtedy dodać ponownie.
    const safe = recipe.imageUrl.startsWith('blob:') ? { ...recipe, imageUrl: '' } : recipe
    localStorage.setItem(key(id), JSON.stringify({ recipe: safe, at: Date.now() }))
  } catch {
    /* brak miejsca lub tryb prywatny */
  }
}

export function clearDraft(id: string | undefined) {
  try {
    localStorage.removeItem(key(id))
  } catch {
    /* ignoruj */
  }
}

export function formatTime(at: number): string {
  const d = new Date(at)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? `dziś o ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pl-PL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
