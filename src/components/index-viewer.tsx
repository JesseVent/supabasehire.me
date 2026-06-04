'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Database,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  HardDrive,
  Activity,
  Filter,
  Key,
  RefreshCw,
  Loader2,
  Info,
  FlaskConical,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useSupabaseStore } from '@/store/supabase-store'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { cn } from '@/lib/utils'

// ─── Types ───

interface IndexInfo {
  tableName: string
  indexName: string
  columns: string[]
  type: string
  unique: boolean
  scans: number
  tuplesRead: number
  tuplesFetched: number
  size: string
}

type SortField = 'scans' | 'size' | 'name'
type SortDirection = 'asc' | 'desc'

// API response shape
interface ApiIndexRow {
  schemaname?: string
  tablename: string
  indexname: string
  scans: number
  tuples_read: number
  tuples_fetched: number
  size: string
  is_unused: boolean
}

interface ApiIndexesResponse {
  indexes: ApiIndexRow[]
  _meta?: {
    limited: boolean
    note: string
  }
  error?: string
}

// ─── Demo Data ───

const DEMO_INDEXES: IndexInfo[] = [
  { tableName: 'users', indexName: 'users_pkey', columns: ['id'], type: 'btree', unique: true, scans: 4520, tuplesRead: 45200, tuplesFetched: 4520, size: '856 kB' },
  { tableName: 'users', indexName: 'users_email_idx', columns: ['email'], type: 'btree', unique: true, scans: 12400, tuplesRead: 124000, tuplesFetched: 12400, size: '1.2 MB' },
  { tableName: 'posts', indexName: 'posts_pkey', columns: ['id'], type: 'btree', unique: true, scans: 8900, tuplesRead: 89000, tuplesFetched: 8900, size: '2.4 MB' },
  { tableName: 'posts', indexName: 'posts_user_id_idx', columns: ['user_id'], type: 'btree', unique: false, scans: 6700, tuplesRead: 67000, tuplesFetched: 6700, size: '1.8 MB' },
  { tableName: 'posts', indexName: 'posts_created_at_idx', columns: ['created_at'], type: 'btree', unique: false, scans: 3200, tuplesRead: 32000, tuplesFetched: 3200, size: '1.5 MB' },
  { tableName: 'comments', indexName: 'comments_pkey', columns: ['id'], type: 'btree', unique: true, scans: 5600, tuplesRead: 56000, tuplesFetched: 5600, size: '1.1 MB' },
  { tableName: 'comments', indexName: 'comments_post_id_idx', columns: ['post_id'], type: 'btree', unique: false, scans: 7800, tuplesRead: 78000, tuplesFetched: 7800, size: '1.3 MB' },
  { tableName: 'likes', indexName: 'likes_pkey', columns: ['id'], type: 'btree', unique: true, scans: 2400, tuplesRead: 24000, tuplesFetched: 2400, size: '624 kB' },
  { tableName: 'likes', indexName: 'likes_user_post_idx', columns: ['user_id', 'post_id'], type: 'btree', unique: true, scans: 9800, tuplesRead: 98000, tuplesFetched: 9800, size: '1.6 MB' },
  { tableName: 'notifications', indexName: 'notifications_pkey', columns: ['id'], type: 'btree', unique: true, scans: 0, tuplesRead: 0, tuplesFetched: 0, size: '256 kB' },
  { tableName: 'notifications', indexName: 'notifications_user_id_idx', columns: ['user_id'], type: 'btree', unique: false, scans: 0, tuplesRead: 0, tuplesFetched: 0, size: '384 kB' },
  { tableName: 'audit_logs', indexName: 'audit_logs_pkey', columns: ['id'], type: 'btree', unique: true, scans: 150, tuplesRead: 1500, tuplesFetched: 150, size: '448 kB' },
  { tableName: 'audit_logs', indexName: 'audit_logs_created_at_idx', columns: ['created_at'], type: 'btree', unique: false, scans: 0, tuplesRead: 0, tuplesFetched: 0, size: '320 kB' },
  { tableName: 'categories', indexName: 'categories_slug_idx', columns: ['slug'], type: 'hash', unique: true, scans: 420, tuplesRead: 4200, tuplesFetched: 420, size: '128 kB' },
]

// ─── Helpers ───

