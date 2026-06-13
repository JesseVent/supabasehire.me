import { IcebergRestCatalog } from 'iceberg-js'
import { NextRequest, NextResponse } from 'next/server'

interface IcebergField {
  id: number
  name: string
  required: boolean
  type: unknown
}

interface IcebergSchema {
  'schema-id'?: number
  fields: IcebergField[]
}

interface IcebergTableMetadata {
  'current-schema-id'?: number
  schema?: IcebergSchema
  schemas?: IcebergSchema[]
}

interface IcebergTableEntry {
  namespace: string
  name: string
  metadataLocation: string
  schema: Array<{ name: string; type: string; nullable: boolean }>
}

function resolveType(t: unknown): string {
  if (typeof t === 'string') return t
  if (t && typeof t === 'object') {
    const obj = t as Record<string, unknown>
    if (obj.type === 'list') return `LIST<${resolveType(obj['element-type'] ?? obj.element)}>`
    if (obj.type === 'map') return `MAP<${resolveType(obj['key-type'])}, ${resolveType(obj['value-type'])}>`
    if (obj.type === 'struct') return 'STRUCT'
    if (typeof obj.type === 'string') return obj.type
  }
  return 'unknown'
}

function extractSchema(
  result: Record<string, unknown>
): Array<{ name: string; type: string; nullable: boolean }> {
  try {
    const meta = result['metadata'] as IcebergTableMetadata | undefined
    if (!meta) return []
    const currentId = meta['current-schema-id'] ?? 0
    const schema =
      meta.schemas?.find((s) => (s['schema-id'] ?? 0) === currentId) ??
      meta.schemas?.[0] ??
      meta.schema
    if (!schema?.fields) return []
    return schema.fields.map((f) => ({
      name: f.name,
      type: resolveType(f.type),
      nullable: !f.required,
    }))
  } catch {
    return []
  }
}

// Validate that supabaseUrl is a safe Supabase project URL before making outbound requests.
// Prevents SSRF: rejects non-HTTPS, non-.supabase.co hostnames, and URLs with userinfo.
function validateAndExtractRef(
  raw: string
): { ok: true; projectRef: string } | { ok: false; reason: string } {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'Invalid URL format' }
  }

  if (url.protocol !== 'https:') return { ok: false, reason: 'URL must use HTTPS' }
  if (url.username || url.password) return { ok: false, reason: 'URL must not contain credentials' }

  const host = url.hostname.replace(/\.$/, '').toLowerCase()
  if (!host.endsWith('.supabase.co')) {
    return { ok: false, reason: 'supabaseUrl must be a *.supabase.co project URL' }
  }

  const projectRef = host.split('.')[0]
  if (!projectRef) return { ok: false, reason: 'Could not extract project ref from supabaseUrl' }

  return { ok: true, projectRef }
}

// Resolve a usable JWT for the Iceberg catalog:
// - If serviceRoleKey is already a JWT (eyJ...), use it directly.
// - If it's an opaque sb_secret_/sb_publishable_ key, use the Management API (accessToken)
//   to fetch the real service_role JWT.
async function resolveServiceJwt(opts: {
  serviceRoleKey?: string
  accessToken?: string
  projectRef: string
}): Promise<string | null> {
  const { serviceRoleKey, accessToken, projectRef } = opts

  if (serviceRoleKey?.startsWith('eyJ')) return serviceRoleKey

  // Opaque key — need the Management API to get the real JWT
  if (accessToken) {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return null
      const keys = (await res.json()) as Array<{ name: string; api_key: string }>
      const srKey = keys.find((k) => k.name === 'service_role')
      return srKey?.api_key ?? null
    } catch {
      return null
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { supabaseUrl, serviceRoleKey, accessToken, warehouse } = body as {
    supabaseUrl?: string
    serviceRoleKey?: string
    accessToken?: string
    warehouse?: string
  }

  if (!supabaseUrl || !warehouse) {
    return NextResponse.json({ error: 'supabaseUrl and warehouse are required' }, { status: 400 })
  }

  const validation = validateAndExtractRef(supabaseUrl)
  if (!validation.ok) {
    return NextResponse.json({ error: `Invalid supabaseUrl: ${validation.reason}` }, { status: 400 })
  }

  const jwt = await resolveServiceJwt({
    serviceRoleKey,
    accessToken,
    projectRef: validation.projectRef,
  })

  if (!jwt) {
    return NextResponse.json(
      {
        error:
          'Could not resolve a service role JWT. Provide accessToken (Management API token) or a legacy eyJ... serviceRoleKey.',
      },
      { status: 400 }
    )
  }

  // Supabase Iceberg REST catalog: https://{ref}.storage.supabase.co/storage/v1/iceberg/
  // iceberg-js appends v1/config, v1/<prefix>/namespaces, etc. using new URL(path, baseUrl).
  // Trailing slash ensures the last path segment is not clobbered.
  const catalogBaseUrl = `https://${validation.projectRef}.storage.supabase.co/storage/v1/iceberg/`

  const catalog = new IcebergRestCatalog({
    baseUrl: catalogBaseUrl,
    warehouse,
    auth: {
      type: 'custom',
      getHeaders: async () => ({
        apikey: jwt,
        Authorization: `Bearer ${jwt}`,
      }),
    },
  })

  const tables: IcebergTableEntry[] = []

  try {
    const { namespaces } = await catalog.listNamespaces()

    for (const ns of namespaces) {
      const nsStr = ns.namespace.join('.')
      let identifiers: Array<{ namespace: string[]; name: string }> = []
      try {
        const listed = await catalog.listTables({ namespace: ns.namespace })
        identifiers = listed.identifiers
      } catch {
        continue
      }

      for (const id of identifiers) {
        try {
          const result = await catalog.loadTableResult({
            namespace: id.namespace,
            name: id.name,
          })
          const raw = result as unknown as Record<string, unknown>
          const metadataLocation = raw['metadata-location'] as string | undefined
          if (metadataLocation) {
            tables.push({
              namespace: nsStr,
              name: id.name,
              metadataLocation,
              schema: extractSchema(raw),
            })
          }
        } catch {
          // table not accessible — skip
        }
      }
    }

    return NextResponse.json({ tables })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[iceberg/tables] catalog error:', message)
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      { error: isDev ? message : 'Failed to query Iceberg catalog' },
      { status: 500 }
    )
  }
}
