import { type NextRequest, NextResponse } from 'next/server'
import { forwardableTraceHeaders, getConnectionFromHeaders } from '@/lib/api-auth'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'

// Escape a value for use inside a single-quoted SQL literal.
function sqlString(value: string): string {
  return value.replace(/'/g, "''")
}

// Escape a value for use inside a LIKE pattern (plus literal quoting).
function sqlLike(value: string): string {
  return sqlString(value).replace(/([\\%_])/g, '\\$1')
}

// POST /api/storage
// body: { action: 'list-buckets' | 'list-files' | 'delete-file', bucket?: string, prefix?: string }
//
// Auth strategy: a service role key talks to the Storage API directly. OAuth-only
// connections (DCR access token, no service key) read bucket/object metadata via
// the hosted MCP server instead — storage.buckets / storage.objects — which
// bypasses RLS the same way a service role would.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      action,
      bucket,
      prefix = '',
    } = body as {
      action: string
      bucket?: string
      prefix?: string
    }
    const connection = getConnectionFromHeaders(request)

    if (!connection) {
      return NextResponse.json({ error: 'No connection provided' }, { status: 400 })
    }

    const useMcp = !connection.serviceRoleKey && connection.accessToken

    if (useMcp && (action === 'list-buckets' || action === 'list-files')) {
      const client = mcpClientFromRequest(request)
      if (!client) {
        return NextResponse.json({ error: 'OAuth access token invalid' }, { status: 401 })
      }
      try {
        if (action === 'list-buckets') {
          const raw = await client.callTool('execute_sql', {
            query:
              'SELECT id, name, public, created_at, file_size_limit FROM storage.buckets ORDER BY name;',
          })
          const buckets = parseMcpSqlRows<Record<string, unknown>>(raw)
          return NextResponse.json({ buckets })
        }

        // list-files — emulate the Storage API's one-level listing: entries
        // directly under the prefix, folders as rows with NULL metadata.
        if (!bucket) {
          return NextResponse.json({ error: 'bucket is required for list-files' }, { status: 400 })
        }
        const query = `
WITH entries AS (
  SELECT substring(o.name FROM ${prefix.length + 1}) AS rel,
         o.id::text AS id,
         o.updated_at,
         o.metadata
  FROM storage.objects o
  WHERE o.bucket_id IN (
    SELECT id FROM storage.buckets WHERE id = '${sqlString(bucket)}' OR name = '${sqlString(bucket)}'
  )
    AND o.name LIKE '${sqlLike(prefix)}%'
)
SELECT split_part(rel, '/', 1) AS name, NULL AS id, NULL AS updated_at, NULL AS metadata
FROM entries
WHERE position('/' IN rel) > 0
GROUP BY 1
UNION ALL
SELECT rel AS name, id, updated_at::text, metadata
FROM entries
WHERE position('/' IN rel) = 0 AND rel <> ''
ORDER BY name;`
        const raw = await client.callTool('execute_sql', { query })
        const files = parseMcpSqlRows<Record<string, unknown>>(raw)
        return NextResponse.json({ files })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const status = /unauthorized|jwt|token.*(expired|invalid)/i.test(msg) ? 401 : 502
        return NextResponse.json({ error: `Storage query failed: ${msg}` }, { status })
      } finally {
        client.disconnect().catch(() => {})
      }
    }

    const serviceRoleKey = connection.serviceRoleKey || connection.anonKey
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'A service role key, anon key, or OAuth connection is required to access Storage.' },
        { status: 400 }
      )
    }

    const storageBase = `${connection.supabaseUrl.replace(/\/$/, '')}/storage/v1`

    if (action === 'list-buckets') {
      const res = await fetch(`${storageBase}/bucket`, {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          ...forwardableTraceHeaders(request),
        },
      })
      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json(
          { error: `Storage API error (${res.status}): ${text}` },
          { status: 502 }
        )
      }
      const buckets = await res.json()
      return NextResponse.json({ buckets })
    }

    if (action === 'list-files') {
      if (!bucket) {
        return NextResponse.json({ error: 'bucket is required for list-files' }, { status: 400 })
      }
      const res = await fetch(`${storageBase}/object/list/${bucket}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
          ...forwardableTraceHeaders(request),
        },
        body: JSON.stringify({ prefix, limit: 200, offset: 0 }),
      })
      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json(
          { error: `Storage API error (${res.status}): ${text}` },
          { status: 502 }
        )
      }
      const files = await res.json()
      return NextResponse.json({ files })
    }

    if (action === 'delete-file') {
      if (!connection.serviceRoleKey) {
        return NextResponse.json(
          { error: 'Deleting files requires a service role key (Settings → Secret Key).' },
          { status: 400 }
        )
      }
      if (!bucket || !prefix) {
        return NextResponse.json(
          { error: 'bucket and prefix (file path) are required for delete-file' },
          { status: 400 }
        )
      }
      const res = await fetch(`${storageBase}/object/${bucket}/${prefix}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${connection.serviceRoleKey}`,
          apikey: connection.serviceRoleKey,
          ...forwardableTraceHeaders(request),
        },
      })
      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json(
          { error: `Storage API error (${res.status}): ${text}` },
          { status: 502 }
        )
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
