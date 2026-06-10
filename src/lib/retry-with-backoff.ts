/**
 * Retry a fetch with exponential backoff + jitter.
 *
 * Features:
 * - Stops immediately on 401/403/429 (auth failure or throttle — retrying won't help)
 * - Deduplicates identical in-flight requests (same key → same Promise)
 * - Per-key consecutive-failure counter: callers can use `shouldSkip` to skip
 *   connections whose last N calls all failed with auth errors
 */

const inflight = new Map<string, Promise<Response>>()

export interface RetryOptions {
  /** Unique key for deduplication (e.g. `${connectionId}:${path}`) */
  key: string
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

/**
 * Fetch with exponential backoff, jitter, and in-flight deduplication.
 *
 * Stops retrying on:
 *   - HTTP 401/403 — auth failure (retrying won't fix it)
 *   - HTTP 429     — throttle / rate limit (honour Retry-After if present)
 *   - Network errors after maxAttempts
 */
export async function fetchWithBackoff(
  fetchFn: () => Promise<Response>,
  opts: RetryOptions
): Promise<Response> {
  const { key, maxAttempts = 3, baseDelayMs = 500, maxDelayMs = 15_000 } = opts

  // Deduplicate: if this key is already in-flight, share the same promise
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetchFn()

        // Stop retrying — these won't recover with retries
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          return res
        }

        // Any other non-ok response on last attempt: return it
        if (!res.ok && attempt === maxAttempts) return res

        // Success or continue
        if (res.ok) return res
      } catch (err) {
        if (attempt === maxAttempts) throw err
      }

      // Exponential backoff with ±20% jitter
      const base = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      const jitter = base * 0.2 * (Math.random() * 2 - 1)
      await sleep(Math.round(base + jitter))
    }

    // Should not reach here
    throw new Error('fetchWithBackoff: exhausted retries')
  })().finally(() => inflight.delete(key))

  inflight.set(key, promise)
  return promise
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Per-connection auth failure tracking ─────────────────────────────────────

const authFailureCounts = new Map<string, number>()
const AUTH_SKIP_THRESHOLD = 3

/** Record a 401/403 response for a connection. */
export function recordAuthFailure(connectionId: string): void {
  authFailureCounts.set(connectionId, (authFailureCounts.get(connectionId) ?? 0) + 1)
}

/** Record a successful response — resets the failure counter. */
export function recordSuccess(connectionId: string): void {
  authFailureCounts.delete(connectionId)
}

/**
 * Returns true if the connection has had AUTH_SKIP_THRESHOLD consecutive
 * auth failures and should be skipped to avoid hammering the API.
 */
export function shouldSkipConnection(connectionId: string): boolean {
  return (authFailureCounts.get(connectionId) ?? 0) >= AUTH_SKIP_THRESHOLD
}
