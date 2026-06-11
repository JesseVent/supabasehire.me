import { type NextRequest, NextResponse } from 'next/server'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'

const INDEXES_SQL = `
SELECT
  s.schemaname,
  s.relname AS tablename,
  s.indexrelname AS indexname,
  s.idx_scan AS scans,
  s.idx_tup_read AS tuples_read,
  s.idx_tup_fetch AS tuples_fetched,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
  (s.idx_scan = 0) AS is_unused
FROM pg_stat_user_indexes s
JOIN pg_index i ON s.indexrelid = i.indexrelid
WHERE s.schemaname = 'public'
ORDER BY s.idx_scan DESC;
`

export async function POST(request: NextRequest) {
  const client = mcpClientFromRequest(request)
  if (!client) {
    return NextResponse.json({ error: 'OAuth access token required.' }, { status: 403 })
  }

  try {
    const raw = await client.callTool('execute_sql', { query: INDEXES_SQL })
    const indexes = parseMcpSqlRows(raw)
    return NextResponse.json({ indexes })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = /unauthorized|jwt/i.test(msg) ? 401 : 500
    return NextResponse.json({ error: `Index fetch failed: ${msg}` }, { status })
  } finally {
    client.disconnect().catch(() => {})
  }
}
