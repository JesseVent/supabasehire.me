'use client'

import {
  AlertCircle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Database,
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

interface IcebergColumn {
  name: string
  type: string
  nullable: boolean
}

interface IcebergTable {
  namespace: string
  name: string
  fullName: string // DuckDB view name (created lazily on first select)
  location: string // Iceberg metadata-location (S3 URL)
  rowCount: number | null
  schema: IcebergColumn[] // from catalog API — no DuckDB manifest reads needed
  viewReady: boolean // true once the DuckDB view has been created
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

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'bigint') return val.toString()
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function typeColor(type: string) {
  const t = type.toLowerCase()
  if (t.includes('int') || t.includes('float') || t.includes('double') || t.includes('decimal'))
    return 'text-blue-500'
  if (t.includes('varchar') || t.includes('text') || t.includes('char') || t.includes('string'))
    return 'text-brand'
  if (t.includes('bool')) return 'text-amber-500'
  if (t.includes('date') || t.includes('time') || t.includes('timestamp')) return 'text-violet-500'
  return 'text-muted-foreground'
}

// ─── Component ───

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

  // Pre-filled from saved connection; updated on successful connect
  const [s3KeyId, setS3KeyId] = useState(
    connection?.s3KeyId ?? process.env.NEXT_PUBLIC_S3_KEY_ID ?? ''
  )
  const [s3Secret, setS3Secret] = useState(
    connection?.s3Secret ?? process.env.NEXT_PUBLIC_S3_SECRET ?? ''
  )
  const [warehouse, setWarehouse] = useState(
    connection?.s3Warehouse ?? process.env.NEXT_PUBLIC_S3_WAREHOUSE ?? ''
  )

  const [tables, setTables] = useState<IcebergTable[]>([])
  const [selectedTable, setSelectedTable] = useState<IcebergTable | null>(null)
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(new Set())

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

  const connect = useCallback(async () => {
    if (!connection) return
    if (!s3KeyId || !s3Secret || !warehouse) {
      toast.error('Enter S3 credentials and warehouse name')
      return
    }
    if (connectingRef.current) return
    connectingRef.current = true

    setPhase('connecting')
    setErrorMsg(null)

    if (connection) {
      updateConnection(connection.id, { s3KeyId, s3Secret, s3Warehouse: warehouse })
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
          warehouse,
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
        }>
      }

      if (catalogTables.length === 0) {
        throw new Error(
          `No Iceberg tables found in warehouse "${warehouse}". Verify the analytics bucket name and that tables have been created.`
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
          KEY_ID '${s3KeyId}',
          SECRET '${s3Secret}',
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
        rowCount: null,
        schema: (t.schema ?? []) as IcebergColumn[],
        viewReady: false,
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
  }, [connection, s3KeyId, s3Secret, warehouse, s3Endpoint, updateConnection])

  // Auto-connect when the panel mounts with saved credentials
  useEffect(() => {
    if (phase === 'idle' && s3KeyId && s3Secret && warehouse && connection) {
      connect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

            <Button onClick={connect} className="w-full gap-2">
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
              onClick={connect}
              title="Reconnect / refresh"
            >
              <RefreshCw className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setPhase('idle')}
              title="Edit S3 keys / reconnect"
            >
              <Settings className="size-3" />
            </Button>
          </div>
        </div>
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
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Table2 className="size-8 opacity-30" />
            <p className="text-sm">Select a table to explore</p>
          </div>
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
                                <TableCell
                                  key={c}
                                  className={`text-xs font-mono ${c === 'type' ? typeColor(String(row[c])) : ''}`}
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
                    Postgres runs via Management API (network round-trip). Iceberg runs in DuckDB
                    WASM (S3 reads, in-browser).
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
                                      className="text-[10px] text-blue-500 border-blue-500/30"
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
                                    <span className="text-blue-500">
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
