// Shared TypeScript types for the Supabase Debugging Tool

// ─── Connection Types ───

export interface SupabaseConnection {
  id: string;
  name: string;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string | null;
  accessToken: string | null;
  s3KeyId: string | null;
  s3Secret: string | null;
  s3Warehouse: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionInput {
  name: string;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
  accessToken?: string;
}

export interface UpdateConnectionInput {
  name?: string;
  supabaseUrl?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  accessToken?: string;
}

// ─── Schema Types ───

export interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

export interface ForeignKeyInfo {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

export interface TableSchema {
  tableName: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
}

export interface SchemaResponse {
  tables: TableSchema[];
}

// ─── RLS Types ───

export interface RLSPolicy {
  schemaname: string;
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

export interface RLSEnabledStatus {
  schemaname: string;
  tablename: string;
  rls_enabled: boolean;
}

export interface TableRLSInfo {
  tableName: string;
  rlsEnabled: boolean;
  rlsUnknown?: boolean;
  policies: RLSPolicy[];
}

export interface RLSResponse {
  tables: TableRLSInfo[];
}

// ─── RLS Test Types ───

export type RLSTestOperation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
export type RLSTestRole = "anon" | "authenticated";

export interface RLSTestInput {
  connectionId: string;
  tableName: string;
  operation: RLSTestOperation;
  role: RLSTestRole;
  filters?: Record<string, unknown>;
}

export interface RLSTestResult {
  success: boolean;
  data?: unknown[];
  error?: string;
  rowCount?: number;
  operation: RLSTestOperation;
  role: RLSTestRole;
  tableName: string;
}

// ─── Edge Function Types ───

export interface EdgeFunction {
  id: string;
  name: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  verify_jwt?: boolean;
  import_map?: boolean;
  entrypoint_path?: string;
}

export interface EdgeFunctionsResponse {
  functions: EdgeFunction[];
}

export interface InvokeEdgeFunctionInput {
  connectionId: string;
  functionName: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface InvokeEdgeFunctionResult {
  data?: unknown;
  error?: string;
  status: number;
}

// ─── SQL Query Types ───

export interface SQLQueryInput {
  connectionId: string;
  query: string;
}

export interface SQLQueryResult {
  data?: unknown;
  error?: string;
  success: boolean;
}

// ─── UI Types ───

export type ActivePanel = 'dashboard' | 'schema' | 'rls' | 'edge-functions' | 'realtime' | 'sql' | 'storage' | 'catalog' | 'analytics' | 'traces' | 'settings';

// ─── Data Catalog Types ───

export interface CatalogColumn {
  id: string;
  table_id: string;
  column_name: string;
  data_type: string | null;
  nullable: boolean | null;
  null_pct: number | null;
  distinct_count: number | null;
  sample_values: unknown[] | null;
  min_val: string | null;
  max_val: string | null;
  ai_description: string | null;
}

export interface CatalogTable {
  id: string;
  schema_name: string;
  table_name: string;
  ai_description: string | null;
  row_count: number | null;
  profiled_at: string | null;
  created_at: string;
  columns?: CatalogColumn[];
}

// ─── Helper: Extract Project Ref ───

export function extractProjectRef(supabaseUrl: string): string {
  // e.g. https://xyzproject.supabase.co -> xyzproject
  try {
    const url = new URL(supabaseUrl);
    const hostname = url.hostname;
    const parts = hostname.split(".");
    return parts[0];
  } catch {
    return "";
  }
}
