import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api, isAuthenticated, setAuth, type UserInfo } from '../api'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  if (isAuthenticated()) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const name = username.trim()
    if (!name || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.login(name)
      const fallback: UserInfo = {
        id: res.user.id,
        username: res.user.username,
        display_name: res.user.username,
        email: null,
        role: res.user.role,
        is_active: true,
      }
      // 先写入 token，再拉取完整用户信息（/auth/me 需要带 token）
      setAuth(res.access_token, fallback)
      try {
        const user = await api.me()
        setAuth(res.access_token, user)
      } catch {
        // 拉取失败时保留登录接口返回的兜底用户信息
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">📚</div>
        <h1 className="login-title">企业知识库助手</h1>
        <p className="login-sub">登录后访问企业知识库</p>
        <div className="login-form">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
            autoFocus
            autoComplete="username"
          />
          <button className="btn primary" type="submit" disabled={loading || !username.trim()}>
            {loading ? '登录中…' : '登 录'}
          </button>
        </div>
        {error && <div className="login-error">{error}</div>}
        <p className="login-hint">开发模式：输入用户名即可登录（如 admin / alice）。SSO 统一登录将在接入后启用。</p>
      </form>
    </div>
  )
}
