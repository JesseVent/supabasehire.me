import { NextRequest, NextResponse } from "next/server";
import { fetchRLSViaManagementAPI, fetchSchemaViaOpenAPI } from "@/lib/supabase-helpers";
import { getConnectionFromHeaders } from "@/lib/api-auth";
import type { TableRLSInfo } from "@/lib/supabase-types";
import type { SupabaseConnection } from "@/lib/supabase-types";

// POST /api/rls — Fetch RLS policies for all tables
// Strategy:
//   1. Management API with access token (full RLS info: policies, enabled status)
//   2. Secret key — attempt to infer basic access info
//   3. Publishable key only — return tables with unknown RLS status, note that management token is needed
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
    // Check both accessToken and serviceRoleKey — users sometimes store their
    // personal access token (sbp_...) in the serviceRoleKey field
    const managementToken = connection.accessToken ||
      (connection.serviceRoleKey?.startsWith('sbp_') ? connection.serviceRoleKey : null);

    if (managementToken) {
      const result = await fetchRLSViaManagementAPI(
        connection.supabaseUrl,
        managementToken
      );

      if (result.tables && result.tables.length > 0) {
        return NextResponse.json({ tables: result.tables });
      }

      // If Management API fails, fall through to partial approach
      if (result.error) {
      }
    }

    // Strategy 2: Use PostgREST OpenAPI to get table list, then mark RLS as unknown
    // Only use the actual API key (not sbp_ tokens) for PostgREST
    const postgrestKey = connection.serviceRoleKey?.startsWith('sbp_')
      ? connection.anonKey
      : (connection.serviceRoleKey || connection.anonKey);
    if (postgrestKey) {
      const schemaResult = await fetchSchemaViaOpenAPI(
        connection.supabaseUrl,
        postgrestKey
      );

      if (schemaResult.tables && schemaResult.tables.length > 0) {
        // We know the tables exist but can't determine RLS status
        // Default to rlsEnabled: false (safer assumption) and note the limitation
        const tables: TableRLSInfo[] = schemaResult.tables.map((t) => ({
          tableName: t.tableName,
          rlsEnabled: false, // Unknown — default to false for safety
          rlsUnknown: true,
          policies: [],
        }));

        return NextResponse.json({
          tables,
          _meta: {
            method: postgrestKey === connection.anonKey ? "publishable_key_inferred" : "secret_key_inferred",
            rlsStatusUnknown: true,
            note: "RLS status could not be determined without a management API token. All tables are shown as 'RLS OFF' by default. Add a Supabase management API token for accurate RLS policy information.",
          },
        });
      }

      if (schemaResult.error) {
        return NextResponse.json(
          { error: schemaResult.error },
          { status: 502 }
        );
      }
    }

    // No method available
    return NextResponse.json(
      {
        error: "Cannot fetch RLS info: no management API token or valid API key. Please add a Supabase management API token for RLS policy information.",
        tables: [],
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch RLS policies" },
      { status: 500 }
    );
  }
}
