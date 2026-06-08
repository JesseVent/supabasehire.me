import { NextRequest, NextResponse } from 'next/server'

import { mcpClientFromRequest } from '@/lib/mcp-server-client'

const SETUP_SQL = `
CREATE TABLE IF NOT EXISTS catalog_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_name text NOT NULL,
  table_name text NOT NULL,
  ai_description text,
  row_count int,
  profiled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(schema_name, table_name)
);

CREATE TABLE IF NOT EXISTS catalog_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid REFERENCES catalog_tables(id) ON DELETE CASCADE,
  column_name text NOT NULL,
  data_type text,
  nullable boolean,
  null_pct float,
  distinct_count int,
  sample_values jsonb,
  min_val text,
  max_val text,
  ai_description text,
  UNIQUE(table_id, column_name)
);
`

export async function POST(request: NextRequest) {
  try {
    const client = mcpClientFromRequest(request)
    if (!client) {
      return NextResponse.json(
        { error: 'OAuth access token required. Connect via OAuth to enable catalog setup.' },
        { status: 403 }
      )
    }

    await client.callTool('execute_sql', { query: SETUP_SQL })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: `Setup failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
