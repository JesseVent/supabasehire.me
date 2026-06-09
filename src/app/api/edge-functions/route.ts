import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'
import type { EdgeFunction } from '@/lib/supabase-types'

const DEMO_FUNCTIONS: EdgeFunction[] = [
  {
    id: 'demo-fn-1',
    name: 'hello-world',
    status: 'ACTIVE',
    version: 1,
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:30:00Z',
    verify_jwt: false,
  },
  {
    id: 'demo-fn-2',
    name: 'send-notification',
    status: 'ACTIVE',
    version: 2,
    created_at: '2024-01-20T14:00:00Z',
    updated_at: '2024-02-01T09:15:00Z',
    verify_jwt: true,
  },
  {
    id: 'demo-fn-3',
    name: 'process-webhook',
    status: 'ACTIVE',
    version: 1,
    created_at: '2024-02-05T11:00:00Z',
    updated_at: '2024-02-05T11:00:00Z',
    verify_jwt: false,
  },
]

export async function POST(request: NextRequest) {
  try {
    const connection = getConnectionFromHeaders(request)

    if (!connection) {
      return NextResponse.json({ error: 'No connection provided' }, { status: 400 })
    }

    if (connection.id === DEMO_CONNECTION_ID) {
      return NextResponse.json({ functions: DEMO_FUNCTIONS })
    }

    const client = mcpClientFromRequest(request)
    if (!client) {
      return NextResponse.json(
        { error: 'OAuth access token required to list edge functions.' },
        { status: 403 }
      )
    }

    const raw = await client.callTool('list_edge_functions', {})
    let functions: EdgeFunction[] = []
    try {
      const parsed = JSON.parse(raw)
      functions = Array.isArray(parsed) ? parsed : (parsed.functions ?? [])
    } catch {
      // MCP returned non-JSON — treat as empty list
    }

    return NextResponse.json({ functions })
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to list edge functions: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    )
  }
}
