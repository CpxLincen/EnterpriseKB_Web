/** 后端 API 地址。
 *  - 生产/容器部署：留空，使用相对路径，由 Nginx 反向代理到后端（同源，无需 CORS）。
 *  - 本地开发：留空即可，Vite dev server 已配置 /knowledge-bases、/chat、/auth 等代理；
 *    如需直连后端，可设置 VITE_API_BASE=http://127.0.0.1:8000。
 */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''

const TOKEN_KEY = 'entkb_token'
const USER_KEY = 'entkb_user'

export interface UserInfo {
  id: number
  username: string
  display_name: string | null
  email: string | null
  role: string
  is_active: boolean
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: { id: number; username: string; role: string }
}

export interface KnowledgeBase {
  name: string
  embedding_model: string
  embedding_dimensions: number
  document_count: number
  created_at: string | null
}

export interface DocumentInfo {
  id: number
  filename: string
  chunk_count: number
  created_at: string | null
}

export interface Citation {
  filename: string
  page_number: number | null
  chunk_index: number
  excerpt: string
  knowledge_base?: string
}

export interface ChatResponse {
  answer: string
  citations: Citation[]
  decision: string
}

export interface UploadResult {
  filename: string
  knowledge_base: string
  chunks: number
  text_chunks?: number
  table_chunks?: number
  skipped_pages?: number
  ocr_pages?: number
  parse_ms?: number
  warnings?: string[]
}

export interface RebuildResult {
  knowledge_base: string
  processed: number
  chunks: number
  errors: string[]
  warnings?: string[]
}

export interface EvalSetInfo {
  id: string
  name: string
  knowledge_base: string | null
  cases: number
  error?: string
}

export interface EvalCase {
  id: string
  category: string
  question: string
  reference_answer: string | null
  expected_sources: string[]
  expected_facts: string[]
  expect_no_answer: boolean
}

export interface EvalCaseResult {
  id: string
  category: string
  question: string
  answer: string
  citations: Citation[]
  is_no_answer: boolean
  retrieval_hit: boolean | null
  expected_sources: string[]
  fact_hit: boolean | null
  fact_matched: string[]
  fact_missing: string[]
  no_answer_correct: boolean | null
  judge_score: number | null
  judge_reason: string | null
}

export interface EvalMetric {
  n: number
  hit?: number
  correct?: number
  rate: number | null
}

export interface EvalSummary {
  total: number
  answered: number
  no_answer: number
  retrieval_recall: EvalMetric
  fact_accuracy: EvalMetric
  no_answer_accuracy: EvalMetric
  judge_accuracy: EvalMetric | null
}

export interface EvalRunStatus {
  job_id: string
  set_id: string
  judge: boolean
  modes: string[]
  status: 'queued' | 'running' | 'done' | 'error'
  progress: number
  total: number
  summary: Record<string, EvalSummary> | null
  results: Record<string, EvalCaseResult[]>
  error: string | null
  started_at: string | null
  finished_at: string | null
}

export interface AuditLogEntry {
  id: number
  ts: string | null
  action: string
  user: string | null
  ip: string | null
  detail: string | null
  extra: Record<string, unknown> | null
}

export interface AuditLogsResponse {
  total: number
  limit: number
  offset: number
  items: AuditLogEntry[]
}

export interface AuditActionStat {
  action: string
  count: number
}

export interface ReviewItem {
  id: number
  question: string
  answer: string
  knowledge_base: string
  citations: Citation[]
  decision: string
  status: 'pending' | 'approved' | 'rejected'
  asked_by: string | null
  reviewer: string | null
  review_note: string | null
  created_at: string | null
  reviewed_at: string | null
}

export interface ReviewQueueResponse {
  total: number
  limit: number
  offset: number
  items: ReviewItem[]
}

export interface ConversationSummary {
  id: number
  title: string
  knowledge_base: string | null
  created_at: string | null
  updated_at: string | null
  message_count: number | null
  status: string
  archived_at: string | null
}

