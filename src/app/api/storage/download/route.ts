import { type NextRequest, NextResponse } from 'next/server'
import { forwardableTraceHeaders, getConnectionFromHeaders } from '@/lib/api-auth'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { projectRefFromUrl, SupabaseMcpClient } from '@/lib/supabase-mcp-client'
import type { SupabaseConnection } from '@/lib/supabase-types'

const DEMO_CONNECTION_ID = '__demo__'
const VAULT_SECRET_NAME = 'devtool-edge-fn-key'
const vaultCache = new Map<string, { secret: string; expires: number }>()
const VAULT_TTL_MS = 5 * 60 * 1000

async function getVaultSecretForStorage(
  supabaseUrl: string,
  accessToken: string
): Promise<string | null> {
  const cacheKey = `${supabaseUrl}:${accessToken.slice(0, 8)}`
  const cached = vaultCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.secret

  const projectRef = projectRefFromUrl(supabaseUrl)
  if (!projectRef) return null

  const client = new SupabaseMcpClient({ projectRef, accessToken })
  try {
    const raw = await client.callTool('execute_sql', {
      query: `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '${VAULT_SECRET_NAME}' LIMIT 1`,
    })
    const rows = parseMcpSqlRows<{ decrypted_secret: string }>(raw)
    const secret = rows[0]?.decrypted_secret ?? null
    if (secret) vaultCache.set(cacheKey, { secret, expires: Date.now() + VAULT_TTL_MS })
    return secret
  } catch {
    return null
  } finally {
    client.disconnect().catch(() => {})
  }
}

// POST /api/storage/download — proxy-fetch a private storage file using service role key
// body: { connection, bucket, path }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { bucket, path } = body as {
      bucket: string
      path: string
    }
    const connection = getConnectionFromHeaders(request)

    if (!connection || !bucket || !path) {
      return NextResponse.json(
        { error: 'connection, bucket, and path are required' },
        { status: 400 }
      )
    }

    // Demo mode — redirect to the static public asset (works across all environments)
    if (connection.id === DEMO_CONNECTION_ID) {
      return NextResponse.redirect(new URL('/sample-analytics.parquet', request.url), 302)
    }

    let serviceRoleKey = connection.serviceRoleKey || connection.anonKey
    if (!connection.serviceRoleKey && connection.accessToken) {
      const vaultKey = await getVaultSecretForStorage(connection.supabaseUrl, connection.accessToken)
      if (vaultKey) serviceRoleKey = vaultKey
    }
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service role key required to download private files' },
        { status: 400 }
      )
    }

    const url = `${connection.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${path}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        ...forwardableTraceHeaders(request),
      },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Storage error (${res.status}): ${text}` },
        { status: res.status >= 400 ? res.status : 502 }
      )
    }

    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
  }
}
