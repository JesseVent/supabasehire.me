import { NextRequest, NextResponse } from "next/server";
import { executeManagementSQL } from "@/lib/supabase-helpers";
import { getConnectionFromHeaders } from "@/lib/api-auth";
import type { SupabaseConnection } from "@/lib/supabase-types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tableNames: string[] | undefined = body.tableNames;
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

    const tableFilter = tableNames?.length
      ? `AND relname = ANY(ARRAY[${tableNames.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}])`
      : "";

    // Fetch row counts from pg_stat_user_tables
    const rowCountSQL = `
SELECT schemaname, relname AS table_name, n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
${tableFilter}
ORDER BY relname;
`;

    // Fetch column stats from pg_stats joined with information_schema
    const statsSQL = `
SELECT
  s.tablename,
  s.attname AS column_name,
  ROUND((s.null_frac * 100)::numeric, 2) AS null_pct,
  CASE
    WHEN s.n_distinct >= 0 THEN s.n_distinct::bigint
    ELSE NULL
  END AS distinct_count,
  s.most_common_vals::text AS sample_values_raw,
  s.most_common_freqs::text AS sample_freqs_raw,
  c.data_type,
  c.is_nullable
FROM pg_stats s
JOIN information_schema.columns c
  ON c.table_schema = s.schemaname
  AND c.table_name = s.tablename
  AND c.column_name = s.attname
WHERE s.schemaname = 'public'
${tableNames?.length ? `AND s.tablename = ANY(ARRAY[${tableNames.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}])` : ""}
ORDER BY s.tablename, s.attname;
`;

    const [rowCountResult, statsResult] = await Promise.all([
      executeManagementSQL(connection.supabaseUrl, managementToken, rowCountSQL),
      executeManagementSQL(connection.supabaseUrl, managementToken, statsSQL),
    ]);

    if (rowCountResult.error) {
      return NextResponse.json({ error: rowCountResult.error }, { status: 500 });
    }

    const rowCounts = rowCountResult.data as Array<{
      schemaname: string;
      table_name: string;
      row_count: number;
    }>;
    const columnStats = (statsResult.data || []) as Array<{
      tablename: string;
      column_name: string;
      null_pct: number | null;
      distinct_count: number | null;
      sample_values_raw: string | null;
      data_type: string;
      is_nullable: string;
    }>;

    // Parse PostgreSQL array literal: {val1,val2,...}
    function parsePgArray(raw: string | null): unknown[] {
      if (!raw) return [];
      const inner = raw.replace(/^\{/, "").replace(/\}$/, "");
      if (!inner) return [];
      const items: unknown[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '"' && inner[i - 1] !== "\\") {
          inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          items.push(current.trim().replace(/^"|"$/g, ""));
          current = "";
        } else {
          current += ch;
        }
      }
      if (current) items.push(current.trim().replace(/^"|"$/g, ""));
      return items.slice(0, 10);
    }

    // Group column stats by table
    const colsByTable: Record<string, typeof columnStats> = {};
    for (const col of columnStats) {
      if (!colsByTable[col.tablename]) colsByTable[col.tablename] = [];
      colsByTable[col.tablename].push(col);
    }

    const now = new Date().toISOString();

    // Upsert all tables
    for (const row of rowCounts) {
      const upsertTableSQL = `
INSERT INTO catalog_tables (schema_name, table_name, row_count, profiled_at)
VALUES ('${row.schemaname}', '${row.table_name.replace(/'/g, "''")}', ${row.row_count ?? 0}, '${now}')
ON CONFLICT (schema_name, table_name) DO UPDATE SET
  row_count = EXCLUDED.row_count,
  profiled_at = EXCLUDED.profiled_at;
`;
      const tableResult = await executeManagementSQL(connection.supabaseUrl, managementToken, upsertTableSQL);
      if (tableResult.error) continue;

      // Get the table id
      const getIdSQL = `SELECT id FROM catalog_tables WHERE schema_name = '${row.schemaname}' AND table_name = '${row.table_name.replace(/'/g, "''")}' LIMIT 1;`;
      const idResult = await executeManagementSQL(connection.supabaseUrl, managementToken, getIdSQL);
      if (idResult.error || !(idResult.data as Array<{ id: string }>)?.[0]?.id) continue;
      const tableId = (idResult.data as Array<{ id: string }>)[0].id;

      const cols = colsByTable[row.table_name] || [];
      for (const col of cols) {
        const sampleVals = parsePgArray(col.sample_values_raw);
        const sampleJson = JSON.stringify(sampleVals).replace(/'/g, "''");
        const colUpsertSQL = `
INSERT INTO catalog_columns (table_id, column_name, data_type, nullable, null_pct, distinct_count, sample_values)
VALUES (
  '${tableId}',
  '${col.column_name.replace(/'/g, "''")}',
  '${(col.data_type || "").replace(/'/g, "''")}',
  ${col.is_nullable === "YES"},
  ${col.null_pct ?? 0},
  ${col.distinct_count ?? "NULL"},
  '${sampleJson}'::jsonb
)
ON CONFLICT (table_id, column_name) DO UPDATE SET
  data_type = EXCLUDED.data_type,
  nullable = EXCLUDED.nullable,
  null_pct = EXCLUDED.null_pct,
  distinct_count = EXCLUDED.distinct_count,
  sample_values = EXCLUDED.sample_values;
`;
        await executeManagementSQL(connection.supabaseUrl, managementToken, colUpsertSQL);
      }
    }

    return NextResponse.json({ success: true, profiled: rowCounts.length });
  } catch (err) {
    return NextResponse.json(
      { error: `Profiling failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
