/*
  Regras de segurança:
  - Firestore (users, usernames, jogos): firestore.rules
  - Realtime Database (chatGlobal): database.rules.json
  Publicação: firebase deploy --only firestore:rules,database
*/

import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import { isFirebaseConfigured } from './firebase'

function SetupBanner() {
  if (isFirebaseConfigured) return null
  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
      <p className="mx-auto max-w-6xl text-sm text-amber-900">
        <span className="font-semibold">Firebase não configurado.</span> Edite o arquivo{' '}
        <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">.env</code> com as credenciais reais.
      </p>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <SetupBanner />
      <Routes>
        {/* A raiz abre sempre na tela de login */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
