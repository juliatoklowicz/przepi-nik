import { useEffect, useRef, useState } from 'react'
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

export default function ImportPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('text') ? 'text' : 'link')
  const [url, setUrl] = useState(params.get('url') ?? '')
  const [text, setText] = useState(params.get('text') ?? '')
  const [language, setLanguage] = useState<'' | 'polish' | 'english'>('')
  const [busy, setBusy] = useState<{ msg: string; pct: number | null } | null>(null)
  const [error, setError] = useState('')
  const autoStarted = useRef(false)

  function finish(draft: Draft, extraNotice?: string) {
    if (extraNotice) draft.notices.unshift(extraNotice)
    setPendingDraft(draft)
    navigate('/nowy')
  }

  async function run(task: () => Promise<void>) {
    setError('')
    try {
      await task()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const importLink = (value = url) =>
    run(async () => {
      const link = extractUrl(value) ?? value.trim()
      if (!/^https?:\/\//.test(link)) throw new Error('To nie wygląda na link. Wklej adres zaczynający się od https://')
      setBusy({ msg: 'Pobieram przepis…', pct: null })
      const result = await fetchFromUrl(link)
      setBusy({ msg: 'Porządkuję składniki i liczę kalorie…', pct: null })
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
        draft,
        social && empty
          ? 'Opis posta nie zawiera listy składników – przepis może być w samym filmie. Zapisz film w telefonie i użyj opcji „Z filmu”, albo uzupełnij ręcznie.'
          : undefined,
      )
    })

  const importText = () =>
    run(async () => {
      setBusy({ msg: 'Porządkuję przepis…', pct: null })
      finish(await buildDraft({ text, sourceUrl: extractUrl(text) ?? undefined }))
    })

  const importPhotos = (files: FileList | null) =>
    files?.length &&
    run(async () => {
      const ocrText = await ocrImages([...files], (msg, pct) => setBusy({ msg, pct }))
      if (!ocrText.trim()) throw new Error('Nie udało się odczytać tekstu z tego zdjęcia.')
      setBusy({ msg: 'Porządkuję przepis…', pct: null })
      finish(await buildDraft({ text: ocrText }), 'Tekst odczytany ze zdjęcia – sprawdź, czy nie ma literówek.')
    })

  const importVideo = (file: File | undefined) =>
    file &&
    run(async () => {
      const spoken = await transcribeFile(file, language || undefined, (msg, pct) => setBusy({ msg, pct }))
      if (!spoken) throw new Error('Nie rozpoznano mowy w nagraniu.')
      setBusy({ msg: 'Porządkuję przepis…', pct: null })
      const draft = await buildDraft({ text: spoken })
      draft.recipe.notes = [draft.recipe.notes, `Transkrypcja nagrania:\n${spoken}`].filter(Boolean).join('\n\n')
      finish(draft, 'Przepis rozpoznany z mowy – automatyczna transkrypcja bywa niedokładna, popraw składniki i kroki. Pełny tekst jest w notatkach.')
    })

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

      <div className="mode-grid" role="tablist">
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} className={`mode ${mode === m.id ? 'active' : ''}`} onClick={() => setMode(m.id)} disabled={!!busy}>
            <Icon name={m.icon} size={22} />
            <strong>{m.label}</strong>
            <small>{m.desc}</small>
          </button>
        ))}
      </div>

      {error && <p className="notice error">{error}</p>}

      {busy ? (
        <div className="progress-card" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p>{busy.msg}</p>
          {busy.pct != null && (
            <div className="progress">
              <span style={{ width: `${Math.round(busy.pct * 100)}%` }} />
            </div>
          )}
        </div>
      ) : (
        <div className="import-panel">
          {mode === 'link' && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void importLink()
              }}
            >
              <label className="field">
                <span>Link do przepisu</span>
                <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@…/video/…" autoFocus />
              </label>
              <button className="btn primary block" disabled={!url.trim()}>
                Pobierz przepis
              </button>
              <p className="hint">
                Z TikToka i Instagrama pobierany jest opis posta. Instagram często blokuje pobieranie – wtedy skopiuj opis i użyj „Wklej tekst” albo zrób zrzut ekranu.
              </p>
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
                <input type="file" accept="image/*" multiple hidden onChange={(e) => importPhotos(e.target.files)} />
              </label>
              <p className="hint">Tekst jest odczytywany na Twoim telefonie. Za pierwszym razem pobiera się ok. 15 MB danych językowych.</p>
            </div>
          )}

          {mode === 'video' && (
            <div>
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
                <input type="file" accept="video/*,audio/*" hidden onChange={(e) => importVideo(e.target.files?.[0])} />
              </label>
              <p className="hint">
                Mowa jest rozpoznawana na Twoim urządzeniu, za darmo. Za pierwszym razem pobiera się model (~80 MB, najlepiej przez Wi-Fi), a samo rozpoznawanie trwa 1–3 minuty. To funkcja eksperymentalna: wynik zawsze trzeba przejrzeć.
              </p>
            </div>
          )}
        </div>
      )}

      {!busy && (
        <button className="btn ghost block manual-btn" onClick={() => {
            clearPendingDraft()
            navigate('/nowy')
          }}>
          <Icon name="pen" size={18} /> Wpisz przepis ręcznie
        </button>
      )}
    </div>
  )
}
