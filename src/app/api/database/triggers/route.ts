import { NextRequest, NextResponse } from "next/server";
import { executeManagementSQL, parseQueryResult } from "@/lib/supabase-helpers";
import { getConnectionFromHeaders } from "@/lib/api-auth";
import type { SupabaseConnection } from "@/lib/supabase-types";

// POST /api/database/triggers — Fetch database triggers
// Requires Management API token for trigger data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const connection = getConnectionFromHeaders(request);

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
  t.trigger_name AS name,
  t.event_object_table AS tablename,
  STRING_AGG(t.event_manipulation, ', ' ORDER BY t.event_manipulation) AS events,
  t.action_timing AS timing,
  t.action_orientation AS orientation,
  t.action_statement AS function_call,
  CASE WHEN t.action_condition IS NOT NULL THEN t.action_condition ELSE NULL END AS condition,
  NOT EXISTS (
    SELECT 1 FROM pg_trigger pt
    JOIN pg_class c ON c.oid = pt.tgrelid
    WHERE pt.tgname = t.trigger_name
    AND c.relname = t.event_object_table
    AND pt.tgenabled = 'D'
  ) AS enabled
FROM information_schema.triggers t
WHERE t.trigger_schema = 'public'
GROUP BY t.trigger_name, t.event_object_table, t.action_timing, t.action_orientation, t.action_statement, t.action_condition
ORDER BY t.event_object_table, t.trigger_name;
`;

      const result = await executeManagementSQL(
        connection.supabaseUrl,
        managementToken,
        sql,
        true
      );

      if (result.data) {
        return NextResponse.json({ triggers: parseQueryResult(result.data) });
      }
    }

    // No fallback for triggers without Management API
    return NextResponse.json({
      triggers: [],
      _meta: {
        limited: true,
        note: "Trigger data requires a Management API token. Add one in Settings to view trigger information.",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch triggers" },
      { status: 500 }
    );
  }
}

