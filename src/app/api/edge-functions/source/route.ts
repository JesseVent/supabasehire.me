import { NextRequest, NextResponse } from "next/server";
import { extractProjectRef } from "@/lib/supabase-types";
import { getConnectionFromHeaders } from "@/lib/api-auth";
import type { SupabaseConnection } from "@/lib/supabase-types";

// POST /api/edge-functions/source — Fetch the raw source body of a deployed
// edge function via the Supabase Management API:
//   GET /v1/projects/{ref}/functions/{slug}/body
//
// The body endpoint returns either a plain-text source file (legacy / dashboard-edited
// single-file deploys) or a binary eszip bundle (modern CLI bundle deploys).
// We always pass the response through as text — the client-side frontmatter
// extractor is defensive and silently returns an empty result for binary payloads.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { functionName } = body as {
      functionName: string;
    };
    const connection = getConnectionFromHeaders(request);

    if (!connection || !functionName) {
      return NextResponse.json(
        { error: "connection and functionName are required" },
        { status: 400 }
      );
    }

    if (!connection.accessToken) {
      return NextResponse.json(
        { error: "Access token is required to fetch edge function source" },
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
      `https://api.supabase.com/v1/projects/${projectRef}/functions/${encodeURIComponent(functionName)}/body`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
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

    const contentType = response.headers.get("content-type") ?? "";
    const source = await response.text();

    return NextResponse.json({ source, contentType });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch edge function source" },
      { status: 500 }
    );
  }
}
