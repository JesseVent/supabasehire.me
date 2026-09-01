/// <reference types="bun-types" />
import { expect, test } from 'bun:test'
import { extractStats } from './metadata'

// Shape of the LoadTableResult Supabase's Iceberg REST catalog returns.
const loaded = {
  'metadata-location': 's3://wh/ns/t/metadata/00003.metadata.json',
  metadata: {
    'format-version': 2,
    location: 's3://wh/ns/t',
    'last-updated-ms': 1756700000000,
    'current-snapshot-id': 222,
    'default-spec-id': 1,
    'partition-specs': [
      { 'spec-id': 0, fields: [] },
      { 'spec-id': 1, fields: [{ name: 'day' }, { name: 'region' }] },
    ],
    snapshots: [
      { 'snapshot-id': 111, summary: { 'total-records': '5' } },
      {
        'snapshot-id': 222,
        summary: { 'total-records': '4200', 'total-data-files': '7', 'total-files-size': '918273' },
      },
    ],
  },
}

test('reads the current snapshot, not the latest in the array', () => {
  const s = extractStats(loaded as unknown as Record<string, unknown>)
  expect(s.rowCount).toBe(4200)
  expect(s.dataFiles).toBe(7)
  expect(s.sizeBytes).toBe(918273)
  expect(s.lastUpdatedMs).toBe(1756700000000)
  expect(s.snapshotCount).toBe(2)
  expect(s.formatVersion).toBe(2)
  expect(s.partitionFields).toEqual(['day', 'region'])
  expect(s.location).toBe('s3://wh/ns/t')
})

test('a never-written table yields nulls, not zeros or throws', () => {
  const s = extractStats({ metadata: { 'format-version': 2, snapshots: [] } })
  expect(s.rowCount).toBeNull()
  expect(s.sizeBytes).toBeNull()
  expect(s.partitionFields).toEqual([])
  expect(extractStats({}).rowCount).toBeNull()
})
