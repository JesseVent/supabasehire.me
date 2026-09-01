import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { projectRefFromUrl, SupabaseMcpClient, unwrapMcpJson } from '@/lib/supabase-mcp-client'
import type { LogEntry, LogService, LogsQueryResult } from '@/lib/supabase-types'
import { buildLogsQuery, normalizeLogRow } from './logs-sql'

interface LogsRequestBody {
  service?: LogService
  startTime?: string
  endTime?: string
  filter?: string
  /** Correlated mode: pull every log line carrying this W3C trace id (32 hex). */
  traceId?: string
  limit?: number
}

const DEFAULT_LIMIT = 500

// POST /api/logs
// body: { service?, startTime?, endTime?, filter?, traceId?, limit? }
//
// Logs come from the Supabase MCP `query_logs` tool: read-only ClickHouse SQL over the project's
// unified `logs` stream. (It replaced the per-service `get_logs` tool, which no longer exists.)
export async function POST(request: NextRequest) {
  try {
    const connection = getConnectionFromHeaders(request)
    if (!connection) {
      return NextResponse.json(
        { logs: [], error: 'No connection provided' } satisfies LogsQueryResult,
        { status: 400 }
      )
    }

    if (connection.id === DEMO_CONNECTION_ID) {
      return NextResponse.json({ logs: [] } satisfies LogsQueryResult)
    }

    const accessToken = connection.accessToken
    if (!accessToken) {
      return NextResponse.json(
        {
          logs: [],
          error: 'Management API access token required to fetch logs. Connect via OAuth.',
        } satisfies LogsQueryResult,
        { status: 403 }
      )
    }

    const projectRef = projectRefFromUrl(connection.supabaseUrl)
    if (!projectRef) {
      return NextResponse.json(
        {
          logs: [],
          error: 'Could not extract project ref from Supabase URL.',
        } satisfies LogsQueryResult,
        { status: 400 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as LogsRequestBody

    let query: ReturnType<typeof buildLogsQuery>
    try {
      query = buildLogsQuery({
        service: body.service ?? 'all',
        limit: Number(body.limit ?? DEFAULT_LIMIT),
        filter: body.filter,
        traceId: body.traceId,
        startTime: body.startTime,
        endTime: body.endTime,
      })
    } catch (err) {
      return NextResponse.json(
        {
          logs: [],
          error: err instanceof Error ? err.message : 'Invalid log query',
        } satisfies LogsQueryResult,
        { status: 400 }
      )
    }

    const client = new SupabaseMcpClient({ projectRef, accessToken })
    try {
      const resultText = await client.callTool('query_logs', { ...query })
      const payload = unwrapMcpJson(resultText) as {
        result?: unknown
        error?: string | null
      } | null

      // query_logs answers a failed query with 200 + { result: null, error: "..." }.
      if (payload?.error) {
        return NextResponse.json(
          { logs: [], error: `Log query failed: ${payload.error}` } satisfies LogsQueryResult,
          { status: 502 }
        )
      }

      const rows = Array.isArray(payload?.result) ? payload.result : []
      const logs = rows
        .map((row, i) => normalizeLogRow(row, i))
        .filter((entry): entry is LogEntry => entry !== null)

      return NextResponse.json({ logs } satisfies LogsQueryResult)
    } finally {
      client.disconnect().catch(() => {})
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const sanitized = msg.replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[token]')
    const isAuthError = /unauthorized|jwt|token.*(expired|invalid)|permission/i.test(msg)
    return NextResponse.json(
      { logs: [], error: `Failed to fetch logs: ${sanitized}` } satisfies LogsQueryResult,
      { status: isAuthError ? 401 : 502 }
    )
  }
}
