/**
 * Server-side MCP client factory.
 *
 * Creates a SupabaseMcpClient from request headers so API routes can call
 * mcp.supabase.com/mcp without duplicating the auth plumbing everywhere.
 * Used by catalog routes and any other server route that needs MCP access.
 */
import { NextRequest } from 'next/server'

import { H, getConnectionFromHeaders } from '@/lib/api-auth'
import { SupabaseMcpClient, projectRefFromUrl } from '@/lib/supabase-mcp-client'

/**
 * Build a project-scoped SupabaseMcpClient from the X-Supabase-* request headers.
 * Returns null if the access token or project ref cannot be determined.
 */
export function mcpClientFromRequest(request: NextRequest): SupabaseMcpClient | null {
  const conn = getConnectionFromHeaders(request)
  if (!conn?.accessToken) return null

  const projectRef = projectRefFromUrl(conn.supabaseUrl)
  if (!projectRef) return null

  return new SupabaseMcpClient({
    projectRef,
    accessToken: conn.accessToken,
    onTokenRefresh: async () => {
      // Token refresh is handled client-side; server routes use short-lived tokens
      return null
    },
  })
}

/**
 * Build a project-scoped SupabaseMcpClient from explicit values.
 * Useful when the caller already has the ref and token extracted.
 */
export function mcpClientFromToken(projectRef: string, accessToken: string): SupabaseMcpClient {
  return new SupabaseMcpClient({ projectRef, accessToken })
}

export { H }
