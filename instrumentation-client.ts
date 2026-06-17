import posthog from 'posthog-js'

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: '/ingest',
  ui_host: 'https://us.posthog.com',
  defaults: '2026-01-30',
  // Autocapture is disabled — this app handles API keys and tokens in form fields.
  // All tracking is done explicitly via track() in analytics.ts.
  autocapture: false,
  capture_heatmaps: false,
  session_recording: { maskAllInputs: true },
  capture_exceptions: true,
  debug: process.env.NODE_ENV === 'development',
})

// IMPORTANT: Never combine this approach with other client-side PostHog initialization
// approaches, especially components like a PostHogProvider.
// instrumentation-client.ts is the correct solution for initializing client-side
// PostHog in Next.js 15.3+ apps.
