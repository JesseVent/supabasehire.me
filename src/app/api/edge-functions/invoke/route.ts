import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders, traceIdFromTraceparent, traceparentHeader } from '@/lib/api-auth'
import { getValidApiKey } from '@/lib/supabase-helpers'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { projectRefFromUrl, SupabaseMcpClient } from '@/lib/supabase-mcp-client'
import type { SupabaseConnection } from '@/lib/supabase-types'

const VAULT_CACHE = new Map<string, { secret: string; expires: number }>()
const VAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes
const VAULT_SECRET_NAME = 'devtool-edge-fn-key'

/**
 * Retrieve a secret from Supabase Vault via MCP SQL.
 * Caches the result for 5 minutes to avoid hammering MCP.
 */
async function getVaultSecret(
  supabaseUrl: string,
  accessToken: string
): Promise<string | null> {
  const cacheKey = `${supabaseUrl}:${accessToken.slice(0, 8)}`
  const cached = VAULT_CACHE.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    return cached.secret
  }

  const projectRef = projectRefFromUrl(supabaseUrl)
  if (!projectRef) return null

  const client = new SupabaseMcpClient({ projectRef, accessToken })
  try {
    const raw = await client.callTool('execute_sql', {
      query: `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '${VAULT_SECRET_NAME}' LIMIT 1`,
    })
    const rows = parseMcpSqlRows<{ decrypted_secret: string }>(raw)
    const secret = rows[0]?.decrypted_secret ?? null
    if (secret) {
      VAULT_CACHE.set(cacheKey, { secret, expires: Date.now() + VAULT_TTL_MS })
    }
    return secret
  } catch {
    return null
  } finally {
    client.disconnect().catch(() => {})
  }
}

// POST /api/edge-functions/invoke — Invoke an edge function
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      functionName,
      method,
      body: functionBody,
      headers: customHeaders,
      verifyJwt,
    } = body as {
      functionName: string
      method?: string
      body?: unknown
      headers?: Record<string, string>
      verifyJwt?: boolean
    }
    const connection = getConnectionFromHeaders(request)

    if (!connection || !functionName) {
      return NextResponse.json(
        { error: 'connection and functionName are required' },
        { status: 400 }
      )
    }

    const httpMethod = method?.toUpperCase() || 'POST'
    if (httpMethod !== 'GET' && httpMethod !== 'POST') {
      return NextResponse.json({ error: 'Method must be GET or POST' }, { status: 400 })
    }

    // ── Key resolution ──
    // 1. Prefer explicit serviceRoleKey if present.
    // 2. OAuth-only connection? Try Vault fallback (secret stored in
    //    Supabase Vault, retrieved via MCP SQL with admin privileges).
    // 3. Fall back to anonKey.
    let rawKey = connection.serviceRoleKey ?? connection.anonKey
    if (!connection.serviceRoleKey && connection.accessToken) {
      const vaultKey = await getVaultSecret(connection.supabaseUrl, connection.accessToken)
      if (vaultKey) rawKey = vaultKey
    }

    // New-format opaque keys (sb_secret_/sb_publishable_) are not JWTs and are
    // rejected by the edge runtime. Exchange them for a real JWT first.
    const apiKey = await getValidApiKey(connection.supabaseUrl, rawKey)

    const url = `${connection.supabaseUrl}/functions/v1/${functionName}`

    // Propagate-or-mint a W3C trace id: the edge runtime stamps its logs with it
    // and agent-query echoes it in its OTLP spans, so the trace and the server
    // logs join by trace_id. A caller's own traceparent (request header, or one
    // passed in customHeaders) wins — the traceId returned below is always the
    // one actually sent, so the caller can query logs by it.
    const traceId =
      traceIdFromTraceparent(request.headers.get('traceparent')) ??
      traceIdFromTraceparent(customHeaders?.traceparent ?? null) ??
      crypto.randomUUID().replaceAll('-', '')

    const requestHeaders: Record<string, string> = {
      apikey: rawKey,
      'Content-Type': 'application/json',
      ...customHeaders,
      traceparent: traceparentHeader(traceId),
    }

    // Only send Authorization for functions that verify JWT.
    // verify_jwt=false functions may do their own auth checks and can reject
    // anon-role JWTs even though the platform ignores the header.
    if (verifyJwt !== false) {
      requestHeaders.Authorization = `Bearer ${apiKey}`
    }

    const fetchOptions: RequestInit = {
      method: httpMethod,
      headers: requestHeaders,
    }

    // Only include body for POST requests
    if (httpMethod === 'POST' && functionBody) {
      fetchOptions.body = JSON.stringify(functionBody)
    }

    const response = await fetch(url, fetchOptions)

    let data: unknown
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    if (!response.ok) {
      return NextResponse.json({
        error: typeof data === 'string' ? data : JSON.stringify(data),
        status: response.status,
      })
    }

    return NextResponse.json({
      data,
      status: response.status,
      traceId,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to invoke edge function' }, { status: 500 })
  }
}
