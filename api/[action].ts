// Jedna funkcja serwerowa obsługująca wszystkie zapytania, których przeglądarka
// nie może wykonać sama (CORS): pobieranie przepisu z linku, proxy obrazków,
// tłumaczenie (MyMemory) i wyszukiwanie produktów (Open Food Facts).
// Na Vercelu działa jako /api/<akcja>, lokalnie podpina ją vite.config.ts.

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

export type ImportResult = {
  platform: 'tiktok' | 'instagram' | 'web'
  url: string
  title?: string
  author?: string
  text?: string
  imageUrl?: string
  /** Przepis z danych strukturalnych schema.org (blogi kulinarne). */
  structured?: {
    name?: string
    description?: string
    ingredients: string[]
    steps: string[]
    servings?: string
    totalTime?: string
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function assertPublicUrl(raw: string | null): URL {
  if (!raw) throw new Error('Brak adresu URL')
  const url = new URL(raw.trim())
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Nieobsługiwany adres')
  const h = url.hostname
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) ||
    h.startsWith('[')
  ) {
    throw new Error('Niedozwolony adres')
  }
  return url
}

async function fetchText(url: string, ua = BROWSER_UA): Promise<{ text: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: { 'user-agent': ua, 'accept-language': 'pl-PL,pl;q=0.9,en;q=0.8', accept: 'text/html,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return { text: await res.text(), finalUrl: res.url || url }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function metaContent(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
    'i',
  )
  const m = html.match(re)
  const v = m?.[1] ?? m?.[2]
  return v ? decodeEntities(v) : undefined
}

// ---------- TikTok ----------

async function importTikTok(url: URL): Promise<ImportResult> {
  let target = url.toString()
  // Krótkie linki (vm.tiktok.com / vt.tiktok.com) – rozwiń przekierowanie.
  if (!/\/video\/|\/photo\//.test(url.pathname)) {
    try {
      const res = await fetch(target, { headers: { 'user-agent': BROWSER_UA }, redirect: 'follow', signal: AbortSignal.timeout(10000) })
      if (res.url) target = res.url.split('?')[0]
    } catch {
      /* spróbuj z oryginalnym adresem */
    }
  }
  const oembed = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(target)}`, {
    headers: { 'user-agent': BROWSER_UA },
    signal: AbortSignal.timeout(10000),
  })
  if (oembed.ok) {
    const data = (await oembed.json()) as { title?: string; author_name?: string; thumbnail_url?: string }
    if (data.title !== undefined) {
      return { platform: 'tiktok', url: target, text: data.title, author: data.author_name, imageUrl: data.thumbnail_url }
    }
  }
  // Zapas: opis z danych osadzonych w stronie.
  const { text: html } = await fetchText(target)
  const desc = html.match(/"desc":"((?:[^"\\]|\\.)*)"/)
  return {
    platform: 'tiktok',
    url: target,
    text: desc ? JSON.parse(`"${desc[1]}"`) : metaContent(html, 'og:description'),
    imageUrl: metaContent(html, 'og:image'),
  }
}

// ---------- Instagram ----------

async function importInstagram(url: URL): Promise<ImportResult> {
  const code = url.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1]
  if (!code) throw new Error('Nie rozpoznano linku do posta Instagram')
  const postUrl = `https://www.instagram.com/p/${code}/`

  try {
    const { text: html } = await fetchText(`${postUrl}embed/captioned/`)
    const cap = html.match(/<div class="Caption">([\s\S]*?)<div class="CaptionComments">/)
    if (cap) {
      const body = cap[1].replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, '')
      const img = html.match(/<img[^>]+class="EmbeddedMediaImage"[^>]+src="([^"]+)"/)
      return { platform: 'instagram', url: postUrl, text: stripTags(body), imageUrl: img ? decodeEntities(img[1]) : undefined }
    }
  } catch {
    /* przejdź do metody zapasowej */
  }

  const { text: html } = await fetchText(postUrl, 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')
  const desc = metaContent(html, 'og:description') ?? metaContent(html, 'description')
  if (!desc) throw new Error('Instagram nie udostępnił opisu tego posta')
  // Format: "123 likes, 4 comments - autor on 1 March 2024: "opis""
  const quoted = desc.match(/:\s*["“](.*)["”]\s*\.?$/s)
  return { platform: 'instagram', url: postUrl, text: quoted ? quoted[1] : desc, imageUrl: metaContent(html, 'og:image') }
}

// ---------- Strony z przepisami (schema.org/Recipe) ----------

type Json = any // eslint-disable-line @typescript-eslint/no-explicit-any

function findRecipeNode(node: Json): Json | undefined {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipeNode(n)
      if (r) return r
    }
    return
  }
  const type = node['@type']
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node
  return findRecipeNode(node['@graph']) ?? findRecipeNode(node.mainEntity)
}

