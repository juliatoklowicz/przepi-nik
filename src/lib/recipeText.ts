// Zamiana luźnego tekstu (opis z TikToka/Instagrama, tekst ze zrzutu ekranu,
// transkrypcja filmu) na szkic przepisu: tytuł, porcje, składniki, kroki.
// Bez AI – na regułach, więc wynik zawsze warto przejrzeć w edytorze.

import { cleanLine, matchFood, parseIngredientLine } from './ingredients'

export interface TextDraft {
  title: string
  servings: number | null
  prepMinutes: number | null
  ingredients: string[]
  steps: string[]
  notes: string
}

const ING_HEAD = /^(składniki|skladniki|lista składników|potrzebujesz|będziesz potrzebować|ingredients?|you(?:'|’)ll need|zutaten|ingredientes|ingredienti|ingrédients)\b\s*(?:\([^)]*\))?\s*[:\-–—]?\s*(.*)$/iu
const STEP_HEAD = /^(przygotowanie|sposób przygotowania|sposob przygotowania|wykonanie|instrukcj[ae]|kroki|jak (?:to )?zrobić|przepis krok po kroku|instructions?|method|directions|steps|preparation|how to make(?: it)?|zubereitung|preparación|preparazione|procedimento)\b\s*[:\-–—]?\s*(.*)$/iu
const NOTE_HEAD = /^(wskazówki|wskazowki|uwagi|porady?|rady|tipy?|tips?|notes?|note)\b\s*[:\-–—]?\s*(.*)$/iu

const STEP_NUMBER = /^(?:\d{1,2}\s*[.)]|\d️?⃣|krok\s*\d+\s*[:.)]?|step\s*\d+\s*[:.)]?)\s*/iu

const QTY_START = /^(?:\d|[½¼¾⅓⅔]|pół\b|półtor|jeden\b|jedna\b|dwa\b|dwie\b|trzy\b|szczypta|garść|łyżk|łyżecz|szklank|kawałek|opakowanie|puszka|a pinch|one\b|two\b)/iu

function fahrenheitToCelsius(text: string): string {
  return text.replace(/(\d{3})\s*°?\s*F\b/g, (_, f) => `${Math.round(((parseInt(f, 10) - 32) * 5) / 9 / 5) * 5}°C`)
}

function stripHashtags(text: string): string {
  return text
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1')
    .replace(/[ \t]{2,}/g, ' ')
}

/** Rozbija jednolinijkowy opis (typowy dla TikToka) na linie. */
function explodeLines(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length >= 4 && text.length / lines.length < 160) return text
  return text
    .replace(/\s*([\p{Extended_Pictographic}](?:️|‍[\p{Extended_Pictographic}])*)\s*/gu, '\n$1 ')
    .replace(/\s+([•▪◦‣⁃]|[-–—](?=\s))\s+/g, '\n$1 ')
    .replace(/\s+(?=\d{1,2}[.)]\s+\p{Lu})/gu, '\n')
    .replace(
      /\s*\b(składniki|skladniki|przygotowanie|sposób przygotowania|wykonanie|ingredients|instructions|method|directions|wskazówki|tips)\b\s*[:\-–—]/giu,
      '\n$1:',
    )
}

function cleanTitle(s: string): string {
  return cleanLine(s)
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/[\s,(]*(serves\s*\d+|(?:na|for|dla)\s+\d+\s*(?:porcj|osob|osób|people|servings)\p{L}*|\d+\s*(?:porcj\p{L}*|servings))\)?/giu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[:\-–—|,.]+$/, '')
    .trim()
    .slice(0, 90)
}

function looksLikeIngredient(line: string): boolean {
  if (line.length > 80 || /[.!?]$/.test(line) && line.split(' ').length > 7) return false
  if (QTY_START.test(line)) return true
  const p = parseIngredientLine(line)
  if (p.amount != null) return true
  return line.split(/\s+/).length <= 4 && !!matchFood(line)
}

