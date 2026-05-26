'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  TableIcon,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TableDataViewerProps {
  connection: import('@/lib/supabase-types').SupabaseConnection | null
  tableName: string | null
  isDemoMode: boolean
}

interface FetchResult {
  rows?: Record<string, unknown>[]
  count?: number
  tableName?: string
  error?: string
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground/60 text-xs">NULL</span>
  }

  if (typeof value === 'boolean') {
    return value ? (
      <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓</span>
    ) : (
      <span className="text-red-500 font-medium">✗</span>
    )
  }

  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-mono text-xs text-blue-600 dark:text-blue-400 cursor-default">
              {json.length > 50 ? json.slice(0, 50) + '...' : json}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm">
            <pre className="text-xs whitespace-pre-wrap break-all">{json}</pre>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const str = String(value)
  if (str.length > 50) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-mono text-xs cursor-default">{str.slice(0, 50)}...</span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm">
            <p className="text-xs whitespace-pre-wrap break-all">{str}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return <span className="font-mono text-xs">{str}</span>
}

export function TableDataViewer({ connection, tableName, isDemoMode }: TableDataViewerProps) {
  const connectionId = connection?.id || null
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [limit] = useState(50)

  const fetchRows = useCallback(async () => {
    if (!connectionId || !tableName) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tables/rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection, tableName, limit, offset }),
      })
      const data: FetchResult = await res.json()
      if (data.error) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to fetch rows')
      } else {
        setRows(data.rows || [])
        setTotalCount(data.count || 0)
      }
    } catch {
      setError('Failed to fetch table rows')
    } finally {
      setIsLoading(false)
    }
  }, [connectionId, tableName, limit, offset])

  // Fetch when table or offset changes
  useEffect(() => {
    if (connectionId && tableName) {
      setOffset(0)
      fetchRows()
    }
  }, [connectionId, tableName, fetchRows])

  useEffect(() => {
    if (connectionId && tableName && offset > 0) {
      fetchRows()
    }
  }, [offset, connectionId, tableName, fetchRows])

  // Column headers from row data keys
  const columns = useMemo(() => {
    if (rows.length === 0) return []
    return Object.keys(rows[0])
  }, [rows])

  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.max(1, Math.ceil(totalCount / limit))

  const handlePrevPage = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - limit))
  }, [limit])

  const handleNextPage = useCallback(() => {
    setOffset((prev) => prev + limit)
  }, [limit])

  const handleRefresh = useCallback(() => {
    fetchRows()
  }, [fetchRows])

  if (!tableName) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <TableIcon className="size-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Select a table to view its data</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <AlertCircle className="size-10 text-red-500/50 mb-3" />
        <p className="text-sm font-medium text-red-600 dark:text-red-400">Error loading data</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-3 gap-1.5">
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <TableIcon className="size-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium">No data found</p>
        <p className="text-xs text-muted-foreground mt-1">
          {isDemoMode ? 'Demo table is empty' : `Table "${tableName}" has no rows or RLS is blocking access`}
        </p>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-3 gap-1.5">
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>
    )
  }

  return (
    <div className="em-panel h-full flex flex-col gap-3">
      {/* Header with count and pagination */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <TableIcon className="size-3" />
            {totalCount} row{totalCount !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {columns.length} column{columns.length !== 1 ? 's' : ''}
          </Badge>
          {isDemoMode && (
            <Badge className="text-xs bg-amber-500 hover:bg-amber-600">Demo</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={offset === 0}
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={offset + limit >= totalCount}
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="h-7 w-7 p-0"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Data table */}
      <ScrollArea className="w-full">
        <div className="min-w-full">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                {columns.map((col) => (
                  <th
                    key={col}
                    className="text-left px-3 py-2 font-mono text-xs font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="border-b hover:bg-muted/30 transition-colors"
                >
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-2 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">
                      <CellValue value={row[col]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
