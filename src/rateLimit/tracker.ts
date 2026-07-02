import { ProviderAvailability } from '../types'
import { logger } from '../utils/logger'

// In-memory rate-limit tracker. Functional factory (closure over state, no
// class) so the dispatcher can ask "is this provider usable right now?" and
// mark one as cooling down when it returns a 429. State is per-process, which
// is exactly what a single-node gateway needs.

interface Entry {
  availableAt: number
  lastReason?: string
}

export interface RateLimitTracker {
  isAvailable: (providerId: string) => boolean
  markLimited: (providerId: string, cooldownMs: number, reason?: string) => void
  clear: (providerId: string) => void
  snapshot: (providerIds: string[]) => ProviderAvailability[]
}

export const createRateLimitTracker = (): RateLimitTracker => {
  const state = new Map<string, Entry>()

  const isAvailable = (providerId: string): boolean => {
    const entry = state.get(providerId)
    if (!entry) return true
    if (Date.now() >= entry.availableAt) {
      state.delete(providerId)
      return true
    }
    return false
  }

  const markLimited = (providerId: string, cooldownMs: number, reason?: string): void => {
    const availableAt = Date.now() + Math.max(0, cooldownMs)
    state.set(providerId, { availableAt, lastReason: reason })
    logger.warn('provider rate-limited, cooling down', {
      provider: providerId,
      cooldownMs,
      availableAt: new Date(availableAt).toISOString(),
      reason,
    })
  }

  const clear = (providerId: string): void => {
    state.delete(providerId)
  }

  const snapshot = (providerIds: string[]): ProviderAvailability[] =>
    providerIds.map((id) => {
      const entry = state.get(id)
      const available = isAvailable(id)
      return {
        id,
        available,
        availableAt: entry ? entry.availableAt : 0,
        lastReason: entry?.lastReason,
      }
    })

  return { isAvailable, markLimited, clear, snapshot }
}
