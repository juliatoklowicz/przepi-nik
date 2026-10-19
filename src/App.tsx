import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { isCloud } from './lib/store'
import CookMode from './pages/CookMode'
import Home from './pages/Home'
import ImportPage from './pages/ImportPage'
import Login, { NewPassword } from './pages/Login'
import RecipeEditor from './pages/RecipeEditor'
import RecipeView from './pages/RecipeView'
import Settings from './pages/Settings'
import SharePage from './pages/SharePage'

function Shell() {
  const { session, loading, recovery } = useAuth()

  if (loading)
    return (
      <div className="splash" role="status">
        <img src="/favicon.svg" alt="" width={64} height={64} />
        <span>Przepiśnik</span>
      </div>
    )
  if (isCloud && recovery) return <NewPassword />
  if (isCloud && !session) return <Login />
  return <Outlet />
}

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/dodaj', element: <ImportPage /> },
      { path: '/udostepnij', element: <SharePage /> },
      { path: '/nowy', element: <RecipeEditor /> },
      { path: '/przepis/:id', element: <RecipeView /> },
      { path: '/przepis/:id/edytuj', element: <RecipeEditor /> },
      { path: '/przepis/:id/gotuj', element: <CookMode /> },
      { path: '/ustawienia', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