export interface ConversationMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  decision: string | null
  memory: string | null
  created_at: string | null
}

export interface ConversationDetail extends ConversationSummary {
  total: number
  has_more: boolean
  messages: ConversationMessage[]
}

export interface ConversationListResponse {
  items: ConversationSummary[]
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): UserInfo | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as UserInfo) : null
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken())
}

export function setAuth(token: string, user: UserInfo): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function setStoredUser(user: UserInfo): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
  })
  // 401：清除本地凭证并跳转登录页（登录页本身除外）
  if (res.status === 401) {
    clearAuth()
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
  }
  if (!res.ok) {
    let detail = `请求失败（HTTP ${res.status}）`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (body?.detail) {
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
      }
    } catch {
      // 响应体不是 JSON 时保留默认错误信息
    }
    throw new Error(detail)
  }
  return (await res.json()) as T
}

export interface ChatStreamCallbacks {
  onCitations?: (citations: Citation[]) => void
  onDecision?: (decision: string) => void
  onDelta?: (text: string) => void
  onMemory?: (memory: string) => void
  onError?: (message: string) => void
}

/**
 * 以 SSE 方式请求指定端点并逐块回调（citations / delta / done / error）。
 * 错误通过 onError 回调返回（不抛异常）；401 时清凭证并跳转登录。
 */
async function postSse(
  path: string,
  body: unknown,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    callbacks.onError?.(err instanceof Error ? err.message : String(err))
    return
  }

  if (res.status === 401) {
    clearAuth()
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
    return
  }

  if (!res.ok) {
    let detail = `请求失败（HTTP ${res.status}）`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (body?.detail) {
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
      }
    } catch {
      // 响应体不是 JSON 时保留默认错误信息
    }
    callbacks.onError?.(detail)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    callbacks.onError?.('当前浏览器不支持流式读取')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  const handleEvent = (rawEvent: string) => {
    const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'))
    if (!dataLine) return
    const payload = dataLine.slice(5).trim()
    if (!payload) return
    let evt: {
      type: string
      citations?: Citation[]
      text?: string
      message?: string
      decision?: string
      memory?: string
    }
    try {
      evt = JSON.parse(payload)
    } catch {
      return
    }
    if (evt.decision) callbacks.onDecision?.(evt.decision)
    if (evt.type === 'citations' && evt.citations) {
      callbacks.onCitations?.(evt.citations)
      if (evt.memory) callbacks.onMemory?.(evt.memory)
    }
    else if (evt.type === 'delta' && evt.text) callbacks.onDelta?.(evt.text)
    else if (evt.type === 'error') callbacks.onError?.(evt.message ?? '流式输出出错')
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        handleEvent(rawEvent)
      }
    }
    if (buffer.trim()) handleEvent(buffer)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return
    callbacks.onError?.(err instanceof Error ? err.message : String(err))
  }
}

/** 流式问答：以 SSE 方式请求 /chat/stream，逐块回调回答增量。 */
export async function chatStream(
  question: string,
  knowledgeBase: string,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  return postSse('/chat/stream', { question, knowledge_base: knowledgeBase }, callbacks)
}

/** 会话内流式问答：以 SSE 方式请求 /conversations/{id}/chat/stream。 */
export async function conversationChatStream(
  conversationId: number,
  question: string,
  knowledgeBase: string | null,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  return postSse(
    `/conversations/${conversationId}/chat/stream`,
    { question, knowledge_base: knowledgeBase ?? null },
    callbacks,
  )
}