function looksLikeStep(line: string): boolean {
  return STEP_NUMBER.test(line) || line.length > 70 || /^(dodaj|wymieszaj|piecz|gotuj|smaż|pokrój|wlej|wsyp|podgrzej|ugotuj|zblenduj|wstaw|połącz|rozgrzej|add|mix|bake|cook|fry|cut|pour|heat|stir|preheat|combine|blend|place)\b/i.test(line)
}

function splitLongStep(step: string): string[] {
  if (step.length < 260) return [step]
  return step.split(/(?<=[.!?])\s+(?=[\p{Lu}])/u).reduce<string[]>((acc, s) => {
    const last = acc[acc.length - 1]
    if (last && last.length + s.length < 160) acc[acc.length - 1] = `${last} ${s}`
    else acc.push(s)
    return acc
  }, [])
}

function splitCommaList(content: string): string[] {
  const parts = content.split(/,\s+|;\s*/)
  return parts.length >= 2 && parts.every((p) => p.length < 50) ? parts : [content]
}

export function findServings(text: string): number | null {
  const m =
    text.match(/(?:na|for|dla)\s+(\d{1,2})\s*(?:porcj|osob|osób|people|servings|persons|sztuk)/i) ??
    text.match(/(\d{1,2})\s*(?:porcj\p{L}*|osob\p{L}*|osób|servings|portions|people)\b/iu) ??
    text.match(/(?:porcje|porcji|servings|serves|yield|ilość porcji)\s*[:\-]?\s*(\d{1,2})/i)
  return m ? parseInt(m[1], 10) : null
}

export function findMinutes(text: string): number | null {
  const h = text.match(/(?:czas[^\d\n]{0,30}|w\s+|ready in\s+|takes\s+|total time[:\s]+)(\d+(?:[.,]\d)?)\s*(?:h|godz|hours?)\b/i)
  if (h) return Math.round(parseFloat(h[1].replace(',', '.')) * 60)
  const m = text.match(/(?:czas[^\d\n]{0,30}|w\s+|gotowe w\s+|ready in\s+|takes\s+|total time[:\s]+)(\d{1,3})\s*(?:min|minut)/i)
  return m ? parseInt(m[1], 10) : null
}

// Liczebniki w różnych przypadkach – w mowie („dwóch bananów, czterdziestu gramów”) padają zamiast cyfr.
const NUMBER_WORDS: Record<string, number> = {
  pół: 0.5, jeden: 1, jedna: 1, jedno: 1, jednego: 1, jednej: 1, jedną: 1,
  dwa: 2, dwie: 2, dwóch: 2, dwoma: 2, trzy: 3, trzech: 3, cztery: 4, czterech: 4,
  pięć: 5, pięciu: 5, sześć: 6, sześciu: 6, siedem: 7, siedmiu: 7, osiem: 8, ośmiu: 8,
  dziesięć: 10, dziesięciu: 10, piętnaście: 15, piętnastu: 15, dwadzieścia: 20, dwudziestu: 20,
  trzydzieści: 30, trzydziestu: 30, czterdzieści: 40, czterdziestu: 40, pięćdziesiąt: 50, pięćdziesięciu: 50,
  sto: 100, stu: 100, dwieście: 200, dwustu: 200, trzysta: 300, trzystu: 300, czterysta: 400, pięćset: 500,
  one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5,
}

/** Z tekstu bez struktury (np. transkrypcji) wyciąga fragmenty typu „200 g mąki” albo „dwóch bananów”. */
export function extractInlineIngredients(text: string): string[] {
  const units = String.raw`g|gram\p{L}*|kg|dag|dkg|deko|ml|mililitr\p{L}*|l|litr\p{L}*|łyż\p{L}*|szklan\p{L}*|szczypt\p{L}*|garś\p{L}*|ząb\p{L}*|opakowa\p{L}*|puszk\p{L}*|kostk\p{L}*|cups?|tbsp|tsp|tablespoons?|teaspoons?`
  const numWords = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')
  const re = new RegExp(String.raw`(?<![\p{L}\d])(\d+(?:[.,]\d+)?|${numWords})\s+(?:(${units})\s+)?(\p{L}{3,})(?:\s+(\p{L}{4,}))?`, 'giu')
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(re)) {
    const [, num, unit, w1, w2] = m
    if (/^(minut|sekund|godzin|stopni|raz|osob|osób|porcj|sztuk|dni|minutes?|seconds?|hours?|degrees?|times)/i.test(w1)) continue
    const qty = /\d/.test(num) ? num : String(NUMBER_WORDS[num.toLowerCase()])
    // Drugie słowo tylko, jeśli doprecyzowuje produkt („płatków owsianych”, „mleka kokosowego”).
    const two = w2 ? matchFood(`${w1} ${w2}`) : undefined
    const single = matchFood(w1)
    const useTwo = !!two && two !== single
    const food = useTwo ? two : single
    if (!food) continue
    const name = useTwo ? `${w1} ${w2}` : w1
    const key = food.name
    if (seen.has(key)) continue
    seen.add(key)
    out.push([qty, unit, name].filter(Boolean).join(' '))
  }
  return out
}

