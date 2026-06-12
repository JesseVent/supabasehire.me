import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { projectRefFromUrl, SupabaseMcpClient } from '@/lib/supabase-mcp-client'

// POST /api/mcp/tools — Return the tool list from the Supabase hosted MCP server.
// Runs server-side to avoid CORS restrictions on mcp.supabase.com.
export async function POST(request: NextRequest) {
  const connection = getConnectionFromHeaders(request)
  if (!connection?.accessToken) {
    return NextResponse.json({ error: 'Access token required for MCP' }, { status: 401 })
  }

  const projectRef = projectRefFromUrl(connection.supabaseUrl)
  if (!projectRef) {
    return NextResponse.json({ error: 'Could not determine project ref from URL' }, { status: 400 })
  }

  const client = new SupabaseMcpClient({ projectRef, accessToken: connection.accessToken })
  try {
    const tools = await client.listTools()
    return NextResponse.json({ tools })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to list MCP tools'
    const sanitized = msg.replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[token]')
    const isAuthError = /unauthorized|jwt|token.*(expired|invalid)/i.test(msg)
    const error = isAuthError
      ? `OAuth token expired or invalid. Reconnect via OAuth in the Settings panel. (${sanitized})`
      : sanitized
    return NextResponse.json({ error }, { status: isAuthError ? 401 : 502 })
  } finally {
    client.disconnect().catch(() => {})
  }
}
