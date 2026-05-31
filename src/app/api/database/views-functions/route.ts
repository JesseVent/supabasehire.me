import { NextRequest, NextResponse } from "next/server";
import { executeManagementSQL, parseQueryResult } from "@/lib/supabase-helpers";
import type { SupabaseConnection } from "@/lib/supabase-types";

// POST /api/database/views-functions — Fetch database views and functions
// Requires Management API token for full data
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
      // Fetch views
      const viewsSQL = `
SELECT
  v.table_name AS name,
  v.view_definition AS definition
FROM information_schema.views v
WHERE v.table_schema = 'public'
ORDER BY v.table_name;
`;

      // Fetch view columns
      const viewColumnsSQL = `
SELECT
  c.table_name AS view_name,
  c.column_name AS name,
  c.data_type AS type,
  c.is_nullable AS nullable
FROM information_schema.columns c
JOIN information_schema.views v ON v.table_name = c.table_name AND v.table_schema = c.table_schema
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;
`;

      // Fetch functions
      const functionsSQL = `
SELECT
  p.proname AS name,
  pg_get_functiondef(p.oid) AS source_code,
  pg_get_function_result(p.oid) AS return_type,
  l.lanname AS language,
  p.provolatile AS volatility,
  p.proisstrict AS strict,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
WHERE n.nspname = 'public'
  AND l.lanname IN ('plpgsql', 'sql')
ORDER BY p.proname;
`;

      const [viewsResult, columnsResult, functionsResult] = await Promise.all([
        executeManagementSQL(connection.supabaseUrl, managementToken, viewsSQL, true),
        executeManagementSQL(connection.supabaseUrl, managementToken, viewColumnsSQL, true),
        executeManagementSQL(connection.supabaseUrl, managementToken, functionsSQL, true),
      ]);

      const views = parseQueryResult(viewsResult.data);
      const columns = parseQueryResult(columnsResult.data);
      const functions = parseQueryResult(functionsResult.data);

      return NextResponse.json({ views, columns, functions });
    }

    // No fallback for views/functions without Management API
    return NextResponse.json({
      views: [],
      columns: [],
      functions: [],
      _meta: {
        limited: true,
        note: "Views and functions data requires a Management API token. Add one in Settings to view this information.",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch views/functions" },
      { status: 500 }
    );
  }
}

