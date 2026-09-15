import { useEffect, useState } from 'react'
import { api, type Citation, type ReviewItem } from '../api'

const PAGE_SIZE = 20

const STATUS_LABELS: Record<string, string> = {
  pending: '待复核',
  approved: '已通过',
  rejected: '已驳回',
}

const STATUS_TABS = [
  { value: 'pending', label: '待复核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: '', label: '全部' },
]

function formatTs(ts: string | null): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString()
}

function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations || citations.length === 0) return null
  return (
    <details className="citations">
      <summary>引用来源（{citations.length}）</summary>
      <ol>
        {citations.map((c, i) => (
          <li key={i} className="citation">
            <span className="citation-meta">
              {c.filename}
              {c.page_number != null ? ` · 第 ${c.page_number} 页` : ''} · 块 {c.chunk_index}
            </span>
            <div className="citation-excerpt">{c.excerpt}</div>
          </li>
        ))}
      </ol>
    </details>
  )
}

export default function ReviewPage() {
  const [status, setStatus] = useState('pending')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<number, string>>({})

  async function fetchQueue(nextOffset: number, s: string = status) {
    setLoading(true)
    setError(null)
    try {
      const res = await api.listReviewItems({
        status: s || undefined,
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
    void fetchQueue(0, 'pending')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function switchStatus(s: string) {
    setStatus(s)
    void fetchQueue(0, s)
  }

  async function resolve(id: number, action: 'approve' | 'reject') {
    setError(null)
    try {
      await api.resolveReviewItem(id, action, notes[id]?.trim() || undefined)
      setNotes((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      void fetchQueue(offset, status)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="review-page">
      <header className="page-header">
        <div>
          <h1>人工复核</h1>
          <p className="page-sub">查看低置信回答（门禁判定为 review），通过或驳回</p>
        </div>
        <button className="btn ghost" onClick={() => void fetchQueue(offset)} disabled={loading}>
          {loading ? '加载中…' : '↻ 刷新'}
        </button>
      </header>

      <div className="mode-tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            className={`mode-tab${status === tab.value ? ' active' : ''}`}
            onClick={() => switchStatus(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert error">
          {error}
          <button className="alert-close" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      <section className="card">
        <h2>
          {STATUS_LABELS[status] ?? '全部'}（共 {total} 条）
        </h2>
        {items.length === 0 ? (
          <p className="empty-tip">{loading ? '加载中…' : '暂无待复核项。'}</p>
        ) : (
          <div className="review-list">
            {items.map((item) => (
              <article key={item.id} className="review-card">
                <div className="review-card-head">
                  <span className={`status-pill ${item.status}`}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                  <span className="review-meta">
                    知识库 <b>{item.knowledge_base}</b> · 提问 {item.asked_by ?? '-'} ·{' '}
                    {formatTs(item.created_at)}
                  </span>
                </div>
                <div className="review-q">
                  <span className="review-q-label">Q</span>
                  {item.question}
                </div>
                <div className="review-a">
                  <span className="review-a-label">A</span>
                  <div>{item.answer}</div>
                </div>
                <CitationList citations={item.citations} />
                {item.status === 'pending' ? (
                  <div className="review-card-foot">
                    <input
                      className="review-note"
                      placeholder="复核意见（可选）"
                      value={notes[item.id] ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                    <button className="btn primary tiny" onClick={() => void resolve(item.id, 'approve')}>
                      ✓ 通过
                    </button>
                    <button className="btn danger tiny" onClick={() => void resolve(item.id, 'reject')}>
                      ✕ 驳回
                    </button>
                  </div>
                ) : (
                  <div className="review-card-resolved">
                    复核人 <b>{item.reviewer ?? '-'}</b> · {formatTs(item.reviewed_at)}
                    {item.review_note ? ` · 意见：${item.review_note}` : ''}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <div className="pager">
          <span>
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            className="btn ghost tiny"
            onClick={() => void fetchQueue(offset - PAGE_SIZE)}
            disabled={loading || currentPage <= 1}
          >
            上一页
          </button>
          <button
            className="btn ghost tiny"
            onClick={() => void fetchQueue(offset + PAGE_SIZE)}
            disabled={loading || currentPage >= totalPages}
          >
            下一页
          </button>
        </div>
      </section>
    </div>
  )
}
