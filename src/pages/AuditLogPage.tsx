import { useEffect, useState } from 'react'
import { api, type AuditActionStat, type AuditLogEntry } from '../api'

const PAGE_SIZE = 50

const ACTION_LABELS: Record<string, string> = {
  login: '登录',
  sso_login: 'SSO 登录',
  logout: '登出',
  document_upload: '文档上传',
  document_delete: '文档删除',
  chat: '问答',
  eval_run: '评测运行',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

function formatTs(ts: string | null): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString()
}

function formatExtra(extra: Record<string, unknown> | null): string {
  if (!extra) return '-'
  try {
    return JSON.stringify(extra)
  } catch {
    return String(extra)
  }
}

interface Filters {
  q: string
  action: string
  user: string
}

export default function AuditLogPage() {
  const [actions, setActions] = useState<AuditActionStat[]>([])
  const [items, setItems] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [filters, setFilters] = useState<Filters>({ q: '', action: '', user: '' })
  const [draft, setDraft] = useState<Filters>({ q: '', action: '', user: '' })

  async function fetchLogs(nextOffset: number, f: Filters = filters) {
    setLoading(true)
    setError(null)
    try {
      const res = await api.listAuditLogs({
        q: f.q.trim() || undefined,
        action: f.action || undefined,
        user: f.user.trim() || undefined,
        limit: PAGE_SIZE,
        offset: nextOffset,
      })
      setItems(res.items)
      setTotal(res.total)
      setOffset(res.offset)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api.listAuditActions().then(setActions).catch(() => {})
    void fetchLogs(0, { q: '', action: '', user: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  function search() {
    setFilters(draft)
    void fetchLogs(0, draft)
  }

  function reset() {
    setDraft({ q: '', action: '', user: '' })
    setFilters({ q: '', action: '', user: '' })
    void fetchLogs(0, { q: '', action: '', user: '' })
  }

  function prevPage() {
    if (currentPage > 1) void fetchLogs(offset - PAGE_SIZE)
  }

  function nextPage() {
    if (currentPage < totalPages) void fetchLogs(offset + PAGE_SIZE)
  }

  return (
    <div className="audit-page">
      <header className="page-header">
        <div>
          <h1>审计日志</h1>
          <p className="page-sub">查看登录、上传、删除、问答、评测等关键操作记录</p>
        </div>
        <button
          className="btn ghost"
          onClick={() => void fetchLogs(offset)}
          disabled={loading}
        >
          {loading ? '加载中…' : '↻ 刷新'}
        </button>
      </header>

      <section className="card">
        <div className="audit-filters">
          <label className="filter-label">
            <span>关键词</span>
            <input
              className="filter-input search"
              value={draft.q}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') search()
              }}
              placeholder="搜索操作 / 用户 / IP / 详情"
            />
          </label>
          <label className="filter-label">
            <span>操作类型</span>
            <select
              className="filter-select"
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            >
              <option value="">全部操作</option>
              {actions.map((a) => (
                <option key={a.action} value={a.action}>
                  {actionLabel(a.action)}（{a.count}）
                </option>
              ))}
            </select>
          </label>
          <label className="filter-label">
            <span>用户</span>
            <input
              className="filter-input"
              value={draft.user}
              onChange={(e) => setDraft((d) => ({ ...d, user: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') search()
              }}
              placeholder="用户名精确匹配"
            />
          </label>
          <div className="audit-actions">
            <button className="btn primary" onClick={search} disabled={loading}>
              查询
            </button>
            <button className="btn ghost" onClick={reset} disabled={loading}>
              清空
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="alert error">
          {error}
          <button className="alert-close" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      <section className="card">
        <h2>操作记录（共 {total} 条）</h2>
        {items.length === 0 ? (
          <p className="empty-tip">{loading ? '加载中…' : '暂无匹配的审计日志。'}</p>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作</th>
                <th>用户</th>
                <th>IP</th>
                <th>详情</th>
                <th>附加信息</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className="audit-time">{formatTs(row.ts)}</td>
                  <td>
                    <span className="action-badge" title={row.action}>
                      {actionLabel(row.action)}
                    </span>
                  </td>
                  <td>{row.user ?? '-'}</td>
                  <td>{row.ip ?? '-'}</td>
                  <td className="audit-detail" title={row.detail ?? ''}>
                    {row.detail ?? '-'}
                  </td>
                  <td className="audit-extra" title={formatExtra(row.extra)}>
                    {formatExtra(row.extra)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="pager">
          <span>
            第 {currentPage} / {totalPages} 页
          </span>
          <button className="btn ghost tiny" onClick={prevPage} disabled={loading || currentPage <= 1}>
            上一页
          </button>
          <button
            className="btn ghost tiny"
            onClick={nextPage}
            disabled={loading || currentPage >= totalPages}
          >
            下一页
          </button>
        </div>
      </section>
    </div>
  )
}
