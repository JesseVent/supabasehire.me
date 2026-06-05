import { NextRequest, NextResponse } from "next/server";
import { getConnectionFromHeaders } from "@/lib/api-auth";
import type { SupabaseConnection } from "@/lib/supabase-types";

// POST /api/edge-functions/invoke — Invoke an edge function
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { functionName, method, body: functionBody, headers: customHeaders } = body as {
      functionName: string;
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    };
    const connection = getConnectionFromHeaders(request);

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

    // Use serviceRoleKey when available — it bypasses RLS and has the most access.
    // New-format opaque keys (sb_secret_) go in apikey only; the platform rejects
    // them in Authorization. Legacy JWT keys (eyJ...) must also appear in
    // Authorization: Bearer for platform-level JWT verification to pass.
    const apiKey = connection.serviceRoleKey ?? connection.anonKey;

    const url = `${connection.supabaseUrl}/functions/v1/${functionName}`;

    const requestHeaders: Record<string, string> = {
      apikey: apiKey,
      "Content-Type": "application/json",
      // JWT-format keys need Authorization for platform JWT verification.
      // Sending a new-format opaque key as Bearer causes a 401 — skip it.
      ...(apiKey.startsWith('eyJ') && { Authorization: `Bearer ${apiKey}` }),
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
