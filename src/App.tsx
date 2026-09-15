import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import Layout from './components/Layout'
import AdminPage from './pages/AdminPage'
import AuditLogPage from './pages/AuditLogPage'
import ChatPage from './pages/ChatPage'
import EvalPage from './pages/EvalPage'
import LoginPage from './pages/LoginPage'
import ReviewPage from './pages/ReviewPage'
import { isAuthenticated } from './api'

function RequireAuth({ children }: { children: ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<ChatPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/eval" element={<EvalPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
