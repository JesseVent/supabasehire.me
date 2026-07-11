/**
 * Client-side project backup.
 *
 * Gathers schema DDL (via Postgres pg_get_*def catalog functions), RLS policies,
 * edge-function source, storage buckets, migration history, and capped row data —
 * then bundles everything into a zip using fflate.
 *
 * All data is fetched through the existing apiFetch routes (OAuth accessToken
 * required for SQL/MCP-backed steps).
 */

import { apiFetch } from '@/lib/api-auth'
import type { SupabaseConnection } from '@/lib/supabase-types'
import { zipSync, type Zippable } from 'fflate'

// ─── Types ───

export interface BackupStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  detail?: string
}

export type ProgressCallback = (steps: BackupStep[]) => void

export interface BackupOptions {
  includeData: boolean
  rowLimit: number
}

export interface BackupResult {
  bytes: Uint8Array
  filename: string
  warnings: string[]
}

export const DEFAULT_BACKUP_OPTIONS: BackupOptions = {
  includeData: true,
  rowLimit: 500,
}

// ─── SQL helper ───

interface SqlRow {
  [key: string]: unknown
}

async function runSql(conn: SupabaseConnection, query: string): Promise<SqlRow[]> {
  const res = await apiFetch('/api/sql', conn, { query })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error || `SQL request failed (${res.status})`)
  }
  if (body.success === false) {
    throw new Error(body.error || 'SQL execution failed')
  }
  return (body.data ?? []) as SqlRow[]
}

// ─── SQL queries ───

/** Non-system schemas that are not Supabase-managed internal temp schemas. */
const SYSTEM_SCHEMAS = "('pg_catalog','information_schema','pg_toast')"

const TABLES_QUERY = /* sql */ `
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ${SYSTEM_SCHEMAS}
  AND n.nspname NOT LIKE 'pg_temp_%'
  AND n.nspname NOT LIKE 'pg_toast_%'
  AND c.relkind IN ('r','p')
ORDER BY n.nspname, c.relname;
`

const COLUMNS_QUERY = /* sql */ `
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  a.attname AS column_name,
  pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
  a.attnotnull AS not_null,
  format_type(a.atttypid, a.atttypmod) AS data_type,
  a.attnum AS ordinal_position
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname NOT IN ${SYSTEM_SCHEMAS}
  AND n.nspname NOT LIKE 'pg_temp_%'
  AND c.relkind IN ('r','p')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY n.nspname, c.relname, a.attnum;
`

const CONSTRAINTS_QUERY = /* sql */ `
SELECT
  n.nspname AS schema_name,
  cl.relname AS table_name,
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname NOT IN ${SYSTEM_SCHEMAS}
ORDER BY n.nspname, cl.relname, con.conname;
`

const INDEXES_QUERY = /* sql */ `
SELECT
  n.nspname AS schema_name,
  cl.relname AS table_name,
  ci.relname AS index_name,
  pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index i
JOIN pg_class cl ON cl.oid = i.indrelid
JOIN pg_class ci ON ci.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname NOT IN ${SYSTEM_SCHEMAS}
ORDER BY n.nspname, cl.relname, ci.relname;
`

const VIEWS_QUERY = /* sql */ `
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  pg_get_viewdef(c.oid, true) AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname NOT IN ${SYSTEM_SCHEMAS}
  AND n.nspname NOT LIKE 'pg_temp_%'
ORDER BY n.nspname, c.relname;
`

const FUNCTIONS_QUERY = /* sql */ `
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ${SYSTEM_SCHEMAS}
  AND n.nspname NOT LIKE 'pg_temp_%'
ORDER BY n.nspname, p.proname;
`

const TRIGGERS_QUERY = /* sql */ `
SELECT
  n.nspname AS schema_name,
  cl.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class cl ON cl.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname NOT IN ${SYSTEM_SCHEMAS}
  AND NOT t.tgisinternal
ORDER BY n.nspname, cl.relname, t.tgname;
`

