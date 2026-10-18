import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { isCloud } from './lib/store'
import Home from './pages/Home'
import ImportPage from './pages/ImportPage'
import Login from './pages/Login'
import RecipeEditor from './pages/RecipeEditor'
import RecipeView from './pages/RecipeView'
import Settings from './pages/Settings'
import SharePage from './pages/SharePage'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return <div className="splash">Przepiśnik</div>
  if (isCloud && !session) return <Login />

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dodaj" element={<ImportPage />} />
      <Route path="/udostepnij" element={<SharePage />} />
      <Route path="/nowy" element={<RecipeEditor />} />
      <Route path="/przepis/:id" element={<RecipeView />} />
      <Route path="/przepis/:id/edytuj" element={<RecipeEditor />} />
      <Route path="/ustawienia" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
