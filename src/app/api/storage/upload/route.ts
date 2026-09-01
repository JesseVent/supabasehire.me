import { type NextRequest, NextResponse } from 'next/server'
import { forwardableTraceHeaders, getConnectionFromHeaders } from '@/lib/api-auth'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { projectRefFromUrl, SupabaseMcpClient } from '@/lib/supabase-mcp-client'

const VAULT_SECRET_NAME = 'devtool-edge-fn-key'
const vaultCache = new Map<string, { secret: string; expires: number }>()
const VAULT_TTL_MS = 5 * 60 * 1000

async function getVaultSecret(
  supabaseUrl: string,
  accessToken: string
): Promise<string | null> {
  const cacheKey = `${supabaseUrl}:${accessToken}`
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

// POST /api/storage/upload — Upload a file to Supabase Storage
// Body: { bucket: string, fileName: string, mimeType: string, data: base64-string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { bucket, fileName, mimeType, data } = body as {
      bucket: string
      fileName: string
      mimeType: string
      data: string
    }
    const connection = getConnectionFromHeaders(request)

    if (!connection || !bucket || !fileName || !data) {
      return NextResponse.json(
        { error: 'connection, bucket, fileName, and data are required' },
        { status: 400 }
      )
    }

    let serviceRoleKey = connection.serviceRoleKey || connection.anonKey
    if (!connection.serviceRoleKey && connection.accessToken) {
      const vaultKey = await getVaultSecret(connection.supabaseUrl, connection.accessToken)
      if (vaultKey) serviceRoleKey = vaultKey
    }
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service role key required to upload files' },
        { status: 400 }
      )
    }

    // Decode base64 and upload to Supabase Storage
    const buffer = Buffer.from(data, 'base64')
    const url = `${connection.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${fileName}`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': mimeType || 'application/octet-stream',
        'x-upsert': 'true',
        ...forwardableTraceHeaders(request),
      },
      body: buffer,
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Storage upload error (${res.status}): ${text}` },
        { status: res.status >= 400 ? res.status : 502 }
      )
    }

    return NextResponse.json({ success: true, path: `${bucket}/${fileName}` })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to upload file: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
