/// <reference types="bun-types" />
import { expect, test } from 'bun:test'
import { buildLogsQuery, MAX_WINDOW_MS, mapSeverity, normalizeLogRow } from './logs-sql'

test('per-service queries filter by source; "all" does not', () => {
  const one = buildLogsQuery({ service: 'edge-functions', limit: 50 })
  expect(one.sql).toContain("source in ('function_edge_logs', 'function_logs')")
  expect(one.sql).toContain('limit 50')
  expect(buildLogsQuery({ service: 'all', limit: 10 }).sql).not.toContain('source in')
})

test('search filter is escaped, not interpolated raw', () => {
  const q = buildLogsQuery({ service: 'all', limit: 10, filter: "o'brien" })
  expect(q.sql).toContain("positionCaseInsensitive(event_message, 'o\\'brien')")
})

test('trace correlation queries the attribute keys, and rejects a non-hex id', () => {
  const q = buildLogsQuery({ service: 'all', limit: 10, traceId: 'A'.repeat(32) })
  expect(q.sql).toContain(`log_attributes['trace_id'] = '${'a'.repeat(32)}'`)
  expect(q.sql).toContain('request.headers.traceparent')
  expect(() => buildLogsQuery({ service: 'all', limit: 10, traceId: "'; drop--" })).toThrow()
})

test('a window wider than 24h is clamped instead of rejected by the API', () => {
  const end = '2026-09-01T12:00:00.000Z'
  const q = buildLogsQuery({
    service: 'all',
    limit: 10,
    startTime: '2026-08-20T00:00:00.000Z',
    endTime: end,
  })
  expect(q.iso_timestamp_end).toBe(end)
  expect(Date.parse(end) - Date.parse(q.iso_timestamp_start!)).toBe(MAX_WINDOW_MS)
})

test('rows normalize to LogEntry, with naive timestamps read as UTC', () => {
  const entry = normalizeLogRow(
    {
      id: 'abc',
      timestamp: '2026-09-01T07:20:47.057000',
      event_message: 'checkpoint complete',
      severity_text: 'LOG',
      source: 'postgres_logs',
      log_attributes: { 'parsed.query_id': '7' },
    },
    0
  )
  expect(entry?.timestamp).toBe('2026-09-01T07:20:47.057Z')
  expect(entry?.service).toBe('postgres')
  expect(entry?.severity).toBe('INFO')
  expect(entry?.metadata['parsed.query_id']).toBe('7')
  expect(normalizeLogRow(null, 0)).toBeNull()
})

test('severity maps the values the stream actually emits', () => {
  expect(mapSeverity('FATAL')).toBe('ERROR')
  expect(mapSeverity('WARNING')).toBe('WARN')
  expect(mapSeverity('LOG')).toBe('INFO')
  expect(mapSeverity(undefined)).toBe('UNKNOWN')
})
