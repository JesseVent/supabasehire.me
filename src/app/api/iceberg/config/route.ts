import { type NextRequest, NextResponse } from 'next/server'
import { parseMcpSqlRows } from '@/lib/mcp-response-parser'
import { mcpClientFromRequest } from '@/lib/mcp-server-client'

// A wrappers Iceberg FDW keeps its non-secret settings as foreign-server options and its
// credentials in Vault, referenced from those options by UUID. Resolving both gives the
// Analytics panel everything its form would otherwise ask the user to paste.
// Matched by shape (any server carrying catalog_uri), not by server name.
const ICEBERG_CONFIG_SQL = `
WITH srv AS (
  SELECT
    s.srvname,
    (SELECT option_value FROM pg_options_to_table(s.srvoptions) WHERE option_name = 'warehouse') AS warehouse,
    (SELECT option_value FROM pg_options_to_table(s.srvoptions) WHERE option_name = 'catalog_uri') AS catalog_uri,
    (SELECT option_value FROM pg_options_to_table(s.srvoptions) WHERE option_name = 'vault_aws_access_key_id') AS key_id_ref,
    (SELECT option_value FROM pg_options_to_table(s.srvoptions) WHERE option_name = 'vault_aws_secret_access_key') AS secret_ref
  FROM pg_foreign_server s
  WHERE EXISTS (SELECT 1 FROM pg_options_to_table(s.srvoptions) WHERE option_name = 'catalog_uri')
)
SELECT
  srvname,
  warehouse,
  catalog_uri,
  (SELECT decrypted_secret FROM vault.decrypted_secrets v WHERE v.id::text = srv.key_id_ref) AS s3_key_id,
  (SELECT decrypted_secret FROM vault.decrypted_secrets v WHERE v.id::text = srv.secret_ref) AS s3_secret
FROM srv
ORDER BY srvname;
`

interface ConfigRow {
  srvname: string
  warehouse: string | null
  catalog_uri: string | null
  s3_key_id: string | null
  s3_secret: string | null
}

export async function POST(request: NextRequest) {
  const client = mcpClientFromRequest(request)
  if (!client) {
    // Not a rejected credential — this connection has none. The panel falls back to
    // asking for the values instead of reporting a failure.
    return NextResponse.json(
      { error: 'OAuth access token required.', code: 'oauth_required' },
      { status: 403 }
    )
  }

  try {
    const raw = await client.callTool('execute_sql', { query: ICEBERG_CONFIG_SQL })
    const rows = parseMcpSqlRows<ConfigRow>(raw)

    // Only a row that answers every field the panel needs is worth returning — a partial
    // one would suppress the form without being able to connect.
    const configs = rows
      .filter((r) => r.warehouse && r.s3_key_id && r.s3_secret)
      .map((r) => ({
        server: r.srvname,
        warehouse: r.warehouse,
        catalogUri: r.catalog_uri,
        s3KeyId: r.s3_key_id,
        s3Secret: r.s3_secret,
      }))

    return NextResponse.json({ configs })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = /unauthorized|jwt/i.test(msg) ? 401 : 500
    return NextResponse.json({ error: `Iceberg config fetch failed: ${msg}` }, { status })
  } finally {
    client.disconnect().catch(() => {})
  }
}
