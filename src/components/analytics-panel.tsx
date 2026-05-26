'use client'

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  Database,
  Loader2,
  Play,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Table2,
  BarChart3,
  Terminal,
  Layers,
  AlertCircle,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  fullName: string  // DuckDB view name
  location: string  // Iceberg metadata-location (S3 URL)
  rowCount: number | null
}

interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
}

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
  if (t.includes('int') || t.includes('float') || t.includes('double') || t.includes('decimal')) return 'text-blue-500'
  if (t.includes('varchar') || t.includes('text') || t.includes('char') || t.includes('string')) return 'text-brand'
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
  const [s3KeyId, setS3KeyId] = useState(connection?.s3KeyId ?? '')
  const [s3Secret, setS3Secret] = useState(connection?.s3Secret ?? '')
  const [warehouse, setWarehouse] = useState(connection?.s3Warehouse ?? '')

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

  const connRef = useRef<import('@duckdb/duckdb-wasm').AsyncDuckDBConnection | null>(null)

  const projectRef = connection ? extractProjectRef(connection.supabaseUrl) : ''
  const s3Endpoint = `${projectRef}.supabase.co/storage/v1/s3`

  const connect = useCallback(async () => {
    if (!connection) return
    if (!s3KeyId || !s3Secret || !warehouse) {
      toast.error('Enter S3 credentials and warehouse name')
      return
    }

    setPhase('connecting')
    setErrorMsg(null)

    try {
      const db = await getDuckDB()
      const conn = await db.connect()
      connRef.current = conn

      // Load extensions — iceberg_rest is NOT available in WASM; use httpfs + iceberg only
      await conn.query(`INSTALL httpfs; LOAD httpfs;`)
      await conn.query(`INSTALL iceberg; LOAD iceberg;`)

      // S3 secret for Supabase
      await conn.query(`
        CREATE OR REPLACE SECRET supabase_s3 (
          TYPE S3,
          KEY_ID '${s3KeyId}',
          SECRET '${s3Secret}',
          ENDPOINT '${s3Endpoint}',
          URL_STYLE 'path'
        );
      `)

      // Discover tables via S3 glob.
      // DuckDB WASM may not support ** recursive S3 globbing — try fixed-depth patterns instead.
      // Iceberg structure: warehouse/{[namespace/]table}/metadata/00001-xxxx.metadata.json
      const safeWarehouse = warehouse.replace(/'/g, "''")

      const globPatterns = [
        `s3://${safeWarehouse}/*/metadata/*.metadata.json`,
        `s3://${safeWarehouse}/*/*/metadata/*.metadata.json`,
        `s3://${safeWarehouse}/*/*/*/metadata/*.metadata.json`,
        `s3://${safeWarehouse}/*/metadata/*.json`,
        `s3://${safeWarehouse}/*/*/metadata/*.json`,
        `s3://${safeWarehouse}/**/metadata/*.metadata.json`,
      ]

      const allFound: string[] = []
      for (const pattern of globPatterns) {
        try {
          const res = await conn.query(`SELECT file FROM glob('${pattern}') ORDER BY file;`)
          const files = res.toArray()
            .map((r) => { const row = r.toJSON(); return String(row.file ?? row[Object.keys(row)[0]] ?? '') })
            .filter((f) => f && f.includes('/metadata/'))
          allFound.push(...files)
        } catch { /* pattern unsupported or no matches */ }
      }

      // Deduplicate and filter to actual Iceberg metadata files
      const metaFiles = [...new Set(allFound)]
        .filter((f) => f.endsWith('.metadata.json') || /\/metadata\/\d{5}-[a-f0-9-]+\.json$/.test(f))
        .sort()

      if (metaFiles.length === 0) {
        // Diagnostic: list top-level entries to surface what IS in the bucket
        let hint = ''
        try {
          const diagRes = await conn.query(`SELECT file FROM glob('s3://${safeWarehouse}/*') ORDER BY file LIMIT 20;`)
          const top = diagRes.toArray()
            .map((r) => { const row = r.toJSON(); return String(row.file ?? row[Object.keys(row)[0]] ?? '') })
            .filter(Boolean)
          hint = top.length > 0
            ? ` Top-level entries: ${top.slice(0, 5).join(', ')}${top.length > 5 ? '…' : ''}`
            : ' Bucket appears empty or inaccessible — verify credentials.'
        } catch { hint = ' Could not list bucket — check S3 credentials and warehouse name.' }
        throw new Error(`No Iceberg metadata found in s3://${warehouse}/.${hint}`)
      }

      // Deduplicate: last entry per table root = newest version (sorted ascending)
      const tableRoots = new Map<string, string>() // tableRoot → latestMetadataFile
      for (const filePath of metaFiles) {
        const metaIdx = filePath.lastIndexOf('/metadata/')
        if (metaIdx < 0) continue
        tableRoots.set(filePath.substring(0, metaIdx), filePath)
      }

      const tableList: IcebergTable[] = []
      for (const [tableRoot, latestMeta] of tableRoots.entries()) {
        const warehousePrefix = `s3://${warehouse}/`
        const relative = tableRoot.startsWith(warehousePrefix)
          ? tableRoot.slice(warehousePrefix.length)
          : tableRoot
        const parts = relative.split('/').filter(Boolean)
        const tableName = parts[parts.length - 1] ?? tableRoot
        const namespace = parts.length >= 2 ? parts.slice(0, -1).join('.') : 'default'
        const viewName = `${namespace}_${tableName}`.replace(/[^a-z0-9_]/gi, '_')

        try {
          await conn.query(
            `CREATE OR REPLACE VIEW "${viewName}" AS SELECT * FROM iceberg_scan('${latestMeta.replace(/'/g, "''")}');`
          )
        } catch {
          // skip corrupt/empty tables
        }

        tableList.push({ namespace, name: tableName, fullName: viewName, location: latestMeta, rowCount: null })
      }

      // Row counts (best-effort — skip on failure)
      const withCounts = await Promise.all(
        tableList.map(async (t) => {
          try {
            const cr = await conn.query(`SELECT COUNT(*) AS n FROM "${t.fullName}";`)
            const n = cr.toArray()[0]?.toJSON()?.n
            return { ...t, rowCount: typeof n === 'bigint' ? Number(n) : Number(n ?? 0) }
          } catch {
            return t
          }
        })
      )

      setTables(withCounts)

      const firstNs = [...new Set(withCounts.map((t) => t.namespace))]
      if (firstNs.length > 0) setExpandedNamespaces(new Set([firstNs[0]]))

      // Persist S3 creds to connection so they're pre-filled next time
      if (connection) {
        updateConnection(connection.id, { s3KeyId, s3Secret, s3Warehouse: warehouse })
      }

      setPhase('connected')
      toast.success(`Connected — ${withCounts.length} table${withCounts.length !== 1 ? 's' : ''} found`)
    } catch (err) {
      setPhase('error')
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(msg)
      toast.error('Connection failed')
    }
  }, [connection, s3KeyId, s3Secret, warehouse, s3Endpoint, updateConnection])

  const selectTable = useCallback(async (table: IcebergTable) => {
    if (!connRef.current) return
    setSelectedTable(table)
    setIsLoadingTable(true)
    setTableSchema([])
    setPreviewData(null)
    setProfileData(null)

    try {
      const conn = connRef.current

      // Schema
      const descResult = await conn.query(`DESCRIBE SELECT * FROM iceberg_scan('${table.location.replace(/'/g, "''")}');`)
      const cols: IcebergColumn[] = descResult.toArray().map((r) => {
        const row = r.toJSON()
        return {
          name: String(row.column_name ?? row.Field ?? ''),
          type: String(row.column_type ?? row.Type ?? ''),
          nullable: String(row.null ?? row.Null ?? 'YES').toUpperCase() !== 'NO',
        }
      })
      setTableSchema(cols)

      // Preview
      const previewResult = await conn.query(`SELECT * FROM iceberg_scan('${table.location.replace(/'/g, "''")}') LIMIT 100;`)
      const previewRows = previewResult.toArray().map((r) => r.toJSON())
      const previewCols = Object.keys(previewRows[0] ?? {})
      setPreviewData({ columns: previewCols, rows: previewRows })

      // Profile: null %, distinct, min, max per column
      if (cols.length > 0) {
        const total = table.rowCount ?? 1
        const profileCols = cols.slice(0, 20) // cap at 20 cols
        const selects = profileCols.map((c) => {
          const q = `"${c.name}"`
          return [
            `COUNT(${q}) AS "${c.name}_count"`,
            `COUNT(DISTINCT ${q}) AS "${c.name}_distinct"`,
            `MIN(${q})::VARCHAR AS "${c.name}_min"`,
            `MAX(${q})::VARCHAR AS "${c.name}_max"`,
          ].join(', ')
        })
        const profileResult = await conn.query(
          `SELECT COUNT(*) AS total_rows, ${selects.join(', ')} FROM iceberg_scan('${table.location.replace(/'/g, "''")}');`
        )
        const pr = profileResult.toArray()[0]?.toJSON() ?? {}
        const totalRows = Number(pr.total_rows ?? total)
        const profileRows = profileCols.map((c) => ({
          column: c.name,
          type: c.type,
          nullable: c.nullable ? 'YES' : 'NO',
          null_pct: totalRows > 0 ? (((totalRows - Number(pr[`${c.name}_count`] ?? totalRows)) / totalRows) * 100).toFixed(1) + '%' : '—',
          distinct: String(pr[`${c.name}_distinct`] ?? '—'),
          min: String(pr[`${c.name}_min`] ?? '—'),
          max: String(pr[`${c.name}_max`] ?? '—'),
        }))
        setProfileData({ columns: ['column', 'type', 'nullable', 'null_pct', 'distinct', 'min', 'max'], rows: profileRows })
      }
    } catch (err) {
      toast.error(`Failed to load ${table.name}: ${err instanceof Error ? err.message : String(err)}`)
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
              <p><span className="font-medium">S3 endpoint:</span> {s3Endpoint}</p>
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
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tables</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-6" onClick={connect} title="Reconnect / refresh">
              <RefreshCw className="size-3" />
            </Button>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => setPhase('idle')} title="Edit S3 keys / reconnect">
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
                    {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    {ns}
                    <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">{nsTables.length}</Badge>
                  </button>
                  {expanded && nsTables.map((t) => (
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
                <Badge variant="outline" className="text-xs">{selectedTable.namespace}</Badge>
                {selectedTable.rowCount !== null && (
                  <span className="text-xs text-muted-foreground">{selectedTable.rowCount.toLocaleString()} rows</span>
                )}
              </div>
              <TabsList className="ml-auto h-7">
                <TabsTrigger value="preview" className="text-xs px-2 h-6 gap-1">
                  <Table2 className="size-3" />Preview
                </TabsTrigger>
                <TabsTrigger value="profile" className="text-xs px-2 h-6 gap-1">
                  <BarChart3 className="size-3" />Profile
                </TabsTrigger>
                <TabsTrigger value="sql" className="text-xs px-2 h-6 gap-1">
                  <Terminal className="size-3" />SQL
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
                              <TableHead key={c} className="text-xs whitespace-nowrap">{c}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewData.rows.map((row, i) => (
                            <TableRow key={i}>
                              {previewData.columns.map((c) => (
                                <TableCell key={c} className="text-xs font-mono max-w-[200px] truncate">
                                  {formatCell(row[c])}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data</div>
                  )}
                </TabsContent>

                <TabsContent value="profile" className="flex-1 overflow-hidden m-0 p-0">
                  {profileData ? (
                    <ScrollArea className="h-full">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {profileData.columns.map((c) => (
                              <TableHead key={c} className="text-xs capitalize">{c.replace('_', ' ')}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {profileData.rows.map((row, i) => (
                            <TableRow key={i}>
                              {profileData.columns.map((c) => (
                                <TableCell key={c} className={`text-xs font-mono ${c === 'type' ? typeColor(String(row[c])) : ''}`}>
                                  {formatCell(row[c])}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No profile data</div>
                  )}
                </TabsContent>

                <TabsContent value="sql" className="flex flex-col flex-1 overflow-hidden m-0 p-3 gap-3">
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
                    <Button onClick={runSql} disabled={isRunning} size="sm" className="gap-1.5 self-start">
                      {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                      Run
                    </Button>
                  </div>
                  {sqlError && (
                    <div className="text-xs text-destructive bg-destructive/10 rounded p-2 font-mono">{sqlError}</div>
                  )}
                  {sqlResult && (
                    <ScrollArea className="flex-1">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {sqlResult.columns.map((c) => (
                              <TableHead key={c} className="text-xs whitespace-nowrap">{c}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sqlResult.rows.map((row, i) => (
                            <TableRow key={i}>
                              {sqlResult.columns.map((c) => (
                                <TableCell key={c} className="text-xs font-mono max-w-[200px] truncate">
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
              </>
            )}
          </Tabs>
        )}
      </div>
    </div>
  )
}
