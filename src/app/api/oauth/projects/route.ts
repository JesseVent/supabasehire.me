import { type NextRequest, NextResponse } from 'next/server'

// GET /api/oauth/projects — list Supabase projects for an authenticated user.
// Proxied server-side because api.supabase.com blocks CORS from browser origins.
export async function POST(request: NextRequest) {
  let accessToken: string
  try {
    const body = await request.json()
    accessToken = body.accessToken
    if (!accessToken) throw new Error('missing accessToken')
  } catch {
    return NextResponse.json({ error: 'Body must be { accessToken }' }, { status: 400 })
  }

  const res = await fetch('https://api.supabase.com/v1/projects', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const d = data as Record<string, string>
    return NextResponse.json(
      { error: d.message ?? d.error ?? `Projects fetch failed (${res.status})` },
      { status: res.status }
    )
  }

  return NextResponse.json({ projects: data })
}
