'use client'

import {
  AlertCircle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock,
  Columns3,
  Database,
  Files,
  HardDrive,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Settings,
  Table2,
  Terminal,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatTile } from '@/components/ui/stat-tile'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api-auth'
import { extractProjectRef, type SupabaseConnection } from '@/lib/supabase-types'
import { useSupabaseStore } from '@/store/supabase-store'

// ─── Types ───

/** Iceberg FDW settings read back off the connected project (see /api/iceberg/config). */
interface ProjectIcebergConfig {
  server: string
  warehouse: string
  catalogUri: string | null
  s3KeyId: string
  s3Secret: string
}

interface IcebergColumn {
  name: string
  type: string
  nullable: boolean
}

/** Current-snapshot stats read off the table metadata the catalog already returns. */
interface IcebergTableStats {
  rowCount: number | null
  dataFiles: number | null
  sizeBytes: number | null
  lastUpdatedMs: number | null
  snapshotCount: number | null
  formatVersion: number | null
  partitionFields: string[]
  location: string | null
}

interface IcebergTable {
  namespace: string
  name: string
  fullName: string // DuckDB view name (created lazily on first select)
  location: string // Iceberg metadata-location (S3 URL)
  rowCount: number | null
  schema: IcebergColumn[] // from catalog API — no DuckDB manifest reads needed
  viewReady: boolean // true once the DuckDB view has been created
  stats: IcebergTableStats
}

interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
}

interface BenchResult {
  label: string
  pgMs: number | null
  icebergMs: number | null
  pgRows: number
  icebergRows: number
  pgError?: string
  icebergError?: string
}

const BENCH_QUERIES: { label: string; sql: (t: string) => string }[] = [
  { label: 'COUNT(*)', sql: (t) => `SELECT COUNT(*) FROM ${t}` },
  { label: 'Sample 100', sql: (t) => `SELECT * FROM ${t} LIMIT 100` },
  { label: 'Sample 1 000', sql: (t) => `SELECT * FROM ${t} LIMIT 1000` },
  { label: 'Sample 5 000', sql: (t) => `SELECT * FROM ${t} LIMIT 5000` },
]

// ─── DuckDB singleton ───

let dbInstance: import('@duckdb/duckdb-wasm').AsyncDuckDB | null = null
let dbInitPromise: Promise<import('@duckdb/duckdb-wasm').AsyncDuckDB> | null = null

async function getDuckDB() {
  if (dbInstance) return dbInstance
  if (dbInitPromise) return dbInitPromise
  dbInitPromise = (async () => {
    const duckdb = await import('@duckdb/duckdb-wasm')
    const bundles = duckdb.getJsDelivrBundles()
    const bundle = await duckdb.selectBundle(bundles)
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
    )
    const worker = new Worker(workerUrl)
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING)
    const db = new duckdb.AsyncDuckDB(logger, worker)
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
    URL.revokeObjectURL(workerUrl)
    dbInstance = db
    return db
  })()
  return dbInitPromise
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

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}

function formatCount(n: number | null): string {
  return n === null ? '—' : n.toLocaleString()
}

/** Tile-sized number: 6,714,200 → 6.7M, so a big warehouse doesn't overflow the card. */
function formatCompact(n: number | null): string {
  if (n === null) return '—'
  return n < 1000
    ? String(n)
    : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function formatAge(ms: number | null): string {
  if (!ms) return '—'
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'bigint') return val.toString()
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

// ─── Component ───

const LS_KEY = 'iceberg-settings'

function readLsSettings() {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(sessionStorage.getItem(LS_KEY) ?? '{}') as {
      s3KeyId?: string
      warehouse?: string
    }
  } catch {
    return {}
  }
}

function saveLsSettings(vals: { s3KeyId: string; warehouse: string }) {
  try {
    sessionStorage.setItem(LS_KEY, JSON.stringify(vals))
  } catch {}
}

