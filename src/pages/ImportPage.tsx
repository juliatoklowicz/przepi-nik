import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { buildDraft, clearPendingDraft, fetchFromUrl, setPendingDraft, type Draft } from '../lib/importer'
import { ocrImages } from '../lib/ocr'
import { transcribeFile } from '../lib/transcribe'

type Mode = 'link' | 'text' | 'photo' | 'video'

const MODES: { id: Mode; icon: string; label: string; desc: string }[] = [
  { id: 'link', icon: 'link', label: 'Z linku', desc: 'TikTok, Instagram, blog' },
  { id: 'text', icon: 'text', label: 'Wklej tekst', desc: 'np. skopiowany opis' },
  { id: 'photo', icon: 'camera', label: 'Ze zdjęcia', desc: 'zrzut ekranu, książka' },
  { id: 'video', icon: 'video', label: 'Z filmu', desc: 'przepis mówiony' },
]

export function extractUrl(s: string): string | null {
  return s.match(/https?:\/\/[^\s<>"']+/)?.[0]?.replace(/[),.]+$/, '') ?? null
}

const canReadClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText

class Cancelled extends Error {}

export default function ImportPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('text') ? 'text' : 'link')
  const [url, setUrl] = useState(params.get('url') ?? '')
  const [text, setText] = useState(params.get('text') ?? '')
  const [language, setLanguage] = useState<'' | 'polish' | 'english'>('')
  const [busy, setBusy] = useState<{ msg: string; pct: number | null; cancellable: boolean } | null>(null)
  const [error, setError] = useState<{ text: string; fallback?: boolean } | null>(null)
  const autoStarted = useRef(false)
  const run = useRef<{ id: number; ctrl: AbortController | null }>({ id: 0, ctrl: null })
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  function finish(token: number, draft: Draft, extraNotice?: string) {
    if (token !== run.current.id) return
    if (extraNotice) draft.notices.unshift(extraNotice)
    setPendingDraft(draft)
    navigate('/nowy')
  }

  async function start(task: (token: number, signal: AbortSignal) => Promise<void>, onError?: (msg: string) => { text: string; fallback?: boolean }) {
    const ctrl = new AbortController()
    const token = run.current.id + 1
    run.current = { id: token, ctrl }
    setError(null)
    try {
      await task(token, ctrl.signal)
    } catch (e) {
      if (token !== run.current.id || e instanceof Cancelled || (e as Error).name === 'AbortError') return
      const msg = e instanceof Error ? e.message : String(e)
      setError(onError ? onError(msg) : { text: msg })
    } finally {
      if (token === run.current.id) setBusy(null)
    }
  }

  function cancel() {
    run.current.ctrl?.abort()
    run.current = { id: run.current.id + 1, ctrl: null }
    setBusy(null)
  }

  const importLink = (value = url) =>
    start(
      async (token, signal) => {
        const link = extractUrl(value) ?? value.trim()
        if (!/^https?:\/\//.test(link)) throw new Error('To nie wygląda na link. Wklej adres zaczynający się od https://')
        setBusy({ msg: 'Pobieram przepis…', pct: null, cancellable: true })
        const result = await fetchFromUrl(link, signal)
        if (token !== run.current.id) throw new Cancelled()
        setBusy({ msg: 'Porządkuję składniki i liczę kalorie…', pct: null, cancellable: true })
        const draft = await buildDraft({
          text: result.text,
          structured: result.structured,
          title: result.title,
          imageUrl: result.imageUrl,
          sourceUrl: result.url,
        })
        const social = result.platform !== 'web'
        const empty = !draft.recipe.ingredients.length
        finish(
          token,
          draft,
          social && empty
            ? 'Opis posta nie zawiera listy składników – przepis może być w samym filmie. Zapisz film w telefonie i użyj opcji „Z filmu”, albo uzupełnij ręcznie.'
            : undefined,
        )
      },
      (msg) => ({
        text: /instagram/i.test(value) ? `Instagram nie oddał opisu posta (${msg}). To częste – skopiuj opis albo zrób zrzut ekranu.` : `Nie udało się pobrać przepisu: ${msg}.`,
        fallback: true,
      }),
    )

  const importText = () =>
    start(async (token) => {
      setBusy({ msg: 'Porządkuję przepis…', pct: null, cancellable: false })
      finish(token, await buildDraft({ text, sourceUrl: extractUrl(text) ?? undefined }))
    })

  const importPhotos = (files: FileList | null) =>
    files?.length &&
    start(async (token) => {
      const ocrText = await ocrImages([...files], (msg, pct) => token === run.current.id && setBusy({ msg, pct, cancellable: true }))
      if (token !== run.current.id) throw new Cancelled()
      if (!ocrText.trim()) throw new Error('Nie udało się odczytać tekstu z tego zdjęcia. Spróbuj ostrzejszego zrzutu albo wklej tekst.')
      setBusy({ msg: 'Porządkuję przepis…', pct: null, cancellable: false })
      finish(token, await buildDraft({ text: ocrText }), 'Tekst odczytany ze zdjęcia – sprawdź, czy nie ma literówek.')
    })

  const importVideo = (file: File | undefined) =>
    file &&
    start(async (token) => {
      const spoken = await transcribeFile(file, language || undefined, (msg, pct) => token === run.current.id && setBusy({ msg, pct, cancellable: true }))
      if (token !== run.current.id) throw new Cancelled()
      if (!spoken) throw new Error('Nie rozpoznano mowy w nagraniu. Sprawdź, czy film ma dźwięk z przepisem.')
      setBusy({ msg: 'Porządkuję przepis…', pct: null, cancellable: false })
      const draft = await buildDraft({ text: spoken })
      draft.recipe.notes = [draft.recipe.notes, `Transkrypcja nagrania:\n${spoken}`].filter(Boolean).join('\n\n')
      finish(token, draft, 'Przepis rozpoznany z mowy – automatyczna transkrypcja bywa niedokładna, popraw składniki i kroki. Pełny tekst jest w notatkach.')
    })

  async function pasteLink() {
    try {
      const clip = await navigator.clipboard.readText()
      const link = extractUrl(clip)
      if (link) {
        setUrl(link)
        void importLink(link)
      } else if (clip.trim()) {
        setError({ text: 'W schowku nie ma linku. Jeśli skopiowałaś opis przepisu, wklej go w „Wklej tekst”.', fallback: true })
      } else {
        setError({ text: 'Schowek jest pusty. Skopiuj link w TikToku (Udostępnij → Kopiuj link).' })
      }
    } catch {
      setError({ text: 'Przeglądarka nie dała dostępu do schowka – przytrzymaj pole i wybierz „Wklej”.' })
    }
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    const keys: Record<string, number> = { ArrowRight: idx + 1, ArrowLeft: idx - 1, Home: 0, End: MODES.length - 1 }
    if (!(e.key in keys)) return
    e.preventDefault()
    const next = (keys[e.key] + MODES.length) % MODES.length
    setMode(MODES[next].id)
    tabRefs.current[next]?.focus()
  }

  useEffect(() => {
    if (params.get('auto') && params.get('url') && !autoStarted.current) {
      autoStarted.current = true
      void importLink(params.get('url')!)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page">
      <header className="top-bar">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Wróć">
          <Icon name="back" />
        </button>
        <h1>Dodaj przepis</h1>
        <span />
      </header>

      <div className="mode-grid" role="tablist" aria-label="Skąd jest przepis?">
        {MODES.map((m, idx) => (
          <button
            key={m.id}
            ref={(el) => {
              tabRefs.current[idx] = el
            }}
            id={`tab-${m.id}`}
            role="tab"
            aria-selected={mode === m.id}
            aria-controls="import-panel"
            tabIndex={mode === m.id ? 0 : -1}
            className={`mode ${mode === m.id ? 'active' : ''}`}
            onClick={() => {
              setMode(m.id)
              setError(null)
            }}
            onKeyDown={(e) => onTabKey(e, idx)}
            disabled={!!busy}
          >
            <Icon name={m.icon} size={22} />
            <strong>{m.label}</strong>
            <small>{m.desc}</small>
          </button>
        ))}
      </div>

      {error && (
        <div className="notice error" role="alert">
          <p>{error.text}</p>
          {error.fallback && (
            <div className="row wrap notice-actions">
              <button className="btn small" onClick={() => (setMode('text'), setError(null))}>
                <Icon name="text" size={16} /> Wklej tekst
              </button>
              <button className="btn small" onClick={() => (setMode('photo'), setError(null))}>
                <Icon name="camera" size={16} /> Ze zrzutu ekranu
              </button>
            </div>
          )}
        </div>
      )}

      {busy ? (
        <div className="progress-card" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p>{busy.msg}</p>
          {busy.pct != null && (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(busy.pct * 100)}>
              <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, busy.pct))})` }} />
            </div>
          )}
          {busy.cancellable && (
            <button className="btn ghost small" onClick={cancel}>
              Anuluj
            </button>
          )}
        </div>
      ) : (
        <div className="import-panel" id="import-panel" role="tabpanel" aria-labelledby={`tab-${mode}`}>
          {mode === 'link' && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void importLink()
              }}
            >
              <label className="field">
                <span>Link do przepisu</span>
                <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@…/video/…" autoFocus={!canReadClipboard} />
              </label>
              <div className="link-actions">
                {canReadClipboard && (
                  <button type="button" className="btn" onClick={pasteLink}>
                    <Icon name="clipboard" size={18} /> Wklej ze schowka
                  </button>
                )}
                <button className="btn primary" disabled={!url.trim()}>
                  Pobierz przepis
                </button>
              </div>
              <p className="hint">Z TikToka i Instagrama pobierany jest opis posta. Gdy Instagram go zablokuje, podpowiemy inne sposoby.</p>
            </form>
          )}

          {mode === 'text' && (
            <div>
              <label className="field">
                <span>Tekst przepisu</span>
                <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Wklej opis przepisu, np.:\n\nPancakes bananowe\nSkładniki: 1 banan, 2 jajka, 40 g płatków owsianych\nPrzygotowanie: …'} autoFocus />
              </label>
              <button className="btn primary block" onClick={importText} disabled={!text.trim()}>
                Przetwórz tekst
              </button>
            </div>
          )}

          {mode === 'photo' && (
            <div>
              <label className="drop">
                <Icon name="camera" size={30} />
                <strong>Wybierz zrzuty ekranu lub zdjęcia</strong>
                <small>Możesz zaznaczyć kilka naraz (np. opis podzielony na 2 zrzuty).</small>
                <input type="file" accept="image/*" multiple className="visually-hidden" onChange={(e) => importPhotos(e.target.files)} />
              </label>
              <p className="hint">Tekst jest odczytywany na Twoim telefonie. Za pierwszym razem pobiera się ok. 15 MB danych językowych.</p>
            </div>
          )}

          {mode === 'video' && (
            <div>
              <ul className="facts" aria-label="Zanim zaczniesz">
                <li>
                  <strong>~80 MB</strong> jednorazowo, najlepiej przez Wi-Fi
                </li>
                <li>
                  <strong>1–3 min</strong> rozpoznawania
                </li>
                <li>
                  <strong>Eksperymentalne</strong> – wynik trzeba przejrzeć
                </li>
              </ul>
              <label className="field">
                <span>Język nagrania</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
                  <option value="">Rozpoznaj automatycznie</option>
                  <option value="polish">Polski</option>
                  <option value="english">Angielski</option>
                </select>
              </label>
              <label className="drop">
                <Icon name="video" size={30} />
                <strong>Wybierz film lub nagranie</strong>
                <small>np. film zapisany z TikToka albo nagranie ekranu (MP4, M4A, MP3)</small>
                <input type="file" accept="video/*,audio/*" className="visually-hidden" onChange={(e) => importVideo(e.target.files?.[0])} />
              </label>
              <p className="hint">Mowa jest rozpoznawana na Twoim urządzeniu, za darmo – nagranie nigdzie nie wychodzi.</p>
            </div>
          )}
        </div>
      )}

      {!busy && (
        <button
          className="btn ghost block manual-btn"
          onClick={() => {
            clearPendingDraft()
            navigate('/nowy')
          }}
        >
          <Icon name="pen" size={18} /> Wpisz przepis ręcznie
        </button>
      )}
    </div>
  )
}
