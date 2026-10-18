// Proste wykrywanie języka po częstych słowach – wystarcza, żeby zdecydować,
// czy przepis trzeba tłumaczyć i z jakiego języka.

const STOPWORDS: Record<string, string[]> = {
  pl: ['i', 'w', 'z', 'na', 'do', 'się', 'nie', 'oraz', 'jest', 'minut', 'łyżki', 'łyżka', 'szklanki', 'składniki', 'przygotowanie', 'dodaj', 'dodać', 'aż', 'ok', 'pół', 'masło', 'mąki', 'jajka', 'cukru', 'soli', 'piekarnika', 'stopni', 'wszystko', 'potem', 'następnie'],
  en: ['the', 'and', 'of', 'with', 'to', 'add', 'cup', 'cups', 'tbsp', 'tsp', 'minutes', 'ingredients', 'until', 'into', 'for', 'in', 'then', 'mix', 'bake', 'oven', 'salt', 'sugar', 'flour', 'eggs', 'butter', 'your', 'this', 'recipe'],
  de: ['und', 'mit', 'der', 'die', 'das', 'zutaten', 'minuten', 'ein', 'eine', 'den', 'mehl', 'zucker', 'backofen', 'dann', 'zubereitung', 'eier', 'für'],
  es: ['el', 'la', 'de', 'con', 'y', 'los', 'las', 'ingredientes', 'minutos', 'taza', 'cucharada', 'añadir', 'harina', 'azúcar', 'huevos', 'horno', 'para'],
  it: ['il', 'di', 'con', 'e', 'gli', 'ingredienti', 'minuti', 'cucchiaio', 'farina', 'zucchero', 'uova', 'forno', 'aggiungere', 'per', 'della'],
  fr: ['le', 'de', 'et', 'avec', 'les', 'ingrédients', 'minutes', 'cuillère', 'farine', 'sucre', 'oeufs', 'four', 'ajouter', 'pour', 'une', 'des'],
  pt: ['o', 'de', 'com', 'e', 'os', 'ingredientes', 'minutos', 'colher', 'farinha', 'açúcar', 'ovos', 'forno', 'adicione', 'para', 'uma'],
}

const SETS = Object.fromEntries(Object.entries(STOPWORDS).map(([k, v]) => [k, new Set(v)]))

export function detectLang(text: string): string {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  if (words.length < 3) return 'pl'
  const scores: Record<string, number> = {}
  for (const lang of Object.keys(SETS)) scores[lang] = 0
  for (const w of words) for (const lang of Object.keys(SETS)) if (SETS[lang].has(w)) scores[lang]++
  scores.pl += (text.match(/[ąćęłńśźż]/gi)?.length ?? 0) * 0.7
  const [best, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  return score > 0 ? best : 'pl'
}

export const LANG_NAMES: Record<string, string> = {
  pl: 'polski',
  en: 'angielski',
  de: 'niemiecki',
  es: 'hiszpański',
  it: 'włoski',
  fr: 'francuski',
  pt: 'portugalski',
}

export async function translateTexts(texts: string[], from: string): Promise<string[]> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts, from, to: 'pl' }),
  })
  const data = (await res.json()) as { texts?: string[]; error?: string }
  if (!res.ok || !data.texts) throw new Error(data.error ?? 'Tłumaczenie nie powiodło się')
  return data.texts
}

const SETTINGS_KEY = 'przepisnik.autoTranslate'

export function getAutoTranslate(): boolean {
  try {
    return localStorage.getItem(SETTINGS_KEY) !== '0'
  } catch {
    return true
  }
}

export function setAutoTranslate(v: boolean) {
  try {
    localStorage.setItem(SETTINGS_KEY, v ? '1' : '0')
  } catch {
    /* brak dostępu do pamięci przeglądarki */
  }
}
