import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import type { SupabaseConnection } from '@/lib/supabase-types'

const DEMO_CONNECTION_ID = '__demo__'

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

    const serviceRoleKey = connection.serviceRoleKey || connection.anonKey
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
      },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Storage error (${res.status}): ${text}` }, { status: 502 })
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
