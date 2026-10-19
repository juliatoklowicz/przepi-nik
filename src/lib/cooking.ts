// Postęp gotowania (odhaczone składniki, bieżący krok, liczba porcji) – trzymany
// w tej przeglądarce, żeby przeżył wygaszenie ekranu i przeładowanie strony.
// Po 12 godzinach traktujemy go jako stary i zaczynamy od nowa.

export interface CookProgress {
  checked: string[]
  step: number
  servings: number | null
  at: number
}

const TTL = 12 * 60 * 60 * 1000
const key = (id: string) => `przepisnik.cook.${id}`

export function loadProgress(id: string): CookProgress {
  const empty: CookProgress = { checked: [], step: 0, servings: null, at: Date.now() }
  try {
    const raw = localStorage.getItem(key(id))
    if (!raw) return empty
    const p = JSON.parse(raw) as CookProgress
    return Date.now() - p.at > TTL ? empty : { ...empty, ...p }
  } catch {
    return empty
  }
}

export function saveProgress(id: string, patch: Partial<CookProgress>) {
  try {
    const next = { ...loadProgress(id), ...patch, at: Date.now() }
    localStorage.setItem(key(id), JSON.stringify(next))
  } catch {
    /* tryb prywatny – trudno */
  }
}

export function clearProgress(id: string) {
  try {
    localStorage.removeItem(key(id))
  } catch {
    /* ignoruj */
  }
}

/** Ekran nie gaśnie, dopóki trwa gotowanie (o ile przeglądarka to umie). */
export function keepScreenOn(): () => void {
  let lock: WakeLockSentinel | null = null
  let active = true
  const request = async () => {
    try {
      if (active && 'wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen')
    } catch {
      /* brak zgody lub wsparcia */
    }
  }
  const onVisible = () => void request()
  void request()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    active = false
    document.removeEventListener('visibilitychange', onVisible)
    void lock?.release().catch(() => {})
  }
}

export const canKeepScreenOn = typeof navigator !== 'undefined' && 'wakeLock' in navigator
