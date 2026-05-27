import { NextRequest, NextResponse } from "next/server";
import type { SupabaseConnection } from "@/lib/supabase-types";

// POST /api/edge-functions/invoke — Invoke an edge function
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connection, functionName, method, body: functionBody, headers: customHeaders } = body as {
      connection: SupabaseConnection | null;
      functionName: string;
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    };

    if (!connection || !functionName) {
      return NextResponse.json(
        { error: "connection and functionName are required" },
        { status: 400 }
      );
    }

    const httpMethod = method?.toUpperCase() || "POST";
    if (httpMethod !== "GET" && httpMethod !== "POST") {
      return NextResponse.json(
        { error: "Method must be GET or POST" },
        { status: 400 }
      );
    }

    // New-format keys (sb_publishable_, sb_secret_) are NOT JWTs.
    // Supabase edge runtime rule: Authorization: Bearer <X> is only accepted
    // when X exactly equals the apikey header value.
    // So use the same key for both headers — prefer serviceRoleKey over anonKey.
    const apiKey = connection.serviceRoleKey ?? connection.anonKey;

    // Build the URL for the edge function
    const url = `${connection.supabaseUrl}/functions/v1/${functionName}`;

    const requestHeaders: Record<string, string> = {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...customHeaders,
    };

    const fetchOptions: RequestInit = {
      method: httpMethod,
      headers: requestHeaders,
    };

    // Only include body for POST requests
    if (httpMethod === "POST" && functionBody) {
      fetchOptions.body = JSON.stringify(functionBody);
    }

    const response = await fetch(url, fetchOptions);

    let data: unknown;
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      return NextResponse.json({
        error: typeof data === "string" ? data : JSON.stringify(data),
        status: response.status,
      });
    }

    return NextResponse.json({
      data,
      status: response.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to invoke edge function" },
      { status: 500 }
    );
  }
}
