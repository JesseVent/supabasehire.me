import { NextResponse } from 'next/server'

// GET /api/seed-connection — returns SEED_* env vars for prefilling the connection dialog
export async function GET() {
  const name = process.env.SEED_CONNECTION_NAME || ''
  const url = process.env.SEED_SUPABASE_URL || ''
  const anonKey = process.env.SEED_ANON_KEY || ''
  const serviceRoleKey = process.env.SEED_SERVICE_ROLE_KEY || ''
  const accessToken = process.env.SEED_ACCESS_TOKEN || ''

  if (!url) {
    return NextResponse.json({ available: false })
  }

  return NextResponse.json({ available: true, name, url, anonKey, serviceRoleKey, accessToken })
}
