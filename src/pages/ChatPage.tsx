import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api,
  conversationChatStream,
  type Citation,
  type ConversationMessage as ServerMessage,
  type ConversationSummary,
} from '../api'

interface Message {
  id: number | string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  decision?: string
  memory?: string
  error?: boolean
}

const PAGE_SIZE = 50
let nextLocalId = 1

function toMessage(m: ServerMessage): Message {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    citations: m.citations ?? [],
    decision: m.decision ?? undefined,
    memory: m.memory ?? undefined,
  }
}

function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null
  return (
    <details className="citations">
      <summary>引用来源（{citations.length}）</summary>
      <ol>
        {citations.map((c, i) => (
          <li key={i} className="citation">
            <div className="citation-meta">
              {c.knowledge_base ? `[${c.knowledge_base}] ` : ''}
              {c.filename}
              {c.page_number != null ? ` · 第 ${c.page_number} 页` : ''} · 块 {c.chunk_index}
            </div>
            <div className="citation-excerpt">{c.excerpt}</div>
          </li>
        ))}
      </ol>
    </details>
  )
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationFilter, setConversationFilter] = useState<'active' | 'archived'>('active')
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [totalMessages, setTotalMessages] = useState(0)
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [oldestLoadedId, setOldestLoadedId] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const autoSelectedRef = useRef(false)

  const refreshConversations = useCallback(async (status: 'active' | 'archived') => {
    try {
      const res = await api.listConversations({ status })
      setConversations(res.items)
    } catch (err) {
      console.error('加载历史会话失败', err)
    }
  }, [])

  const selectConversation = useCallback(async (id: number) => {
    setLoadingHistory(true)
    try {
      const detail = await api.getConversation(id, { limit: PAGE_SIZE })
      setActiveConversationId(id)
      setActiveStatus(detail.status)
      setMessages(detail.messages.slice().reverse().map(toMessage))
      setTotalMessages(detail.total)
      setHasMoreOlder(detail.has_more)
      const oldest = detail.messages.length > 0 ? detail.messages[detail.messages.length - 1].id : null
      setOldestLoadedId(oldest)
    } catch (err) {
      console.error('加载会话消息失败', err)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  function newConversation() {
    setActiveConversationId(null)
    setActiveStatus(null)
    setMessages([])
    setTotalMessages(0)
    setHasMoreOlder(false)
    setOldestLoadedId(null)
    setInput('')
  }

  function switchFilter(status: 'active' | 'archived') {
    setConversationFilter(status)
    void refreshConversations(status)
  }

  async function loadOlder() {
    if (activeConversationId == null || oldestLoadedId == null || loadingOlder) return
    setLoadingOlder(true)
    try {
      const detail = await api.getConversation(activeConversationId, {
        limit: PAGE_SIZE,
        beforeId: oldestLoadedId,
      })
      const older = detail.messages.slice().reverse().map(toMessage)
      setMessages((prev) => [...older, ...prev])
      setHasMoreOlder(detail.has_more)
      const newOldest = detail.messages.length > 0 ? detail.messages[detail.messages.length - 1].id : null
      if (newOldest != null) setOldestLoadedId(newOldest)
    } catch (err) {
      console.error('加载更早消息失败', err)
    } finally {
      setLoadingOlder(false)
    }
  }

  async function handleArchive(id: number) {
    try {
      await api.archiveConversation(id)
      if (id === activeConversationId) setActiveStatus('archived')
      void refreshConversations(conversationFilter)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleUnarchive(id: number) {
    try {
      await api.unarchiveConversation(id)
      if (id === activeConversationId) setActiveStatus('active')
      void refreshConversations(conversationFilter)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('确定删除该会话？其消息将一并删除。')) return
    try {
      await api.deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeConversationId === id) newConversation()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void refreshConversations('active')
  }, [refreshConversations])

  // 首次加载完成后自动进入最近一次会话
  useEffect(() => {
    if (autoSelectedRef.current || conversations.length === 0) return
    autoSelectedRef.current = true
    void selectConversation(conversations[0].id)
  }, [conversations, selectConversation])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const question = input.trim()
    if (!question || loading) return
    setInput('')
    const userMsg: Message = { id: `local-${nextLocalId++}`, role: 'user', content: question, citations: [] }
    const assistantId = `local-${nextLocalId++}`
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', citations: [] }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setLoading(true)

    let conversationId = activeConversationId
    if (conversationId == null) {
      try {
        const conv = await api.createConversation({
          title: question.slice(0, 50),
          knowledge_base: null,
        })
        conversationId = conv.id
        setActiveConversationId(conversationId)
        setActiveStatus(conv.status)
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err)
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: text, error: true } : m)),
        )
        setLoading(false)
        return
      }
    }

    try {
      await conversationChatStream(conversationId, question, 'auto', {
        onDecision: (decision) =>
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, decision } : m))),
        onCitations: (citations) =>
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, citations } : m))),
        onDelta: (text) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + text } : m)),
          ),
        onMemory: (memory) =>
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, memory } : m))),
        onError: (message) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: message, error: true } : m)),
          ),
      })
      setTotalMessages((prev) => prev + 2)
      setActiveStatus('active')
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId && !m.content ? { ...m, content: text, error: true } : m)),
      )
    } finally {
      setLoading(false)
      // 发送后会话必然处于 active（归档会话也会自动恢复）
      setConversationFilter('active')
      void refreshConversations('active')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const lastMessage = messages[messages.length - 1]
  const showTyping =
    loading && (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.content === '')

  return (
    <div className="chat-page">
      <aside className="conv-panel">
        <div className="conv-panel-head">
          <button className="btn primary conv-new" onClick={newConversation}>
            ＋ 新建会话
          </button>
          <div className="conv-tabs">
            <button
              className={`conv-tab${conversationFilter === 'active' ? ' active' : ''}`}
              onClick={() => switchFilter('active')}
            >
              进行中
            </button>
            <button
              className={`conv-tab${conversationFilter === 'archived' ? ' active' : ''}`}
              onClick={() => switchFilter('archived')}
            >
              已归档
            </button>
          </div>
        </div>
        <div className="conv-list">
          {conversations.length === 0 ? (
            <div className="conv-empty">
              {conversationFilter === 'active' ? '暂无历史会话' : '暂无已归档会话'}
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={`conv-item${c.id === activeConversationId ? ' active' : ''}`}
                onClick={() => void selectConversation(c.id)}
              >
                <div className="conv-item-main">
                  <div className="conv-title">{c.title || '新对话'}</div>
                  <div className="conv-meta">
                    {c.knowledge_base ?? '自动路由'}
                    {c.message_count != null ? ` · ${c.message_count} 条` : ''}
                  </div>
                </div>
                {conversationFilter === 'active' ? (
                  <button
                    className="conv-action"
                    title="归档"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleArchive(c.id)
                    }}
                  >
                    📥
                  </button>
                ) : (
                  <button
                    className="conv-action"
                    title="恢复"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleUnarchive(c.id)
                    }}
                  >
                    ↩
                  </button>
                )}
                <button
                  className="conv-action"
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDelete(c.id)
                  }}
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="chat-main">
        <header className="page-header">
          <div>
            <h1>智能问询</h1>
            <p className="page-sub">
              {activeConversationId == null
                ? '自动跨库检索 · 新对话首问将自动保存'
                : activeStatus === 'archived'
                  ? '该会话已归档 · 发送新消息将自动恢复'
                  : `自动跨库检索 · 对话已持久化${totalMessages > 0 ? ` · 共 ${totalMessages} 条消息` : ''}`}
            </p>
          </div>
        </header>

        <div className="chat-window">
          {loadingHistory && messages.length === 0 ? (
            <div className="chat-empty">
              <p>正在加载会话…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-icon">💬</div>
              <p>有什么想问的？输入问题开始对话。</p>
              <p className="chat-empty-sub">例如：年假如何计算？</p>
            </div>
          ) : (
            <>
              {hasMoreOlder && (
                <div className="load-older-wrap">
                  <button className="btn ghost load-older" onClick={() => void loadOlder()} disabled={loadingOlder}>
                    {loadingOlder ? '加载中…' : '↑ 加载更早消息'}
                  </button>
                </div>
              )}
              <div className="message-list">
                {messages.map((m) => (
                  <div key={m.id} className={`message-row ${m.role}`}>
                    <div className="avatar">{m.role === 'user' ? '🧑' : '🤖'}</div>
                    <div className={`bubble${m.error ? ' error' : ''}`}>
                      {m.memory === 'followup' && (
                        <div className="memory-badge">↻ 追问 · 已改写检索</div>
                      )}
                      {m.memory === 'reuse' && (
                        <div className="memory-badge reuse">📎 复用上文资料</div>
                      )}
                      {m.decision === 'review' && (
                        <div className="review-badge">⚠️ 低置信度 · 已提交人工复核</div>
                      )}
                      <div className="bubble-text">{m.content}</div>
                      <CitationList citations={m.citations} />
                    </div>
                  </div>
                ))}
                {showTyping && (
                  <div className="message-row assistant">
                    <div className="avatar">🤖</div>
                    <div className="bubble typing">
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                      <span className="typing-text">正在回答…</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </>
          )}
        </div>

        <div className="composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
            rows={2}
          />
          <button
            className="btn primary send-btn"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
          >
            {loading ? '思考中…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}
