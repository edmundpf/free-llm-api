// Shared types: a minimal, practical subset of the OpenAI chat-completions
// contract plus the internal shapes used for routing and rate-limit tracking.

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool' | 'function'

export interface ChatMessage {
  role: ChatRole
  content: string | ContentPart[] | null
  name?: string
  tool_call_id?: string
  tool_calls?: unknown[]
}

export interface ContentPart {
  type: string
  text?: string
  [key: string]: unknown
}

// The incoming OpenAI-style request body. We keep it loose (index signature)
// so unknown fields are forwarded upstream untouched.
export interface ChatCompletionRequest {
  model?: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  top_p?: number
  // Optional caller hint to bias routing without changing the OpenAI contract.
  complexity?: number
  provider?: string
  [key: string]: unknown
}

// The band a task falls into, derived from its complexity score.
export type ComplexityTier = 'trivial' | 'simple' | 'moderate' | 'complex'

export interface ComplexityResult {
  score: number
  tier: ComplexityTier
  signals: Record<string, number>
}

// A single upstream LLM the router can dispatch to.
export interface ProviderConfig {
  id: string
  label: string
  baseUrl: string
  apiKey: string
  model: string
  // Base preference, independent of task complexity.
  weight: number
  // How strongly this provider is favored as complexity rises.
  complexityWeight: number
  // Local fallbacks are only used once every remote is rate-limited.
  isLocal: boolean
  enabled: boolean
  // Default cooldown (ms) applied when a rate limit has no Retry-After header.
  defaultCooldownMs: number
}

// Snapshot of a provider's availability for logging / diagnostics.
export interface ProviderAvailability {
  id: string
  available: boolean
  availableAt: number
  lastReason?: string
}

// Normalised failure classification used by the dispatcher to decide whether
// to fail over to the next provider or surface the error to the caller.
export type FailureKind = 'rate_limit' | 'retriable' | 'fatal'

export interface DispatchError {
  kind: FailureKind
  status?: number
  retryAfterMs?: number
  message: string
  providerId: string
}
