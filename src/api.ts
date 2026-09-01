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
}

export interface ChatResponse {
  answer: string
  citations: Citation[]
}

export interface UploadResult {
  filename: string
  knowledge_base: string
  chunks: number
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
  chat: (question: string, knowledgeBase: string) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ question, knowledge_base: knowledgeBase }),
    }),
}
