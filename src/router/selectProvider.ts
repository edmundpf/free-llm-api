import { ProviderConfig } from '../types'
import { RateLimitTracker } from '../rateLimit/tracker'

// Ordered provider selection. Given the task complexity and the current
// rate-limit state, produce the ordered list of providers the dispatcher
// should try. Remotes are ranked by a complexity-aware score; the local
// fallback is appended last and only surfaces when every remote is unavailable.

export interface SelectionOptions {
  // Caller-forced provider id (skips scoring, still respects availability).
  forcedProviderId?: string
}

const effectiveScore = (provider: ProviderConfig, complexity: number): number =>
  provider.weight + complexity * provider.complexityWeight

export const rankProviders = (
  providers: ProviderConfig[],
  complexity: number,
): ProviderConfig[] => {
  const enabled = providers.filter((p) => p.enabled)
  const remotes = enabled
    .filter((p) => !p.isLocal)
    .sort((a, b) => effectiveScore(b, complexity) - effectiveScore(a, complexity))
  // Local providers are the last resort, kept in weight order among themselves.
  const locals = enabled.filter((p) => p.isLocal).sort((a, b) => b.weight - a.weight)
  return [...remotes, ...locals]
}

export const selectProviders = (
  providers: ProviderConfig[],
  complexity: number,
  tracker: RateLimitTracker,
  options: SelectionOptions = {},
): ProviderConfig[] => {
  const ranked = rankProviders(providers, complexity)

  if (options.forcedProviderId) {
    const forced = ranked.find((p) => p.id === options.forcedProviderId)
    if (forced) {
      // Try the forced provider first, then fall back through the normal stack.
      return [forced, ...ranked.filter((p) => p.id !== forced.id)]
    }
  }

  const available = ranked.filter((p) => tracker.isAvailable(p.id))
  const remotesAvailable = available.some((p) => !p.isLocal)

  // Only expose the local fallback once every remote is rate-limited. If some
  // remotes are still available, drop locals from this attempt entirely.
  const primary = remotesAvailable ? available.filter((p) => !p.isLocal) : available

  if (primary.length > 0) return primary

  // Everything is cooling down. Return the full ranked stack anyway so the
  // dispatcher can still make a best-effort attempt rather than hard-failing.
  return ranked
}
