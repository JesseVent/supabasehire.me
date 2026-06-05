import { NextRequest, NextResponse } from "next/server";
import { extractProjectRef } from "@/lib/supabase-types";
import { DEMO_CONNECTION_ID } from "@/lib/demo-data";
import { getConnectionFromHeaders } from "@/lib/api-auth";
import type { SupabaseConnection } from "@/lib/supabase-types";

interface ProjectInfo {
  id: string;
  name: string;
  ref: string;
  region: string;
  created_at: string;
  database_version: string;
  plan_type: string;
  project_url: string;
  status: string;
}

interface ProjectStats {
  tables_count: number;
  rls_policies_count: number;
  edge_functions_count: number;
}

interface ProjectResponse {
  project: ProjectInfo | null;
  stats: ProjectStats;
  error?: string;
}

const DEMO_PROJECT: ProjectInfo = {
  id: "demo-project-id",
  name: "Demo Project",
  ref: "demo-project",
  region: "us-east-1",
  created_at: "2024-01-15T10:30:00Z",
  database_version: "15.6",
  plan_type: "free",
  project_url: "https://demo-project.supabase.co",
  status: "ACTIVE",
};

const EMPTY_STATS: ProjectStats = { tables_count: 0, rls_policies_count: 0, edge_functions_count: 0 };

function makeFallbackProject(connection: SupabaseConnection, projectRef: string): ProjectInfo {
  return {
    id: connection.id,
    name: connection.name,
    ref: projectRef,
    region: "unknown",
    created_at: connection.createdAt,
    database_version: "unknown",
    plan_type: "unknown",
    project_url: connection.supabaseUrl,
    status: "active",
  };
}

// POST /api/project — Fetch project info from Supabase Management API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const connection = getConnectionFromHeaders(request);

    if (!connection) {
      return NextResponse.json(
        { error: "No connection provided", project: null, stats: EMPTY_STATS } satisfies ProjectResponse,
        { status: 400 }
      );
    }

    // Demo mode
    if (connection.id === DEMO_CONNECTION_ID) {
      return NextResponse.json({
        project: DEMO_PROJECT,
        stats: { tables_count: 8, rls_policies_count: 9, edge_functions_count: 3 },
      } satisfies ProjectResponse);
    }

    const { supabaseUrl, accessToken } = connection;
    const projectRef = extractProjectRef(supabaseUrl);

    if (!projectRef) {
      return NextResponse.json({
        project: makeFallbackProject(connection, ""),
        stats: EMPTY_STATS,
        error: "Could not extract project ref from URL",
      } satisfies ProjectResponse);
    }

    // No access token — return basic info
    if (!accessToken) {
      return NextResponse.json({
        project: makeFallbackProject(connection, projectRef),
        stats: EMPTY_STATS,
        error: "No access token configured — cannot fetch project details from Management API",
      } satisfies ProjectResponse);
    }

    // Fetch project info from Management API
    try {
      const mgmtResponse = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!mgmtResponse.ok) {
        const errorText = await mgmtResponse.text();
        return NextResponse.json({
          project: makeFallbackProject(connection, projectRef),
          stats: EMPTY_STATS,
          error: `Management API error (${mgmtResponse.status}): ${errorText}`,
        } satisfies ProjectResponse);
      }

      const projectData = await mgmtResponse.json();

      const projectInfo: ProjectInfo = {
        id: projectData.id || connection.id,
        name: projectData.name || connection.name,
        ref: projectRef,
        region: projectData.region || "unknown",
        created_at: projectData.created_at || connection.createdAt,
        database_version: projectData.db_version || "unknown",
        plan_type: projectData.plan || "unknown",
        project_url: `https://${projectRef}.supabase.co`,
        status: projectData.status || "active",
      };

      return NextResponse.json({
        project: projectInfo,
        stats: EMPTY_STATS,
      } satisfies ProjectResponse);
    } catch {
      return NextResponse.json({
        project: makeFallbackProject(connection, projectRef),
        stats: EMPTY_STATS,
        error: "Could not reach Supabase Management API — network error",
      } satisfies ProjectResponse);
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch project info", project: null, stats: EMPTY_STATS } satisfies ProjectResponse,
      { status: 500 }
    );
  }
}
