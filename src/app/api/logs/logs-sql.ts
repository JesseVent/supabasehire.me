import type { LogEntry, LogService } from '@/lib/supabase-types'

/**
 * Query builder + row normalizer for the Supabase MCP `query_logs` tool, which runs read-only
 * ClickHouse SQL against one unified `logs` table. Kept out of route.ts because a Next route
 * module may only export handlers.
 *
 * Columns: id, timestamp, event_message, severity_text, source, log_attributes (Map).
 * `select *` is rejected by the backend — always name columns.
 */

/** Every source the unified stream exposes, discovered via `select distinct source from logs`. */
export const ALL_SOURCES = [
  'postgres_logs',
  'edge_logs',
  'function_edge_logs',
  'function_logs',
  'postgrest_logs',
  'realtime_logs',
  'storage_logs',
  'pgbouncer_logs',
  'auth_logs',
  'auth_audit_logs',
] as const

const SERVICE_TO_SOURCES: Record<LogService, readonly string[]> = {
  all: ALL_SOURCES,
  postgres: ['postgres_logs'],
  api: ['edge_logs', 'postgrest_logs'],
  auth: ['auth_logs', 'auth_audit_logs'],
  'edge-functions': ['function_edge_logs', 'function_logs'],
  storage: ['storage_logs'],
  realtime: ['realtime_logs'],
}

const SOURCE_TO_SERVICE: Record<string, LogService> = {
  postgres_logs: 'postgres',
  pgbouncer_logs: 'postgres',
  edge_logs: 'api',
  postgrest_logs: 'api',
  auth_logs: 'auth',
  auth_audit_logs: 'auth',
  function_edge_logs: 'edge-functions',
  function_logs: 'edge-functions',
  storage_logs: 'storage',
  realtime_logs: 'realtime',
}

export const MAX_WINDOW_MS = 24 * 60 * 60 * 1000

/** ClickHouse string literal. The only values that ever reach SQL are escaped here. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export interface LogsQueryArgs {
  sql: string
  iso_timestamp_start?: string
  iso_timestamp_end?: string
}

export interface BuildLogsQueryInput {
  service: LogService
  limit: number
  filter?: string
  /** Correlated mode: a W3C trace id (32 lowercase hex). Anything else is rejected. */
  traceId?: string
  startTime?: string
  endTime?: string
}

export function buildLogsQuery(input: BuildLogsQueryInput): LogsQueryArgs {
  const conditions: string[] = []

  if (input.traceId) {
    if (!/^[0-9a-f]{32}$/i.test(input.traceId)) {
      throw new Error('traceId must be a 32-character hex W3C trace id')
    }
    const id = input.traceId.toLowerCase()
    // Correlated mode spans every source: the id rides the request through the gateway
    // into edge functions, and lands in different attribute keys along the way.
    conditions.push(
      `(log_attributes['trace_id'] = ${quote(id)} or ` +
        `log_attributes['traceId'] = ${quote(id)} or ` +
        `log_attributes['req.traceId'] = ${quote(id)} or ` +
        `log_attributes['otel_trace_id'] = ${quote(id)} or ` +
        `position(log_attributes['request.headers.traceparent'], ${quote(id)}) > 0)`
    )
  } else {
    const sources = SERVICE_TO_SOURCES[input.service] ?? ALL_SOURCES
    if (sources !== ALL_SOURCES) {
      conditions.push(`source in (${sources.map(quote).join(', ')})`)
    }
  }

  const filter = input.filter?.trim()
  if (filter) {
    conditions.push(`positionCaseInsensitive(event_message, ${quote(filter)}) > 0`)
  }

  const where = conditions.length > 0 ? `\nwhere ${conditions.join('\n  and ')}` : ''
  const limit = Math.min(Math.max(Math.trunc(input.limit) || 1, 1), 1000)

  const sql =
    'select id, timestamp, event_message, severity_text, source, log_attributes\n' +
    `from logs${where}\norder by timestamp desc\nlimit ${limit}`

  return { sql, ...buildWindow(input.startTime, input.endTime) }
}

/**
 * The API caps the window at 24h and rejects anything wider, so clamp the start rather than
 * letting a stale saved range fail the whole query.
 */
export function buildWindow(
  startTime?: string,
  endTime?: string
): { iso_timestamp_start?: string; iso_timestamp_end?: string } {
  const endMs = endTime ? Date.parse(endTime) : Number.NaN
  const startMs = startTime ? Date.parse(startTime) : Number.NaN
  if (Number.isNaN(startMs) && Number.isNaN(endMs)) return {}

  const end = Number.isNaN(endMs) ? Date.now() : endMs
  const start = Number.isNaN(startMs) ? end - MAX_WINDOW_MS : Math.max(startMs, end - MAX_WINDOW_MS)

  return {
    iso_timestamp_start: new Date(start).toISOString(),
    iso_timestamp_end: new Date(end).toISOString(),
  }
}

interface RawLogRow {
  id?: string
  timestamp?: string
  event_message?: string
  severity_text?: string
  source?: string
  log_attributes?: Record<string, unknown>
}

/** ClickHouse returns naive UTC (`2026-09-01T07:20:47.057000`); Date.parse would read it as local. */
function toIso(timestamp: string | undefined): string {
  if (!timestamp) return new Date().toISOString()
  if (/(Z|[+-]\d\d:?\d\d)$/.test(timestamp)) return timestamp
  const parsed = new Date(`${timestamp}Z`)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

export function mapSeverity(severityText: string | undefined): LogEntry['severity'] {
  switch (severityText?.toUpperCase()) {
    case 'ERROR':
    case 'FATAL':
    case 'PANIC':
    case 'CRITICAL':
      return 'ERROR'
    case 'WARN':
    case 'WARNING':
      return 'WARN'
    case 'INFO':
    case 'LOG':
    case 'NOTICE':
      return 'INFO'
    case 'DEBUG':
      return 'DEBUG'
    default:
      return 'UNKNOWN'
  }
}

export function normalizeLogRow(raw: unknown, index: number): LogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as RawLogRow

  const attributes =
    row.log_attributes && typeof row.log_attributes === 'object' ? row.log_attributes : {}

  return {
    id: String(row.id ?? `${row.timestamp ?? 'log'}-${index}`),
    timestamp: toIso(row.timestamp),
    service: SOURCE_TO_SERVICE[row.source ?? ''] ?? 'all',
    severity: mapSeverity(row.severity_text),
    message: String(row.event_message ?? ''),
    // `source` last: some sources carry their own `source` attribute, and the column wins.
    metadata: { ...attributes, source: row.source },
    raw: row as Record<string, unknown>,
  }
}
