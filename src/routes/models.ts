import { Request, Response } from 'express'
import { AppConfig } from '../config'
import { RateLimitTracker } from '../rateLimit/tracker'

// GET /v1/models — OpenAI-style model listing. Exposes one virtual model that
// represents the gateway ("auto"), plus each configured provider so callers can
// force a specific one via the request body's `provider` field.
export const makeModelsHandler = (config: AppConfig) =>
  (_req: Request, res: Response): void => {
    const now = Math.floor(Date.now() / 1000)
    const data = [
      { id: 'auto', object: 'model', created: now, owned_by: 'free-llm-api' },
      ...config.providers
        .filter((p) => p.enabled)
        .map((p) => ({
          id: p.id,
          object: 'model',
          created: now,
          owned_by: p.label,
        })),
    ]
    res.json({ object: 'list', data })
  }

// GET /status — non-OpenAI diagnostics: which providers are enabled and their
// current rate-limit state. Handy while wiring up keys.
export const makeStatusHandler = (config: AppConfig, tracker: RateLimitTracker) =>
  (_req: Request, res: Response): void => {
    const ids = config.providers.filter((p) => p.enabled).map((p) => p.id)
    res.json({
      providers: config.providers.map((p) => ({
        id: p.id,
        label: p.label,
        model: p.model,
        enabled: p.enabled,
        isLocal: p.isLocal,
        weight: p.weight,
        complexityWeight: p.complexityWeight,
      })),
      availability: tracker.snapshot(ids),
    })
  }
