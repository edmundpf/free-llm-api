import express, { NextFunction, Request, Response } from 'express'
import { AppConfig } from './config'
import { createRateLimitTracker } from './rateLimit/tracker'
import { createDispatcher } from './core/dispatcher'
import { makeChatCompletionsHandler } from './routes/chatCompletions'
import { makeModelsHandler, makeStatusHandler } from './routes/models'
import { logger } from './utils/logger'

// Assembles the Express app: optional bearer auth, the OpenAI-compatible routes
// and diagnostics. Wiring only — the real work lives in the dispatcher.

const bearerAuth = (expected: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!expected) {
      next()
      return
    }
    const header = req.header('authorization') || ''
    const token = header.replace(/^Bearer\s+/i, '')
    if (token !== expected) {
      res.status(401).json({
        error: { message: 'invalid api key', type: 'authentication_error' },
      })
      return
    }
    next()
  }

export const createServer = (config: AppConfig) => {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  const tracker = createRateLimitTracker()
  const dispatcher = createDispatcher(config, tracker)

  app.get('/health', (_req, res) => res.json({ status: 'ok' }))

  const guard = bearerAuth(config.apiKey)
  app.get('/v1/models', guard, makeModelsHandler(config))
  app.get('/status', guard, makeStatusHandler(config, tracker))
  app.post('/v1/chat/completions', guard, makeChatCompletionsHandler(dispatcher))

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('unhandled express error', { message: err.message })
    res.status(500).json({ error: { message: 'internal error', type: 'internal_error' } })
  })

  return app
}
