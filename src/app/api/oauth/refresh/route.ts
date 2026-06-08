import { NextRequest, NextResponse } from 'next/server'

const MGMT_API = 'https://api.supabase.com'

export async function POST(req: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID
  const clientSecret = process.env.OAUTH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'OAuth not configured' },
      { status: 503 }
    )
  }

  let body: { refresh_token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { refresh_token } = body
  if (!refresh_token) {
    return NextResponse.json({ error: 'Missing refresh_token' }, { status: 400 })
  }

  const tokenRes = await fetch(`${MGMT_API}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return NextResponse.json(
      { error: `Token refresh failed: ${text}` },
      { status: tokenRes.status }
    )
  }

  const tokens = await tokenRes.json()
  return NextResponse.json({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  })
}
