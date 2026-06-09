import { type NextRequest, NextResponse } from 'next/server'

// Server-side proxy for Supabase DCR (RFC 7591).
// The /platform/oauth/apps/register endpoint doesn't send CORS headers,
// so this must be called server-side rather than from the browser directly.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const res = await fetch('https://api.supabase.com/platform/oauth/apps/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.message ?? `DCR failed (${res.status})` },
        { status: res.status }
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: `DCR registration failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
