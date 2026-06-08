import { NextRequest, NextResponse } from 'next/server'

const MGMT_API = 'https://api.supabase.com'

export async function POST(req: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID
  const clientSecret = process.env.OAUTH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'OAuth not configured — set NEXT_PUBLIC_OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET' },
      { status: 503 }
    )
  }

  let body: { code?: string; code_verifier?: string; redirect_uri?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { code, code_verifier, redirect_uri } = body
  if (!code || !code_verifier || !redirect_uri) {
    return NextResponse.json({ error: 'Missing code, code_verifier, or redirect_uri' }, { status: 400 })
  }

  const tokenRes = await fetch(`${MGMT_API}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri,
      code_verifier,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return NextResponse.json({ error: `Token exchange failed: ${text}` }, { status: tokenRes.status })
  }

  const tokens = await tokenRes.json()
  return NextResponse.json({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  })
}