function flattenInstructions(ins: Json): string[] {
  if (!ins) return []
  if (typeof ins === 'string') return stripTags(ins).split(/\n+/).map((s) => s.trim()).filter(Boolean)
  if (Array.isArray(ins)) return ins.flatMap(flattenInstructions)
  if (ins.itemListElement) {
    const inner = flattenInstructions(ins.itemListElement)
    return ins['@type'] === 'HowToSection' && ins.name ? [`${ins.name}:`, ...inner] : inner
  }
  if (ins.text) return [stripTags(String(ins.text))]
  if (ins.name) return [stripTags(String(ins.name))]
  return []
}

function pickImage(img: Json): string | undefined {
  if (!img) return
  if (typeof img === 'string') return img
  if (Array.isArray(img)) return pickImage(img[0])
  return img.url ?? img.contentUrl
}

/** Lista (<ul>/<ol>) albo akapity zaraz pod nagłówkiem pasującym do wzorca, np. „Składniki”. */
function listAfterHeading(html: string, pattern: string, allowParagraphs: boolean): string[] {
  const headRe = new RegExp(`<h[1-6][^>]*>(?:(?!</h[1-6]>)[\\s\\S]){0,200}?(?:${pattern})(?:(?!</h[1-6]>)[\\s\\S]){0,200}?</h[1-6]>`, 'gi')
  for (const m of html.matchAll(headRe)) {
    const rest = html.slice(m.index! + m[0].length, m.index! + m[0].length + 20000)
    const nextHeading = rest.search(/<h[1-6][\s>]/i)
    const scope = nextHeading > 0 ? rest.slice(0, nextHeading) : rest
    const list = scope.match(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i)
    const items = list
      ? [...list[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((li) => stripTags(li[1]).replace(/\s+/g, ' ').trim())
      : allowParagraphs
        ? [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((p) => stripTags(p[1]).replace(/\s+/g, ' ').trim())
        : []
    const clean = items.filter((t) => t && t.length < 600)
    if (clean.length >= 2) return clean
  }
  return []
}

function microdata(html: string, prop: string): string[] {
  const re = new RegExp(`<[^>]+itemprop=["']${prop}["'][^>]*>([\\s\\S]*?)</(?:li|span|p|div)>`, 'gi')
  return [...html.matchAll(re)].map((m) => stripTags(m[1]).replace(/\s+/g, ' ').trim()).filter(Boolean)
}

async function importWeb(url: URL): Promise<ImportResult> {
  const { text: html, finalUrl } = await fetchText(url.toString())
  const scripts = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const s of scripts) {
    try {
      const recipe = findRecipeNode(JSON.parse(s[1].trim()))
      if (!recipe) continue
      const yieldVal = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield
      return {
        platform: 'web',
        url: finalUrl,
        title: recipe.name ? decodeEntities(String(recipe.name)) : undefined,
        imageUrl: pickImage(recipe.image) ?? metaContent(html, 'og:image'),
        structured: {
          name: recipe.name ? decodeEntities(String(recipe.name)) : undefined,
          description: recipe.description ? stripTags(String(recipe.description)) : undefined,
          ingredients: (recipe.recipeIngredient ?? recipe.ingredients ?? []).map((i: string) => stripTags(String(i))),
          steps: flattenInstructions(recipe.recipeInstructions),
          servings: yieldVal != null ? String(yieldVal) : undefined,
          totalTime: recipe.totalTime ?? recipe.cookTime ?? undefined,
        },
      }
    } catch {
      /* uszkodzony JSON-LD – próbuj dalej */
    }
  }
  const title = metaContent(html, 'og:title') ?? html.match(/<title>([^<]*)<\/title>/i)?.[1]
  const description = metaContent(html, 'og:description') ?? metaContent(html, 'description')
  const ingredients = microdata(html, 'recipeIngredient').length
    ? microdata(html, 'recipeIngredient')
    : listAfterHeading(html, 'składniki|skladniki|ingredients|zutaten|ingredientes', false)
  if (ingredients.length) {
    const steps = microdata(html, 'recipeInstructions').length
      ? microdata(html, 'recipeInstructions')
      : listAfterHeading(html, 'przygotowanie|wykonanie|sposób przygotowania|instructions|directions|method|preparation|zubereitung', true)
    return {
      platform: 'web',
      url: finalUrl,
      title: title ? decodeEntities(title) : undefined,
      imageUrl: metaContent(html, 'og:image'),
      structured: { name: title ? decodeEntities(title) : undefined, description, ingredients, steps },
    }
  }
  return { platform: 'web', url: finalUrl, title, text: description, imageUrl: metaContent(html, 'og:image') }
}

async function handleImport(req: Request): Promise<Response> {
  const url = assertPublicUrl(new URL(req.url).searchParams.get('url'))
  const host = url.hostname.replace(/^www\./, '')
  let result: ImportResult
  if (host.endsWith('tiktok.com')) result = await importTikTok(url)
  else if (host.endsWith('instagram.com') || host === 'instagr.am') result = await importInstagram(url)
  else result = await importWeb(url)
  return json(result)
}

// ---------- Proxy obrazków (miniatury do zapisania) ----------

async function handleImage(req: Request): Promise<Response> {
  const url = assertPublicUrl(new URL(req.url).searchParams.get('url'))
  const res = await fetch(url, { headers: { 'user-agent': BROWSER_UA }, signal: AbortSignal.timeout(12000) })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) return json({ error: 'To nie jest obrazek' }, 400)
  const buf = await res.arrayBuffer()
  if (buf.byteLength > 10 * 1024 * 1024) return json({ error: 'Obrazek jest za duży' }, 400)
  return new Response(buf, { headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' } })
}

// ---------- Tłumaczenie (MyMemory, darmowe) ----------

function chunkLines(text: string, max = 450): string[] {
  const chunks: string[] = []
  let cur = ''
  for (const line of text.split('\n')) {
    const parts = line.length > max ? line.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) ?? [line] : [line]
    for (const p of parts) {
      if (cur && cur.length + p.length + 1 > max) {
        chunks.push(cur)
        cur = p
      } else cur = cur ? `${cur}\n${p}` : p
    }
  }
  if (cur) chunks.push(cur)
  return chunks
}

class QuotaError extends Error {}

async function myMemory(text: string, from: string, to: string): Promise<string> {
  const res = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`,
    { signal: AbortSignal.timeout(15000) },
  )
  const data = (await res.json()) as { responseData?: { translatedText?: string }; quotaFinished?: boolean }
  const t = data.responseData?.translatedText
  if (data.quotaFinished || !t || /MYMEMORY WARNING/i.test(t)) throw new QuotaError()
  return decodeEntities(t)
}

/**
 * Tłumaczy listę tekstów (linii). Łączy je w paczki po ~450 znaków, a jeśli
 * tłumacz zgubi podział na linie – tłumaczy daną paczkę linia po linii.
 */
async function handleTranslate(req: Request): Promise<Response> {
  const { texts, from, to = 'pl' } = (await req.json()) as { texts: string[]; from: string; to?: string }
  if (!Array.isArray(texts)) return json({ error: 'Brak tekstu' }, 400)
  if (texts.join('\n').length > 8000) return json({ error: 'Tekst jest za długi do tłumaczenia' }, 400)
  const out: string[] = new Array(texts.length).fill('')
  try {
    let batch: number[] = []
    let len = 0
    const flush = async () => {
      if (!batch.length) return
      const joined = batch.map((i) => texts[i]).join('\n')
      const translated = (await myMemory(joined, from, to)).split('\n')
      if (translated.length === batch.length) batch.forEach((i, k) => (out[i] = translated[k].trim()))
      else for (const i of batch) out[i] = (await Promise.all(chunkLines(texts[i]).map((c) => myMemory(c, from, to)))).join(' ')
      batch = []
      len = 0
    }
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i]
      if (!t.trim()) continue
      if (t.length > 450) {
        await flush()
        out[i] = (await Promise.all(chunkLines(t).map((c) => myMemory(c, from, to)))).join(' ')
        continue
      }
      if (len + t.length + 1 > 450) await flush()
      batch.push(i)
      len += t.length + 1
    }
    await flush()
  } catch (e) {
    if (e instanceof QuotaError) return json({ error: 'Wyczerpano dzienny darmowy limit tłumaczeń – spróbuj jutro' }, 429)
    throw e
  }
  return json({ texts: out })
}

// ---------- Wyszukiwanie produktów (Open Food Facts) ----------

const round1 = (v: unknown) => Math.round((Number(v) || 0) * 10) / 10

async function handleFood(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q) return json({ items: [] })
  const res = await fetch(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=15&langs=pl,en&fields=code,product_name,product_name_pl,brands,nutriments`,
    { headers: { 'user-agent': 'Przepisnik/1.0 (aplikacja prywatna)' }, signal: AbortSignal.timeout(12000) },
  )
  if (!res.ok) return json({ error: 'Baza Open Food Facts nie odpowiada' }, 502)
  const data = (await res.json()) as { hits?: Json[] }
  const items = (data.hits ?? [])
    .map((h) => {
      const n = h.nutriments ?? {}
      const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : undefined)
      const name = h.product_name_pl || h.product_name
      if (kcal == null || !name) return null
      return {
        id: `off:${h.code}`,
        name: h.brands ? `${name} (${String(h.brands).split(',')[0]})` : name,
        kcal: Math.round(kcal),
        protein: round1(n.proteins_100g),
        fat: round1(n.fat_100g),
        carbs: round1(n.carbohydrates_100g),
      }
    })
    .filter(Boolean)
  return json({ items })
}

// ---------- Routing ----------

async function route(req: Request): Promise<Response> {
  const action = new URL(req.url).pathname.split('/').filter(Boolean).pop()
  try {
    switch (action) {
      case 'import':
        return await handleImport(req)
      case 'image':
        return await handleImage(req)
      case 'translate':
        return await handleTranslate(req)
      case 'food':
        return await handleFood(req)
      default:
        return json({ error: 'Nieznana akcja' }, 404)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg.includes('timeout') || msg.includes('aborted') ? 'Strona nie odpowiedziała na czas' : msg }, 400)
  }
}

export const GET = route
export const POST = route
