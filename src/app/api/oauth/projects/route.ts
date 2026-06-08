import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  let body: { access_token?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  if (!body.access_token) return NextResponse.json({ error: 'Missing access_token' }, { status: 400 })

  const res = await fetch('https://api.supabase.com/v1/projects', {
    headers: { Authorization: `Bearer ${body.access_token}` },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
