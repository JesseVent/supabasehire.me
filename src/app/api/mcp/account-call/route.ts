import { NextRequest, NextResponse } from 'next/server'
import { SupabaseMcpClient } from '@/lib/supabase-mcp-client'

// POST /api/mcp/account-call — Execute an account-level Supabase MCP tool server-side.
// Needed because mcp.supabase.com blocks CORS from browser origins.
// Body: { accessToken: string, name: string, args?: Record<string, unknown>, projectRef?: string }
export async function POST(request: NextRequest) {
  let accessToken: string
  let name: string
  let args: Record<string, unknown>
  let projectRef: string | undefined

  try {
    const body = await request.json()
    accessToken = body.accessToken
    name = body.name
    args = body.args ?? {}
    projectRef = body.projectRef
    if (!accessToken) throw new Error('missing accessToken')
    if (!name) throw new Error('missing name')
  } catch {
    return NextResponse.json({ error: 'Body must be { accessToken, name, args?, projectRef? }' }, { status: 400 })
  }

  const client = new SupabaseMcpClient({ projectRef, accessToken })
  try {
    const result = await client.callTool(name, args)
    return NextResponse.json({ result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : `MCP tool "${name}" failed` },
      { status: 502 }
    )
  } finally {
    client.disconnect().catch(() => {})
  }
}
