import { FOODS, findFoodById, type Food, type FoodExtras } from './foods'
import { uid, type FoodRef, type Ingredient } from './types'

// ---------- Jednostki ----------

interface UnitDef {
  /** [1, 2–4, 5+, ułamek] – np. łyżka, łyżki, łyżek, łyżki */
  forms: [string, string, string, string]
  g?: number
  ml?: number
  extra?: keyof FoodExtras
  fallback?: number
  aliases: string[]
}

export const UNITS: Record<string, UnitDef> = {
  g: { forms: ['g', 'g', 'g', 'g'], g: 1, aliases: ['g', 'gr', 'gram', 'gramy', 'gramow', 'grama', 'grams', 'gramm'] },
  kg: { forms: ['kg', 'kg', 'kg', 'kg'], g: 1000, aliases: ['kg', 'kilogram', 'kilogramy', 'kilogramow', 'kilo'] },
  dag: { forms: ['dag', 'dag', 'dag', 'dag'], g: 10, aliases: ['dag', 'dkg', 'deko', 'dekagram', 'dekagramy', 'dekagramow'] },
  mg: { forms: ['mg', 'mg', 'mg', 'mg'], g: 0.001, aliases: ['mg'] },
  ml: { forms: ['ml', 'ml', 'ml', 'ml'], ml: 1, aliases: ['ml', 'mililitr', 'mililitry', 'mililitrow'] },
  l: { forms: ['l', 'l', 'l', 'l'], ml: 1000, aliases: ['l', 'litr', 'litra', 'litry', 'litrow', 'liter', 'liters', 'litre', 'litres'] },
  szklanka: {
    forms: ['szklanka', 'szklanki', 'szklanek', 'szklanki'],
    ml: 250,
    aliases: ['szklanka', 'szklanki', 'szklanek', 'szklanke', 'szkl', 'cup', 'cups', 'kubek', 'kubki', 'kubka'],
  },
  łyżka: {
    forms: ['łyżka', 'łyżki', 'łyżek', 'łyżki'],
    ml: 15,
    aliases: ['lyzka', 'lyzki', 'lyzek', 'lyzke', 'lyz', 'tbsp', 'tbs', 'tablespoon', 'tablespoons'],
  },
  łyżeczka: {
    forms: ['łyżeczka', 'łyżeczki', 'łyżeczek', 'łyżeczki'],
    ml: 5,
    aliases: ['lyzeczka', 'lyzeczki', 'lyzeczek', 'lyzeczke', 'lyzecz', 'lyzeczk', 'tsp', 'teaspoon', 'teaspoons'],
  },
  szczypta: { forms: ['szczypta', 'szczypty', 'szczypt', 'szczypty'], g: 0.5, aliases: ['szczypta', 'szczypty', 'szczypte', 'szczypt', 'pinch', 'pinches'] },
  garść: {
    forms: ['garść', 'garście', 'garści', 'garści'],
    extra: 'handful',
    fallback: 30,
    aliases: ['garsc', 'garsci', 'garscie', 'garstka', 'garstki', 'garstke', 'handful', 'handfuls'],
  },
  'szt.': {
    forms: ['szt.', 'szt.', 'szt.', 'szt.'],
    extra: 'pc',
    aliases: ['szt', 'sztuka', 'sztuki', 'sztuk', 'pc', 'pcs', 'piece', 'pieces'],
  },
  ząbek: { forms: ['ząbek', 'ząbki', 'ząbków', 'ząbka'], g: 5, aliases: ['zabek', 'zabki', 'zabkow', 'zabka', 'clove', 'cloves'] },
  plaster: {
    forms: ['plaster', 'plastry', 'plastrów', 'plastra'],
    extra: 'slice',
    fallback: 20,
    aliases: ['plaster', 'plastry', 'plastrow', 'plastra', 'plasterek', 'plasterki', 'plasterkow', 'slice', 'slices'],
  },
  kromka: { forms: ['kromka', 'kromki', 'kromek', 'kromki'], extra: 'slice', fallback: 35, aliases: ['kromka', 'kromki', 'kromek', 'kromke'] },
  puszka: { forms: ['puszka', 'puszki', 'puszek', 'puszki'], extra: 'can', fallback: 400, aliases: ['puszka', 'puszki', 'puszek', 'puszke', 'can', 'cans', 'tin', 'tins'] },
  opakowanie: {
    forms: ['opakowanie', 'opakowania', 'opakowań', 'opakowania'],
    extra: 'pack',
    aliases: ['opakowanie', 'opakowania', 'opakowan', 'opak', 'op', 'paczka', 'paczki', 'paczek', 'paczke', 'torebka', 'torebki', 'saszetka', 'saszetki', 'package', 'packages', 'pack'],
  },
  kostka: { forms: ['kostka', 'kostki', 'kostek', 'kostki'], extra: 'cube', aliases: ['kostka', 'kostki', 'kostek', 'kostke', 'cube', 'cubes'] },
  pęczek: { forms: ['pęczek', 'pęczki', 'pęczków', 'pęczka'], extra: 'bunch', fallback: 40, aliases: ['peczek', 'peczki', 'peczka', 'peczkow', 'bunch', 'bunches'] },
  miarka: { forms: ['miarka', 'miarki', 'miarek', 'miarki'], extra: 'pc', fallback: 30, aliases: ['miarka', 'miarki', 'miarek', 'scoop', 'scoops'] },
  kawałek: { forms: ['kawałek', 'kawałki', 'kawałków', 'kawałka'], extra: 'pc', fallback: 30, aliases: ['kawalek', 'kawalki', 'kawalkow', 'kawalka', 'piece of'] },
  oz: { forms: ['oz', 'oz', 'oz', 'oz'], g: 28.35, aliases: ['oz', 'ounce', 'ounces'] },
  lb: { forms: ['lb', 'lb', 'lb', 'lb'], g: 453.6, aliases: ['lb', 'lbs', 'pound', 'pounds'] },
}

