import { NextRequest, NextResponse } from "next/server";
import { fetchSchemaViaManagementAPI, fetchSchemaViaOpenAPI, fetchSchemaViaRestAPI } from "@/lib/supabase-helpers";
import type { SupabaseConnection } from "@/lib/supabase-types";

// POST /api/schema — Fetch database schema from Supabase
// Strategy:
//   1. Management API with access token (most complete: columns, types, FKs, defaults)
//   2. PostgREST OpenAPI with secret key (JWT format, basic schema)
//   3. REST API discovery with publishable key (limited, may not work)
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

    const errors: string[] = [];

    // Strategy 1: Use Management API if access token or sbp_ token is available
    // Check both accessToken and serviceRoleKey — users sometimes store their
    // personal access token (sbp_...) in the serviceRoleKey field
    const managementToken = connection.accessToken ||
      (connection.serviceRoleKey?.startsWith('sbp_') ? connection.serviceRoleKey : null);

    if (managementToken) {
      const result = await fetchSchemaViaManagementAPI(
        connection.supabaseUrl,
        managementToken
      );

      if (result.tables && result.tables.length > 0) {
        return NextResponse.json({ tables: result.tables });
      }

      if (result.error) {
        errors.push(`Management API: ${result.error}`);
      }
    }

    // Strategy 2: Use PostgREST OpenAPI with secret key (old JWT format only)
    // New sb_publishable_ keys don't work with the OpenAPI spec endpoint
    const secretKey = connection.serviceRoleKey?.startsWith('sbp_') ||
      connection.serviceRoleKey?.startsWith('sb_publishable_')
        ? null  // Don't try sbp_ or sb_publishable_ with PostgREST OpenAPI
        : connection.serviceRoleKey;

    const openApiKey = secretKey || (connection.anonKey?.startsWith('eyJ') ? connection.anonKey : null);

    if (openApiKey) {
      const result = await fetchSchemaViaOpenAPI(
        connection.supabaseUrl,
        openApiKey
      );

      if (result.tables && result.tables.length > 0) {
        return NextResponse.json({
          tables: result.tables,
          _meta: {
            method: openApiKey === connection.anonKey ? "publishable_key" : "secret_key",
            note: "Schema fetched via PostgREST OpenAPI. Some details (FK relationships, defaults) may be limited. Add a management API token for full schema info.",
          },
        });
      }

      if (result.error) {
        errors.push(`PostgREST: ${result.error}`);
      }
    }

    // Strategy 3: Try REST API discovery with publishable key
    if (connection.anonKey) {
      const result = await fetchSchemaViaRestAPI(
        connection.supabaseUrl,
        connection.anonKey
      );

      if (result.tables && result.tables.length > 0) {
        return NextResponse.json({
          tables: result.tables,
          _meta: {
            method: "rest_api",
            note: "Schema fetched via REST API discovery. Add a management API token for full schema info including foreign keys and defaults.",
          },
        });
      }

      if (result.error) {
        errors.push(`REST API: ${result.error}`);
      }
    }

    // All methods failed
    const errorDetail = errors.length > 0 ? errors.join('; ') : 'No valid credentials available';
    return NextResponse.json(
      {
        error: `Cannot fetch schema. ${errorDetail}. Please add a valid Supabase Management API token (Personal Access Token from your dashboard at supabase.com/dashboard/account/tokens) for full schema access.`,
        tables: [],
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch schema" },
      { status: 500 }
    );
  }
}
