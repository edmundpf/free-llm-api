import { Request, Response } from 'express'
import { Readable } from 'node:stream'
import { Dispatcher, AllProvidersExhaustedError } from '../core/dispatcher'
import { ChatCompletionRequest, ChatMessage } from '../types'
import { Interaction } from '../context/transcript'
import { logger } from '../utils/logger'

// Recorder callback the handler uses to persist an interaction for Claude to
// read. It's fire-and-forget on the store side.
export type RecordFn = (entry: Interaction) => void

// Flatten a message's content down to plain text for the transcript.
const messageText = (m: ChatMessage): string => {
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) return m.content.map((p) => p.text || '').join(' ')
  return ''
}

const lastUserPrompt = (messages: ChatMessage[]): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messageText(messages[i])
  }
  return ''
}

// POST /v1/chat/completions — the single OpenAI-style endpoint. It delegates
// provider selection and failover to the dispatcher, then either streams the
// upstream SSE body straight through or relays the JSON response. Failover has
// already happened by the time we touch `res`, so we never write partial output
// and then try to switch providers.

const relayHeaders = (provider: string, complexityTier: string) => ({
  // Surface which model actually served the request for debugging.
  'X-LLM-Provider': provider,
  'X-LLM-Complexity': complexityTier,
})

const streamResponse = async (
  upstream: globalThis.Response,
  res: Response,
): Promise<void> => {
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  if (!upstream.body) {
    res.end()
    return
  }

  const nodeStream = Readable.fromWeb(upstream.body as any)
  // If the client disconnects, stop pulling from upstream.
  res.on('close', () => nodeStream.destroy())
  try {
    for await (const chunk of nodeStream) {
      const ok = res.write(chunk)
      if (!ok) await new Promise((resolve) => res.once('drain', resolve))
    }
  } finally {
    res.end()
  }
}

export const makeChatCompletionsHandler = (dispatcher: Dispatcher, record: RecordFn) =>
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as ChatCompletionRequest

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({
        error: { message: 'messages must be a non-empty array', type: 'invalid_request_error' },
      })
      return
    }

    try {
      const result = await dispatcher.dispatch(body)
      const headers = relayHeaders(result.provider.id, result.complexity.tier)
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)

      if (body.stream) {
        // The reply body is piped straight through, so we log the prompt and the
        // chosen provider but leave the reply for the transcript to mark uncaptured.
        record({
          time: new Date().toISOString(),
          provider: result.provider.id,
          model: result.provider.model,
          tier: result.complexity.tier,
          prompt: lastUserPrompt(body.messages),
          reply: '',
        })
        await streamResponse(result.response, res)
        return
      }

      const json = (await result.response.json()) as {
        model?: string
        choices?: { message?: { content?: string } }[]
      }
      record({
        time: new Date().toISOString(),
        provider: result.provider.id,
        model: json.model ?? result.provider.model,
        tier: result.complexity.tier,
        prompt: lastUserPrompt(body.messages),
        reply: json.choices?.[0]?.message?.content ?? '',
      })
      res.status(200).json(json)
    } catch (e) {
      if (e instanceof AllProvidersExhaustedError) {
        // If the only failure was a fatal client error, echo its status.
        const fatal = e.errors.find((err) => err.kind === 'fatal')
        const status = fatal?.status ?? 503
        logger.error('request failed after failover', {
          status,
          tried: e.errors.map((err) => `${err.providerId}:${err.kind}`),
        })
        res.status(status).json({
          error: {
            message: fatal
              ? fatal.message
              : 'all upstream providers are unavailable or rate-limited',
            type: fatal ? 'upstream_error' : 'no_provider_available',
            details: e.errors.map((err) => ({
              provider: err.providerId,
              kind: err.kind,
              status: err.status,
            })),
          },
        })
        return
      }
      logger.error('unexpected handler error', { message: String(e) })
      res.status(500).json({
        error: { message: 'internal error', type: 'internal_error' },
      })
    }
  }
