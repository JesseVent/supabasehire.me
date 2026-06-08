import { NextRequest, NextResponse } from 'next/server'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'
import type { TableSchema, ColumnInfo, ForeignKeyInfo } from '@/lib/supabase-types'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'

const COLUMNS_SQL = `
SELECT
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  c.ordinal_position
FROM information_schema.tables t
JOIN information_schema.columns c
  ON t.table_name = c.table_name AND c.table_schema = 'public'
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;
`

const FK_SQL = `
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';
`

export async function POST(request: NextRequest) {
  const client = mcpClientFromRequest(request)
  if (!client) {
    return NextResponse.json({ error: 'OAuth access token required.' }, { status: 403 })
  }

  try {
    const [colsRaw, fkRaw] = await Promise.all([
      client.callTool('execute_sql', { query: COLUMNS_SQL }),
      client.callTool('execute_sql', { query: FK_SQL }).catch(() => '[]'),
    ])

    const columns = parseMcpSqlRows<ColumnInfo>(colsRaw)
    const foreignKeys = parseMcpSqlRows<ForeignKeyInfo>(fkRaw)

    // DEBUG: log raw and parsed counts to verify parser is working
    console.log('[DEBUG schema] colsRaw length:', colsRaw.length, 'colsRaw prefix:', colsRaw.substring(0, 200))
    console.log('[DEBUG schema] parsed columns count:', columns.length)

    const tableMap = new Map<string, TableSchema>()
    for (const col of columns) {
      if (!tableMap.has(col.table_name)) {
        tableMap.set(col.table_name, { tableName: col.table_name, columns: [], foreignKeys: [] })
      }
      tableMap.get(col.table_name)!.columns.push(col)
    }
    for (const fk of foreignKeys) {
      tableMap.get(fk.table_name)?.foreignKeys.push(fk)
    }

    return NextResponse.json({ tables: Array.from(tableMap.values()) })
  } catch (err) {
    return NextResponse.json(
      { error: `Schema fetch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
