import { type NextRequest, NextResponse } from 'next/server'

// Server-side proxy for Supabase token exchange and refresh.
// api.supabase.com/v1/oauth/token blocks CORS from browser origins,
// so both exchangeCode() and refreshAccessToken() route through here.
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()

    const res = await fetch('https://api.supabase.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const d = data as Record<string, string>
      return NextResponse.json(
        { error: d.error ?? d.message ?? `Token request failed (${res.status})` },
        { status: res.status }
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: `Token proxy failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
