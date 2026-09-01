import { type NextRequest, NextResponse } from 'next/server'
import { forwardableTraceHeaders, getConnectionFromHeaders } from '@/lib/api-auth'
import { DEMO_TABLE_ROWS } from '@/lib/demo-data'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'
import { getValidApiKey } from '@/lib/supabase-helpers'
import type { SupabaseConnection } from '@/lib/supabase-types'

const TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      tableName,
      limit = 50,
      offset = 0,
    } = body as {
      tableName: string
      limit?: number
      offset?: number
    }
    const connection = getConnectionFromHeaders(request)

    if (!tableName) {
      return NextResponse.json({ error: 'tableName is required' }, { status: 400 })
    }

    // Demo mode
    if (connection?.id === '__demo__') {
      const allRows = DEMO_TABLE_ROWS[tableName] || []
      const slicedRows = allRows.slice(offset, offset + limit)
      return NextResponse.json({
        rows: slicedRows,
        count: allRows.length,
        tableName,
      })
    }

    if (!connection) {
      return NextResponse.json({ error: 'No connection provided' }, { status: 400 })
    }

    const { supabaseUrl, anonKey, serviceRoleKey } = connection

    // OAuth-only connections (no service role key): query through the hosted
    // MCP server, which bypasses RLS like a service role would. The anon key
    // path below is RLS-limited and would show empty/forbidden rows.
    if (!serviceRoleKey && connection.accessToken) {
      const client = mcpClientFromRequest(request)
      if (client) {
        if (!TABLE_NAME_RE.test(tableName)) {
          return NextResponse.json({ error: 'Invalid table name' }, { status: 400 })
        }
        const safeLimit = Math.min(Math.max(Math.trunc(Number(limit) || 50), 1), 500)
        const safeOffset = Math.max(Math.trunc(Number(offset) || 0), 0)
        try {
          const [rowsRaw, countRaw] = await Promise.all([
            client.callTool('execute_sql', {
              query: `SELECT * FROM public."${tableName}" LIMIT ${safeLimit} OFFSET ${safeOffset};`,
            }),
            client.callTool('execute_sql', {
              query: `SELECT count(*)::int AS count FROM public."${tableName}";`,
            }),
          ])
          const rows = parseMcpSqlRows<Record<string, unknown>>(rowsRaw)
          const countRows = parseMcpSqlRows<{ count: number }>(countRaw)
          return NextResponse.json({
            rows,
            count: countRows[0]?.count ?? rows.length,
            tableName,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const status = /unauthorized|jwt|token.*(expired|invalid)/i.test(msg) ? 401 : 502
          return NextResponse.json(
            { error: `Failed to fetch rows from ${tableName}: ${msg}` },
            { status }
          )
        } finally {
          client.disconnect().catch(() => {})
        }
      }
    }

    const apiKey = serviceRoleKey || anonKey
    if (!supabaseUrl || !apiKey) {
      return NextResponse.json({ error: 'Connection missing URL or API key' }, { status: 400 })
    }

    // Get a valid JWT (exchanges publishable key if needed)
    const validKey = await getValidApiKey(supabaseUrl, apiKey)

    // Use Supabase REST API to fetch rows
    const url = `${supabaseUrl}/rest/v1/${tableName}?select=*&limit=${limit}&offset=${offset}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${validKey}`,
        Prefer: 'count=exact',
        ...forwardableTraceHeaders(request),
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Failed to fetch rows from ${tableName}: ${errorText}` },
        { status: response.status }
      )
    }

    const rows = await response.json()

    // Try to get total count from Content-Range header
    const contentRange = response.headers.get('content-range')
    let count = Array.isArray(rows) ? rows.length : 0
    if (contentRange) {
      const parts = contentRange.split('/')
      if (parts[1] && parts[1] !== '*') {
        count = parseInt(parts[1], 10)
      }
    }

    return NextResponse.json({
      rows: Array.isArray(rows) ? rows : [],
      count,
      tableName,
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch table rows: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
