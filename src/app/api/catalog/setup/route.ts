import { NextRequest, NextResponse } from "next/server";
import { executeManagementSQL } from "@/lib/supabase-helpers";
import { getConnectionFromHeaders } from "@/lib/api-auth";
import type { SupabaseConnection } from "@/lib/supabase-types";

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
`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const connection = getConnectionFromHeaders(request);

    if (!connection) {
      return NextResponse.json({ error: "No connection provided" }, { status: 400 });
    }

    const managementToken = connection.accessToken ||
      (connection.serviceRoleKey?.startsWith("sbp_") ? connection.serviceRoleKey : null);

    if (!managementToken) {
      return NextResponse.json(
        { error: "Management API token required. Add your access token in Settings." },
        { status: 403 }
      );
    }

    const result = await executeManagementSQL(connection.supabaseUrl, managementToken, SETUP_SQL);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Setup failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
