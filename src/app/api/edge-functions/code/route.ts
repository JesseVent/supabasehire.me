import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'

// POST /api/edge-functions/code — retrieve edge function source code via MCP
// body: { functionSlug: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { functionSlug } = body as { functionSlug?: string }
    const connection = getConnectionFromHeaders(request)

    if (!connection || !functionSlug) {
      return NextResponse.json(
        { error: 'connection and functionSlug are required' },
        { status: 400 }
      )
    }

    const client = mcpClientFromRequest(request)
    if (!client) {
      return NextResponse.json(
        { error: 'OAuth access token required to fetch edge function code.' },
        { status: 403 }
      )
    }

    // MCP tool accepts either 'slug' or 'function_slug' — try both patterns
    const raw = await client.callTool('get_edge_function', { slug: functionSlug })
    let code: string | null = null
    let metadata: Record<string, unknown> = {}

    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed.source_code === 'string') {
        code = parsed.source_code
      } else if (typeof parsed.code === 'string') {
        code = parsed.code
      } else if (typeof parsed.content === 'string') {
        code = parsed.content
      } else if (typeof parsed === 'string') {
        code = parsed
      }
      metadata = parsed.metadata ?? parsed.details ?? {}
    } catch {
      // MCP returned raw text
      code = raw
    }

    if (!code) {
      return NextResponse.json(
        { error: 'No source code returned for this function' },
        { status: 404 }
      )
    }

    return NextResponse.json({ code, metadata })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/unauthorized|jwt|token.*(expired|invalid)/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 401 })
    }
    return NextResponse.json({ error: `Failed to fetch edge function code: ${msg}` })
  }
}