export const api = {
  login: (username: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
  me: () => request<UserInfo>('/auth/me'),
  logout: () => request<{ detail: string }>('/auth/logout', { method: 'POST' }),
  listKnowledgeBases: () => request<KnowledgeBase[]>('/knowledge-bases'),
  listDocuments: (kb: string) =>
    request<DocumentInfo[]>(`/knowledge-bases/${encodeURIComponent(kb)}/documents`),
  uploadDocument: (kb: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<UploadResult>(`/knowledge-bases/${encodeURIComponent(kb)}/documents`, {
      method: 'POST',
      body: form,
    })
  },
  deleteDocument: (kb: string, id: number) =>
    request<{ deleted: boolean; filename: string }>(
      `/knowledge-bases/${encodeURIComponent(kb)}/documents/${id}`,
      { method: 'DELETE' },
    ),
  reingestKnowledgeBase: (kb: string, sourceDir: string) =>
    request<RebuildResult>(`/knowledge-bases/${encodeURIComponent(kb)}/reingest`, {
      method: 'POST',
      body: JSON.stringify({ source_dir: sourceDir }),
    }),
  rebuildKnowledgeBase: (kb: string, sourceDir: string) =>
    request<RebuildResult>(`/knowledge-bases/${encodeURIComponent(kb)}/rebuild`, {
      method: 'POST',
      body: JSON.stringify({ source_dir: sourceDir }),
    }),
  listEvalSets: () => request<EvalSetInfo[]>('/eval/sets'),
  getEvalSet: (setId: string) =>
    request<{ id: string; knowledge_base: string; cases: EvalCase[] }>(
      `/eval/sets/${encodeURIComponent(setId)}`,
    ),
  runEval: (evalSet: string, judge: boolean, modes: string[] = ['dense', 'hybrid', 'rerank']) =>
    request<{ job_id: string }>('/eval/runs', {
      method: 'POST',
      body: JSON.stringify({ eval_set: evalSet, judge, modes }),
    }),
  getEvalRun: (jobId: string) => request<EvalRunStatus>(`/eval/runs/${encodeURIComponent(jobId)}`),
  listAuditActions: () => request<AuditActionStat[]>('/audit/actions'),
  listAuditLogs: (params: {
    q?: string
    action?: string
    user?: string
    limit?: number
    offset?: number
  }) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.action) qs.set('action', params.action)
    if (params.user) qs.set('user', params.user)
    if (params.limit != null) qs.set('limit', String(params.limit))
    if (params.offset != null) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return request<AuditLogsResponse>(`/audit/logs${query ? `?${query}` : ''}`)
  },
  listReviewItems: (params: { status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.limit != null) qs.set('limit', String(params.limit))
    if (params.offset != null) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return request<ReviewQueueResponse>(`/review/queue${query ? `?${query}` : ''}`)
  },
  resolveReviewItem: (id: number, action: 'approve' | 'reject', note?: string) =>
    request<ReviewItem>(`/review/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action, note: note ?? null }),
    }),
  chat: (question: string, knowledgeBase: string) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ question, knowledge_base: knowledgeBase }),
    }),
  listConversations: (params?: { status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    const query = qs.toString()
    return request<ConversationListResponse>(`/conversations${query ? `?${query}` : ''}`)
  },
  createConversation: (params: { title?: string | null; knowledge_base?: string | null }) =>
    request<ConversationSummary>('/conversations', {
      method: 'POST',
      body: JSON.stringify({
        title: params.title ?? null,
        knowledge_base: params.knowledge_base ?? null,
      }),
    }),
  getConversation: (id: number, params?: { limit?: number; beforeId?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.beforeId != null) qs.set('before_id', String(params.beforeId))
    const query = qs.toString()
    return request<ConversationDetail>(`/conversations/${id}${query ? `?${query}` : ''}`)
  },
  deleteConversation: (id: number) =>
    request<{ deleted: boolean; id: number }>(`/conversations/${id}`, { method: 'DELETE' }),
  archiveConversation: (id: number) =>
    request<ConversationSummary>(`/conversations/${id}/archive`, { method: 'POST' }),
  unarchiveConversation: (id: number) =>
    request<ConversationSummary>(`/conversations/${id}/unarchive`, { method: 'POST' }),
  runRetention: () =>
    request<{ archived: number; deleted: number; archive_days: number | null; retention_days: number | null }>(
      '/conversations/retention/run',
      { method: 'POST' },
    ),
}
