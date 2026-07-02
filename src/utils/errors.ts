import { DispatchError, FailureKind } from '../types'

// Failure classification. Turns an upstream HTTP status (or a thrown network
// error) into the kind the dispatcher acts on: rate_limit -> cool down and
// fail over, retriable -> just fail over, fatal -> surface to the caller.

const classifyStatus = (status: number): FailureKind => {
  if (status === 429) return 'rate_limit'
  // Some gateways signal quota exhaustion with 402/403; treat as rate-limit so
  // we fail over instead of hammering.
  if (status === 402 || status === 403) return 'rate_limit'
  if (status >= 500) return 'retriable'
  return 'fatal'
}

// Parse Retry-After (seconds, or an HTTP date) into milliseconds.
export const parseRetryAfter = (headerValue: string | null): number | undefined => {
  if (!headerValue) return undefined
  const asSeconds = Number(headerValue)
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds * 1000)
  const asDate = Date.parse(headerValue)
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now())
  return undefined
}

export const fromResponse = (
  providerId: string,
  status: number,
  body: string,
  retryAfterHeader: string | null,
): DispatchError => ({
  kind: classifyStatus(status),
  status,
  retryAfterMs: parseRetryAfter(retryAfterHeader),
  message: body.slice(0, 500),
  providerId,
})

export const fromThrown = (providerId: string, err: unknown): DispatchError => {
  const message = err instanceof Error ? err.message : String(err)
  const isAbort = err instanceof Error && err.name === 'AbortError'
  return {
    // Timeouts and network blips are worth trying the next provider for.
    kind: 'retriable',
    message: isAbort ? 'request timed out' : message,
    providerId,
  }
}

export const isDispatchError = (e: unknown): e is DispatchError =>
  typeof e === 'object' && e !== null && 'kind' in e && 'providerId' in e
