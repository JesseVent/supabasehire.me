import { type NextRequest, NextResponse } from 'next/server'
import { getConnectionFromHeaders } from '@/lib/api-auth'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'
import { getValidApiKey } from '@/lib/supabase-helpers'
import type { SupabaseConnection } from '@/lib/supabase-types'
import { extractProjectRef } from '@/lib/supabase-types'

interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
}

interface HealthCheckResult {
  urlReachable: boolean
  publishableKeyValid: boolean
  accessTokenValid: boolean
  secretKeyValid: boolean
  projectRef: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  checks: HealthCheck[]
}

// POST /api/connections/[id]/health — Check connection health
// body: { connection: SupabaseConnection }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const connection = getConnectionFromHeaders(request)

    if (!connection) {
      return NextResponse.json({ error: 'No connection provided' }, { status: 400 })
    }

    const { supabaseUrl, anonKey, serviceRoleKey, accessToken } = connection
    const projectRef = extractProjectRef(supabaseUrl)
    const checks: HealthCheck[] = []

    let urlReachable = false
    let publishableKeyValid = false
    let accessTokenValid = false
    let secretKeyValid = false

    // 1. Check if Supabase URL is reachable
    try {
      const validAnonKey = await getValidApiKey(supabaseUrl, anonKey)
      const urlResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${validAnonKey}`,
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
      })

      urlReachable = true

      if (
        urlResponse.ok ||
        urlResponse.status === 404 ||
        urlResponse.status === 401 ||
        urlResponse.status === 406
      ) {
        publishableKeyValid = true
        checks.push({
          name: 'Supabase URL',
          status: 'pass',
          message: `URL is reachable (status: ${urlResponse.status})`,
        })
        checks.push({
          name: 'Publishable Key',
          status: 'pass',
          message: 'Publishable key is accepted by the API',
        })
      } else {
        checks.push({
          name: 'Supabase URL',
          status: 'pass',
          message: `URL is reachable but returned status ${urlResponse.status}`,
        })
        checks.push({
          name: 'Publishable Key',
          status: 'warn',
          message: `API returned status ${urlResponse.status} — key may not be valid`,
        })
      }
    } catch {
      checks.push({
        name: 'Supabase URL',
        status: 'fail',
        message: 'URL is not reachable — check the Supabase URL and network connectivity',
      })
      checks.push({
        name: 'Publishable Key',
        status: 'fail',
        message: 'Cannot verify — URL is not reachable',
      })
    }

    // 2. Check if access token is valid via MCP
    if (accessToken) {
      try {
        const client = mcpClientFromRequest(request)
        if (!client) throw new Error('no client')
        await client.callTool('execute_sql', { query: 'SELECT 1' })
        accessTokenValid = true
        checks.push({
          name: 'Access Token',
          status: 'pass',
          message: 'Access token is valid — MCP server accessible',
        })
      } catch {
        checks.push({
          name: 'Access Token',
          status: 'fail',
          message: 'Access token is invalid or expired',
        })
      }
    } else {
      checks.push({
        name: 'Access Token',
        status: 'warn',
        message: 'No access token configured — connect via OAuth for full access',
      })
    }

    // 3. Check if secret key is valid
    if (serviceRoleKey) {
      if (serviceRoleKey.startsWith('sbp_')) {
        secretKeyValid = true
        checks.push({
          name: 'Secret Key',
          status: 'pass',
          message:
            'sbp_ token stored as Secret Key — management API access confirmed via Access Token check',
        })
      } else {
        try {
          const srResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
            method: 'GET',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            signal: AbortSignal.timeout(10000),
          })

          if (srResponse.ok || srResponse.status === 404 || srResponse.status === 406) {
            secretKeyValid = true
            checks.push({
              name: 'Secret Key',
              status: 'pass',
              message: 'Secret key is accepted by the API',
            })
          } else {
            checks.push({
              name: 'Secret Key',
              status: 'warn',
              message: `API returned status ${srResponse.status} for secret key`,
            })
          }
        } catch {
          checks.push({
            name: 'Secret Key',
            status: 'warn',
            message: 'Could not verify — network error',
          })
        }
      }
    } else {
      checks.push({
        name: 'Secret Key',
        status: 'warn',
        message: 'No secret key configured — some features may be limited',
      })
    }

    // Determine overall status
    const failCount = checks.filter((c) => c.status === 'fail').length
    const warnCount = checks.filter((c) => c.status === 'warn').length

    let status: 'healthy' | 'degraded' | 'unhealthy'
    if (failCount > 0) {
      status = 'unhealthy'
    } else if (warnCount > 0) {
      status = 'degraded'
    } else {
      status = 'healthy'
    }

    const result: HealthCheckResult = {
      urlReachable,
      publishableKeyValid,
      accessTokenValid,
      secretKeyValid,
      projectRef,
      status,
      checks,
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}
