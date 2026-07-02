import { AppConfig } from '../config'
import {
  ChatCompletionRequest,
  ComplexityResult,
  DispatchError,
  ProviderConfig,
} from '../types'
import { RateLimitTracker } from '../rateLimit/tracker'
import { scoreComplexity } from '../router/complexity'
import { selectProviders } from '../router/selectProvider'
import { callProvider } from '../providers/openaiCompatible'
import { isDispatchError } from '../utils/errors'
import { logger } from '../utils/logger'

// Top-level orchestration: score the prompt, build the ordered provider stack,
// then try each in turn. A rate limit cools the provider down and fails over to
// the next; a retriable error just fails over; a fatal error is surfaced. On
// success the winning upstream Response is returned untouched so the route can
// stream it or read it as JSON. Kept as a functional factory (no class yet).

export interface DispatchSuccess {
  provider: ProviderConfig
  response: Response
  complexity: ComplexityResult
  attempts: string[]
}

export class AllProvidersExhaustedError extends Error {
  readonly errors: DispatchError[]
  readonly complexity: ComplexityResult
  constructor(errors: DispatchError[], complexity: ComplexityResult) {
    super('all providers exhausted')
    this.name = 'AllProvidersExhaustedError'
    this.errors = errors
    this.complexity = complexity
  }
}

export interface Dispatcher {
  dispatch: (req: ChatCompletionRequest) => Promise<DispatchSuccess>
}

export const createDispatcher = (
  config: AppConfig,
  tracker: RateLimitTracker,
): Dispatcher => {
  const dispatch = async (req: ChatCompletionRequest): Promise<DispatchSuccess> => {
    const complexity = scoreComplexity(req.messages, req.complexity)
    const candidates = selectProviders(config.providers, complexity.score, tracker, {
      forcedProviderId: typeof req.provider === 'string' ? req.provider : undefined,
    }).slice(0, config.maxAttempts)

    logger.info('routing request', {
      complexity: complexity.score,
      tier: complexity.tier,
      stack: candidates.map((p) => p.id),
    })

    const attempts: string[] = []
    const errors: DispatchError[] = []

    for (const provider of candidates) {
      attempts.push(provider.id)
      try {
        const response = await callProvider(provider, req, config.requestTimeoutMs)
        tracker.clear(provider.id)
        logger.info('provider succeeded', {
          provider: provider.id,
          tier: complexity.tier,
          attempts,
        })
        return { provider, response, complexity, attempts }
      } catch (e) {
        const err: DispatchError = isDispatchError(e)
          ? e
          : { kind: 'retriable', message: String(e), providerId: provider.id }
        errors.push(err)

        if (err.kind === 'rate_limit') {
          const cooldown = err.retryAfterMs ?? provider.defaultCooldownMs
          tracker.markLimited(provider.id, cooldown, err.message)
          continue
        }
        if (err.kind === 'retriable') {
          logger.warn('provider retriable failure, failing over', {
            provider: provider.id,
            status: err.status,
            message: err.message,
          })
          continue
        }
        // Fatal (e.g. malformed request): surface immediately, no failover.
        logger.error('provider fatal failure', {
          provider: provider.id,
          status: err.status,
          message: err.message,
        })
        throw new AllProvidersExhaustedError([err], complexity)
      }
    }

    throw new AllProvidersExhaustedError(errors, complexity)
  }

  return { dispatch }
}
