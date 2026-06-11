import { NextRequest, NextResponse } from 'next/server'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import type { RLSTestResult } from '@/lib/supabase-types'

function decodeJwt(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    const decoded = Buffer.from(payload, 'base64').toString('utf8')
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const client = mcpClientFromRequest(request)
  if (!client) {
    return NextResponse.json({ error: 'OAuth access token required.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { tableName, operation = 'SELECT', role = 'anon', jwt, claims } = body as {
      tableName: string
      operation?: string
      role?: string
      jwt?: string
      claims?: Record<string, any>
    }

    if (!tableName) {
      return NextResponse.json({ error: 'tableName is required' }, { status: 400 })
    }

    const safeTable = tableName.replace(/"/g, '""')
    const safeRole = role.replace(/'/g, "''")

    let claimsSql = ''
    const resolvedClaims = claims || (jwt ? decodeJwt(jwt) : null)
    if (resolvedClaims) {
      const escapedClaims = JSON.stringify(resolvedClaims).replace(/'/g, "''")
      claimsSql = `SELECT set_config('request.jwt.claims', '${escapedClaims}', true);`
    }

    // Run the operation as the requested role inside a rolled-back transaction
    // so no data is actually modified.
    let querySQL = ''
    if (operation === 'SELECT') {
      querySQL = `SELECT * FROM public."${safeTable}" LIMIT 5;`
    } else if (operation === 'INSERT') {
      querySQL = `INSERT INTO public."${safeTable}" DEFAULT VALUES;`
    } else if (operation === 'UPDATE') {
      querySQL = `UPDATE public."${safeTable}" SET "${safeTable}" = "${safeTable}" WHERE false;`
    } else if (operation === 'DELETE') {
      querySQL = `DELETE FROM public."${safeTable}" WHERE false;`
    } else {
      querySQL = `SELECT * FROM public."${safeTable}" LIMIT 5;`
    }

    const testSQL = `
BEGIN;
SET LOCAL ROLE '${safeRole}';
${claimsSql ? `${claimsSql}\n` : ''}${querySQL}
ROLLBACK;
`

    let data: unknown[] = []
    let rowCount = 0

    try {
      const raw = await client.callTool('execute_sql', { query: testSQL })
      data = parseMcpSqlRows(raw)
      rowCount = data.length

      const result: RLSTestResult = {
        success: true,
        data,
        rowCount,
        operation: operation as RLSTestResult['operation'],
        role: role as RLSTestResult['role'],
        tableName,
      }
      return NextResponse.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isRlsBlock = /permission denied|insufficient privilege|new row violates/i.test(msg)
      const result: RLSTestResult = {
        success: false,
        error: isRlsBlock ? `Access denied by RLS policy: ${msg}` : msg,
        operation: operation as RLSTestResult['operation'],
        role: role as RLSTestResult['role'],
        tableName,
      }
      return NextResponse.json(result)
    }
  } catch (err) {
    return NextResponse.json(
      { error: `RLS test failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