const MIGRATIONS_QUERY = /* sql */ `
SELECT version, statements
FROM supabase_migrations.schema_migrations
ORDER BY version;
`

// ─── DDL assembly ───

function quoteIdent(name: unknown): string {
  return `"${String(name).replace(/"/g, '""')}"`
}

function buildSchemaSql(parts: {
  columns: SqlRow[]
  constraints: SqlRow[]
  indexes: SqlRow[]
  views: SqlRow[]
  functions: SqlRow[]
  triggers: SqlRow[]
}): string {
  const { columns, constraints, indexes, views, functions, triggers } = parts
  const lines: string[] = []

  lines.push('-- Schema backup')
  lines.push('-- Generated by Supabase DevTool')
  lines.push(`-- Timestamp: ${new Date().toISOString()}`)
  lines.push('')

  // Group columns by table
  const tablesMap = new Map<string, SqlRow[]>()
  for (const col of columns) {
    const key = `${col.schema_name}.${col.table_name}`
    if (!tablesMap.has(key)) tablesMap.set(key, [])
    tablesMap.get(key)?.push(col)
  }

  // CREATE TABLE statements
  lines.push('-- ─── Tables ───')
  lines.push('')
  for (const [key, cols] of tablesMap) {
    const [schema, table] = key.split('.')
    lines.push(`CREATE TABLE IF NOT EXISTS ${quoteIdent(schema)}.${quoteIdent(table)} (`)

    const colDefs = cols.map((col) => {
      const colName = quoteIdent(col.column_name)
      const dataType = String(col.data_type)
      const nullable = col.not_null ? ' NOT NULL' : ''
      const def = col.column_default ? ` DEFAULT ${col.column_default}` : ''
      return `  ${colName} ${dataType}${nullable}${def}`
    })
    lines.push(colDefs.join(',\n'))
    lines.push(');')
    lines.push('')
  }

  // Constraints (ALTER TABLE ADD CONSTRAINT)
  if (constraints.length > 0) {
    lines.push('-- ─── Constraints ───')
    lines.push('')
    for (const con of constraints) {
      const tableRef = `${quoteIdent(con.schema_name)}.${quoteIdent(con.table_name)}`
      lines.push(
        `ALTER TABLE ${tableRef} ADD CONSTRAINT ${quoteIdent(con.constraint_name)} ${con.definition};`,
      )
    }
    lines.push('')
  }

  // Indexes
  if (indexes.length > 0) {
    lines.push('-- ─── Indexes ───')
    lines.push('')
    for (const idx of indexes) {
      lines.push(`${idx.definition};`)
    }
    lines.push('')
  }

  // Views
  if (views.length > 0) {
    lines.push('-- ─── Views ───')
    lines.push('')
    for (const v of views) {
      const viewRef = `${quoteIdent(v.schema_name)}.${quoteIdent(v.view_name)}`
      lines.push(`CREATE OR REPLACE VIEW ${viewRef} AS`)
      lines.push(`  ${String(v.definition).trim()};`)
      lines.push('')
    }
  }

  // Functions
  if (functions.length > 0) {
    lines.push('-- ─── Functions ───')
    lines.push('')
    for (const fn of functions) {
      lines.push(`${String(fn.definition).trim()};`)
      lines.push('')
    }
  }

  // Triggers
  if (triggers.length > 0) {
    lines.push('-- ─── Triggers ───')
    lines.push('')
    for (const tr of triggers) {
      lines.push(`${String(tr.definition).trim()};`)
      lines.push('')
    }
  }

  return lines.join('\n')
}

// ─── Backup orchestration ───

function updateStep(
  steps: BackupStep[],
  id: string,
  status: BackupStep['status'],
  detail: string | undefined,
  onProgress: ProgressCallback,
) {
  const step = steps.find((s) => s.id === id)
  if (step) {
    step.status = status
    step.detail = detail
  }
  onProgress([...steps])
}

