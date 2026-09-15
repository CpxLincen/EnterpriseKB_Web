import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api, clearAuth, getStoredUser, setStoredUser, type UserInfo } from '../api'

const navItems = [
  { to: '/', label: '智能问询', icon: '💬', end: true },
  { to: '/admin', label: '知识库管理', icon: '🗂️', end: false },
  { to: '/eval', label: '评测', icon: '🧪', end: false },
  { to: '/audit', label: '审计日志', icon: '🕒', end: false, adminOnly: true },
  { to: '/review', label: '人工复核', icon: '🛡️', end: false, adminOnly: true },
]

export default function Layout() {
  const [user, setUser] = useState<UserInfo | null>(getStoredUser())
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    api
      .me()
      .then((u) => {
        if (!active) return
        setUser(u)
        setStoredUser(u)
      })
      .catch(() => {
        if (!active) return
        clearAuth()
        navigate('/login', { replace: true })
      })
    return () => {
      active = false
    }
  }, [navigate])

  function handleLogout() {
    void api.logout().catch(() => {})
    clearAuth()
    setUser(null)
    navigate('/login', { replace: true })
  }

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || user?.role === 'admin')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">📚</span>
          <div>
            <div className="brand-title">企业知识库助手</div>
            <div className="brand-sub">Enterprise KB Agent</div>
          </div>
        </div>
        <nav className="nav">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="user-avatar">👤</div>
          <div className="user-meta">
            <div className="user-name">{user?.display_name || user?.username || '未登录'}</div>
            <div className="user-role">{user?.role === 'admin' ? '管理员' : '用户'}</div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="退出登录">
            ⏻
          </button>
        </div>
        <div className="sidebar-footer">FastAPI · pgvector · RAG</div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
