import { NextRequest, NextResponse } from 'next/server'
import { getValidApiKey } from '@/lib/supabase-helpers'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { DEMO_TABLE_ROWS } from '@/lib/demo-data'
import type { SupabaseConnection } from '@/lib/supabase-types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tableName, limit = 50, offset = 0 } = body as {
      tableName: string
      limit?: number
      offset?: number
    }
    const connection = getConnectionFromHeaders(request)

    if (!tableName) {
      return NextResponse.json(
        { error: 'tableName is required' },
        { status: 400 }
      )
    }

    // Demo mode
    if (connection?.id === '__demo__') {
      const allRows = DEMO_TABLE_ROWS[tableName] || []
      const slicedRows = allRows.slice(offset, offset + limit)
      return NextResponse.json({
        rows: slicedRows,
        count: allRows.length,
        tableName,
      })
    }

    if (!connection) {
      return NextResponse.json(
        { error: 'No connection provided' },
        { status: 400 }
      )
    }

    const { supabaseUrl, anonKey, serviceRoleKey } = connection
    const apiKey = serviceRoleKey || anonKey
    if (!supabaseUrl || !apiKey) {
      return NextResponse.json(
        { error: 'Connection missing URL or API key' },
        { status: 400 }
      )
    }

    // Get a valid JWT (exchanges publishable key if needed)
    const validKey = await getValidApiKey(supabaseUrl, apiKey)

    // Use Supabase REST API to fetch rows
    const url = `${supabaseUrl}/rest/v1/${tableName}?select=*&limit=${limit}&offset=${offset}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${validKey}`,
        Prefer: 'count=exact',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Failed to fetch rows from ${tableName}: ${errorText}` },
        { status: response.status }
      )
    }

    const rows = await response.json()

    // Try to get total count from Content-Range header
    const contentRange = response.headers.get('content-range')
    let count = Array.isArray(rows) ? rows.length : 0
    if (contentRange) {
      const parts = contentRange.split('/')
      if (parts[1] && parts[1] !== '*') {
        count = parseInt(parts[1], 10)
      }
    }

    return NextResponse.json({
      rows: Array.isArray(rows) ? rows : [],
      count,
      tableName,
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch table rows: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
