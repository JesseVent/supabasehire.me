import posthog from 'posthog-js'

// PostHog is initialized in instrumentation-client.ts for Next.js 15.3+.
// This module only exports helpers that call the already-initialized instance.

/** Fire a PLG product event. No-ops when PostHog is not initialized. */
export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  posthog.capture(event, properties)
}

/**
 * Attach a Supabase project ref as a super-property so every subsequent
 * event carries it — lets you slice adoption by project in PostHog.
 */
export function setProject(supabaseUrl: string) {
  if (typeof window === 'undefined') return
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0]
    posthog.register({ project_ref: ref })
  } catch {
    // invalid URL — skip
  }
}
