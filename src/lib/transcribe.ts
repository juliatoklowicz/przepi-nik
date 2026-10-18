// Transkrypcja nagrania (film z TikToka zapisany w galerii, nagranie ekranu,
// plik audio) – w całości na urządzeniu, bez płatnych usług.

async function decodeAudio(file: File): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer())
    if (decoded.numberOfChannels === 1) return decoded.getChannelData(0)
    const a = decoded.getChannelData(0)
    const b = decoded.getChannelData(1)
    const mono = new Float32Array(a.length)
    for (let i = 0; i < a.length; i++) mono[i] = (a[i] + b[i]) / 2
    return mono
  } catch {
    throw new Error('Nie udało się odczytać dźwięku z tego pliku. Spróbuj z plikiem MP4 lub M4A.')
  } finally {
    void ctx.close()
  }
}

export async function transcribeFile(
  file: File,
  language: 'polish' | 'english' | undefined,
  onProgress: (msg: string, pct: number | null) => void,
): Promise<string> {
  onProgress('Wyciągam dźwięk z nagrania…', null)
  const audio = await decodeAudio(file)
  if (audio.length / 16000 > 15 * 60) throw new Error('Nagranie jest za długie (maks. 15 minut).')

  const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  try {
    return await new Promise<string>((resolve, reject) => {
      worker.onmessage = (e) => {
        const msg = e.data
        if (msg.type === 'download') onProgress('Pobieram model rozpoznawania mowy (tylko za pierwszym razem, ~80 MB)…', msg.progress)
        else if (msg.type === 'transcribing') onProgress('Rozpoznaję mowę… to może potrwać 1–3 minuty', null)
        else if (msg.type === 'done') resolve(msg.text.trim())
        else if (msg.type === 'error') reject(new Error(msg.message))
      }
      worker.onerror = (e) => reject(new Error(e.message || 'Błąd rozpoznawania mowy'))
      worker.postMessage({ audio, language }, [audio.buffer])
    })
  } finally {
    worker.terminate()
  }
}
