/**
 * Pure parsers for Iceberg table metadata. Kept out of route.ts because a Next route
 * module may only export handlers.
 */

export interface IcebergTableStats {
  rowCount: number | null
  dataFiles: number | null
  sizeBytes: number | null
  lastUpdatedMs: number | null
  snapshotCount: number | null
  formatVersion: number | null
  partitionFields: string[]
  location: string | null
}

const EMPTY_STATS: IcebergTableStats = {
  rowCount: null,
  dataFiles: null,
  sizeBytes: null,
  lastUpdatedMs: null,
  snapshotCount: null,
  formatVersion: null,
  partitionFields: [],
  location: null,
}

/** Snapshot summary values arrive as strings in the Iceberg spec. */
function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Row counts, file counts and sizes off the current snapshot summary. The catalog already
 * hands us the whole table metadata on loadTableResult — no manifest reads, no extra calls.
 * A table that has never been written to has no snapshot; every field stays null.
 */
export function extractStats(result: Record<string, unknown>): IcebergTableStats {
  try {
    const meta = result['metadata'] as Record<string, unknown> | undefined
    if (!meta) return EMPTY_STATS

    const snapshots = (meta['snapshots'] as Array<Record<string, unknown>> | undefined) ?? []
    const currentId = meta['current-snapshot-id']
    const snapshot =
      snapshots.find((s) => s['snapshot-id'] === currentId) ?? snapshots[snapshots.length - 1]
    const summary = (snapshot?.['summary'] as Record<string, unknown> | undefined) ?? {}

    const specs = (meta['partition-specs'] as Array<Record<string, unknown>> | undefined) ?? []
    const spec = specs.find((s) => s['spec-id'] === (meta['default-spec-id'] ?? 0)) ?? specs[0]
    const specFields = (spec?.['fields'] as Array<{ name?: string }> | undefined) ?? []

    return {
      rowCount: num(summary['total-records']),
      dataFiles: num(summary['total-data-files']),
      sizeBytes: num(summary['total-files-size']),
      lastUpdatedMs: num(meta['last-updated-ms']),
      snapshotCount: snapshots.length,
      formatVersion: num(meta['format-version']),
      partitionFields: specFields.map((f) => f.name).filter((n): n is string => Boolean(n)),
      location: typeof meta['location'] === 'string' ? (meta['location'] as string) : null,
    }
  } catch {
    return EMPTY_STATS
  }
}
