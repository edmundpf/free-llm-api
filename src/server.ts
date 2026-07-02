import path from 'node:path'
import express, { NextFunction, Request, Response } from 'express'
import { AppConfig } from './config'
import { createRateLimitTracker } from './rateLimit/tracker'
import { createDispatcher } from './core/dispatcher'
import { requireAuth } from './middleware/auth'
import { createContextStore } from './context/store'
import { makeChatCompletionsHandler } from './routes/chatCompletions'
import { makeModelsHandler, makeStatusHandler } from './routes/models'
import { makeLoginHandler, makeMeHandler } from './routes/auth'
import { makeFsListHandler } from './routes/fs'
import { makeGetContextHandler, makeSetContextHandler } from './routes/context'
import { logger } from './utils/logger'

// Assembles the Express app: it serves the built React PWA, exposes the login
// endpoint, and guards the OpenAI-compatible API behind a session JWT. Wiring
// only — the real work lives in the dispatcher and auth utilities.

// The PWA is built by Vite into web/dist; serve it as the app shell.
const webDir = path.join(__dirname, '..', 'web', 'dist')

export const createServer = (config: AppConfig) => {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  const tracker = createRateLimitTracker()
  const dispatcher = createDispatcher(config, tracker)
  const contextStore = createContextStore(config.context)
  const guard = requireAuth(config.auth)

  // Public: health + login + static PWA assets.
  app.get('/health', (_req, res) => res.json({ status: 'ok' }))
  app.post('/auth/login', makeLoginHandler(config.auth))

  // Protected API: a valid JWT is required on every call.
  app.get('/auth/me', guard, makeMeHandler())
  app.get('/v1/models', guard, makeModelsHandler(config))
  app.get('/status', guard, makeStatusHandler(config, tracker))
  app.post('/v1/chat/completions', guard, makeChatCompletionsHandler(dispatcher, contextStore.record))

  // Folder picker + context settings for the "let Claude see my prompts" feature.
  app.get('/fs/list', guard, makeFsListHandler())
  app.get('/config/context', guard, makeGetContextHandler(contextStore))
  app.post('/config/context', guard, makeSetContextHandler(contextStore))

  // Serve the PWA and fall back to index.html for client-side routing.
  app.use(express.static(webDir))
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/v1') ||
      req.path.startsWith('/auth') ||
      req.path.startsWith('/fs') ||
      req.path.startsWith('/config') ||
      req.path === '/status'
    ) {
      next()
      return
    }
    res.sendFile(path.join(webDir, 'index.html'), (err) => {
      if (err) res.status(404).json({ error: { message: 'not found', type: 'not_found' } })
    })
  })

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('unhandled express error', { message: err.message })
    res.status(500).json({ error: { message: 'internal error', type: 'internal_error' } })
  })

  return app
}
