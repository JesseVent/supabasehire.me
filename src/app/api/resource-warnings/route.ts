import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { DEMO_CONNECTION_ID, DEMO_RESOURCE_WARNINGS } from '@/lib/demo-data'
import { extractProjectRef } from '@/lib/supabase-types'

// Proxied server-side because api.supabase.com blocks CORS from browser origins,
// and the access token must not reach the browser. Same Management-API auth path
// as /api/oauth/projects — uses the OAuth access token (Bearer), not the sbp_ key.
export async function POST(request: NextRequest) {
  const connection = getConnectionFromHeaders(request)
  if (!connection) {
    return NextResponse.json({ error: 'No connection provided' }, { status: 400 })
  }

  if (connection.id === DEMO_CONNECTION_ID) {
    return NextResponse.json(DEMO_RESOURCE_WARNINGS)
  }

  if (!connection.accessToken) {
    return NextResponse.json(
      { error: 'No access token — connect via OAuth to fetch resource warnings' },
      { status: 401 }
    )
  }

  const projectRef = extractProjectRef(connection.supabaseUrl)
  if (!projectRef) {
    return NextResponse.json(
      { error: 'Could not extract project ref from URL' },
      { status: 400 }
    )
  }

  const res = await fetch(
    `https://api.supabase.com/platform/projects-resource-warnings?ref=${projectRef}`,
    { headers: { Authorization: `Bearer ${connection.accessToken}` } }
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const d = data as Record<string, string>
    return NextResponse.json(
      { error: d.message ?? d.error ?? `Resource warnings fetch failed (${res.status})` },
      { status: res.status }
    )
  }

  return NextResponse.json(data)
}