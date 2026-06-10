import { type NextRequest, NextResponse } from 'next/server'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'

// POST /api/sql — Execute a raw SQL query via the hosted Supabase MCP server.
// DCR-issued OAuth tokens are only valid for mcp.supabase.com, not the
// Management API, so SQL must go through the MCP execute_sql tool.
export async function POST(request: NextRequest) {
  const client = mcpClientFromRequest(request)
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'OAuth access token required to execute SQL. Reconnect via OAuth.' },
      { status: 401 }
    )
  }

  let query: string | undefined
  try {
    const body = await request.json()
    query = body.query
  } catch {
    query = undefined
  }
  if (!query) {
    return NextResponse.json({ success: false, error: 'Query is required' }, { status: 400 })
  }

  try {
    const raw = await client.callTool('execute_sql', { query })
    const data = parseMcpSqlRows<Record<string, unknown>>(raw)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to execute SQL'
    const status = /unauthorized|jwt|token.*(expired|invalid)/i.test(msg) ? 401 : 500
    return NextResponse.json({ success: false, error: msg }, { status })
  } finally {
    client.disconnect().catch(() => {})
  }
}
