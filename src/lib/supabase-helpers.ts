import { extractProjectRef } from "@/lib/supabase-types";
import type { ColumnInfo, ForeignKeyInfo, TableSchema, RLSPolicy, RLSEnabledStatus, TableRLSInfo } from "@/lib/supabase-types";

/**
 * Execute a SQL query via the Supabase Management API.
 * Requires the access token.
 */
export async function executeManagementSQL(
  supabaseUrl: string,
  accessToken: string,
  query: string,
  readOnly = false
): Promise<{ data?: unknown; error?: string }> {
  const projectRef = extractProjectRef(supabaseUrl);
  if (!projectRef) {
    return { error: "Could not extract project ref from Supabase URL" };
  }

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, ...(readOnly && { read_only: true }) }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        error: `Management API error (${response.status}): ${errorText}`,
      };
    }

    const result = await response.json();
    return { data: result };
  } catch (err) {
    return {
      error: `Failed to execute SQL: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Execute a SQL query via the Supabase REST API using the secret key.
 * This uses the PostgREST interface and requires a defined RPC function.
 * For ad-hoc queries, prefer executeManagementSQL.
 */
export async function executeSupabaseRPC(
  supabaseUrl: string,
  secretKey: string,
  functionName: string,
  params: Record<string, unknown>
): Promise<{ data?: unknown; error?: string }> {
  try {
    // Get a valid JWT (exchanges publishable key if needed)
    const validKey = await getValidApiKey(supabaseUrl, secretKey);

    const headers: Record<string, string> = {
      apikey: secretKey,
      Authorization: `Bearer ${validKey}`,
      "Content-Type": "application/json",
    };

    const url = `${supabaseUrl}/rest/v1/rpc/${functionName}`;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        error: `Supabase RPC error (${response.status}): ${errorText}`,
      };
    }

    const result = await response.json();
    return { data: result };
  } catch (err) {
    return {
      error: `Failed to execute RPC: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Exchange a Supabase publishable key (sb_publishable_...) for an anonymous JWT.
 * The new publishable key format cannot be used directly with PostgREST —
 * it must first be exchanged via the Supabase Auth API.
 * Returns the JWT token string, or null if exchange fails.
 */
export async function exchangePublishableKeyForJWT(
  supabaseUrl: string,
  publishableKey: string
): Promise<string | null> {
  try {
    // Anonymous sign-in returns a proper eyJ... JWT the edge runtime accepts.
    // grant_type=apikey doesn't exist; grant_type=anonymous is the correct path
    // for obtaining a JWT from an sb_publishable_ or sb_secret_ opaque key.
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=anonymous`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.access_token || data.jwt || null;
  } catch {
    return null;
  }
}

/**
 * Get a valid API key/JWT for making PostgREST requests.
 * For old-style JWT keys (eyJ...), returns the key directly.
 * For new publishable keys (sb_publishable_...), exchanges for a JWT first.
 * Caches the result to avoid repeated exchanges.
 */
const jwtCache = new Map<string, { jwt: string; expires: number }>();

export async function getValidApiKey(
  supabaseUrl: string,
  apiKey: string
): Promise<string> {
  // Old JWT format — use directly
  if (apiKey.startsWith('eyJ')) {
    return apiKey;
  }

  // New key formats (sb_publishable_ and sb_secret_) are opaque — not JWTs.
  // Edge functions reject them with UNAUTHORIZED_INVALID_JWT_FORMAT.
  // Exchange via anonymous sign-in to get a real eyJ... JWT.
  if (apiKey.startsWith('sb_publishable_') || apiKey.startsWith('sb_secret_')) {
    const cacheKey = `${supabaseUrl}:${apiKey}`;
    const cached = jwtCache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return cached.jwt;
    }

    const jwt = await exchangePublishableKeyForJWT(supabaseUrl, apiKey);
    if (jwt) {
      jwtCache.set(cacheKey, { jwt, expires: Date.now() + 55 * 60 * 1000 });
      return jwt;
    }

    return apiKey;
  }

  // Unknown format — try as-is
  return apiKey;
}

/**
 * Fetch schema via the PostgREST OpenAPI endpoint using publishable key or secret key.
 * This is a wrapper that uses getValidApiKey to handle key format conversion.
 * For new sb_publishable_ keys, this may not work as the OpenAPI spec endpoint
 * often requires a secret key. In that case, use fetchSchemaViaRestAPI instead.
 */
export async function fetchSchemaViaOpenAPI(
  supabaseUrl: string,
  apiKey: string
): Promise<{ tables?: TableSchema[]; error?: string }> {
  try {
    const validKey = await getValidApiKey(supabaseUrl, apiKey);

    const headers: Record<string, string> = {
      apikey: apiKey,
      Authorization: `Bearer ${validKey}`,
      Accept: "application/json",
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        error: `PostgREST OpenAPI error (${response.status}): ${errorText}`,
      };
    }

    const spec = await response.json();
    return parseOpenAPISpec(spec);
  } catch (err) {
    return {
      error: `Failed to fetch OpenAPI spec: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Fetch schema by discovering tables through the PostgREST REST API.
 * This works with the new sb_publishable_ key format by querying each
 * table's URL to discover columns, instead of using the OpenAPI spec endpoint
 * which requires a secret key.
 * 
 * Strategy: Use the Supabase Management API SQL endpoint if available.
 * Otherwise, fall back to REST API table discovery.
 */
export async function fetchSchemaViaRestAPI(
  supabaseUrl: string,
  publishableKey: string
): Promise<{ tables?: TableSchema[]; error?: string }> {
  try {
    // Try to use Supabase client to introspect tables
    // The /rest/v1/ root endpoint requires a secret key, but individual table
    // endpoints work with publishable keys. We'll use a SQL approach through
    // the Supabase RPC if available, or return a partial result.
    
    // Since we can't query pg_catalog or information_schema through REST API,
    // we'll try to fetch the OpenAPI spec with the correct approach.
    // If that fails, we return an error suggesting to add a management token.
    
    // Try with Bearer token (JWT obtained from key exchange)
    const validKey = await getValidApiKey(supabaseUrl, publishableKey);
    
    const headers: Record<string, string> = {
      apikey: publishableKey,
      Authorization: `Bearer ${validKey}`,
      Accept: "application/json",
    };

    // Try the OpenAPI endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "GET",
      headers,
    });

    if (response.ok) {
      const spec = await response.json();
      return parseOpenAPISpec(spec);
    }

    // If OpenAPI fails, try to discover tables via the RPC approach
    // Query the Supabase auth endpoint for schema info
    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/schema_info`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });

    if (rpcResponse.ok) {
      const data = await rpcResponse.json();
      if (Array.isArray(data)) {
        // Map the RPC result to TableSchema
        return { tables: data as TableSchema[] };
      }
    }

    // Both approaches failed - the publishable key alone isn't sufficient
    // for schema introspection without a management API token
    return {
      error: "Cannot fetch schema with publishable key alone. The PostgREST OpenAPI endpoint requires a secret key, and schema introspection needs a Management API token. Please add a Supabase Management API token (Personal Access Token from your dashboard) for full schema access.",
    };
  } catch (err) {
    return {
      error: `Failed to fetch schema: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Parse the PostgREST OpenAPI spec into TableSchema objects.
 */
function parseOpenAPISpec(spec: Record<string, unknown>): { tables?: TableSchema[]; error?: string } {
  try {
    const tables: TableSchema[] = [];
    const definitions = spec.definitions || spec.components?.schemas;
    
    if (!definitions || typeof definitions !== "object") {
      return { error: "OpenAPI spec does not contain table definitions" };
    }

    for (const [tableName, tableDef] of Object.entries(definitions as Record<string, unknown>)) {
      if (!tableDef || typeof tableDef !== "object") continue;
      
      const def = tableDef as Record<string, unknown>;
      const properties = def.properties as Record<string, unknown> | undefined;
      const required = (def.required as string[]) || [];

      if (!properties) continue;

      const columns: ColumnInfo[] = [];
      const foreignKeys: ForeignKeyInfo[] = [];
      let ordinalPosition = 0;

      for (const [colName, colDef] of Object.entries(properties)) {
        ordinalPosition++;
        const col = colDef as Record<string, unknown>;
        
        // Extract type information
        const dataType = openApiTypeToPostgres(col);
        const isNullable = !required.includes(colName) ? "YES" : "NO";
        const columnDefault = col.default as string | null || null;
        
        columns.push({
          table_name: tableName,
          column_name: colName,
          data_type: dataType,
          is_nullable: isNullable,
          column_default: columnDefault,
          ordinal_position: ordinalPosition,
        });

        // Check for FK hints in description (PostgREST adds "→ tablename.column" for FKs)
        const description = col.description as string | undefined;
        if (description) {
          const fkMatch = description.match(/→\s*(\w+)\.(\w+)/);
          if (fkMatch) {
            foreignKeys.push({
              table_name: tableName,
              column_name: colName,
              foreign_table_name: fkMatch[1],
              foreign_column_name: fkMatch[2],
            });
          }
        }
      }

      if (columns.length > 0) {
        tables.push({
          tableName,
          columns,
          foreignKeys,
        });
      }
    }

    return { tables };
  } catch (err) {
    return {
      error: `Failed to parse OpenAPI spec: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Convert OpenAPI type/format to PostgreSQL type string.
 */
function openApiTypeToPostgres(col: Record<string, unknown>): string {
  const type = col.type as string;
  const format = col.format as string | undefined;
  
  if (format === "uuid") return "uuid";
  if (format === "date-time" || format === "timestamp with time zone") return "timestamptz";
  if (format === "date") return "date";
  if (format === "time") return "time";
  if (format === "integer" || type === "integer") return "integer";
  if (format === "bigint" || type === "bigint") return "bigint";
  if (format === "double" || type === "number") return "double precision";
  if (format === "boolean" || type === "boolean") return "boolean";
  if (format === "json" || format === "jsonb") return "jsonb";
  if (type === "array") return "array";
  if (type === "string") return "text";
  
  // Fallback
  return type || "text";
}

/**
 * Fetch RLS status via the Supabase Management API SQL query.
 * Requires access token.
 */
export async function fetchRLSViaManagementAPI(
  supabaseUrl: string,
  accessToken: string
): Promise<{ tables?: TableRLSInfo[]; error?: string }> {
  // Query RLS policies
  const policiesSQL = `
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public';
`;

  const rlsEnabledSQL = `
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public';
`;

  const [policiesResult, rlsEnabledResult] = await Promise.all([
    executeManagementSQL(supabaseUrl, accessToken, policiesSQL, true),
    executeManagementSQL(supabaseUrl, accessToken, rlsEnabledSQL, true),
  ]);

  if (policiesResult.error) return { error: policiesResult.error };
  if (rlsEnabledResult.error) return { error: rlsEnabledResult.error };

  const policies = parseQueryResult<RLSPolicy>(policiesResult.data);
  const rlsStatuses = parseQueryResult<RLSEnabledStatus>(rlsEnabledResult.data);

  const tableMap = new Map<string, TableRLSInfo>();

  for (const status of rlsStatuses) {
    tableMap.set(status.tablename, {
      tableName: status.tablename,
      rlsEnabled: Boolean(status.rls_enabled),
      policies: [],
    });
  }

  for (const policy of policies) {
    if (!tableMap.has(policy.tablename)) {
      tableMap.set(policy.tablename, {
        tableName: policy.tablename,
        rlsEnabled: false,
        policies: [],
      });
    }
    tableMap.get(policy.tablename)!.policies.push(policy);
  }

  return { tables: Array.from(tableMap.values()) };
}

/**
 * Fetch schema via the Management API SQL query.
 * Requires access token.
 */
export async function fetchSchemaViaManagementAPI(
  supabaseUrl: string,
  accessToken: string
): Promise<{ tables?: TableSchema[]; error?: string }> {
  // Query columns
  const columnsSQL = `
SELECT 
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  c.ordinal_position
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name AND c.table_schema = 'public'
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;
`;

  const fkSQL = `
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';
`;

  const [columnsResult, fkResult] = await Promise.all([
    executeManagementSQL(supabaseUrl, accessToken, columnsSQL, true),
    executeManagementSQL(supabaseUrl, accessToken, fkSQL, true),
  ]);

  if (columnsResult.error) return { error: columnsResult.error };
  if (fkResult.error) {
    return { error: fkResult.error };
  }

  const columns = parseQueryResult<ColumnInfo>(columnsResult.data);
  const foreignKeys = parseQueryResult<ForeignKeyInfo>(fkResult.data);

  const tableMap = new Map<string, TableSchema>();

  for (const col of columns) {
    const tableName = col.table_name;
    if (!tableMap.has(tableName)) {
      tableMap.set(tableName, {
        tableName,
        columns: [],
        foreignKeys: [],
      });
    }
    tableMap.get(tableName)!.columns.push(col);
  }

  for (const fk of foreignKeys) {
    const table = tableMap.get(fk.table_name);
    if (table) {
      table.foreignKeys.push(fk);
    }
  }

  return { tables: Array.from(tableMap.values()) };
}

/**
 * Parse the Supabase Management API query result.
 * The API may return results in different formats depending on the endpoint.
 */
export function parseQueryResult<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if (Array.isArray(obj.rows)) {
      return obj.rows as T[];
    }
    if (Array.isArray(obj.data)) {
      return obj.data as T[];
    }
    if (Array.isArray(obj.result)) {
      return obj.result as T[];
    }

    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        return value as T[];
      }
    }
  }

  return [];
}
