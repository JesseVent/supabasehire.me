import { type NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { serverTraceBus } from '@/lib/server-trace-bus'

/**
 * POST /api/agent/chat
 *
 * Server-side proxy for LLM API requests.
 * The client sends an OpenAI-compatible request body WITHOUT an API key.
 * This route injects the key from a server environment variable and forwards
 * the request to the LLM provider, keeping the key off the browser.
 *
 * Auth (T-05) — same pattern as the supa-agent extension:
 *   The client passes its Supabase Management API OAuth access token in
 *   `x-supabase-access-token` (the same header used by every other route).
 *   Server-side we validate it by calling api.supabase.com/v1/profile.
 *   Validated tokens are cached for 5 minutes to avoid hammering the MGMT API.
 *   If no server LLM key is configured, auth is skipped (local dev only).
 *
 * Rate limiting:
 *   30 requests per IP per minute (in-process, resets on cold start).
 *
 * Env vars used for LLM keys (pick one):
 *   LLM_API_KEY       — works for any OpenAI-compatible provider
 *   OPENAI_API_KEY     — alias, specific to OpenAI
 *
 * The client sends:
 *   { provider, model, body }
 * where `body` is the full OpenAI chat/completions request payload.
 * baseURL is intentionally NOT accepted from the client — it is resolved
 * server-side from the provider allowlist to prevent SSRF.
 *
 * Trace events:
 *   Every LLM call is published to the server-side trace bus so that
 *   /api/agent/trace SSE subscribers can visualize backend agent activity.
 */

// Hardcoded allowlist — the client cannot override these URLs.
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
}

// ── Management API token validation cache ───────────────────────────────────
// Mirrors the extension's approach: the access token the user already holds
// from the Management API OAuth flow is reused here for auth.
const TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutes
const validTokenCache = new Map<string, number>() // token → expiresAt

// ── Rate limiting (T-05) ───────────────────────────────────────────────────
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60 * 1000
const rateMap = new Map<string, { count: number; resetAt: number }>()

async function isMgmtTokenValid(token: string): Promise<boolean> {
  const cached = validTokenCache.get(token)
  if (cached && cached > Date.now()) return true

  try {
    const res = await fetch('https://api.supabase.com/v1/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      validTokenCache.set(token, Date.now() + TOKEN_TTL_MS)
      return true
    }
    return false
  } catch {
    return false
  }
}

function getCallerIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || entry.resetAt <= now) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  // ── Auth check (Supabase Management API OAuth token) ─────────────────────
  // Only enforce when a server LLM key is configured — without one the panel
  // already requires the user to enter their own key (client-side only).
  const serverLlmKeyPresent = !!(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY)
  if (serverLlmKeyPresent) {
    const mgmtToken = request.headers.get('x-supabase-access-token')
    if (!mgmtToken) {
      return NextResponse.json(
        { error: 'Unauthorized: Supabase Management API access token required.' },
        { status: 401 }
      )
    }
    const valid = await isMgmtTokenValid(mgmtToken)
    if (!valid) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or expired Supabase access token.' },
        { status: 401 }
      )
    }
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const callerIp = getCallerIp(request)
  if (!checkRateLimit(callerIp)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before sending more requests.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  try {
    const { provider, model, body } = await request.json()

    if (!provider || !body) {
      return NextResponse.json({ error: 'provider and body are required' }, { status: 400 })
    }

    // Resolve base URL from server-side allowlist — never from the client
    const baseURL = PROVIDER_BASE_URLS[provider]
    if (!baseURL) {
      return NextResponse.json(
        {
          error: `Unknown provider "${provider}". Server-side proxy only supports: ${Object.keys(PROVIDER_BASE_URLS).join(', ')}`,
        },
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

    // Inject model from client config if not already in body
    if (!body.model && model) {
      body.model = model
    }

    // Reasoning models (gpt-5.x series) only support verbosity:'medium'
    const resolvedModel: string = body.model ?? model ?? ''
    if (
      /gpt-5[._\d]/.test(resolvedModel) ||
      resolvedModel === 'gpt-54' ||
      resolvedModel === 'gpt-54-mini'
    ) {
      if (body.verbosity === 'low') body.verbosity = 'medium'
      if (
        body.reasoning &&
        typeof body.reasoning === 'object' &&
        (body.reasoning as Record<string, unknown>).verbosity === 'low'
      ) {
        ;(body.reasoning as Record<string, unknown>).verbosity = 'medium'
      }
    }

    // Use the OpenAI SDK so @opentelemetry/instrumentation-openai auto-captures
    // token counts, latency, and model info as PostHog AI spans.
    const client = new OpenAI({ apiKey, baseURL })

    const callStart = Date.now()
    const modelName = (body.model ?? model ?? 'unknown') as string
    const msgCount = Array.isArray(body.messages) ? body.messages.length : 0

    serverTraceBus.publish({
      type: 'llm_call',
      title: `LLM → ${provider}/${modelName}`,
      metadata: { provider, model: modelName, messageCount: msgCount, streaming: body.stream === true },
      input: JSON.stringify({ model: modelName, messages: body.messages, tools: body.tools }),
    })

    if (body.stream === true) {
      const stream = await client.chat.completions.create({ ...body, stream: true })
      serverTraceBus.publish({
        type: 'llm_call',
        title: `LLM ← ${provider}/${modelName} (stream)`,
        duration: Date.now() - callStart,
        metadata: { provider, model: modelName, streaming: true },
      })
      return new NextResponse(stream.toReadableStream(), {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // Non-streaming
    const completion = await client.chat.completions.create({ ...body, stream: false })
    const duration = Date.now() - callStart
    const usage = completion.usage

    serverTraceBus.publish({
      type: 'llm_call',
      title: `LLM ← ${provider}/${modelName}`,
      duration,
      metadata: {
        provider,
        model: modelName,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
      },
      output: JSON.stringify(completion.choices?.[0]?.message ?? completion),
    })

    return NextResponse.json(completion)
  } catch (err) {
    console.error('[/api/agent/chat] Error:', err)
    serverTraceBus.publish({
      type: 'error',
      title: 'LLM proxy error',
      error: err instanceof Error ? err.message : 'Internal proxy error',
    })
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Internal proxy error',
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
  if (provider === 'openai' && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY)
    return process.env.ANTHROPIC_API_KEY
  if (provider === 'google' && process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY

  return null
}