export async function createBackup(
  connection: SupabaseConnection,
  options: BackupOptions,
  onProgress: ProgressCallback,
): Promise<BackupResult> {
  const warnings: string[] = []

  const steps: BackupStep[] = [
    { id: 'columns', label: 'Gathering table structure', status: 'pending' },
    { id: 'constraints', label: 'Gathering constraints & indexes', status: 'pending' },
    { id: 'routines', label: 'Gathering views, functions & triggers', status: 'pending' },
    { id: 'migrations', label: 'Gathering migration history', status: 'pending' },
    { id: 'rls', label: 'Gathering RLS policies', status: 'pending' },
    { id: 'edge-functions', label: 'Gathering edge functions', status: 'pending' },
    { id: 'storage', label: 'Gathering storage buckets', status: 'pending' },
    ...(options.includeData
      ? [{ id: 'data', label: `Gathering row data (≤${options.rowLimit}/table)`, status: 'pending' as const }]
      : []),
    { id: 'zip', label: 'Building zip archive', status: 'pending' },
  ]
  onProgress([...steps])

  const files: Zippable = {}

  // Helper that runs a step with error isolation
  async function safe<T>(id: string, fn: () => Promise<T>): Promise<T | undefined> {
    updateStep(steps, id, 'running', undefined, onProgress)
    try {
      const result = await fn()
      updateStep(steps, id, 'done', undefined, onProgress)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`[${id}] ${msg}`)
      updateStep(steps, id, 'error', msg, onProgress)
      return undefined
    }
  }

  // 1. Columns
  const columns = (await safe('columns', () => runSql(connection, COLUMNS_QUERY))) ?? []

  // 2. Constraints + indexes
  const constraints = (await safe('constraints', () => runSql(connection, CONSTRAINTS_QUERY))) ?? []
  const indexes = await safe('indexes', () => runSql(connection, INDEXES_QUERY))
  if (!indexes) {
    // indexes failed but constraints succeeded — keep going
  }

  // 3. Views, functions, triggers
  const views = (await safe('routines', async () => {
    const [v, f, t] = await Promise.all([
      runSql(connection, VIEWS_QUERY),
      runSql(connection, FUNCTIONS_QUERY),
      runSql(connection, TRIGGERS_QUERY),
    ])
    return { views: v, functions: f, triggers: t }
  })) ?? { views: [], functions: [], triggers: [] }

  // Assemble schema.sql
  const schemaSql = buildSchemaSql({
    columns,
    constraints,
    indexes: indexes ?? [],
    views: views.views,
    functions: views.functions,
    triggers: views.triggers,
  })
  files['schema.sql'] = strToU8(schemaSql)

  // 4. Migrations
  const migrations = await safe('migrations', () => runSql(connection, MIGRATIONS_QUERY))
  if (migrations) {
    files['migrations.json'] = strToU8(JSON.stringify(migrations, null, 2))
  }

  // 5. RLS policies
  const rlsData = await safe('rls', async () => {
    const res = await apiFetch('/api/rls', connection)
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || `RLS request failed (${res.status})`)
    return body.tables ?? []
  })
  if (rlsData) {
    files['rls.json'] = strToU8(JSON.stringify(rlsData, null, 2))
    // Also a restorable .sql with ALTER TABLE ... FORCE ROW LEVEL SECURITY + CREATE POLICY
    files['rls.sql'] = strToU8(buildRlsSql(rlsData))
  }

  // 6. Edge functions
  const edgeFns = await safe('edge-functions', async () => {
    const listRes = await apiFetch('/api/edge-functions', connection)
    const listBody = await listRes.json()
    if (!listRes.ok) throw new Error(listBody.error || `Edge functions request failed (${listRes.status})`)
    const fns = listBody.functions ?? []

    const sources: Record<string, string> = {}
    for (const fn of fns) {
      try {
        const codeRes = await apiFetch('/api/edge-functions/code', connection, {
          functionSlug: fn.name,
        })
        const codeBody = await codeRes.json()
        if (codeRes.ok && codeBody.code) {
          sources[fn.name] = codeBody.code
        }
      } catch {
        warnings.push(`[edge-functions] Could not fetch source for "${fn.name}"`)
      }
    }
    return { fns, sources }
  })
  if (edgeFns) {
    files['edge-functions/manifest.json'] = strToU8(JSON.stringify(edgeFns.fns, null, 2))
    for (const [name, code] of Object.entries(edgeFns.sources)) {
      files[`edge-functions/${sanitizeFilename(name)}.ts`] = strToU8(code)
    }
  }

  // 7. Storage buckets
  const buckets = await safe('storage', async () => {
    const res = await apiFetch('/api/storage', connection, { action: 'list-buckets' })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || `Storage request failed (${res.status})`)
    return body.buckets ?? []
  })
  if (buckets) {
    files['storage/buckets.json'] = strToU8(JSON.stringify(buckets, null, 2))
  }

  // 8. Row data (optional)
  if (options.includeData) {
    const dataResult = await safe('data', async () => {
      const tableList = await runSql(connection, TABLES_QUERY)
      const tableFiles: Record<string, SqlRow[]> = {}
      for (const row of tableList) {
        const schema = String(row.schema_name)
        const table = String(row.table_name)
        try {
          const data = await runSql(
            connection,
            `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)} LIMIT ${options.rowLimit};`,
          )
          tableFiles[`${sanitizeFilename(schema)}.${sanitizeFilename(table)}`] = data
        } catch {
          warnings.push(`[data] Could not read ${schema}.${table}`)
        }
      }
      return tableFiles
    })
    if (dataResult) {
      for (const [name, rows] of Object.entries(dataResult)) {
        files[`data/${name}.json`] = strToU8(JSON.stringify(rows, null, 2))
      }
    }
  }

  // Manifest
  files['manifest.json'] = strToU8(
    JSON.stringify(
      {
        projectUrl: connection.supabaseUrl,
        createdAt: new Date().toISOString(),
        options,
        warnings,
        tables: tablesMapKeys(columns),
      },
      null,
      2,
    ),
  )

  // 9. Zip
  updateStep(steps, 'zip', 'running', undefined, onProgress)
  let bytes: Uint8Array
  try {
    bytes = zipSync(files, { level: 6 })
    updateStep(steps, 'zip', 'done', `${Object.keys(files).length} files`, onProgress)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    updateStep(steps, 'zip', 'error', msg, onProgress)
    throw err
  }

  const projectRef = connection.supabaseUrl
    ? extractRef(connection.supabaseUrl)
    : 'supabase'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${projectRef}-backup-${timestamp}.zip`

  return { bytes, filename, warnings }
}

// ─── Helpers ───

function strToU8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function extractRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0]
  } catch {
    return 'supabase'
  }
}

function tablesMapKeys(columns: SqlRow[]): string[] {
  const set = new Set<string>()
  for (const col of columns) {
    set.add(`${col.schema_name}.${col.table_name}`)
  }
  return [...set]
}

function buildRlsSql(tables: SqlRow[]): string {
  const lines: string[] = []
  lines.push('-- RLS policy backup')
  lines.push('-- Generated by Supabase DevTool')
  lines.push(`-- Timestamp: ${new Date().toISOString()}`)
  lines.push('')

  for (const table of tables) {
    const tableName = String(table.tableName)
    lines.push(`-- ${tableName}`)
    if (table.rlsEnabled) {
      lines.push(`ALTER TABLE ${quoteIdent(tableName)} ENABLE ROW LEVEL SECURITY;`)
    }
    const policies = (table.policies ?? []) as SqlRow[]
    for (const p of policies) {
      const cmd = String(p.cmd || '').toUpperCase()
      const roles = String(p.roles || 'public')
      const policyName = quoteIdent(p.policyname)
      const using = p.qual ? `\n  USING (${p.qual})` : ''
      const check = p.with_check ? `\n  WITH CHECK (${p.with_check})` : ''
      lines.push(
        `CREATE POLICY ${policyName} ON ${quoteIdent(tableName)}\n  AS ${String(p.permissive || 'PERMISSIVE').toUpperCase()}\n  FOR ${cmd || 'ALL'}\n  TO ${roles}${using}${check};`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}
