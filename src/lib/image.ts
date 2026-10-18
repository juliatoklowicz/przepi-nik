/** Zmniejsza zdjęcie do rozsądnego rozmiaru (JPEG, maks. 1080 px), żeby nie zapychać miejsca. */
export async function compressImage(blob: Blob, maxSize = 1080, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Nie udało się przetworzyć zdjęcia'))), 'image/jpeg', quality),
  )
}

/** Pobiera miniaturę z zewnętrznego serwisu przez nasze proxy (omija CORS). */
export async function fetchRemoteImage(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(`/api/image?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    return await compressImage(await res.blob())
  } catch {
    return null
  }
}
