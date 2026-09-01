import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Citation, type KnowledgeBase } from '../api'

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  error?: boolean
}

let nextId = 1

function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null
  return (
    <details className="citations">
      <summary>引用来源（{citations.length}）</summary>
      <ol>
        {citations.map((c, i) => (
          <li key={i} className="citation">
            <div className="citation-meta">
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
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [knowledgeBase, setKnowledgeBase] = useState('default')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const refreshKbs = useCallback(async () => {
    try {
      const kbs = await api.listKnowledgeBases()
      setKnowledgeBases(kbs)
      setKnowledgeBase((prev) => (kbs.some((kb) => kb.name === prev) ? prev : kbs[0]?.name ?? 'default'))
    } catch (err) {
      console.error('加载知识库列表失败', err)
    }
  }, [])

  useEffect(() => {
    void refreshKbs()
  }, [refreshKbs])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const question = input.trim()
    if (!question || loading) return
    setInput('')
    setMessages((prev) => [...prev, { id: nextId++, role: 'user', content: question, citations: [] }])
    setLoading(true)
    try {
      const res = await api.chat(question, knowledgeBase)
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: 'assistant', content: res.answer, citations: res.citations },
      ])
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      setMessages((prev) => [
        ...prev,
        { id: nextId++, role: 'assistant', content: text, citations: [], error: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="chat-page">
      <header className="page-header">
        <div>
          <h1>智能问询</h1>
          <p className="page-sub">向企业知识库 Agent 提问，回答将附上引用来源</p>
        </div>
        <label className="kb-picker">
          <span>知识库</span>
          <input
            list="chat-kb-options"
            value={knowledgeBase}
            onChange={(e) => setKnowledgeBase(e.target.value)}
            placeholder="知识库名称"
          />
          <datalist id="chat-kb-options">
            {knowledgeBases.map((kb) => (
              <option key={kb.name} value={kb.name} />
            ))}
          </datalist>
        </label>
      </header>

      <div className="chat-window">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p>有什么想问的？输入问题开始对话。</p>
            <p className="chat-empty-sub">例如：年假如何计算？</p>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((m) => (
              <div key={m.id} className={`message-row ${m.role}`}>
                <div className="avatar">{m.role === 'user' ? '🧑' : '🤖'}</div>
                <div className={`bubble${m.error ? ' error' : ''}`}>
                  <div className="bubble-text">{m.content}</div>
                  <CitationList citations={m.citations} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="message-row assistant">
                <div className="avatar">🤖</div>
                <div className="bubble typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <span className="typing-text">检索资料并思考中…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
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
        <button className="btn primary send-btn" onClick={() => void handleSend()} disabled={loading || !input.trim()}>
          {loading ? '思考中…' : '发送'}
        </button>
      </div>
    </div>
  )
}