export const UNIT_KEYS = Object.keys(UNITS)

/** Jednostki „kuchenne”, przy których ilości pokazujemy jako ułamki (½, ¼). */
const FRACTION_UNITS = new Set(['szklanka', 'łyżka', 'łyżeczka', 'szt.', 'garść', 'puszka', 'opakowanie', 'kostka', 'pęczek', 'ząbek', 'kromka', 'plaster', 'miarka', 'szczypta', 'kawałek'])
const MASS_OR_VOLUME = new Set(['g', 'kg', 'dag', 'mg', 'ml', 'l', 'oz', 'lb'])

export function stripDiacritics(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const UNIT_LOOKUP = new Map<string, string>()
for (const [key, def] of Object.entries(UNITS)) for (const a of def.aliases) UNIT_LOOKUP.set(a, key)

function lookupUnit(word: string | undefined): string | null {
  if (!word) return null
  return UNIT_LOOKUP.get(stripDiacritics(word).replace(/\.+$/, '')) ?? null
}

export function unitLabel(unit: string | null, amount: number | null): string {
  if (!unit) return ''
  const def = UNITS[unit]
  if (!def) return unit
  if (amount == null) return def.forms[0]
  if (!Number.isInteger(amount)) return def.forms[3]
  if (amount === 1) return def.forms[0]
  const mod10 = amount % 10
  const mod100 = amount % 100
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return def.forms[1]
  return def.forms[2]
}

// ---------- Liczby ----------

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅕': 0.2, '⅖': 0.4 }
const WORD_NUMBERS: Record<string, number> = {
  pół: 0.5, pol: 0.5, półtora: 1.5, półtorej: 1.5, poltora: 1.5, poltorej: 1.5,
  jeden: 1, jedna: 1, jedno: 1, jedną: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, pięć: 5, sześć: 6,
  one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5,
}

const QTY = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?(?:\s*(?:-|–|do)\s*\d+(?:[.,]\d+)?)?`
const WORD_QTY = Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length).join('|')

function replaceUnicodeFractions(s: string): string {
  return s.replace(/(\d+)?\s*([½¼¾⅓⅔⅛⅕⅖])/g, (_, whole, frac) => {
    const v = (whole ? parseInt(whole, 10) : 0) + FRACTIONS[frac]
    return ` ${+v.toFixed(3)} `.replace('.', ',')
  })
}

export function parseQty(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  if (s in WORD_NUMBERS) return WORD_NUMBERS[s]
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10)
  m = s.match(/^(\d+)\/(\d+)$/)
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10)
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:-|–|do)\s*(\d+(?:[.,]\d+)?)$/)
  if (m) return (parseFloat(m[1].replace(',', '.')) + parseFloat(m[2].replace(',', '.'))) / 2
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function formatAmount(n: number, unit: string | null): string {
  if (unit && !FRACTION_UNITS.has(unit)) {
    if (n >= 100) return String(Math.round(n / 5) * 5)
    if (n >= 10) return String(Math.round(n))
    return String(+n.toFixed(1)).replace('.', ',')
  }
  const whole = Math.floor(n)
  const rest = n - whole
  const options: [number, string][] = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']]
  let best = options[0]
  for (const o of options) if (Math.abs(o[0] - rest) < Math.abs(best[0] - rest)) best = o
  if (n >= 10) return String(Math.round(n))
  const w = best[0] === 1 ? whole + 1 : whole
  if (!best[1]) return String(w || (n > 0 ? '¼' : '0'))
  return `${w || ''}${best[1]}`
}

// ---------- Parsowanie linii składnika ----------

const LEADING_JUNK = /^[\s\-–—•*·▪▫◦‣⁃✓✔☑➡►▶→>+]+|^[\p{Extended_Pictographic}\uFE0F\u200D\u20E3\s]+/u
const APPROX = /^(ok\.?|około|okolo|ca\.?|about|approx\.?|approximately|~)\s*/i
const UNIT_QUALIFIERS = /^(stołow\w*|stolow\w*|herbacian\w*|płask\w*|plask\w*|czubat\w*|kopiast\w*|pełn\w*|peln\w*|duż\w*|mał\w*|heaping|level|of)\s+/i

export interface ParsedLine {
  amount: number | null
  unit: string | null
  name: string
}

function cleanName(s: string): string {
  return s
    .replace(/^(of|x|×)\s+/i, '')
    .replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function cleanLine(raw: string): string {
  let s = raw.replace(/\u00A0/g, ' ').trim()
  for (let i = 0; i < 3; i++) s = s.replace(LEADING_JUNK, '')
  return s.trim()
}

// Ilość na końcu linii („mąka – 500 g”) – bez zakresów ze spacjami, żeby „typ 650 - 500 g” nie był zakresem.
const QTY_TRAIL = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?(?:[-–]\d+(?:[.,]\d+)?)?`
const TRAIL_RE = new RegExp(`^(.*?\\p{L}.*?)[\\s:\\-–—(]+(?:ok\\.?\\s*|około\\s*)?(${QTY_TRAIL})\\s*([\\p{L}.]+)?\\)?\\.?$`, 'iu')
// Gramatura w środku/na końcu, np. „1 serek mascarpone 250 g” albo „1 puszka pomidorów (400 g)”
const INNER_WEIGHT_RE = new RegExp(`[\\s(]+(${QTY_TRAIL})\\s*(g|gr|kg|dag|dkg|ml|l)\\b\\.?\\)?`, 'iu')

export function parseIngredientLine(raw: string): ParsedLine {
  let s = replaceUnicodeFractions(cleanLine(raw)).replace(/\s{2,}/g, ' ').trim()
  // Numeracja listy typu „1. 200 g mąki” lub „1) 2 jajka”
  s = s
    .replace(/^\d+[.)]\s+(?=\d)/, '')
    .replace(APPROX, '')
    .replace(/^(\d+)\s+(?:i|and)\s+(\d+\/\d+)/i, '$1 $2')

  const juice = s.match(new RegExp(`^sok\\s+z\\s+(${QTY}|pół|połowy|jednej|dwóch|dwu|trzech)?\\s*(cytryn|limon)\\p{L}*`, 'iu'))
  if (juice) {
    const words: Record<string, number> = { pół: 0.5, połowy: 0.5, jednej: 1, dwóch: 2, dwu: 2, trzech: 3 }
    const amount = juice[1] ? (words[juice[1].toLowerCase()] ?? parseQty(juice[1])) : 1
    return { amount, unit: null, name: /cytryn/i.test(juice[2]) ? 'sok z cytryny' : 'sok z limonki' }
  }

  const lead = s.match(new RegExp(`^(${QTY}|(?:${WORD_QTY})(?=\\s))\\s*([\\p{L}.]+)?\\s*(.*)$`, 'iu'))
  if (lead) {
    let amount = parseQty(lead[1])
    let unit = lookupUnit(lead[2])
    let name = unit ? lead[3] : `${lead[2] ?? ''} ${lead[3]}`
    if (unit) name = name.replace(UNIT_QUALIFIERS, '').replace(UNIT_QUALIFIERS, '')
    if (!unit || !MASS_OR_VOLUME.has(unit)) {
      const inner = name.match(INNER_WEIGHT_RE)
      if (inner) {
        amount = parseQty(inner[1])! * (amount ?? 1)
        unit = lookupUnit(inner[2])
        name = name.replace(inner[0], ' ')
      }
    }
    return { amount, unit, name: cleanName(name) }
  }

  const trail = s.match(TRAIL_RE)
  if (trail && !/\b(typ|type|nr)$/i.test(trail[1].trim())) {
    const unit = lookupUnit(trail[3])
    if (unit || !trail[3]) {
      return { amount: parseQty(trail[2]), unit, name: cleanName(trail[1]) }
    }
  }

  // „szczypta soli”, „garść szpinaku”, „łyżka masła” – jednostka bez liczby oznacza 1
  const first = s.match(/^([\p{L}.]+)\s+(.+)$/u)
  const firstUnit = first && lookupUnit(first[1])
  if (first && firstUnit && !MASS_OR_VOLUME.has(firstUnit)) {
    return { amount: 1, unit: firstUnit, name: cleanName(first[2].replace(UNIT_QUALIFIERS, '')) }
  }

  return { amount: null, unit: null, name: cleanName(s) }
}

