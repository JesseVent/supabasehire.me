import { type NextRequest, NextResponse } from 'next/server'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'

import type { CatalogColumn, CatalogTable } from '@/lib/supabase-types'

const JOIN_SQL = `
SELECT
  ct.id, ct.schema_name, ct.table_name, ct.ai_description, ct.row_count,
  ct.profiled_at, ct.created_at,
  cc.id AS col_id, cc.column_name, cc.data_type, cc.nullable,
  cc.null_pct, cc.distinct_count, cc.sample_values,
  cc.min_val, cc.max_val,
  cc.ai_description AS col_ai_description
FROM catalog_tables ct
LEFT JOIN catalog_columns cc ON cc.table_id = ct.id
ORDER BY ct.schema_name, ct.table_name, cc.column_name;
`

export async function POST(request: NextRequest) {
  try {
    const client = mcpClientFromRequest(request)
    if (!client) {
      return NextResponse.json({ error: 'OAuth access token required.' }, { status: 403 })
    }

    // Check if catalog schema exists
    let checkRaw: string
    try {
      checkRaw = await client.callTool('execute_sql', {
        query: `SELECT to_regclass('public.catalog_tables')::text AS exists;`,
      })
    } catch {
      return NextResponse.json({ schemaReady: false, tables: [] })
    }

    type CheckRow = { exists: string | null }
    const checkRows = parseMcpSqlRows<CheckRow>(checkRaw)
    if (!checkRows[0]?.exists) {
      return NextResponse.json({ schemaReady: false, tables: [] })
    }

    const raw = await client.callTool('execute_sql', { query: JOIN_SQL })

    type JoinRow = {
      id: string
      schema_name: string
      table_name: string
      ai_description: string | null
      row_count: number | null
      profiled_at: string | null
      created_at: string
      col_id: string | null
      column_name: string | null
      data_type: string | null
      nullable: boolean | null
      null_pct: number | null
      distinct_count: number | null
      sample_values: unknown[] | null
      min_val: string | null
      max_val: string | null
      col_ai_description: string | null
    }

    const rows = parseMcpSqlRows<JoinRow>(raw)
    const tableMap = new Map<string, CatalogTable>()

    for (const row of rows) {
      if (!tableMap.has(row.id)) {
        tableMap.set(row.id, {
          id: row.id,
          schema_name: row.schema_name,
          table_name: row.table_name,
          ai_description: row.ai_description,
          row_count: row.row_count,
          profiled_at: row.profiled_at,
          created_at: row.created_at,
          columns: [],
        })
      }
      if (row.col_id) {
        const col: CatalogColumn = {
          id: row.col_id,
          table_id: row.id,
          column_name: row.column_name!,
          data_type: row.data_type,
          nullable: row.nullable,
          null_pct: row.null_pct,
          distinct_count: row.distinct_count,
          sample_values: row.sample_values,
          min_val: row.min_val,
          max_val: row.max_val,
          ai_description: row.col_ai_description,
        }
        tableMap.get(row.id)!.columns!.push(col)
      }
    }

    return NextResponse.json({ schemaReady: true, tables: Array.from(tableMap.values()) })
  } catch (err) {
    return NextResponse.json(
      { error: `Load failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
