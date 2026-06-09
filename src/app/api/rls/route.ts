import { type NextRequest, NextResponse } from 'next/server'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'
import type { RLSEnabledStatus, RLSPolicy, TableRLSInfo } from '@/lib/supabase-types'

const POLICIES_SQL = `
SELECT
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';
`

const RLS_STATUS_SQL = `
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public';
`

export async function POST(request: NextRequest) {
  const client = mcpClientFromRequest(request)
  if (!client) {
    return NextResponse.json({ error: 'OAuth access token required.' }, { status: 403 })
  }

  try {
    const [policiesRaw, statusRaw] = await Promise.all([
      client.callTool('execute_sql', { query: POLICIES_SQL }),
      client.callTool('execute_sql', { query: RLS_STATUS_SQL }),
    ])

    const policies = parseMcpSqlRows<RLSPolicy>(policiesRaw)
    const statuses = parseMcpSqlRows<RLSEnabledStatus>(statusRaw)

    const tableMap = new Map<string, TableRLSInfo>()
    for (const s of statuses) {
      tableMap.set(s.tablename, {
        tableName: s.tablename,
        rlsEnabled: Boolean(s.rls_enabled),
        policies: [],
      })
    }
    for (const p of policies) {
      if (!tableMap.has(p.tablename)) {
        tableMap.set(p.tablename, { tableName: p.tablename, rlsEnabled: false, policies: [] })
      }
      tableMap.get(p.tablename)!.policies.push(p)
    }

    return NextResponse.json({ tables: Array.from(tableMap.values()) })
  } catch (err) {
    return NextResponse.json(
      { error: `RLS fetch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
