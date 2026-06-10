import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { extractProjectRef } from '@/lib/supabase-types'
import { managementSql } from '@/lib/supabase-helpers'

// POST /api/sql — Execute a raw SQL query via the Management API
export async function POST(request: NextRequest) {
  try {
    const connection = getConnectionFromHeaders(request)
    if (!connection) {
      return NextResponse.json({ error: 'Connection required' }, { status: 400 })
    }

    const { query } = await request.json()
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const accessToken = connection.accessToken
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Access token is required to execute SQL queries. Please update your connection.' },
        { status: 400 }
      )
    }

    const projectRef = extractProjectRef(connection.supabaseUrl)
    if (!projectRef) {
      return NextResponse.json({ error: 'Could not determine project ref from URL' }, { status: 400 })
    }

    // Run SQL query (not read-only because users execute migrations/DDL statements here)
    const data = await managementSql(accessToken, projectRef, query, false)

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to execute SQL'
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    )
  }
}
