import { NextRequest, NextResponse } from "next/server";
import { extractProjectRef } from "@/lib/supabase-types";
import type { EdgeFunction, SupabaseConnection } from "@/lib/supabase-types";

// POST /api/edge-functions — List edge functions from Supabase
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

    if (!connection.accessToken) {
      return NextResponse.json(
        { error: "Access token is required to list edge functions. Please update your connection with a Supabase access token." },
        { status: 400 }
      );
    }

    const projectRef = extractProjectRef(connection.supabaseUrl);
    if (!projectRef) {
      return NextResponse.json(
        { error: "Could not extract project ref from Supabase URL" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/functions`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Supabase Management API error (${response.status}): ${errorText}` },
        { status: 502 }
      );
    }

    const functions = (await response.json()) as EdgeFunction[];

    return NextResponse.json({ functions });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list edge functions" },
      { status: 500 }
    );
  }
}
