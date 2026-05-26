import { NextRequest, NextResponse } from "next/server";
import { executeManagementSQL } from "@/lib/supabase-helpers";
import type { SupabaseConnection } from "@/lib/supabase-types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const connection: SupabaseConnection | null = body.connection || null;
    const { tableId, schemaName, tableName } = body as {
      tableId: string;
      schemaName: string;
      tableName: string;
    };

    if (!connection || !tableId || !schemaName || !tableName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const managementToken = connection.accessToken ||
      (connection.serviceRoleKey?.startsWith("sbp_") ? connection.serviceRoleKey : null);

    if (!managementToken) {
      return NextResponse.json(
        { error: "Management API token required." },
        { status: 403 }
      );
    }

    // Load the table and column AI descriptions
    const tableSQL = `SELECT ai_description FROM catalog_tables WHERE id = '${tableId}' LIMIT 1;`;
    const columnsSQL = `SELECT column_name, ai_description FROM catalog_columns WHERE table_id = '${tableId}' AND ai_description IS NOT NULL;`;

    const [tableResult, colsResult] = await Promise.all([
      executeManagementSQL(connection.supabaseUrl, managementToken, tableSQL),
      executeManagementSQL(connection.supabaseUrl, managementToken, columnsSQL),
    ]);

    const tableRows = tableResult.data as Array<{ ai_description: string | null }>;
    const colRows = (colsResult.data || []) as Array<{ column_name: string; ai_description: string | null }>;

    const statements: string[] = [];
    const safeSchema = schemaName.replace(/"/g, '""');
    const safeTable = tableName.replace(/"/g, '""');

    if (tableRows?.[0]?.ai_description) {
      const desc = tableRows[0].ai_description.replace(/'/g, "''");
      statements.push(`COMMENT ON TABLE "${safeSchema}"."${safeTable}" IS '${desc}';`);
    }

    for (const col of colRows) {
      if (col.ai_description) {
        const safeCol = col.column_name.replace(/"/g, '""');
        const desc = col.ai_description.replace(/'/g, "''");
        statements.push(`COMMENT ON COLUMN "${safeSchema}"."${safeTable}"."${safeCol}" IS '${desc}';`);
      }
    }

    if (statements.length === 0) {
      return NextResponse.json({ success: true, committed: 0, message: "No AI descriptions to commit." });
    }

    const commitSQL = statements.join("\n");
    const commitResult = await executeManagementSQL(connection.supabaseUrl, managementToken, commitSQL);

    if (commitResult.error) {
      return NextResponse.json({ error: commitResult.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, committed: statements.length });
  } catch (err) {
    return NextResponse.json(
      { error: `Commit failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
