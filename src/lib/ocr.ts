// Odczyt tekstu ze zrzutów ekranu/zdjęć – Tesseract działa w przeglądarce,
// za darmo. Przy pierwszym użyciu pobiera ok. 15 MB danych językowych.

export async function ocrImages(files: File[], onProgress: (msg: string, pct: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  onProgress('Przygotowuję odczyt tekstu…', 0)
  const worker = await createWorker(['pol', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress('Odczytuję tekst…', m.progress)
      else if (m.status.includes('load')) onProgress('Pobieram dane językowe (tylko za pierwszym razem)…', m.progress)
    },
  })
  try {
    const texts: string[] = []
    for (const [i, file] of files.entries()) {
      if (files.length > 1) onProgress(`Odczytuję zdjęcie ${i + 1} z ${files.length}…`, i / files.length)
      const { data } = await worker.recognize(file)
      texts.push(data.text)
    }
    return texts.join('\n')
  } finally {
    await worker.terminate()
  }
}
