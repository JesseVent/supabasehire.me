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

import { NextRequest } from 'next/server'
import type { SupabaseConnection } from '@/lib/supabase-types'

// Header names — single source of truth for client and server
export const H = {
  Url:            'x-supabase-url',
  Id:             'x-supabase-connection-id',
  Name:           'x-supabase-connection-name',
  AnonKey:        'x-supabase-anon-key',
  ServiceRoleKey: 'x-supabase-service-role-key',
  AccessToken:    'x-supabase-access-token',
} as const

/**
 * Extract a SupabaseConnection from request headers.
 * Returns null if the required URL header is missing.
 */
export function getConnectionFromHeaders(
  request: NextRequest
): SupabaseConnection | null {
  const url = request.headers.get(H.Url)
  if (!url) return null

  return {
    id: request.headers.get(H.Id) || '',
    name: request.headers.get(H.Name) || '',
    supabaseUrl: url,
    anonKey: request.headers.get(H.AnonKey) || '',
    serviceRoleKey: request.headers.get(H.ServiceRoleKey),
    accessToken: request.headers.get(H.AccessToken),
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
export function connectionHeaders(
  conn: SupabaseConnection
): Record<string, string> {
  const headers: Record<string, string> = {
    [H.Url]: conn.supabaseUrl,
    [H.Id]: conn.id,
    [H.Name]: conn.name,
    [H.AnonKey]: conn.anonKey,
  }
  if (conn.serviceRoleKey) headers[H.ServiceRoleKey] = conn.serviceRoleKey
  if (conn.accessToken) headers[H.AccessToken] = conn.accessToken
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
export async function apiFetch(
  path: string,
  conn: SupabaseConnection,
  data?: Record<string, unknown>
): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...connectionHeaders(conn),
    },
    body: JSON.stringify(data ?? {}),
  })
}
