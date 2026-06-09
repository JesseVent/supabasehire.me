'use client'

import {
  ChevronLeft,
  ChevronRight,
  Database,
  FileIcon,
  Info,
  Loader2,
  Play,
  Terminal,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { apiFetch } from '@/lib/api-auth'

// ─── Types ───

interface ColumnSchema {
  name: string
  type: string
}

interface QueryResult {
  columns: ColumnSchema[]
  rows: Record<string, unknown>[]
  rowCount: number
  totalRows: number
}

interface ParquetViewerProps {
  open: boolean
  onClose: () => void
  connection: import('@/lib/supabase-types').SupabaseConnection
  bucket: string
  filePath: string
  fileName: string
}

// ─── DuckDB singleton (reused across opens) ───

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

const PAGE_SIZE = 100

function formatCellValue(val: unknown, colType?: string): string {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'bigint') return val.toString()
  if (val instanceof Date) return val.toISOString().replace('T', ' ').slice(0, 19)
  // Arrow returns Date32/Timestamp values as milliseconds since epoch
  if (typeof val === 'number' && Number.isFinite(val) && colType) {
    const t = colType.toLowerCase()
    if (t.includes('date') || t.includes('timestamp')) {
      const d = new Date(val)
      if (!isNaN(d.getTime())) {
        return t.includes('date') && !t.includes('timestamp')
          ? d.toISOString().slice(0, 10)
          : d.toISOString().replace('T', ' ').slice(0, 19)
      }
    }
  }
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function inferTypeColor(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('int') || t.includes('float') || t.includes('double') || t.includes('decimal'))
    return 'text-blue-500'
  if (t.includes('varchar') || t.includes('text') || t.includes('char')) return 'text-brand'
  if (t.includes('bool')) return 'text-amber-500'
  if (t.includes('date') || t.includes('time') || t.includes('timestamp')) return 'text-violet-500'
  return 'text-muted-foreground'
}

