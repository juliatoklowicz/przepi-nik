import { Navigate, useSearchParams } from 'react-router-dom'
import { extractUrl } from './ImportPage'

/** Cel „Udostępnij” z innych aplikacji (np. TikTok → Udostępnij → Przepiśnik). */
export default function SharePage() {
  const [params] = useSearchParams()
  const all = [params.get('url'), params.get('text'), params.get('title')].filter(Boolean).join(' ')
  const url = extractUrl(all)
  if (url) return <Navigate to={`/dodaj?auto=1&url=${encodeURIComponent(url)}`} replace />
  if (all.trim()) return <Navigate to={`/dodaj?text=${encodeURIComponent(all)}`} replace />
  return <Navigate to="/dodaj" replace />
}
