import { NextRequest, NextResponse } from 'next/server'

import { mcpClientFromRequest } from '@/lib/mcp-server-client'

function parseRows<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as T[]
    if (Array.isArray(parsed.rows)) return parsed.rows as T[]
    if (Array.isArray(parsed.data)) return parsed.data as T[]
  } catch {
    // ignore parse errors
  }
  return []
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tableId, schemaName, tableName } = body as {
      tableId: string
      schemaName: string
      tableName: string
    }

    const client = mcpClientFromRequest(request)
    if (!client || !tableId || !schemaName || !tableName) {
      return NextResponse.json({ error: 'Missing required fields or OAuth token' }, { status: 400 })
    }

    const tableSQL = `SELECT ai_description FROM catalog_tables WHERE id = '${tableId}' LIMIT 1;`
    const columnsSQL = `SELECT column_name, ai_description FROM catalog_columns WHERE table_id = '${tableId}' AND ai_description IS NOT NULL;`

    const [tableRaw, colsRaw] = await Promise.all([
      client.callTool('execute_sql', { query: tableSQL }),
      client.callTool('execute_sql', { query: columnsSQL }),
    ])

    const tableRows = parseRows<{ ai_description: string | null }>(tableRaw)
    const colRows = parseRows<{ column_name: string; ai_description: string | null }>(colsRaw)

    const statements: string[] = []
    const safeSchema = schemaName.replace(/"/g, '""')
    const safeTable = tableName.replace(/"/g, '""')

    if (tableRows[0]?.ai_description) {
      const desc = tableRows[0].ai_description.replace(/'/g, "''")
      statements.push(`COMMENT ON TABLE "${safeSchema}"."${safeTable}" IS '${desc}';`)
    }

    for (const col of colRows) {
      if (col.ai_description) {
        const safeCol = col.column_name.replace(/"/g, '""')
        const desc = col.ai_description.replace(/'/g, "''")
        statements.push(
          `COMMENT ON COLUMN "${safeSchema}"."${safeTable}"."${safeCol}" IS '${desc}';`
        )
      }
    }

    if (statements.length === 0) {
      return NextResponse.json({ success: true, committed: 0, message: 'No AI descriptions to commit.' })
    }

    await client.callTool('execute_sql', { query: statements.join('\n') })
    return NextResponse.json({ success: true, committed: statements.length })
  } catch (err) {
    return NextResponse.json(
      { error: `Commit failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
