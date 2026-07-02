import { Request, Response } from 'express'
import { Readable } from 'node:stream'
import { Dispatcher, AllProvidersExhaustedError } from '../core/dispatcher'
import { ChatCompletionRequest } from '../types'
import { logger } from '../utils/logger'

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

export const makeChatCompletionsHandler = (dispatcher: Dispatcher) =>
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
        await streamResponse(result.response, res)
        return
      }

      const json = await result.response.json()
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
