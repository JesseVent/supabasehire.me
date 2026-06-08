import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/agent/chat
 *
 * Server-side proxy for LLM API requests.
 * The client sends an OpenAI-compatible request body WITHOUT an API key.
 * This route injects the key from a server environment variable and forwards
 * the request to the LLM provider, keeping the key off the browser.
 *
 * Env vars used (pick one):
 *   LLM_API_KEY       — works for any OpenAI-compatible provider
 *   OPENAI_API_KEY     — alias, specific to OpenAI
 *
 * The client sends:
 *   { provider, model, body }
 * where `body` is the full OpenAI chat/completions request payload.
 * baseURL is intentionally NOT accepted from the client — it is resolved
 * server-side from the provider allowlist to prevent SSRF.
 */

// Hardcoded allowlist — the client cannot override these URLs.
const PROVIDER_BASE_URLS: Record<string, string> = {
	openai: 'https://api.openai.com/v1',
	anthropic: 'https://api.anthropic.com/v1',
	google: 'https://generativelanguage.googleapis.com/v1beta/openai',
	openrouter: 'https://openrouter.ai/api/v1',
}

export async function POST(request: NextRequest) {
	try {
		const { provider, model, body } = await request.json()

		if (!provider || !body) {
			return NextResponse.json(
				{ error: 'provider and body are required' },
				{ status: 400 }
			)
		}

		// Resolve base URL from server-side allowlist — never from the client
		const baseURL = PROVIDER_BASE_URLS[provider]
		if (!baseURL) {
			return NextResponse.json(
				{ error: `Unknown provider "${provider}". Server-side proxy only supports: ${Object.keys(PROVIDER_BASE_URLS).join(', ')}` },
				{ status: 400 }
			)
		}

		// Resolve API key from server env — never from the client
		const apiKey = resolveApiKey(provider)

		if (!apiKey) {
			return NextResponse.json(
				{
					error:
						'No LLM API key configured on the server. Set LLM_API_KEY or OPENAI_API_KEY in your .env file.',
				},
				{ status: 401 }
			)
		}

		// Build the provider URL from the server-side allowlist
		const endpoint = `${baseURL}/chat/completions`

		// Inject model from client config if not already in body
		if (!body.model && model) {
			body.model = model
		}

		// Reasoning models (gpt-5.x series) only support verbosity:'medium'
		const resolvedModel: string = body.model ?? model ?? ''
		if (/gpt-5[._\d]/.test(resolvedModel) || resolvedModel === 'gpt-54' || resolvedModel === 'gpt-54-mini') {
			if (body.verbosity === 'low') body.verbosity = 'medium'
			if (
				body.reasoning &&
				typeof body.reasoning === 'object' &&
				(body.reasoning as Record<string, unknown>).verbosity === 'low'
			) {
				(body.reasoning as Record<string, unknown>).verbosity = 'medium'
			}
		}

		// Forward to the provider
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(body),
		})

		// Stream or JSON — pass through the response as-is
		const contentType = response.headers.get('content-type') || ''
		const isStream =
			body.stream === true || contentType.includes('text/event-stream')

		if (isStream) {
			// Stream the response back
			const reader = response.body?.getReader()
			if (!reader) {
				return NextResponse.json(
					{ error: 'No response body from provider' },
					{ status: 502 }
				)
			}

			return new NextResponse(
				new ReadableStream({
					async start(controller) {
						try {
							while (true) {
								const { done, value } = await reader.read()
								if (done) break
								controller.enqueue(value)
							}
							controller.close()
						} catch (err) {
							controller.error(err)
						}
					},
				}),
				{
					status: response.status,
					headers: {
						'Content-Type': contentType || 'text/event-stream',
						'Cache-Control': 'no-cache',
						Connection: 'keep-alive',
					},
				}
			)
		}

		// Non-streaming: pass through JSON
		const data = await response.json()

		if (!response.ok) {
			return NextResponse.json(data, { status: response.status })
		}

		return NextResponse.json(data)
	} catch (err) {
		console.error('[/api/agent/chat] Error:', err)
		return NextResponse.json(
			{
				error:
					err instanceof Error ? err.message : 'Internal proxy error',
			},
			{ status: 500 }
		)
	}
}

/**
 * Resolve the API key from environment variables.
 * Priority: LLM_API_KEY > provider-specific key
 */
function resolveApiKey(provider?: string): string | null {
	// Generic key — works for any provider
	if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY

	// Provider-specific fallbacks
	if (provider === 'openai' && process.env.OPENAI_API_KEY)
		return process.env.OPENAI_API_KEY
	if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY)
		return process.env.ANTHROPIC_API_KEY
	if (provider === 'google' && process.env.GOOGLE_API_KEY)
		return process.env.GOOGLE_API_KEY

	return null
}
