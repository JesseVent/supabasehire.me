/**
 * Run a SQL query against a Supabase project via the Management API.
 * Works with both sbp_... personal access tokens and OAuth JWTs.
 * Returns rows as plain objects (no MCP wrapper layer).
 */
export async function managementSql(
  accessToken: string,
  projectRef: string,
  query: string,
  readOnly = true
): Promise<Record<string, unknown>[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, read_only: readOnly }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Management API SQL (${res.status}): ${text}`)
  }
  const data = await res.json()
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  if (Array.isArray(data?.rows)) return data.rows as Record<string, unknown>[]
  if (Array.isArray(data?.data)) return data.data as Record<string, unknown>[]
  return []
}

/**
 * Execute a Supabase RPC function via the PostgREST REST API.
 */
export async function executeSupabaseRPC(
  supabaseUrl: string,
  secretKey: string,
  functionName: string,
  params: Record<string, unknown>
): Promise<{ data?: unknown; error?: string }> {
  try {
    // Get a valid JWT (exchanges publishable key if needed)
    const validKey = await getValidApiKey(supabaseUrl, secretKey)

    const headers: Record<string, string> = {
      apikey: secretKey,
      Authorization: `Bearer ${validKey}`,
      'Content-Type': 'application/json',
    }

    const url = `${supabaseUrl}/rest/v1/rpc/${functionName}`
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        error: `Supabase RPC error (${response.status}): ${errorText}`,
      }
    }

    const result = await response.json()
    return { data: result }
  } catch (err) {
    return {
      error: `Failed to execute RPC: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Exchange a Supabase publishable key (sb_publishable_...) for an anonymous JWT.
 * The new publishable key format cannot be used directly with PostgREST —
 * it must first be exchanged via the Supabase Auth API.
 * Returns the JWT token string, or null if exchange fails.
 */
export async function exchangePublishableKeyForJWT(
  supabaseUrl: string,
  publishableKey: string
): Promise<string | null> {
  try {
    // Anonymous sign-in returns a proper eyJ... JWT the edge runtime accepts.
    // grant_type=apikey doesn't exist; grant_type=anonymous is the correct path
    // for obtaining a JWT from an sb_publishable_ or sb_secret_ opaque key.
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=anonymous`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) return null

    const data = await response.json()
    return data.access_token || data.jwt || null
  } catch {
    return null
  }
}

/**
 * Get a valid API key/JWT for making PostgREST requests.
 * For old-style JWT keys (eyJ...), returns the key directly.
 * For new publishable keys (sb_publishable_...), exchanges for a JWT first.
 * Caches the result to avoid repeated exchanges.
 */
const jwtCache = new Map<string, { jwt: string; expires: number }>()

export async function getValidApiKey(supabaseUrl: string, apiKey: string): Promise<string> {
  // Old JWT format — use directly
  if (apiKey.startsWith('eyJ')) {
    return apiKey
  }

  // New key formats (sb_publishable_ and sb_secret_) are opaque — not JWTs.
  // Edge functions reject them with UNAUTHORIZED_INVALID_JWT_FORMAT.
  // Exchange via anonymous sign-in to get a real eyJ... JWT.
  if (apiKey.startsWith('sb_publishable_') || apiKey.startsWith('sb_secret_')) {
    const cacheKey = `${supabaseUrl}:${apiKey}`
    const cached = jwtCache.get(cacheKey)

    if (cached && cached.expires > Date.now()) {
      return cached.jwt
    }

    const jwt = await exchangePublishableKeyForJWT(supabaseUrl, apiKey)
    if (jwt) {
      jwtCache.set(cacheKey, { jwt, expires: Date.now() + 55 * 60 * 1000 })
      return jwt
    }

    return apiKey
  }

  // Unknown format — try as-is
  return apiKey
}
