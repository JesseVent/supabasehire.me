/**
 * Header-based auth for API routes.
 *
 * Connection credentials are passed via custom `X-Supabase-*` headers
 * instead of the request body, so they don't appear in body logs or
 * request payloads. This is a defense-in-depth measure — the app runs
 * locally on localhost, but keeping credentials out of the body reduces
 * exposure if request logging is ever added.
 *
 * IMPORTANT: This is a local dev tool. Credentials are still stored in
 * the browser's localStorage (via Zustand persist) and are readable from
 * devtools. See the README Security section for details.
 */

import type { NextRequest } from 'next/server'
import { getExtensionCredentials, getSessionCredentials, setSessionCredentials } from '@/lib/extension-bridge'
import type { SupabaseConnection } from '@/lib/supabase-types'

// Header names — single source of truth for client and server
export const H = {
  Url: 'x-supabase-url',
  Id: 'x-supabase-connection-id',
  Name: 'x-supabase-connection-name',
  AnonKey: 'x-supabase-anon-key',
  ServiceRoleKey: 'x-supabase-service-role-key',
  AccessToken: 'x-supabase-access-token',
  RefreshToken: 'x-supabase-refresh-token',
} as const

/**
 * Extract a SupabaseConnection from request headers.
 * Returns null if the required URL header is missing.
 */
export function getConnectionFromHeaders(request: NextRequest): SupabaseConnection | null {
  const url = request.headers.get(H.Url)
  if (!url) return null

  return {
    id: request.headers.get(H.Id) || '',
    name: request.headers.get(H.Name) || '',
    supabaseUrl: url,
    anonKey: request.headers.get(H.AnonKey) || '',
    serviceRoleKey: request.headers.get(H.ServiceRoleKey),
    accessToken: request.headers.get(H.AccessToken),
    refreshToken: request.headers.get(H.RefreshToken),
    s3KeyId: null,
    s3Secret: null,
    s3Warehouse: null,
    createdAt: '',
    updatedAt: '',
  }
}

/**
 * Build the connection headers object for a fetch call.
 * Filters out null/undefined values.
 */
export function connectionHeaders(conn: SupabaseConnection): Record<string, string> {
  const headers: Record<string, string> = {
    [H.Url]: conn.supabaseUrl,
    [H.Id]: conn.id,
    [H.Name]: conn.name,
    [H.AnonKey]: conn.anonKey,
  }
  if (conn.serviceRoleKey) headers[H.ServiceRoleKey] = conn.serviceRoleKey
  if (conn.accessToken) headers[H.AccessToken] = conn.accessToken
  if (conn.refreshToken) headers[H.RefreshToken] = conn.refreshToken
  return headers
}

/**
 * Client-side fetch wrapper that includes connection credentials in headers.
 *
 * Usage:
 *   const res = await apiFetch('/api/sql', conn, { query: 'SELECT 1' })
 *
 * The connection data goes into `X-Supabase-*` headers.
 * The `data` parameter is the rest of the request body (without connection).
 */
async function updateStoredConnection(
  connectionId: string,
  updates: Partial<SupabaseConnection>
): Promise<void> {
  try {
    // Update through the Zustand store so both the in-memory state and the
    // persisted localStorage copy get the refreshed tokens. Patching
    // localStorage directly would leave components holding the old token,
    // and the next store write would clobber the refreshed (rotated)
    // refresh token — permanently breaking the OAuth session.
    // Dynamic import keeps the store out of server bundles (this module is
    // also imported by API routes for getConnectionFromHeaders).
    const { useSupabaseStore } = await import('@/store/supabase-store')
    useSupabaseStore.getState().updateConnection(connectionId, updates)
  } catch {
    // silent fail — persistence is best-effort
  }
}

const AUTH_ERROR_PATTERNS = [
  /jwt expired/i,
  /invalid token/i,
  /invalid_token/i,
  /token expired/i,
  /unauthorized/i,
  /authentication failed/i,
]

function isAuthError(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const str = JSON.stringify(body)
  return AUTH_ERROR_PATTERNS.some((p) => p.test(str))
}

async function tryRefresh(
  conn: SupabaseConnection
): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (!conn.refreshToken) return null
  try {
    const clientId = sessionStorage.getItem('supabase_dcr_client_id')
    const clientSecret = sessionStorage.getItem('supabase_dcr_client_secret')
    if (!clientId) return null

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: conn.refreshToken,
    })
    if (clientSecret) params.set('client_secret', clientSecret)

    const refreshRes = await fetch('/api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    if (!refreshRes.ok) {
      const errData = await refreshRes.json().catch(() => ({})) as Record<string, string>
      if (/unrecognized.client/i.test(errData.error ?? '')) {
        sessionStorage.removeItem('supabase_dcr_client_id')
        sessionStorage.removeItem('supabase_dcr_client_secret')
      }
      return null
    }
    const tokens = await refreshRes.json()
    return {
      accessToken: tokens.access_token as string,
      refreshToken: (tokens.refresh_token ?? conn.refreshToken) as string,
    }
  } catch {
    return null
  }
}

export async function apiFetch(
  path: string,
  conn: SupabaseConnection,
  data?: Record<string, unknown>
): Promise<Response> {
  // Extension connections should use credentials extracted from the extension
  // vault. The extension is only awake briefly (service workers are suspended),
  // so we do NOT keep proxying every call through it. Instead we read the
  // tokens once into a session-only cache, then route through normal /api/*
  // calls like a regular OAuth connection.
  let effectiveConn = conn
  if (conn.source === 'extension') {
    let creds = getSessionCredentials(conn.id)
    if (!creds) {
      creds = await getExtensionCredentials()
      if (creds) {
        setSessionCredentials(conn.id, creds)
      }
    }

    if (!creds?.accessToken) {
      return new Response(
        JSON.stringify({
          error: 'Extension is not responding. Open the extension once to reconnect, or switch to OAuth.',
          // Distinguishable code so the UI can render an actionable OAuth button.
          code: 'extension_unavailable',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    effectiveConn = {
      ...conn,
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      anonKey: creds.anonKey ?? conn.anonKey,
      serviceRoleKey: creds.serviceRoleKey ?? conn.serviceRoleKey,
    }
  }

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...connectionHeaders(effectiveConn),
    },
    body: JSON.stringify(data ?? {}),
  })

  // Case 1: Direct 401 from our API routes
  if (res.status === 401 && effectiveConn.refreshToken) {
    const tokens = await tryRefresh(effectiveConn)
    if (tokens) {
      await updateStoredConnection(conn.id, tokens)
      return fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...connectionHeaders({ ...effectiveConn, ...tokens }),
        },
        body: JSON.stringify(data ?? {}),
      })
    }
    return res
  }

  // Case 2: Management API errors are proxied as 200 with { error: "JWT expired" }
  // Clone the response so we can still return it if refresh fails
  const cloned = res.clone()
  try {
    const body = await cloned.json()
    if (isAuthError(body) && effectiveConn.refreshToken) {
      const tokens = await tryRefresh(effectiveConn)
      if (tokens) {
        await updateStoredConnection(conn.id, tokens)
        return fetch(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...connectionHeaders({ ...effectiveConn, ...tokens }),
          },
          body: JSON.stringify(data ?? {}),
        })
      }
    }
  } catch {
    // Not JSON — ignore
  }

  return res
}
