// Thin client for the gateway. Same-origin in production (served by Express),
// proxied to :8787 in dev. The JWT is stored in localStorage so the session
// persists across reloads and app restarts, and is sent as a Bearer token on
// every protected call.

const TOKEN_KEY = 'sunset-llm.token'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatResult {
  content: string
  // Which gateway provider served it (gemini, deepseek, ...) — the footnote.
  provider: string | null
  // The actual upstream model id, from the response body.
  model: string | null
  complexity: string | null
}

// Thrown on a 401 so the UI can drop the session and show the login screen.
export class AuthError extends Error {
  constructor(message = 'session expired') {
    super(message)
    this.name = 'AuthError'
  }
}

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY)

const authHeaders = (): Record<string, string> => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const login = async (email: string, password: string): Promise<void> => {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (res.status === 401) throw new AuthError('invalid email or password')
  if (!res.ok) throw new Error(`login failed (${res.status})`)
  const data = (await res.json()) as { token?: string }
  if (!data.token) throw new Error('login response missing token')
  setToken(data.token)
}

// Validate a stored token on startup.
export const checkSession = async (): Promise<boolean> => {
  if (!getToken()) return false
  try {
    const res = await fetch('/auth/me', { headers: authHeaders() })
    return res.ok
  } catch {
    return false
  }
}

export const sendChat = async (messages: ChatMessage[]): Promise<ChatResult> => {
  const res = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ model: 'auto', messages }),
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    const message =
      (detail as { error?: { message?: string } })?.error?.message ||
      `request failed (${res.status})`
    throw new Error(message)
  }
  const provider = res.headers.get('X-LLM-Provider')
  const complexity = res.headers.get('X-LLM-Complexity')
  const data = (await res.json()) as {
    model?: string
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content ?? ''
  return { content, provider, model: data.model ?? null, complexity }
}

// ---- Folder picker + context settings (server-side filesystem) ----

export interface DirEntry {
  name: string
  path: string
}

export interface DirListing {
  path: string
  parent: string | null
  entries: DirEntry[]
}

export interface ContextState {
  folder: string | null
  enabled: boolean
}

const authedJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    const message =
      (detail as { error?: { message?: string } })?.error?.message ||
      `request failed (${res.status})`
    throw new Error(message)
  }
  return (await res.json()) as T
}

export const listDir = (path?: string): Promise<DirListing> =>
  authedJson<DirListing>(`/fs/list${path ? `?path=${encodeURIComponent(path)}` : ''}`)

export const getContextConfig = (): Promise<ContextState> =>
  authedJson<ContextState>('/config/context')

export const setContextConfig = (patch: {
  folder?: string | null
  enabled?: boolean
}): Promise<ContextState> =>
  authedJson<ContextState>('/config/context', { method: 'POST', body: JSON.stringify(patch) })
