import { type NextRequest, NextResponse } from 'next/server'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'

const TRIGGERS_SQL = `
SELECT
  t.tgname AS name,
  c.relname AS tablename,
  CASE t.tgtype::int & 66
    WHEN 2 THEN 'BEFORE'
    WHEN 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END AS timing,
  CASE WHEN (t.tgtype::int & 1) = 1 THEN 'ROW' ELSE 'STATEMENT' END AS orientation,
  ARRAY_TO_STRING(ARRAY_REMOVE(ARRAY[
    CASE WHEN (t.tgtype::int & 4) = 4 THEN 'INSERT' END,
    CASE WHEN (t.tgtype::int & 8) = 8 THEN 'DELETE' END,
    CASE WHEN (t.tgtype::int & 16) = 16 THEN 'UPDATE' END,
    CASE WHEN (t.tgtype::int & 128) = 128 THEN 'TRUNCATE' END
  ], NULL), ', ') AS events,
  p.proname || '(' || COALESCE(pg_get_function_arguments(p.oid), '') || ')' AS function_call,
  pg_get_triggerdef(t.oid, true) AS definition,
  CASE WHEN t.tgenabled = 'O' THEN true ELSE false END AS enabled,
  d.description AS condition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
LEFT JOIN pg_description d ON d.objoid = t.oid AND d.classoid = 'pg_trigger'::regclass
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
`

export async function POST(request: NextRequest) {
  const client = mcpClientFromRequest(request)
  if (!client) {
    return NextResponse.json({ error: 'OAuth access token required.' }, { status: 403 })
  }

  try {
    const raw = await client.callTool('execute_sql', { query: TRIGGERS_SQL })
    const triggers = parseMcpSqlRows(raw)
    return NextResponse.json({ triggers })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = /unauthorized|jwt/i.test(msg) ? 401 : 500
    return NextResponse.json({ error: `Trigger fetch failed: ${msg}` }, { status })
  } finally {
    client.disconnect().catch(() => {})
  }
}
