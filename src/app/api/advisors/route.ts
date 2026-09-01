import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { DEMO_ADVISOR_LINTS, DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { projectRefFromUrl, SupabaseMcpClient, unwrapMcpJson } from '@/lib/supabase-mcp-client'
import type { AdvisorLint, AdvisorsResult, AdvisorType } from '@/lib/supabase-types'

const TYPES: AdvisorType[] = ['security', 'performance']

function parseLints(raw: unknown, type: AdvisorType): AdvisorLint[] {
  // get_advisors answers `{ result: { lints: [...] } }`; tolerate a bare `{ lints }` too.
  const payload = raw as { lints?: unknown; result?: { lints?: unknown } } | null
  const candidate = payload?.lints ?? payload?.result?.lints
  const lints = Array.isArray(candidate) ? candidate : []
  return lints
    .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === 'object')
    .map((l) => ({
      type,
      name: String(l.name ?? 'unknown'),
      title: String(l.title ?? l.name ?? 'Advisor finding'),
      level: String(l.level ?? 'INFO').toUpperCase() as AdvisorLint['level'],
      facing: typeof l.facing === 'string' ? l.facing : null,
      categories: Array.isArray(l.categories) ? l.categories.map(String) : [],
      description: String(l.description ?? ''),
      // `detail` carries escaped backticks from the API — unescape so the UI can render them.
      detail: String(l.detail ?? '').replace(/\\`/g, '`'),
      remediation: typeof l.remediation === 'string' ? l.remediation : null,
      cacheKey: String(l.cache_key ?? `${l.name}-${Math.random().toString(36).slice(2, 9)}`),
    }))
}

// POST /api/advisors — security + performance advisors via the Supabase MCP `get_advisors` tool.
// Replaces the old /api/resource-warnings, which called a dashboard-only platform endpoint that
// rejects Management API tokens ("JWT could not be decoded").
export async function POST(request: NextRequest) {
  const connection = getConnectionFromHeaders(request)
  if (!connection) {
    return NextResponse.json(
      { lints: [], error: 'No connection provided' } satisfies AdvisorsResult,
      { status: 400 }
    )
  }

  if (connection.id === DEMO_CONNECTION_ID) {
    return NextResponse.json({ lints: DEMO_ADVISOR_LINTS } satisfies AdvisorsResult)
  }

  if (!connection.accessToken) {
    return NextResponse.json(
      {
        lints: [],
        error: 'Management API access token required to fetch advisors. Connect via OAuth.',
      } satisfies AdvisorsResult,
      { status: 403 }
    )
  }

  const projectRef = projectRefFromUrl(connection.supabaseUrl)
  if (!projectRef) {
    return NextResponse.json(
      {
        lints: [],
        error: 'Could not extract project ref from Supabase URL.',
      } satisfies AdvisorsResult,
      { status: 400 }
    )
  }

  const client = new SupabaseMcpClient({ projectRef, accessToken: connection.accessToken })
  try {
    // One session, both advisor types.
    const results = await Promise.all(
      TYPES.map(async (type) =>
        parseLints(unwrapMcpJson(await client.callTool('get_advisors', { type })), type)
      )
    )
    return NextResponse.json({ lints: results.flat() } satisfies AdvisorsResult)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch advisors'
    const sanitized = msg.replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[token]')
    const isAuthError = /unauthorized|jwt|token.*(expired|invalid)|permission/i.test(msg)
    return NextResponse.json(
      {
        lints: [],
        error: isAuthError ? `${sanitized} — reconnect this project via OAuth.` : sanitized,
      } satisfies AdvisorsResult,
      { status: isAuthError ? 401 : 502 }
    )
  } finally {
    client.disconnect().catch(() => {})
  }
}
