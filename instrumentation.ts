// instrumentation.ts — Next.js server-side instrumentation (runs once in Node.js context).
// Sets up OpenTelemetry with PostHog's span processor so every OpenAI SDK call is
// automatically captured as a PostHog AI event (model, tokens, latency, cost).
//
// Docs: https://posthog.com/docs/ai-engineering/observability

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { NodeSDK } = await import('@opentelemetry/sdk-node')
  const { resourceFromAttributes } = await import('@opentelemetry/resources')
  const { PostHogSpanProcessor } = await import('@posthog/ai/otel')
  const { OpenAIInstrumentation } = await import('@opentelemetry/instrumentation-openai')

  const apiKey = process.env.POSTHOG_API_KEY
  if (!apiKey) return // no-op if not configured

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': 'supabasehire-devtool',
    }),
    spanProcessors: [
      new PostHogSpanProcessor({
        apiKey,
        host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
      }),
    ],
    instrumentations: [new OpenAIInstrumentation()],
  })

  sdk.start()
}