export function ParquetViewer({
  open,
  onClose,
  connection,
  bucket,
  filePath,
  fileName,
}: ParquetViewerProps) {
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'loading-db' | 'ready' | 'error'>(
    'idle'
  )
  const [error, setError] = useState<string | null>(null)
  const [schema, setSchema] = useState<ColumnSchema[]>([])
  const [previewResult, setPreviewResult] = useState<QueryResult | null>(null)
  const [customSql, setCustomSql] = useState('')
  const [customResult, setCustomResult] = useState<QueryResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [page, setPage] = useState(0)
  const connRef = useRef<import('@duckdb/duckdb-wasm').AsyncDuckDBConnection | null>(null)
  const fileRef = useRef<string | null>(null)

  const loadFile = useCallback(async () => {
    setPhase('downloading')
    setError(null)
    setSchema([])
    setPreviewResult(null)
    setCustomResult(null)
    setPage(0)

    try {
      // 1. Download via proxy
      const res = await apiFetch('/api/storage/download', connection, { bucket, path: filePath })
      if (!res.ok) {
        let errMsg = 'Download failed'
        try {
          const d = await res.json()
          errMsg = d.error || errMsg
        } catch {
          errMsg = `Download failed with status ${res.status}`
        }
        throw new Error(errMsg)
      }
      const buffer = await res.arrayBuffer()

      // 2. Init DuckDB WASM
      setPhase('loading-db')
      const db = await getDuckDB()

      // 3. Register file buffer and open connection
      const fname = `preview_${Date.now()}.parquet`
      await db.registerFileBuffer(fname, new Uint8Array(buffer))
      fileRef.current = fname

      if (connRef.current) {
        await connRef.current.close()
      }
      const conn = await db.connect()
      connRef.current = conn

      // 4. Load schema
      const schemaResult = await conn.query(`DESCRIBE SELECT * FROM read_parquet('${fname}')`)
      const cols: ColumnSchema[] = []
      for (const row of schemaResult) {
        cols.push({
          name: String(row.column_name ?? row[0] ?? ''),
          type: String(row.column_type ?? row[1] ?? ''),
        })
      }
      setSchema(cols)

      // 5. Row count + first page preview
      const countResult = await conn.query(`SELECT COUNT(*) AS n FROM read_parquet('${fname}')`)
      const totalRows = Number(countResult.toArray()[0]?.n ?? 0)

      const previewData = await conn.query(
        `SELECT * FROM read_parquet('${fname}') LIMIT ${PAGE_SIZE} OFFSET 0`
      )
      const rows = previewData
        .toArray()
        .map((r) => Object.fromEntries(cols.map((c) => [c.name, r[c.name]])))

      setPreviewResult({ columns: cols, rows, rowCount: rows.length, totalRows })
      setCustomSql(`SELECT *\nFROM read_parquet('${fname}')\nLIMIT 50`)
      setPhase('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [connection, bucket, filePath])

  useEffect(() => {
    if (open) loadFile()
    return () => {
      // cleanup connection on close but keep DB alive
      connRef.current?.close()
      connRef.current = null
    }
  }, [open, loadFile])

  const runCustomQuery = useCallback(async () => {
    if (!connRef.current || !fileRef.current || isRunning) return
    setIsRunning(true)
    setCustomResult(null)
    try {
      const result = await connRef.current.query(customSql)
      const colNames = result.schema.fields.map((f) => f.name)
      const cols: ColumnSchema[] = result.schema.fields.map((f) => ({
        name: f.name,
        type: f.type.toString(),
      }))
      const rows = result.toArray().map((r) => Object.fromEntries(colNames.map((c) => [c, r[c]])))
      setCustomResult({ columns: cols, rows, rowCount: rows.length, totalRows: rows.length })
    } catch (err) {
      toast.error('Query error', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsRunning(false)
    }
  }, [customSql, isRunning])

  const goToPage = useCallback(
    async (newPage: number) => {
      if (!connRef.current || !fileRef.current || !previewResult) return
      const fname = fileRef.current
      const offset = newPage * PAGE_SIZE
      try {
        const data = await connRef.current.query(
          `SELECT * FROM read_parquet('${fname}') LIMIT ${PAGE_SIZE} OFFSET ${offset}`
        )
        const cols = previewResult.columns
        const rows = data
          .toArray()
          .map((r) => Object.fromEntries(cols.map((c) => [c.name, r[c.name]])))
        setPreviewResult((prev) => (prev ? { ...prev, rows, rowCount: rows.length } : null))
        setPage(newPage)
      } catch (err) {
        toast.error('Pagination error', {
          description: err instanceof Error ? err.message : String(err),
        })
      }
    },
    [previewResult]
  )

  const totalPages = previewResult ? Math.ceil(previewResult.totalRows / PAGE_SIZE) : 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        style={{ width: '90vw', maxWidth: '90vw' }}
        className="max-h-[90vh] flex flex-col p-0 gap-0"
      >
        <DialogDescription className="sr-only">
          Preview and query Parquet file contents
        </DialogDescription>
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileIcon className="size-4 text-primary shrink-0" />
            <DialogTitle className="font-mono text-sm truncate">{fileName}</DialogTitle>
            <Badge variant="outline" className="text-[10px] shrink-0">
              Parquet
            </Badge>
            {previewResult && (
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {previewResult.totalRows.toLocaleString()} rows
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" className="size-7 p-0 shrink-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </DialogHeader>

        {/* Loading / error states */}
        {(phase === 'downloading' || phase === 'loading-db') && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {phase === 'downloading' ? 'Downloading file…' : 'Initializing DuckDB WASM…'}
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <p className="text-sm text-destructive font-medium">Failed to load file</p>
            <p className="text-xs text-muted-foreground max-w-md text-center">{error}</p>
            <Button size="sm" onClick={loadFile}>
              Retry
            </Button>
          </div>
        )}

        {phase === 'ready' && previewResult && (
          <Tabs defaultValue="preview" className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pt-2 border-b flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="preview" className="gap-1.5">
                  <Database className="size-3.5" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="schema" className="gap-1.5">
                  <Info className="size-3.5" />
                  Schema
                </TabsTrigger>
                <TabsTrigger value="sql" className="gap-1.5">
                  <Play className="size-3.5" />
                  SQL
                </TabsTrigger>
              </TabsList>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 pb-1">
                <Terminal className="size-3" />
                Run DuckDB SQL directly against this file
              </p>
            </div>

            {/* ── Preview tab ── */}
            <TabsContent value="preview" className="flex-1 flex flex-col min-h-0 m-0">
              <ScrollArea className="flex-1 min-h-0">
                <div className="min-w-max">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        {previewResult.columns.map((col) => (
                          <TableHead key={col.name} className="text-xs whitespace-nowrap py-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">{col.name}</span>
                              <span className={`text-[10px] font-mono ${inferTypeColor(col.type)}`}>
                                {col.type}
                              </span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewResult.rows.map((row, i) => (
                        <TableRow key={i}>
                          {previewResult.columns.map((col) => {
                            const raw = formatCellValue(row[col.name], col.type)
                            const isNull = raw === 'NULL'
                            return (
                              <TooltipProvider key={col.name} delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <TableCell
                                      className={`text-xs font-mono py-1.5 whitespace-nowrap max-w-[240px] truncate cursor-default ${isNull ? 'text-muted-foreground/50 italic' : ''}`}
                                    >
                                      {raw}
                                    </TableCell>
                                  </TooltipTrigger>
                                  {raw.length > 20 && (
                                    <TooltipContent
                                      side="bottom"
                                      className="max-w-[400px] break-all font-mono text-xs"
                                    >
                                      {raw}
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              {/* Pagination — always visible so total row count is always surfaced */}
              <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
                <span>
                  Rows {page * PAGE_SIZE + 1}–
                  {Math.min((page + 1) * PAGE_SIZE, previewResult.totalRows)} of{' '}
                  {previewResult.totalRows.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="size-3" />
                  </Button>
                  <span className="px-2">
                    Page {page + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= totalPages - 1}
                  >
                    <ChevronRight className="size-3" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ── Schema tab ── */}
            <TabsContent value="schema" className="flex-1 min-h-0 m-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Column</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schema.map((col, i) => (
                    <TableRow key={col.name}>
                      <TableCell className="text-xs text-muted-foreground py-1.5">
                        {i + 1}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-medium py-1.5">
                        {col.name}
                      </TableCell>
                      <TableCell className={`text-xs font-mono py-1.5 ${inferTypeColor(col.type)}`}>
                        {col.type}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            {/* ── SQL tab ── */}
            <TabsContent value="sql" className="flex-1 flex flex-col min-h-0 m-0">
              <div className="flex flex-col gap-2 p-3 border-b">
                <Textarea
                  value={customSql}
                  onChange={(e) => setCustomSql(e.target.value)}
                  className="font-mono text-xs resize-none h-28"
                  placeholder="SELECT * FROM read_parquet('file.parquet') LIMIT 50"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      runCustomQuery()
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Use{' '}
                    <code className="font-mono bg-muted px-1 rounded">
                      read_parquet(&apos;{fileRef.current || 'file.parquet'}&apos;)
                    </code>{' '}
                    in your query. ⌘↵ to run.
                  </p>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={runCustomQuery}
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    Run
                  </Button>
                </div>
              </div>
              {customResult && (
                <ScrollArea className="flex-1 min-h-0">
                  <div className="min-w-max">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          {customResult.columns.map((col) => (
                            <TableHead key={col.name} className="text-xs whitespace-nowrap py-2">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium">{col.name}</span>
                                <span
                                  className={`text-[10px] font-mono ${inferTypeColor(col.type)}`}
                                >
                                  {col.type}
                                </span>
                              </div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customResult.rows.map((row, i) => (
                          <TableRow key={i}>
                            {customResult.columns.map((col) => (
                              <TableCell
                                key={col.name}
                                className="text-xs font-mono py-1.5 whitespace-nowrap max-w-[240px] truncate"
                              >
                                {formatCellValue(row[col.name], col.type)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              )}
              {customResult && (
                <div className="px-4 py-2 border-t text-xs text-muted-foreground">
                  {customResult.rowCount.toLocaleString()} row
                  {customResult.rowCount !== 1 ? 's' : ''}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
