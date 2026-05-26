import { NextRequest, NextResponse } from "next/server";
import { executeManagementSQL } from "@/lib/supabase-helpers";
import type { SupabaseConnection } from "@/lib/supabase-types";

// POST /api/sql — Execute a raw SQL query
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connection, query } = body as { connection: SupabaseConnection | null; query: string };

    if (!connection || !query) {
      return NextResponse.json(
        { error: "connection and query are required" },
        { status: 400 }
      );
    }

    if (!connection.accessToken) {
      return NextResponse.json(
        { error: "Access token is required to execute SQL queries. Please update your connection with a Supabase access token." },
        { status: 400 }
      );
    }

    const result = await executeManagementSQL(
      connection.supabaseUrl,
      connection.accessToken,
      query
    );

    if (result.error) {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to execute SQL" },
      { status: 500 }
    );
  }
}