export function parseRecipeText(raw: string): TextDraft {
  const text = explodeLines(fahrenheitToCelsius(stripHashtags(raw.replace(/\r/g, ''))))
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^[\p{Extended_Pictographic}️‍\s.,:!-]*$/u.test(l))

  const intro: string[] = []
  const ingredients: string[] = []
  const steps: string[] = []
  const notes: string[] = []
  let section: 'intro' | 'ingredients' | 'steps' | 'notes' = 'intro'
  const hasHeadings = lines.some((l) => ING_HEAD.test(cleanLine(l)) || STEP_HEAD.test(cleanLine(l)))

  for (const rawLine of lines) {
    const line = cleanLine(rawLine)
    if (!line) continue
    let m: RegExpMatchArray | null
    if ((m = line.match(ING_HEAD))) {
      section = 'ingredients'
      if (m[2]) ingredients.push(...splitCommaList(m[2]))
      continue
    }
    if ((m = line.match(STEP_HEAD))) {
      section = 'steps'
      if (m[2]) steps.push(m[2])
      continue
    }
    if ((m = line.match(NOTE_HEAD)) && line.length < 40) {
      section = 'notes'
      if (m[2]) notes.push(m[2])
      continue
    }

    if (!hasHeadings) {
      // Bez nagłówków zgadujemy po wyglądzie linii.
      const firstLine = section === 'intro' && !intro.length
      if (looksLikeIngredient(line) && !STEP_NUMBER.test(line) && (!firstLine || QTY_START.test(line))) section = 'ingredients'
      else if (section !== 'intro' && looksLikeStep(line)) section = 'steps'
      else if (section === 'intro' && looksLikeStep(line) && intro.length) section = 'steps'
    } else if (section === 'ingredients' && STEP_NUMBER.test(line) && !looksLikeIngredient(line.replace(STEP_NUMBER, ''))) {
      section = 'steps'
    }

    switch (section) {
      case 'intro':
        intro.push(line)
        break
      case 'ingredients':
        ingredients.push(...splitCommaList(line))
        break
      case 'steps':
        steps.push(...splitLongStep(line.replace(STEP_NUMBER, '')))
        break
      case 'notes':
        notes.push(line)
    }
  }

  const titleLine = intro.find((l) => cleanTitle(l).length >= 3) ?? ''
  let title = cleanTitle(titleLine.split(/(?<=[.!?])\s/)[0] ?? '')
  const restIntro = intro.filter((l) => l !== titleLine && !(l.length < 50 && (findServings(l) || findMinutes(l))))

  let introAsSteps = false
  // Brak składników – spróbuj wyłuskać je z treści (np. z transkrypcji filmu).
  if (!ingredients.length) {
    ingredients.push(...extractInlineIngredients([...intro, ...steps].join(' ')))
    if (!steps.length && intro.length) {
      steps.push(...intro.flatMap(splitLongStep))
      introAsSteps = true
    }
  }

  return {
    title,
    servings: findServings(raw),
    prepMinutes: findMinutes(raw),
    ingredients: ingredients.map((l) => l.trim().replace(/[.;,]+$/, '')).filter(Boolean),
    steps: steps.map((s) => s.trim()).filter(Boolean),
    notes: [...(introAsSteps ? [] : restIntro), ...notes].join('\n'),
  }
}
