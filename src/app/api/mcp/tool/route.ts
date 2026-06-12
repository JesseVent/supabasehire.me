import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { projectRefFromUrl, SupabaseMcpClient } from '@/lib/supabase-mcp-client'

// POST /api/mcp/tool — Execute a Supabase MCP tool server-side.
// Runs server-side to avoid CORS restrictions on mcp.supabase.com.
// Body: { name: string, args: Record<string, unknown> }
export async function POST(request: NextRequest) {
  const connection = getConnectionFromHeaders(request)
  if (!connection?.accessToken) {
    return NextResponse.json({ error: 'Access token required for MCP' }, { status: 401 })
  }

  const projectRef = projectRefFromUrl(connection.supabaseUrl)
  if (!projectRef) {
    return NextResponse.json({ error: 'Could not determine project ref from URL' }, { status: 400 })
  }

  let name: string
  let args: Record<string, unknown>
  try {
    const body = await request.json()
    name = body.name
    args = body.args ?? {}
    if (!name) throw new Error('missing name')
  } catch {
    return NextResponse.json({ error: 'Body must be { name, args }' }, { status: 400 })
  }

  const client = new SupabaseMcpClient({ projectRef, accessToken: connection.accessToken })
  try {
    const result = await client.callTool(name, args)
    return NextResponse.json({ result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : `MCP tool "${name}" failed`
    const sanitized = msg.replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[token]')
    const isAuthError = /unauthorized|jwt|token.*(expired|invalid)/i.test(msg)
    const error = isAuthError
      ? `OAuth token expired or invalid. Reconnect via OAuth. (${sanitized})`
      : sanitized
    return NextResponse.json({ error }, { status: isAuthError ? 401 : 502 })
  } finally {
    client.disconnect().catch(() => {})
  }
}