// ---------- Dopasowanie do bazy produktów ----------

const ENDINGS = ['owie', 'iami', 'ami', 'ach', 'ich', 'ych', 'ymi', 'imi', 'owi', 'ego', 'emu', 'iej', 'ej', 'ow', 'om', 'em', 'ia', 'ie', 'iu', 'ym', 'im', 'es', 'a', 'e', 'i', 'o', 'u', 'y', 's']

function stem(word: string): string {
  const w = stripDiacritics(word)
  if (w.length < 4) return w
  for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 3) return w.slice(0, -e.length)
  return w
}

/** Ruchome „e”: cukier → cukr(u), ogórek → ogórk(a), czosnek → czosnk(u). */
function mobileE(word: string): string | null {
  const w = stripDiacritics(word)
  const m = w.match(/^(.*[^aeiouy])i?e([^aeiouy]{1,2})$/)
  return m && m[1].length >= 2 ? m[1] + m[2] : null
}

function commonPrefix(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

function tokenScore(aliasWord: string, word: string): number {
  if (/\d/.test(aliasWord) || /\d/.test(word)) return aliasWord === word ? 3 : 0
  const a = stem(aliasWord)
  const b = stem(word)
  // Premia za zgodność z polskimi znakami (żeby „mąki” wybrało mąkę, a nie mak).
  const exactDiacritics = word.toLowerCase().startsWith(aliasWord.toLowerCase().slice(0, Math.max(3, aliasWord.length - 1))) ? 1 : 0
  if (a === b) return a.length + 2 + exactDiacritics
  const alt = mobileE(aliasWord)
  if (alt && (b === alt || stem(word) === alt || b.startsWith(alt))) return a.length + 1
  const cp = commonPrefix(a, b)
  const minLen = Math.min(a.length, b.length)
  const maxLen = Math.max(a.length, b.length)
  // Krótkie rdzenie (3 litery) tylko przy pełnym prefiksie: „jaj” ~ „jajk”, ale nie „mint” ~ „minut”.
  if (cp >= Math.max(3, maxLen - 2) && (cp >= 4 || (cp === minLen && maxLen - minLen <= 1))) return a.length + exactDiacritics
  return 0
}

function words(s: string): string[] {
  return (s.toLowerCase().match(/\p{L}+|\d+/gu) ?? []).filter((w) => w.length >= 2)
}

interface IndexedAlias {
  food: Food
  words: string[]
}

const ALIAS_INDEX: IndexedAlias[] = FOODS.flatMap((food) => food.aliases.map((a) => ({ food, words: words(a) })))

function scoreAlias(alias: IndexedAlias, nameWords: string[]): number {
  let total = 0
  for (const aw of alias.words) {
    let best = 0
    let bestIdx = -1
    nameWords.forEach((nw, idx) => {
      const sc = tokenScore(aw, nw)
      if (sc > best) {
        best = sc
        bestIdx = idx
      }
    })
    if (!best) return 0
    total += best + (bestIdx === 0 ? 1 : 0)
  }
  return total
}

/** Najlepiej pasujące produkty z wbudowanej bazy (od najlepszego). */
export function searchFoods(name: string, limit = 8): Food[] {
  const nameWords = words(name)
  if (!nameWords.length) return []
  const best = new Map<Food, number>()
  for (const alias of ALIAS_INDEX) {
    const sc = scoreAlias(alias, nameWords)
    if (sc > (best.get(alias.food) ?? 0)) best.set(alias.food, sc)
  }
  return [...best.entries()]
    .filter(([, sc]) => sc >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([f]) => f)
}

export function matchFood(name: string): Food | undefined {
  return searchFoods(name, 1)[0]
}

export function toFoodRef(food: Food): FoodRef {
  return { id: food.id, name: food.name, kcal: food.kcal, protein: food.protein, fat: food.fat, carbs: food.carbs, source: 'local' }
}

// ---------- Gramy i makro ----------

export function computeGrams(amount: number | null, unit: string | null, food: FoodRef | null): number | null {
  if (amount == null) return null
  const extras: FoodExtras = (food && findFoodById(food.id)) || {}
  if (!unit) return extras.pc ? amount * extras.pc : null
  const def = UNITS[unit]
  if (!def) return null
  if (def.g) return amount * def.g
  if (def.ml) return amount * def.ml * (extras.d ?? 1)
  const per = (def.extra && extras[def.extra]) || def.fallback
  return per ? amount * per : null
}

const NEGLIGIBLE = /do smaku|opcjonaln|według uznania|wedlug uznania|do podania|do dekoracji|do posypania|to taste|optional|for serving|garnish/i

/** Dodatki „do podania”, „opcjonalnie” bez konkretnej ilości – nie wliczamy ich do kalorii. */
function isOptional(ing: Ingredient): boolean {
  return NEGLIGIBLE.test(ing.text) && !/^\d/.test(cleanLine(ing.text))
}

export function isNegligible(ing: Ingredient): boolean {
  if (ing.header || isOptional(ing)) return true
  return ing.food?.kcal === 0
}

export function makeIngredient(text: string): Ingredient {
  const trimmed = cleanLine(text)
  if (/^[^\d]{1,40}:$/.test(trimmed)) {
    return { id: uid(), text: trimmed, header: true, amount: null, unit: null, name: trimmed, grams: null, food: null }
  }
  const p = parseIngredientLine(trimmed)
  const food = matchFood(p.name)
  const ref = food ? toFoodRef(food) : null
  return { id: uid(), text: trimmed, amount: p.amount, unit: p.unit, name: p.name, food: ref, grams: computeGrams(p.amount, p.unit, ref) }
}

/** Po zmianie tekstu linii: przelicza ilość/jednostkę, ale zachowuje ręczne poprawki. */
export function reparseIngredient(ing: Ingredient, text: string): Ingredient {
  const fresh = makeIngredient(text)
  const food = ing.foodManual ? ing.food : fresh.food
  return {
    ...fresh,
    id: ing.id,
    food,
    foodManual: ing.foodManual,
    grams: ing.gramsManual ? ing.grams : computeGrams(fresh.amount, fresh.unit, food),
    gramsManual: ing.gramsManual,
  }
}

export interface Macros {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

export function computeNutrition(ingredients: Ingredient[]): { total: Macros; missing: Ingredient[] } {
  const total: Macros = { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  const missing: Ingredient[] = []
  for (const ing of ingredients) {
    if (ing.header || isOptional(ing)) continue
    if (ing.food && ing.grams != null) {
      const f = ing.grams / 100
      total.kcal += ing.food.kcal * f
      total.protein += ing.food.protein * f
      total.fat += ing.food.fat * f
      total.carbs += ing.food.carbs * f
    } else if (!isNegligible(ing)) {
      missing.push(ing)
    }
  }
  return { total, missing }
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return { kcal: m.kcal * factor, protein: m.protein * factor, fat: m.fat * factor, carbs: m.carbs * factor }
}

/** Linia składnika po przeskalowaniu porcji, np. „1½ szklanki mąki pszennej”. */
export function displayIngredient(ing: Ingredient, factor: number): string {
  if (ing.header || ing.amount == null) return ing.text
  const amount = ing.amount * factor
  const juice = !ing.unit && ing.name.match(/^sok z (cytryny|limonki)$/)
  if (juice) return `sok z ${formatAmount(amount, 'szt.')} ${juice[1]}`
  const unit = unitLabel(ing.unit, Number(formatAmount(amount, ing.unit).replace(',', '.')) || amount)
  return [formatAmount(amount, ing.unit), unit, ing.name].filter(Boolean).join(' ')
}
