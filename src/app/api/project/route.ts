import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'
import type { SupabaseConnection } from '@/lib/supabase-types'
import { extractProjectRef } from '@/lib/supabase-types'

interface ProjectInfo {
  id: string
  name: string
  ref: string
  region: string
  created_at: string
  database_version: string
  plan_type: string
  project_url: string
  status: string
}

interface ProjectStats {
  tables_count: number
  rls_policies_count: number
  edge_functions_count: number
}

interface ProjectResponse {
  project: ProjectInfo | null
  stats: ProjectStats
  error?: string
}

const DEMO_PROJECT: ProjectInfo = {
  id: 'demo-project-id',
  name: 'Demo Project',
  ref: 'demo-project',
  region: 'us-east-1',
  created_at: '2024-01-15T10:30:00Z',
  database_version: '15.6',
  plan_type: 'free',
  project_url: 'https://demo-project.supabase.co',
  status: 'ACTIVE',
}

const EMPTY_STATS: ProjectStats = {
  tables_count: 0,
  rls_policies_count: 0,
  edge_functions_count: 0,
}

function makeFallbackProject(connection: SupabaseConnection, projectRef: string): ProjectInfo {
  return {
    id: connection.id,
    name: connection.name,
    ref: projectRef,
    region: 'unknown',
    created_at: connection.createdAt,
    database_version: 'unknown',
    plan_type: 'unknown',
    project_url: connection.supabaseUrl,
    status: 'active',
  }
}

export async function POST(request: NextRequest) {
  try {
    const connection = getConnectionFromHeaders(request)

    if (!connection) {
      return NextResponse.json(
        {
          error: 'No connection provided',
          project: null,
          stats: EMPTY_STATS,
        } satisfies ProjectResponse,
        { status: 400 }
      )
    }

    if (connection.id === DEMO_CONNECTION_ID) {
      return NextResponse.json({
        project: DEMO_PROJECT,
        stats: { tables_count: 8, rls_policies_count: 9, edge_functions_count: 3 },
      } satisfies ProjectResponse)
    }

    const projectRef = extractProjectRef(connection.supabaseUrl)

    if (!projectRef) {
      return NextResponse.json({
        project: makeFallbackProject(connection, ''),
        stats: EMPTY_STATS,
        error: 'Could not extract project ref from URL',
      } satisfies ProjectResponse)
    }

    const client = mcpClientFromRequest(request)
    if (!client) {
      return NextResponse.json({
        project: makeFallbackProject(connection, projectRef),
        stats: EMPTY_STATS,
        error: 'No access token — connect via OAuth to fetch project details',
      } satisfies ProjectResponse)
    }

    try {
      // Try to enrich with project URL from MCP; fall back to constructed URL
      let projectUrl = `https://${projectRef}.supabase.co`
      try {
        const urlRaw = await client.callTool('get_project_url', {})
        const urlData = JSON.parse(urlRaw) as { url?: string; project_url?: string }
        projectUrl = urlData?.url ?? urlData?.project_url ?? projectUrl
      } catch {
        /* ignore — use fallback */
      }

      const projectInfo: ProjectInfo = {
        id: connection.id,
        name: connection.name,
        ref: projectRef,
        region: 'unknown',
        created_at: connection.createdAt,
        database_version: 'unknown',
        plan_type: 'unknown',
        project_url: projectUrl,
        status: 'active',
      }

      return NextResponse.json({
        project: projectInfo,
        stats: EMPTY_STATS,
      } satisfies ProjectResponse)
    } catch {
      return NextResponse.json({
        project: makeFallbackProject(connection, projectRef),
        stats: EMPTY_STATS,
        error: 'Could not fetch project details via MCP',
      } satisfies ProjectResponse)
    }
  } catch {
    return NextResponse.json(
      {
        error: 'Failed to fetch project info',
        project: null,
        stats: EMPTY_STATS,
      } satisfies ProjectResponse,
      { status: 500 }
    )
  }
}
