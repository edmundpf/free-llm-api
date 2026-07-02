import { ChatCompletionRequest, ProviderConfig } from '../types'
import { fromResponse } from '../utils/errors'

// Generic adapter for any OpenAI chat-completions compatible endpoint. Gemini,
// DeepSeek, Mistral, OpenRouter and the local llama.cpp server all speak this
// protocol, so a single function parametrised by baseUrl/apiKey/model drives
// every provider. It never throws a plain Error for HTTP failures: non-2xx
// responses become a classified DispatchError the dispatcher can fail over on.

const buildBody = (
  req: ChatCompletionRequest,
  provider: ProviderConfig,
): Record<string, unknown> => {
  // Strip gateway-only fields and pin the provider's own model id.
  const { complexity, provider: _forced, model: _model, ...rest } = req
  return { ...rest, model: provider.model }
}

const buildHeaders = (provider: ProviderConfig): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
  }
  // OpenRouter recommends these attribution headers; harmless elsewhere.
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_REFERER || 'https://localhost'
    headers['X-Title'] = process.env.OPENROUTER_TITLE || 'free-llm-api'
  }
  return headers
}

const endpoint = (provider: ProviderConfig): string =>
  `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`

// Perform the upstream call and return the raw fetch Response once headers are
// in. The caller decides how to consume the body (JSON vs SSE stream). If the
// status is not ok we read the body and throw a classified DispatchError, which
// happens BEFORE any bytes reach the client — so streaming can still fail over.
export const callProvider = async (
  provider: ProviderConfig,
  req: ChatCompletionRequest,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(endpoint(provider), {
      method: 'POST',
      headers: buildHeaders(provider),
      body: JSON.stringify(buildBody(req, provider)),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw fromResponse(provider.id, res.status, body, res.headers.get('retry-after'))
    }
    return res
  } finally {
    clearTimeout(timer)
  }
}