export function AnalyticsPanel({
  connection,
  isDemoMode = false,
}: {
  connection: SupabaseConnection | null
  isDemoMode?: boolean
}) {
  const updateConnection = useSupabaseStore((s) => s.updateConnection)

  const [phase, setPhase] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const resolveField = (
    connVal: string | null | undefined,
    envVal: string | undefined,
    lsVal?: string | undefined
  ) => connVal || envVal || lsVal || ''

  const ls = readLsSettings()
  const [s3KeyId, setS3KeyId] = useState(
    resolveField(connection?.s3KeyId, process.env.NEXT_PUBLIC_S3_KEY_ID, ls.s3KeyId)
  )
  const [s3Secret, setS3Secret] = useState(
    resolveField(connection?.s3Secret, process.env.NEXT_PUBLIC_S3_SECRET)
  )
  const [warehouse, setWarehouse] = useState(
    resolveField(connection?.s3Warehouse, process.env.NEXT_PUBLIC_S3_WAREHOUSE, ls.warehouse)
  )

  // Name of the foreign server the credentials came from, when the project supplied them
  // instead of the user typing them.
  const [sourcedFromProject, setSourcedFromProject] = useState<string | null>(null)

  const [tables, setTables] = useState<IcebergTable[]>([])
  const [selectedTable, setSelectedTable] = useState<IcebergTable | null>(null)
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(new Set())

  // Sync form fields when the active connection changes
  const prevConnId = useRef<string | undefined>(connection?.id)
  useEffect(() => {
    if (connection?.id === prevConnId.current) return
    prevConnId.current = connection?.id
    const ls2 = readLsSettings()
    setS3KeyId(resolveField(connection?.s3KeyId, process.env.NEXT_PUBLIC_S3_KEY_ID, ls2.s3KeyId))
    setS3Secret(resolveField(connection?.s3Secret, process.env.NEXT_PUBLIC_S3_SECRET))
    setWarehouse(
      resolveField(connection?.s3Warehouse, process.env.NEXT_PUBLIC_S3_WAREHOUSE, ls2.warehouse)
    )
    setPhase('idle')
    setTables([])
    setSelectedTable(null)
  }, [connection?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const [tableSchema, setTableSchema] = useState<IcebergColumn[]>([])
  const [previewData, setPreviewData] = useState<QueryResult | null>(null)
  const [profileData, setProfileData] = useState<QueryResult | null>(null)
  const [isLoadingTable, setIsLoadingTable] = useState(false)

  const [sql, setSql] = useState('')
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null)
  const [sqlError, setSqlError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const [benchPgTable, setBenchPgTable] = useState('')
  const [benchResults, setBenchResults] = useState<BenchResult[]>([])
  const [isBenchmarking, setIsBenchmarking] = useState(false)

  const connRef = useRef<import('@duckdb/duckdb-wasm').AsyncDuckDBConnection | null>(null)
  const connectingRef = useRef(false)

  const projectRef = connection ? extractProjectRef(connection.supabaseUrl) : ''
  // Supabase storage S3 endpoint — use the storage subdomain (same host as the Iceberg catalog)
  const s3Endpoint = `${projectRef}.storage.supabase.co/storage/v1/s3`

  // `creds` lets a caller connect with values it just fetched, without waiting a render
  // for the form state to catch up. `source` names the foreign server they came from.
  const connect = useCallback(
    async (creds?: { s3KeyId: string; s3Secret: string; warehouse: string; source: string }) => {
      if (!connection) return
      const keyId = creds?.s3KeyId ?? s3KeyId
      const secret = creds?.s3Secret ?? s3Secret
      const bucket = creds?.warehouse ?? warehouse
      const fromProject = creds?.source ?? sourcedFromProject
      if (!keyId || !secret || !bucket) {
        toast.error('Enter S3 credentials and warehouse name')
        return
      }
      if (connectingRef.current) return
      connectingRef.current = true

      setPhase('connecting')
      setErrorMsg(null)

      // Credentials the project already holds stay there — copying them into localStorage
      // would widen their blast radius for nothing.
      if (!fromProject) {
        updateConnection(connection.id, { s3KeyId: keyId, s3Secret: secret, s3Warehouse: bucket })
        saveLsSettings({ s3KeyId: keyId, warehouse: bucket })
      }

      try {
        // Discover tables via Iceberg REST catalog (server-side, avoids CORS + S3 glob fragility).
        // Pass both serviceRoleKey and accessToken — the route prefers a real eyJ... JWT and will
        // fall back to fetching one via the Management API when the key is opaque (sb_secret_...).
        const catalogRes = await fetch('/api/iceberg/tables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supabaseUrl: connection.supabaseUrl,
            serviceRoleKey: connection.serviceRoleKey,
            accessToken: connection.accessToken,
            warehouse: bucket,
          }),
        })

        if (!catalogRes.ok) {
          const err = (await catalogRes.json()) as { error?: string; catalogUrl?: string }
          throw new Error(
            `Iceberg catalog error: ${err.error ?? catalogRes.statusText}${err.catalogUrl ? ` (${err.catalogUrl})` : ''}`
          )
        }

        const { tables: catalogTables } = (await catalogRes.json()) as {
          tables: Array<{
            namespace: string
            name: string
            metadataLocation: string
            schema: Array<{ name: string; type: string; nullable: boolean }>
            stats?: Partial<IcebergTableStats>
          }>
        }

        if (catalogTables.length === 0) {
          throw new Error(
            `No Iceberg tables found in warehouse "${bucket}". Verify the analytics bucket name and that tables have been created.`
          )
        }

        // Set up DuckDB WASM with S3 credentials for data reads
        const db = await getDuckDB()
        const conn = await db.connect()
        connRef.current = conn

        await conn.query(`INSTALL httpfs; LOAD httpfs;`)
        await conn.query(`INSTALL iceberg; LOAD iceberg;`)

        await conn.query(`
        CREATE OR REPLACE SECRET supabase_s3 (
          TYPE S3,
          KEY_ID '${keyId}',
          SECRET '${secret}',
          ENDPOINT '${s3Endpoint}',
          URL_STYLE 'path'
        );
      `)

        // Build table list from catalog metadata — no DuckDB view creation yet.
        // Views are created lazily in selectTable() to avoid reading manifests for
        // every table at connect time.
        const tableList: IcebergTable[] = catalogTables.map((t) => ({
          namespace: t.namespace,
          name: t.name,
          fullName: `${t.namespace}_${t.name}`.replace(/[^a-z0-9_]/gi, '_'),
          location: t.metadataLocation,
          rowCount: t.stats?.rowCount ?? null,
          schema: (t.schema ?? []) as IcebergColumn[],
          viewReady: false,
          stats: { ...EMPTY_STATS, ...t.stats },
        }))

        setTables(tableList)

        const firstNs = [...new Set(tableList.map((t) => t.namespace))]
        if (firstNs.length > 0) setExpandedNamespaces(new Set([firstNs[0]]))

        setPhase('connected')
        toast.success(
          `Connected — ${tableList.length} table${tableList.length !== 1 ? 's' : ''} found`
        )
      } catch (err) {
        setPhase('error')
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMsg(msg)
        toast.error('Connection failed')
      } finally {
        connectingRef.current = false
      }
    },
    [connection, s3KeyId, s3Secret, warehouse, sourcedFromProject, s3Endpoint, updateConnection]
  )

  // On mount and whenever the connection changes: connect with whatever credentials we
  // already have, else ask the project for them. A project with an Iceberg FDW keeps the
  // warehouse and S3 keys itself, so there is nothing to prompt for.
  const bootstrapRef = useRef<string | null>(null)
  useEffect(() => {
    if (!connection || phase !== 'idle') return
    if (bootstrapRef.current === connection.id) return
    bootstrapRef.current = connection.id

    if (s3KeyId && s3Secret && warehouse) {
      connect()
      return
    }
    if (!connection.accessToken) return

    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/iceberg/config', connection, {})
        if (!res.ok || cancelled) return
        const { configs } = (await res.json()) as { configs?: ProjectIcebergConfig[] }
        const cfg = configs?.[0]
        if (!cfg || cancelled) return
        setWarehouse(cfg.warehouse)
        setS3KeyId(cfg.s3KeyId)
        setS3Secret(cfg.s3Secret)
        setSourcedFromProject(cfg.server)
        void connect({
          s3KeyId: cfg.s3KeyId,
          s3Secret: cfg.s3Secret,
          warehouse: cfg.warehouse,
          source: cfg.server,
        })
      } catch {
        // No project-side config — the form below asks for the values instead.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connection, phase, s3KeyId, s3Secret, warehouse, connect])

  const selectTable = useCallback(async (table: IcebergTable) => {
    if (!connRef.current) return
    setSelectedTable(table)
    setIsLoadingTable(true)
    setTableSchema([])
    setPreviewData(null)
    setProfileData(null)

    try {
      const conn = connRef.current
      const view = `"${table.fullName}"`

      // Create the DuckDB view on first access (lazy — avoids manifest reads at connect time).
      if (!table.viewReady) {
        await conn.query(
          `CREATE OR REPLACE VIEW ${view} AS SELECT * FROM iceberg_scan('${table.location.replace(/'/g, "''")}');`
        )
        setTables((prev) =>
          prev.map((t) => (t.fullName === table.fullName ? { ...t, viewReady: true } : t))
        )
      }

      // Schema — use catalog metadata when available (zero extra S3 reads).
      // Fall back to DESCRIBE only if the catalog didn't return fields.
      let cols: IcebergColumn[] = table.schema.length > 0 ? table.schema : []
      if (cols.length === 0) {
        const descResult = await conn.query(`DESCRIBE ${view};`)
        cols = descResult.toArray().map((r) => {
          const row = r.toJSON()
          return {
            name: String(row.column_name ?? row.Field ?? ''),
            type: String(row.column_type ?? row.Type ?? ''),
            nullable: String(row.null ?? row.Null ?? 'YES').toUpperCase() !== 'NO',
          }
        })
      }
      setTableSchema(cols)

      // Preview — one page only (LIMIT 100 from the view, reads at most one data file)
      const previewResult = await conn.query(`SELECT * FROM ${view} LIMIT 100;`)
      const previewRows = previewResult.toArray().map((r) => r.toJSON())
      const previewCols = Object.keys(previewRows[0] ?? {})
      setPreviewData({ columns: previewCols, rows: previewRows })

      // Profile — computed entirely from the in-memory sample; zero additional S3 reads.
      if (cols.length > 0 && previewRows.length > 0) {
        const sampleSize = previewRows.length
        const profileCols = cols.slice(0, 20)
        const profileRows = profileCols.map((c) => {
          const values = previewRows
            .map((r) => r[c.name])
            .filter((v) => v !== null && v !== undefined)
          const nullCount = sampleSize - values.length
          const distinct = new Set(values.map(String)).size
          const sorted = [...values].sort((a, b) =>
            String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
          )
          return {
            column: c.name,
            type: c.type,
            nullable: c.nullable ? 'YES' : 'NO',
            null_pct: ((nullCount / sampleSize) * 100).toFixed(1) + '% (sample)',
            distinct: String(distinct) + (sampleSize < 100 ? '' : '+'),
            min: sorted.length > 0 ? String(sorted[0]) : '—',
            max: sorted.length > 0 ? String(sorted[sorted.length - 1]) : '—',
          }
        })
        setProfileData({
          columns: ['column', 'type', 'nullable', 'null_pct', 'distinct', 'min', 'max'],
          rows: profileRows,
        })
      }
    } catch (err) {
      toast.error(
        `Failed to load ${table.name}: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setIsLoadingTable(false)
    }
  }, [])

  const runSql = useCallback(async () => {
    if (!connRef.current || !sql.trim()) return
    setIsRunning(true)
    setSqlError(null)
    setSqlResult(null)
    try {
      const result = await connRef.current.query(sql)
      const rows = result.toArray().map((r) => r.toJSON())
      const columns = Object.keys(rows[0] ?? {})
      setSqlResult({ columns, rows })
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRunning(false)
    }
  }, [sql])

  const runBenchmark = useCallback(async () => {
    if (!connRef.current || !connection || !selectedTable) return
    const pgTable = benchPgTable.trim() || selectedTable.name
    const icebergTable = `"${selectedTable.fullName}"`

    setIsBenchmarking(true)
    setBenchResults([])

    const results: BenchResult[] = []

    for (const q of BENCH_QUERIES) {
      const pgSql = q.sql(pgTable)
      const icebergSql = q.sql(icebergTable)

      // Postgres via Management API
      let pgMs: number | null = null
      let pgRows = 0
      let pgError: string | undefined
      try {
        const t0 = performance.now()
        const res = await apiFetch('/api/sql', connection, { query: pgSql })
        const data = await res.json()
        pgMs = performance.now() - t0
        if (data.success) {
          pgRows = Array.isArray(data.data) ? data.data.length : 0
        } else {
          pgError = data.error ?? 'Query failed'
        }
      } catch (err) {
        pgError = err instanceof Error ? err.message : String(err)
      }

      // Iceberg via DuckDB WASM
      let icebergMs: number | null = null
      let icebergRows = 0
      let icebergError: string | undefined
      try {
        const t0 = performance.now()
        const result = await connRef.current.query(icebergSql)
        icebergMs = performance.now() - t0
        icebergRows = result.numRows
      } catch (err) {
        icebergError = err instanceof Error ? err.message : String(err)
      }

      results.push({ label: q.label, pgMs, icebergMs, pgRows, icebergRows, pgError, icebergError })
      setBenchResults([...results]) // stream results in as they complete
    }

    setIsBenchmarking(false)
  }, [connection, selectedTable, benchPgTable])

  // ─── Render: setup screen ───

  if (isDemoMode) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Layers className="size-10 opacity-30" />
        <p className="text-sm">Analytics Buckets require a real Supabase connection.</p>
      </div>
    )
  }

  if (!connection) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Database className="size-10 opacity-30" />
        <p className="text-sm">No connection selected.</p>
      </div>
    )
  }

  if (phase === 'idle' || phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="size-4" />
              Connect to Analytics Bucket
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Queries Supabase Iceberg tables via DuckDB WASM — no data leaves your browser.
            </p>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Warehouse (Analytics Bucket name)</Label>
                <Input
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  placeholder="omop-iceberg"
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">S3 Access Key ID</Label>
                <Input
                  value={s3KeyId}
                  onChange={(e) => setS3KeyId(e.target.value)}
                  placeholder="9d3634df..."
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">S3 Secret Access Key</Label>
                <Input
                  type="password"
                  value={s3Secret}
                  onChange={(e) => setS3Secret(e.target.value)}
                  placeholder="••••••••"
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>

            {phase === 'error' && errorMsg && (
              <div className="flex items-start gap-2 text-destructive text-xs bg-destructive/10 rounded p-2">
                <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                <span className="break-all">{errorMsg}</span>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              <p>
                <span className="font-medium">S3 endpoint:</span> {s3Endpoint}
              </p>
            </div>

            <Button onClick={() => void connect()} className="w-full gap-2">
              <Database className="size-3.5" />
              Connect
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (phase === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-sm">Connecting to Iceberg catalog…</p>
        <p className="text-xs opacity-60">Scanning S3 bucket for Iceberg metadata files…</p>
      </div>
    )
  }

  // ─── Render: connected ───

  const namespaces = [...new Set(tables.map((t) => t.namespace))]

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar: table list */}
      <div className="w-56 shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Tables
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => void connect()}
              title="Reconnect / refresh"
            >
              <RefreshCw className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => {
                // Editing by hand takes the credentials out of the project's hands, so
                // they persist like any typed value from here on.
                setSourcedFromProject(null)
                setPhase('idle')
              }}
              title="Edit S3 keys / reconnect"
            >
              <Settings className="size-3" />
            </Button>
          </div>
        </div>
        {sourcedFromProject && (
          <p
            className="px-3 py-1.5 border-b text-[10px] text-muted-foreground truncate"
            title={`Warehouse and S3 keys read from ${sourcedFromProject} and this project's vault — not stored in the browser.`}
          >
            Credentials from project vault
            <span className="font-mono"> ({sourcedFromProject})</span>
          </p>
        )}
        <ScrollArea className="flex-1">
          <div className="p-1">
            {namespaces.map((ns) => {
              const nsTables = tables.filter((t) => t.namespace === ns)
              const expanded = expandedNamespaces.has(ns)
              return (
                <div key={ns}>
                  <button
                    className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      const next = new Set(expandedNamespaces)
                      expanded ? next.delete(ns) : next.add(ns)
                      setExpandedNamespaces(next)
                    }}
                  >
                    {expanded ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                    {ns}
                    <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">
                      {nsTables.length}
                    </Badge>
                  </button>
                  {expanded &&
                    nsTables.map((t) => (
                      <button
                        key={t.name}
                        className={`flex items-center gap-1.5 w-full pl-6 pr-2 py-1 rounded text-xs transition-colors ${
                          selectedTable?.name === t.name && selectedTable?.namespace === t.namespace
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-foreground/70 hover:bg-muted/50 hover:text-foreground'
                        }`}
                        onClick={() => selectTable(t)}
                      >
                        <Table2 className="size-3 shrink-0" />
                        <span className="truncate">{t.name}</span>
                        {t.rowCount !== null && (
                          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                            {t.rowCount.toLocaleString()}
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedTable ? (
          <IcebergOverview
            tables={tables}
            warehouse={warehouse}
            catalogHost={`${projectRef}.storage.supabase.co`}
            sourcedFromProject={sourcedFromProject}
            onReconnect={() => void connect()}
            onSelect={selectTable}
            onOpenNamespace={(ns) => setExpandedNamespaces(new Set([...expandedNamespaces, ns]))}
          />
        ) : (
          <Tabs defaultValue="preview" className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0">
              <div className="flex items-center gap-2">
                <Table2 className="size-4 text-muted-foreground" />
                <span className="font-medium text-sm">{selectedTable.name}</span>
                <Badge variant="outline" className="text-xs">
                  {selectedTable.namespace}
                </Badge>
                {selectedTable.rowCount !== null && (
                  <span className="text-xs text-muted-foreground">
                    {selectedTable.rowCount.toLocaleString()} rows
                  </span>
                )}
              </div>
              <TabsList className="ml-auto h-7">
                <TabsTrigger value="preview" className="text-xs px-2 h-6 gap-1">
                  <Table2 className="size-3" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="profile" className="text-xs px-2 h-6 gap-1">
                  <BarChart3 className="size-3" />
                  Profile
                </TabsTrigger>
                <TabsTrigger value="sql" className="text-xs px-2 h-6 gap-1">
                  <Terminal className="size-3" />
                  SQL
                </TabsTrigger>
                <TabsTrigger value="benchmark" className="text-xs px-2 h-6 gap-1">
                  <Zap className="size-3" />
                  Benchmark
                </TabsTrigger>
              </TabsList>
            </div>

            {isLoadingTable ? (
              <div className="flex items-center justify-center flex-1 gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : (
              <>
                <TabsContent value="preview" className="flex-1 overflow-hidden m-0 p-0">
                  {previewData && previewData.rows.length > 0 ? (
                    <ScrollArea className="h-full">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {previewData.columns.map((c) => (
                              <TableHead key={c} className="text-xs whitespace-nowrap">
                                {c}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewData.rows.map((row, i) => (
                            <TableRow key={i}>
                              {previewData.columns.map((c) => (
                                <TableCell
                                  key={c}
                                  className="text-xs font-mono max-w-[200px] truncate"
                                >
                                  {formatCell(row[c])}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      No data
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="profile" className="flex-1 overflow-hidden m-0 p-0">
                  {profileData ? (
                    <ScrollArea className="h-full">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {profileData.columns.map((c) => (
                              <TableHead key={c} className="text-xs capitalize">
                                {c.replace('_', ' ')}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {profileData.rows.map((row, i) => (
                            <TableRow key={i}>
                              {profileData.columns.map((c) => (
                                <TableCell key={c} className="text-xs font-mono">
                                  {formatCell(row[c])}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      No profile data
                    </div>
                  )}
                </TabsContent>

                <TabsContent
                  value="sql"
                  className="flex flex-col flex-1 overflow-hidden m-0 p-3 gap-3"
                >
                  <div className="flex gap-2">
                    <Textarea
                      value={sql}
                      onChange={(e) => setSql(e.target.value)}
                      placeholder={`SELECT * FROM "${selectedTable.fullName}" LIMIT 50;`}
                      className="flex-1 font-mono text-xs resize-none min-h-[80px]"
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runSql()
                      }}
                    />
                    <Button
                      onClick={runSql}
                      disabled={isRunning}
                      size="sm"
                      className="gap-1.5 self-start"
                    >
                      {isRunning ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                      Run
                    </Button>
                  </div>
                  {sqlError && (
                    <div className="text-xs text-destructive bg-destructive/10 rounded p-2 font-mono">
                      {sqlError}
                    </div>
                  )}
                  {sqlResult && (
                    <ScrollArea className="flex-1">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {sqlResult.columns.map((c) => (
                              <TableHead key={c} className="text-xs whitespace-nowrap">
                                {c}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sqlResult.rows.map((row, i) => (
                            <TableRow key={i}>
                              {sqlResult.columns.map((c) => (
                                <TableCell
                                  key={c}
                                  className="text-xs font-mono max-w-[200px] truncate"
                                >
                                  {formatCell(row[c])}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </TabsContent>

                <TabsContent
                  value="benchmark"
                  className="flex flex-col flex-1 overflow-hidden m-0 p-3 gap-3"
                >
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 grid gap-1.5">
                      <Label className="text-xs">Postgres table name</Label>
                      <Input
                        value={benchPgTable}
                        onChange={(e) => setBenchPgTable(e.target.value)}
                        placeholder={selectedTable.name}
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                    <Button
                      onClick={runBenchmark}
                      disabled={isBenchmarking}
                      size="sm"
                      className="gap-1.5 shrink-0"
                    >
                      {isBenchmarking ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Zap className="size-3.5" />
                      )}
                      Run Benchmark
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground -mt-1">
                    ⚠️ Not apples-to-apples: Postgres time includes client→server→Management API→DB
                    round-trip latency. DuckDB WASM runs locally (only S3 reads are measured).
                    Iceberg will appear faster on small queries due to proxy overhead, not raw
                    throughput. Use for relative comparison only.
                  </p>

                  {benchResults.length > 0 && (
                    <ScrollArea className="flex-1">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-28">Query</TableHead>
                            <TableHead className="text-xs">Postgres</TableHead>
                            <TableHead className="text-xs">Iceberg (DuckDB)</TableHead>
                            <TableHead className="text-xs w-20">Faster</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {benchResults.map((r, i) => {
                            const bothOk = r.pgMs !== null && r.icebergMs !== null
                            const maxMs = bothOk ? Math.max(r.pgMs!, r.icebergMs!) : 1
                            const pgWins = bothOk && r.pgMs! < r.icebergMs!
                            const iceWins = bothOk && r.icebergMs! < r.pgMs!
                            return (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-medium py-3">
                                  {r.label}
                                </TableCell>

                                <TableCell className="text-xs py-3">
                                  {r.pgError ? (
                                    <span className="text-destructive font-mono text-[10px]">
                                      {r.pgError.slice(0, 60)}
                                    </span>
                                  ) : r.pgMs !== null ? (
                                    <div className="flex flex-col gap-1">
                                      <span
                                        className={`font-mono font-semibold ${pgWins ? 'text-brand' : ''}`}
                                      >
                                        {r.pgMs < 1000
                                          ? `${r.pgMs.toFixed(0)} ms`
                                          : `${(r.pgMs / 1000).toFixed(2)} s`}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <div className="h-1.5 w-24 rounded bg-muted overflow-hidden">
                                          <div
                                            className={`h-full rounded transition-all ${pgWins ? 'bg-brand' : 'bg-muted-foreground/40'}`}
                                            style={{ width: `${(r.pgMs / maxMs) * 100}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">
                                          {r.pgRows > 0 ? `${r.pgRows.toLocaleString()} rows` : ''}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <Loader2 className="size-3 animate-spin text-muted-foreground" />
                                  )}
                                </TableCell>

                                <TableCell className="text-xs py-3">
                                  {r.icebergError ? (
                                    <span className="text-destructive font-mono text-[10px]">
                                      {r.icebergError.slice(0, 60)}
                                    </span>
                                  ) : r.icebergMs !== null ? (
                                    <div className="flex flex-col gap-1">
                                      <span
                                        className={`font-mono font-semibold ${iceWins ? 'text-brand' : ''}`}
                                      >
                                        {r.icebergMs < 1000
                                          ? `${r.icebergMs.toFixed(0)} ms`
                                          : `${(r.icebergMs / 1000).toFixed(2)} s`}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <div className="h-1.5 w-24 rounded bg-muted overflow-hidden">
                                          <div
                                            className={`h-full rounded transition-all ${iceWins ? 'bg-brand' : 'bg-muted-foreground/40'}`}
                                            style={{ width: `${(r.icebergMs / maxMs) * 100}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">
                                          {r.icebergRows > 0
                                            ? `${r.icebergRows.toLocaleString()} rows`
                                            : ''}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <Loader2 className="size-3 animate-spin text-muted-foreground" />
                                  )}
                                </TableCell>

                                <TableCell className="text-xs py-3">
                                  {pgWins && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-muted-foreground border-border"
                                    >
                                      PG
                                    </Badge>
                                  )}
                                  {iceWins && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-brand border-brand/30"
                                    >
                                      Iceberg
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>

                      {!isBenchmarking &&
                        benchResults.length === BENCH_QUERIES.length &&
                        (() => {
                          const pgWins = benchResults.filter(
                            (r) => r.pgMs !== null && r.icebergMs !== null && r.pgMs < r.icebergMs
                          ).length
                          const iceWins = benchResults.filter(
                            (r) => r.pgMs !== null && r.icebergMs !== null && r.icebergMs < r.pgMs
                          ).length
                          const validResults = benchResults.filter(
                            (r) => r.pgMs !== null && r.icebergMs !== null
                          )
                          const avgPg = validResults.length
                            ? validResults.reduce((s, r) => s + r.pgMs!, 0) / validResults.length
                            : null
                          const avgIce = validResults.length
                            ? validResults.reduce((s, r) => s + r.icebergMs!, 0) /
                              validResults.length
                            : null
                          return (
                            <div className="mx-4 my-3 p-3 rounded-lg border bg-muted/30 flex items-center gap-6 text-xs">
                              <div>
                                <span className="text-muted-foreground">Avg Postgres</span>
                                <p className="font-mono font-semibold text-sm mt-0.5">
                                  {avgPg !== null ? `${avgPg.toFixed(0)} ms` : '—'}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Avg Iceberg</span>
                                <p className="font-mono font-semibold text-sm mt-0.5">
                                  {avgIce !== null ? `${avgIce.toFixed(0)} ms` : '—'}
                                </p>
                              </div>
                              <div className="ml-auto text-right">
                                <span className="text-muted-foreground">Overall winner</span>
                                <p className="font-semibold mt-0.5">
                                  {pgWins > iceWins ? (
                                    <span className="text-foreground">
                                      Postgres ({pgWins}/{validResults.length})
                                    </span>
                                  ) : iceWins > pgWins ? (
                                    <span className="text-brand">
                                      Iceberg ({iceWins}/{validResults.length})
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">Tied</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          )
                        })()}
                    </ScrollArea>
                  )}

                  {isBenchmarking && benchResults.length === 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="size-4 animate-spin" />
                      Running queries…
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </Tabs>
        )}
      </div>
    </div>
  )
}

// ─── Overview (landing screen once connected, before a table is picked) ───

function sumStat(
  tables: IcebergTable[],
  key: 'rowCount' | 'sizeBytes' | 'dataFiles'
): number | null {
  const vals = tables.map((t) => t.stats[key]).filter((v): v is number => v !== null)
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0)
}

function IcebergOverview({
  tables,
  warehouse,
  catalogHost,
  sourcedFromProject,
  onReconnect,
  onSelect,
  onOpenNamespace,
}: {
  tables: IcebergTable[]
  warehouse: string
  catalogHost: string
  sourcedFromProject: string | null
  onReconnect: () => void
  onSelect: (t: IcebergTable) => void
  onOpenNamespace: (ns: string) => void
}) {
  const namespaces = [...new Set(tables.map((t) => t.namespace))]
  const totalRows = sumStat(tables, 'rowCount')
  const totalBytes = sumStat(tables, 'sizeBytes')
  const totalFiles = sumStat(tables, 'dataFiles')
  const totalColumns = tables.reduce((n, t) => n + t.schema.length, 0)

  const largest = [...tables]
    .filter((t) => t.stats.rowCount !== null || t.stats.sizeBytes !== null)
    .sort((a, b) => (b.stats.rowCount ?? 0) - (a.stats.rowCount ?? 0))
    .slice(0, 8)
  const maxRows = largest[0]?.stats.rowCount ?? 0

  const recent = [...tables]
    .filter((t) => t.stats.lastUpdatedMs !== null)
    .sort((a, b) => (b.stats.lastUpdatedMs ?? 0) - (a.stats.lastUpdatedMs ?? 0))
    .slice(0, 5)

  const partitioned = tables.filter((t) => t.stats.partitionFields.length > 0).length
  const empty = tables.filter((t) => t.stats.rowCount === 0).length

  return (
    <ScrollArea className="h-full">
      <div className="p-6 flex flex-col gap-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border bg-muted/40 p-2">
              <Layers className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">
                {warehouse || 'Analytics bucket'}
              </h2>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {catalogHost}/storage/v1/iceberg
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <Badge variant="secondary" className="text-[10px] h-5">
                  Apache Iceberg
                </Badge>
                <Badge variant="secondary" className="text-[10px] h-5">
                  DuckDB WASM · in-browser
                </Badge>
                {sourcedFromProject && (
                  <Badge variant="outline" className="text-[10px] h-5 font-mono">
                    vault: {sourcedFromProject}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={onReconnect}>
            <RefreshCw className="size-3.5" />
            Refresh catalog
          </Button>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
          <StatTile label="Tables" value={tables.length} icon={Table2} />
          <StatTile label="Namespaces" value={namespaces.length} icon={Database} />
          <StatTile
            label="Rows"
            value={formatCompact(totalRows)}
            icon={BarChart3}
            className={totalRows === null ? undefined : 'tabular-nums'}
          />
          <StatTile label="Size" value={formatBytes(totalBytes)} icon={HardDrive} />
          <StatTile label="Data files" value={formatCompact(totalFiles)} icon={Files} />
          <StatTile label="Columns" value={formatCompact(totalColumns)} icon={Columns3} />
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Largest tables */}
          <Card className="lg:col-span-2 gap-0 py-4">
            <CardHeader className="px-4 pb-3">
              <CardTitle className="text-sm">Largest tables</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              {largest.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No snapshot statistics yet — these tables have not been written to.
                </p>
              ) : (
                <div className="flex flex-col">
                  {largest.map((t) => (
                    <button
                      key={`${t.namespace}.${t.name}`}
                      onClick={() => onSelect(t)}
                      className="group flex items-center gap-3 py-1.5 text-left rounded hover:bg-muted/50 px-2 -mx-2 transition-colors"
                    >
                      <Table2 className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium truncate w-44 shrink-0 group-hover:text-primary transition-colors">
                        {t.name}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{
                            width: `${maxRows > 0 ? Math.max(2, ((t.stats.rowCount ?? 0) / maxRows) * 100) : 2}%`,
                          }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-muted-foreground w-20 text-right shrink-0">
                        {formatCount(t.stats.rowCount)}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground w-16 text-right shrink-0">
                        {formatBytes(t.stats.sizeBytes)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Namespaces */}
          <Card className="gap-0 py-4">
            <CardHeader className="px-4 pb-3">
              <CardTitle className="text-sm">Namespaces</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <div className="flex flex-col">
                {namespaces.map((ns) => {
                  const nsTables = tables.filter((t) => t.namespace === ns)
                  return (
                    <button
                      key={ns}
                      onClick={() => onOpenNamespace(ns)}
                      className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded text-left hover:bg-muted/50 transition-colors"
                    >
                      <Database className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium truncate">{ns}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {nsTables.length} · {formatCount(sumStat(nsTables, 'rowCount'))}
                      </span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Recently updated */}
          <Card className="lg:col-span-2 gap-0 py-4">
            <CardHeader className="px-4 pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Clock className="size-3.5 text-muted-foreground" />
                Recently updated
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              {recent.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No snapshot history available.</p>
              ) : (
                <div className="flex flex-col">
                  {recent.map((t) => (
                    <button
                      key={`${t.namespace}.${t.name}`}
                      onClick={() => onSelect(t)}
                      className="group flex items-center gap-2 py-1.5 px-2 -mx-2 rounded text-left hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                        {t.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate">
                        {t.namespace}
                      </span>
                      {t.stats.partitionFields.length > 0 && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono">
                          {t.stats.partitionFields.join(', ')}
                        </Badge>
                      )}
                      <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                        {formatAge(t.stats.lastUpdatedMs)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Catalog shape */}
          <Card className="gap-0 py-4">
            <CardHeader className="px-4 pb-3">
              <CardTitle className="text-sm">Catalog</CardTitle>
            </CardHeader>
            <CardContent className="px-4 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Partitioned tables</span>
                <span className="tabular-nums">
                  {partitioned} / {tables.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Empty tables</span>
                <span className="tabular-nums">{empty}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg columns/table</span>
                <span className="tabular-nums">
                  {tables.length > 0 ? Math.round(totalColumns / tables.length) : 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Format version</span>
                <span className="tabular-nums font-mono">
                  v{tables.find((t) => t.stats.formatVersion !== null)?.stats.formatVersion ?? '—'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t mt-1.5 leading-relaxed">
                Pick a table to preview rows, profile columns, run SQL, or benchmark it against
                Postgres. Queries execute in your browser — no data reaches a server.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  )
}
