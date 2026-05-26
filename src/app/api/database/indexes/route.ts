import { NextRequest, NextResponse } from "next/server";
import { executeManagementSQL } from "@/lib/supabase-helpers";
import type { SupabaseConnection } from "@/lib/supabase-types";

// POST /api/database/indexes — Fetch database index usage statistics
// Requires Management API token for full data, falls back to OpenAPI for table list
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const connection: SupabaseConnection | null = body.connection || null;

    if (!connection) {
      return NextResponse.json(
        { error: "No connection provided" },
        { status: 400 }
      );
    }

    // Strategy 1: Use Management API if access token or sbp_ token is available
    const managementToken = connection.accessToken ||
      (connection.serviceRoleKey?.startsWith('sbp_') ? connection.serviceRoleKey : null);

    if (managementToken) {
      const sql = `
SELECT
  schemaname,
  relname AS tablename,
  indexrelname AS indexname,
  idx_scan AS scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  idx_scan = 0 AS is_unused
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
`;

      const result = await executeManagementSQL(
        connection.supabaseUrl,
        managementToken,
        sql
      );

      if (result.data) {
        const rows = parseIndexRows(result.data);
        return NextResponse.json({ indexes: rows });
      }

      if (result.error) {
      }
    }

    // No fallback for indexes without Management API — they require SQL access
    return NextResponse.json({
      indexes: [],
      _meta: {
        limited: true,
        note: "Index statistics require a Management API token. Add one in Settings to view index data.",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch indexes" },
      { status: 500 }
    );
  }
}

function parseIndexRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return obj.rows;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.result)) return obj.result;
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}
