import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import type { SupabaseConnection } from '@/lib/supabase-types'

// POST /api/storage
// body: { connection, action: 'list-buckets' | 'list-files', bucket?: string, prefix?: string }
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

    const serviceRoleKey = connection.serviceRoleKey || connection.anonKey
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'A service role key or anon key is required to access Storage.' },
        { status: 400 }
      )
    }

    const storageBase = `${connection.supabaseUrl.replace(/\/$/, '')}/storage/v1`

    if (action === 'list-buckets') {
      const res = await fetch(`${storageBase}/bucket`, {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
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
      if (!bucket || !prefix) {
        return NextResponse.json(
          { error: 'bucket and prefix (file path) are required for delete-file' },
          { status: 400 }
        )
      }
      const res = await fetch(`${storageBase}/object/${bucket}/${prefix}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
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