function parseSizeToBytes(size: string): number {
  const match = size.match(/^([\d.]+)\s*(kB|MB|GB|TB)?$/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = (match[2] || 'kB').toUpperCase()
  switch (unit) {
    case 'TB': return value * 1024 * 1024 * 1024 * 1024
    case 'GB': return value * 1024 * 1024 * 1024
    case 'MB': return value * 1024 * 1024
    case 'KB':
    case 'KB': return value * 1024
    default: return value
  }
}

function formatNumber(num: number): string {
  return num.toLocaleString()
}

/**
 * Derive whether an index is unique from its name pattern.
 * Primary keys and unique constraints follow naming conventions in PostgreSQL:
 *  - <table>_pkey → primary key (unique)
 *  - <table>_<col>_key or *_uniq* or *_unique* → unique index
 */
function deriveUniqueFromName(indexName: string): boolean {
  const lower = indexName.toLowerCase()
  return lower.endsWith('_pkey') || lower.endsWith('_key') || lower.includes('_uniq') || lower.includes('_unique')
}

/**
 * Derive index type from naming patterns.
 * Primary keys and most indexes are btree by default in PostgreSQL.
 * Names containing "hash" suggest a hash index.
 */
function deriveTypeFromName(indexName: string): string {
  const lower = indexName.toLowerCase()
  if (lower.includes('_hash_') || lower.includes('_hash')) return 'hash'
  if (lower.includes('_gin_') || lower.includes('_gin')) return 'gin'
  if (lower.includes('_gist_') || lower.includes('_gist')) return 'gist'
  if (lower.includes('_spgist_') || lower.includes('_spgist')) return 'spgist'
  if (lower.includes('_brin_') || lower.includes('_brin')) return 'brin'
  return 'btree'
}

/**
 * Map API index row to IndexInfo interface.
 * columns and type are not available from the API, so we derive what we can.
 */
function mapApiRowToIndexInfo(row: ApiIndexRow): IndexInfo {
  return {
    tableName: row.tablename,
    indexName: row.indexname,
    columns: [], // Not available from pg_stat_user_indexes
    type: deriveTypeFromName(row.indexname),
    unique: deriveUniqueFromName(row.indexname),
    scans: Number(row.scans) || 0,
    tuplesRead: Number(row.tuples_read) || 0,
    tuplesFetched: Number(row.tuples_fetched) || 0,
    size: row.size || '0 kB',
  }
}

// ─── Chart Config ───

const chartConfig: ChartConfig = {
  scans: {
    label: 'Index Scans',
    color: 'hsl(160, 60%, 45%)',
  },
}

// ─── Component ───

export function IndexViewer() {
  const { activeConnectionId, connections } = useSupabaseStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null
  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID

  // Data state
  const [indexes, setIndexes] = useState<IndexInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metaNote, setMetaNote] = useState<string | null>(null)
  const [isLimited, setIsLimited] = useState(false)

  // Filter state
  const [tableFilter, setTableFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Sort state
  const [sortField, setSortField] = useState<SortField>('scans')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Fetch indexes from API
  const fetchIndexes = useCallback(async () => {
    if (!activeConnectionId) {
      setIndexes([])
      setError(null)
      setMetaNote(null)
      setIsLimited(false)
      return
    }

    if (isDemoMode) {
      setIndexes(DEMO_INDEXES)
      setError(null)
      setMetaNote(null)
      setIsLimited(false)
      return
    }

    setIsLoading(true)
    setError(null)
    setMetaNote(null)
    setIsLimited(false)

    try {
      const res = await fetch('/api/database/indexes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: activeConnection }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || `Failed to fetch indexes (${res.status})`)
      }

      const data: ApiIndexesResponse = await res.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const mapped = (data.indexes || []).map(mapApiRowToIndexInfo)
      setIndexes(mapped)

      if (data._meta?.limited) {
        setIsLimited(true)
        setMetaNote(data._meta.note || null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch index data')
      setIndexes([])
    } finally {
      setIsLoading(false)
    }
  }, [activeConnectionId, isDemoMode])

  // Fetch on mount and when connection changes
  useEffect(() => {
    fetchIndexes()
  }, [fetchIndexes])

  // In demo mode, always use demo data
  const displayIndexes = isDemoMode ? DEMO_INDEXES : indexes

  // Derived data
  const tableNames = useMemo(
    () => [...new Set(displayIndexes.map((i) => i.tableName))].sort(),
    [displayIndexes]
  )
  const indexTypes = useMemo(
    () => [...new Set(displayIndexes.map((i) => i.type))].sort(),
    [displayIndexes]
  )

  // Filtered indexes
  const filteredIndexes = useMemo(() => {
    let result = displayIndexes

    if (tableFilter !== 'all') {
      result = result.filter((i) => i.tableName === tableFilter)
    }

    if (typeFilter !== 'all') {
      result = result.filter((i) => i.type === typeFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (i) =>
          i.indexName.toLowerCase().includes(q) ||
          i.tableName.toLowerCase().includes(q) ||
          i.columns.some((c) => c.toLowerCase().includes(q))
      )
    }

    return result
  }, [displayIndexes, tableFilter, typeFilter, searchQuery])

  // Sorted indexes
  const sortedIndexes = useMemo(() => {
    const sorted = [...filteredIndexes]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'scans':
          cmp = a.scans - b.scans
          break
        case 'size':
          cmp = parseSizeToBytes(a.size) - parseSizeToBytes(b.size)
          break
        case 'name':
          cmp = a.indexName.localeCompare(b.indexName)
          break
      }
      return sortDirection === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [filteredIndexes, sortField, sortDirection])

  // Stats
  const totalIndexes = filteredIndexes.length
  const unusedCount = filteredIndexes.filter((i) => i.scans === 0).length
  const totalSizeBytes = filteredIndexes.reduce((acc, i) => acc + parseSizeToBytes(i.size), 0)
  const totalSizeFormatted = useMemo(() => {
    if (totalSizeBytes >= 1024 * 1024) {
      return `${(totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`
    }
    return `${(totalSizeBytes / 1024).toFixed(0)} kB`
  }, [totalSizeBytes])

  // Unused indexes
  const unusedIndexes = useMemo(
    () => filteredIndexes.filter((i) => i.scans === 0),
    [filteredIndexes]
  )

  // Top 10 chart data (sorted by scans desc)
  const chartData = useMemo(() => {
    return [...filteredIndexes]
      .sort((a, b) => b.scans - a.scans)
      .slice(0, 10)
      .map((i) => ({
        name: i.indexName.length > 20 ? i.indexName.slice(0, 18) + '...' : i.indexName,
        fullName: i.indexName,
        table: i.tableName,
        scans: i.scans,
      }))
  }, [filteredIndexes])

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="size-3 ml-1 text-muted-foreground/50" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="size-3 ml-1 text-primary" />
    ) : (
      <ArrowDown className="size-3 ml-1 text-primary" />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header + Filter Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="size-5 text-primary" />
              <CardTitle>Database Index Viewer</CardTitle>
              {isDemoMode && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 gap-1"
                >
                  <FlaskConical className="size-3" />
                  Demo
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isDemoMode && activeConnectionId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchIndexes}
                  disabled={isLoading}
                  className="h-8 gap-1.5"
                >
                  <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
                  Refresh
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            Monitor index usage statistics and identify potentially unused indexes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filter controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search indexes..."
                className="pl-9 h-9"
              />
            </div>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-9">
                <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                {tableNames.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[130px] h-9">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {indexTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* No connection state */}
      {!activeConnectionId && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <Database className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No active connection</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Connect to a Supabase project or try Demo mode to view index data</p>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <Loader2 className="size-8 text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Loading index data...</p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && !isLoading && activeConnectionId && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            <span className="font-semibold">Failed to load indexes:</span> {error}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchIndexes}
              className="ml-3 h-7 text-xs"
            >
              <RefreshCw className="size-3 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Limited data info alert */}
      {isLimited && metaNote && !isLoading && activeConnectionId && (
        <Alert className="border-sky-200 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20">
          <Info className="size-4 text-sky-600 dark:text-sky-400" />
          <AlertDescription className="text-sky-700 dark:text-sky-300">
            {metaNote}
          </AlertDescription>
        </Alert>
      )}

      {/* Data content — only show when we have an active connection and are not loading */}
      {activeConnectionId && !isLoading && !error && (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-primary to-primary" />
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Database className="size-3.5 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Total Indexes</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{totalIndexes}</p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-600" />
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <AlertTriangle className="size-3.5 text-amber-500" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Unused</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{unusedCount}</p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-cyan-400 to-cyan-600" />
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Activity className="size-3.5 text-cyan-500" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Total Scans</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">
                  {formatNumber(filteredIndexes.reduce((a, i) => a + i.scans, 0))}
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-red-400 to-orange-500" />
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <HardDrive className="size-3.5 text-red-500" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Total Size</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{totalSizeFormatted}</p>
              </CardContent>
            </Card>
          </div>

          {/* Usage Chart — Top 10 Most-Scanned Indexes */}
          {chartData.length > 0 && (
            <Card className="hidden sm:block">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="size-5 text-primary" />
                  <CardTitle>Top 10 Most-Scanned Indexes</CardTitle>
                </div>
                <CardDescription>
                  Index usage by number of scans — helps identify hot indexes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="min-h-[320px] min-w-[300px] w-full" style={{ aspectRatio: undefined }}>
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickMargin={4}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      width={160}
                      tickMargin={4}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, _name, item) => (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-foreground">{item.payload.fullName}</span>
                              <span className="text-muted-foreground">
                                Table: {item.payload.table}
                              </span>
                              <span className="text-foreground font-mono">
                                {Number(value).toLocaleString()} scans
                              </span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Bar
                      dataKey="scans"
                      fill="var(--color-scans)"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Unused Index Warning */}
          {unusedIndexes.length > 0 && (
            <Alert className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                <span className="font-semibold">{unusedIndexes.length} unused index{unusedIndexes.length !== 1 ? 'es' : ''}</span> detected (0 scans).
                These indexes may be candidates for removal to save storage and improve write performance:{' '}
                {unusedIndexes.map((i, idx) => (
                  <span key={`${i.tableName}-${i.indexName}`}>
                    <code className="rounded bg-amber-100 dark:bg-amber-900/30 px-1 py-0.5 text-xs font-mono">
                      {i.indexName}
                    </code>
                    {idx < unusedIndexes.length - 2 ? ', ' : idx === unusedIndexes.length - 2 ? ' and ' : ''}
                  </span>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {/* Limited data — empty state with helpful message */}
          {isLimited && displayIndexes.length === 0 && (
            <Card>
              <CardContent className="py-10 flex flex-col items-center justify-center text-center">
                <Key className="size-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No index data available</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Index statistics require a Management API token with SQL query access.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Index Table */}
          {displayIndexes.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Key className="size-5 text-primary" />
                  <CardTitle>Index Details</CardTitle>
                </div>
                <CardDescription>
                  All indexes with usage statistics — click column headers to sort
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Table</TableHead>
                        <TableHead>Index Name</TableHead>
                        <TableHead>Columns</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Unique</TableHead>
                        <TableHead
                          className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('scans')}
                        >
                          <div className="flex items-center">
                            Scans
                            {renderSortIcon('scans')}
                          </div>
                        </TableHead>
                        <TableHead className="hidden md:table-cell">Tuples Read</TableHead>
                        <TableHead className="hidden md:table-cell">Tuples Fetched</TableHead>
                        <TableHead
                          className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('size')}
                        >
                          <div className="flex items-center">
                            Size
                            {renderSortIcon('size')}
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedIndexes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No indexes found matching your filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedIndexes.map((idx, i) => {
                          const isUnused = idx.scans === 0
                          return (
                            <TableRow
                              key={`${idx.tableName}-${idx.indexName}-${i}`}
                              className={cn(
                                isUnused && 'bg-amber-50/50 dark:bg-amber-950/10'
                              )}
                            >
                              <TableCell className="pl-4 font-medium">
                                <span className="text-sm">{idx.tableName}</span>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs">{idx.indexName}</span>
                                  {isUnused && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30"
                                    >
                                      unused
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {idx.columns.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {idx.columns.map((col) => (
                                      <Badge
                                        key={col}
                                        variant="secondary"
                                        className="text-[10px] px-1.5 py-0 font-mono"
                                      >
                                        {col}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground/60 italic">N/A</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {idx.type}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {idx.unique ? (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-primary hover:bg-primary">
                                    UNIQUE
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className={cn('font-mono text-xs', isUnused ? 'text-amber-600 dark:text-amber-400' : idx.scans > 5000 ? 'text-primary dark:text-primary' : '')}>
                                {formatNumber(idx.scans)}
                              </TableCell>
                              <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                                {formatNumber(idx.tuplesRead)}
                              </TableCell>
                              <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                                {formatNumber(idx.tuplesFetched)}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {idx.size}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
