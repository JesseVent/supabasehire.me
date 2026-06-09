import { type NextRequest, NextResponse } from 'next/server'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'

const VIEWS_SQL = `
SELECT
  c.relname AS name,
  pg_get_viewdef(c.oid) AS definition,
  COALESCE(c.reloptions IS NOT NULL AND 'security_invoker=true' = ANY(c.reloptions), false) AS security_invoker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v' AND n.nspname = 'public'
ORDER BY c.relname;
`

const VIEW_COLUMNS_SQL = `
SELECT
  c.table_name AS view_name,
  c.column_name AS name,
  c.data_type AS type,
  c.is_nullable AS nullable
FROM information_schema.columns c
JOIN information_schema.views v ON v.table_name = c.table_name AND v.table_schema = c.table_schema
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;
`

const FUNCTIONS_SQL = `
SELECT
  p.proname AS name,
  pg_get_functiondef(p.oid) AS source_code,
  pg_get_function_result(p.oid) AS return_type,
  l.lanname AS language,
  p.provolatile AS volatility,
  p.proisstrict AS strict,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
WHERE n.nspname = 'public'
  AND l.lanname IN ('plpgsql', 'sql')
ORDER BY p.proname;
`

export async function POST(request: NextRequest) {
  const client = mcpClientFromRequest(request)
  if (!client) {
    return NextResponse.json({ error: 'OAuth access token required.' }, { status: 403 })
  }

  try {
    const [viewsRaw, columnsRaw, functionsRaw] = await Promise.all([
      client.callTool('execute_sql', { query: VIEWS_SQL }),
      client.callTool('execute_sql', { query: VIEW_COLUMNS_SQL }),
      client.callTool('execute_sql', { query: FUNCTIONS_SQL }),
    ])

    const views = parseMcpSqlRows(viewsRaw)
    const columns = parseMcpSqlRows(columnsRaw)
    const functions = parseMcpSqlRows(functionsRaw)

    return NextResponse.json({ views, columns, functions })
  } catch (err) {
    return NextResponse.json(
      { error: `Database fetch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
