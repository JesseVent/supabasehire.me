'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  BookOpen,
  Search,
  RefreshCw,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Database,
  RotateCcw,
  MessageSquare,
  GitCommit,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { CatalogTable, CatalogColumn, SupabaseConnection } from '@/lib/supabase-types'
import { formatDistanceToNow } from 'date-fns'

type SortKey = 'name' | 'row_count' | 'profiled_at'

function ProfileStatBadge({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined) return null
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">
      <span className="text-foreground/50">{label}</span>
      <span>{String(value)}</span>
    </span>
  )
}

function ColumnRow({ col }: { col: CatalogColumn }) {
  const samples = Array.isArray(col.sample_values) ? col.sample_values.slice(0, 5) : []
  const nullPct = col.null_pct !== null ? `${Number(col.null_pct).toFixed(1)}%` : null

  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-mono text-xs font-medium truncate">{col.column_name}</span>
        <div className="flex flex-wrap gap-1 mt-0.5">
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-mono">
            {col.data_type || 'unknown'}
          </Badge>
          {col.nullable === false && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">NOT NULL</Badge>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        {col.ai_description ? (
          <p className="text-xs text-foreground leading-relaxed">{col.ai_description}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">No AI description yet</p>
        )}
        <div className="flex flex-wrap gap-1">
          {nullPct !== null && <ProfileStatBadge label="null" value={nullPct} />}
          {col.distinct_count !== null && (
            <ProfileStatBadge label="distinct" value={col.distinct_count.toLocaleString()} />
          )}
          {col.min_val && <ProfileStatBadge label="min" value={col.min_val} />}
          {col.max_val && <ProfileStatBadge label="max" value={col.max_val} />}
          {samples.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              samples:
              {samples.map((s, i) => (
                <span key={i} className="px-1 py-0.5 rounded bg-muted font-mono text-foreground/70">
                  {String(s)}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

interface TableCardProps {
  table: CatalogTable
  onReProfile: (tableName: string) => void
  onGenerateAI: (table: CatalogTable) => void
  onCommit: (table: CatalogTable) => void
  isReprofiling: boolean
  isGenerating: boolean
  isCommitting: boolean
}

function TableCard({ table, onReProfile, onGenerateAI, onCommit, isReprofiling, isGenerating, isCommitting }: TableCardProps) {
  const [open, setOpen] = useState(false)
  const cols = table.columns || []
  const profiledAgo = table.profiled_at
    ? formatDistanceToNow(new Date(table.profiled_at), { addSuffix: true })
    : null

  return (
    <div className="border rounded-md bg-card group">
      {/* Header row */}
      <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors">
        {/* Expand toggle */}
        <button
          onClick={() => cols.length > 0 && setOpen(!open)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          disabled={cols.length === 0}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>

        {/* Table name */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Badge variant="outline" className="text-[10px] font-mono px-1 py-0 h-4 shrink-0 hidden sm:inline-flex">
            {table.schema_name}
          </Badge>
          <span className="font-mono text-xs font-semibold truncate">{table.table_name}</span>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
          {table.row_count !== null && (
            <span className="tabular-nums hidden sm:block">{table.row_count.toLocaleString()} rows</span>
          )}
          {profiledAgo && (
            <span className="hidden lg:block">{profiledAgo}</span>
          )}
          {cols.length > 0 && (
            <span className="hidden sm:block">{cols.length} cols</span>
          )}
        </div>

        {/* Actions */}
        <TooltipProvider>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => onReProfile(table.table_name)} disabled={isReprofiling} className="h-6 w-6 p-0">
                  {isReprofiling ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Re-profile</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => onGenerateAI(table)} disabled={isGenerating || !table.profiled_at} className="h-6 w-6 p-0">
                  {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{table.profiled_at ? 'Generate AI' : 'Profile first'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => onCommit(table)} disabled={isCommitting || !table.ai_description} className="h-6 w-6 p-0">
                  {isCommitting ? <Loader2 className="size-3 animate-spin" /> : <GitCommit className="size-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{table.ai_description ? 'Commit to schema' : 'Generate AI first'}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* AI description — shown below header when present */}
      {table.ai_description && (
        <div className="px-3 pb-2.5 -mt-1">
          <p className="text-xs text-muted-foreground leading-relaxed">{table.ai_description}</p>
        </div>
      )}

      {/* Column details — expandable */}
      {open && cols.length > 0 && (
        <div className="border-t mx-0">
          {cols.map((col) => (
            <ColumnRow key={col.id} col={col} />
          ))}
        </div>
      )}
    </div>
  )
}

export function DataCatalogPanel({
  connection: activeConnection,
  isDemoMode = false,
}: {
  connection: SupabaseConnection | null
  isDemoMode?: boolean
}) {
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null)
  const [tables, setTables] = useState<CatalogTable[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [isProfilingAll, setIsProfilingAll] = useState(false)
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)
  const [reprofilingTable, setReprofilingTable] = useState<string | null>(null)
  const [generatingTable, setGeneratingTable] = useState<string | null>(null)
  const [committingTable, setCommittingTable] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [schemaFilter, setSchemaFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')

  const loadCatalog = useCallback(async () => {
    if (!activeConnection) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/catalog/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: activeConnection }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error('Failed to load catalog', { description: data.error })
        setSchemaReady(false)
      } else {
        setSchemaReady(data.schemaReady)
        setTables(data.tables || [])
      }
    } catch {
      toast.error('Failed to load catalog')
      setSchemaReady(false)
    } finally {
      setIsLoading(false)
    }
  }, [activeConnection])

  useEffect(() => {
    if (activeConnection) loadCatalog()
  }, [activeConnection, loadCatalog])

  const handleSetup = async () => {
    if (!activeConnection) return
    setIsSettingUp(true)
    try {
      const res = await fetch('/api/catalog/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: activeConnection }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error('Setup failed', { description: data.error })
      } else {
        toast.success('Catalog schema created')
        await loadCatalog()
      }
    } catch {
      toast.error('Setup failed')
    } finally {
      setIsSettingUp(false)
    }
  }

  const handleProfileAll = async () => {
    if (!activeConnection) return
    setIsProfilingAll(true)
    try {
      const res = await fetch('/api/catalog/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: activeConnection }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error('Profiling failed', { description: data.error })
      } else {
        toast.success(`Profiled ${data.profiled} tables`)
        await loadCatalog()
      }
    } catch {
      toast.error('Profiling failed')
    } finally {
      setIsProfilingAll(false)
    }
  }

  const handleReProfile = async (tableName: string) => {
    if (!activeConnection) return
    setReprofilingTable(tableName)
    try {
      const res = await fetch('/api/catalog/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: activeConnection, tableNames: [tableName] }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error('Re-profile failed', { description: data.error })
      } else {
        toast.success(`Re-profiled ${tableName}`)
        await loadCatalog()
      }
    } catch {
      toast.error('Re-profile failed')
    } finally {
      setReprofilingTable(null)
    }
  }

  const invokeAIGeneration = async (table: CatalogTable) => {
    if (!activeConnection) return
    const cols = table.columns || []

    const columnPayload = cols.map((c) => ({
      name: c.column_name,
      type: c.data_type || 'unknown',
      nullable: c.nullable ?? true,
      nullPct: c.null_pct ?? 0,
      distinctCount: c.distinct_count,
      sampleValues: Array.isArray(c.sample_values) ? c.sample_values : [],
    }))

    const res = await fetch('/api/edge-functions/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection: activeConnection,
        functionName: 'catalog-generator',
        method: 'POST',
        body: {
          tableName: table.table_name,
          schemaName: table.schema_name,
          rowCount: table.row_count ?? 0,
          columns: columnPayload,
        },
      }),
    })
    const result = await res.json()

    if (result.error) {
      throw new Error(result.error)
    }

    const aiData = result.data as {
      tableDescription?: string
      columnDescriptions?: Record<string, string>
      error?: string
    }

    if (aiData.error) throw new Error(aiData.error)

    const managementToken = activeConnection.accessToken ||
      (activeConnection.serviceRoleKey?.startsWith('sbp_') ? activeConnection.serviceRoleKey : null)
    if (!managementToken) throw new Error('Management API token required')

    // Save table description
    if (aiData.tableDescription) {
      const safe = aiData.tableDescription.replace(/'/g, "''")
      await fetch('/api/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection: activeConnection,
          query: `UPDATE catalog_tables SET ai_description = '${safe}' WHERE id = '${table.id}';`,
        }),
      })
    }

    // Save column descriptions
    if (aiData.columnDescriptions) {
      for (const [colName, desc] of Object.entries(aiData.columnDescriptions)) {
        const safeDesc = (desc as string).replace(/'/g, "''")
        const safeCol = colName.replace(/'/g, "''")
        await fetch('/api/sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection: activeConnection,
            query: `UPDATE catalog_columns SET ai_description = '${safeDesc}' WHERE table_id = '${table.id}' AND column_name = '${safeCol}';`,
          }),
        })
      }
    }

    return aiData
  }

  const handleGenerateAI = async (table: CatalogTable) => {
    setGeneratingTable(table.table_name)
    try {
      await invokeAIGeneration(table)
      toast.success(`AI descriptions generated for ${table.table_name}`)
      await loadCatalog()
    } catch (err) {
      toast.error('AI generation failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setGeneratingTable(null)
    }
  }

  const handleGenerateAll = async () => {
    const unprofiled = tables.filter((t) => !t.profiled_at)
    if (unprofiled.length === tables.length) {
      toast.error('Profile tables first before generating AI descriptions')
      return
    }
    setIsGeneratingAll(true)
    let success = 0
    let failed = 0
    for (const table of tables.filter((t) => t.profiled_at)) {
      try {
        await invokeAIGeneration(table)
        success++
      } catch {
        failed++
      }
    }
    toast.success(`AI generation complete: ${success} succeeded${failed > 0 ? `, ${failed} failed` : ''}`)
    await loadCatalog()
    setIsGeneratingAll(false)
  }

  const handleCommit = async (table: CatalogTable) => {
    if (!activeConnection) return
    setCommittingTable(table.table_name)
    try {
      const res = await fetch('/api/catalog/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection: activeConnection,
          tableId: table.id,
          schemaName: table.schema_name,
          tableName: table.table_name,
        }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error('Commit failed', { description: data.error })
      } else if (data.committed === 0) {
        toast.info(data.message || 'Nothing to commit')
      } else {
        toast.success(`Committed ${data.committed} comment(s) to schema`, {
          description: `COMMENT ON TABLE/COLUMN written for ${table.table_name}`,
        })
      }
    } catch {
      toast.error('Commit failed')
    } finally {
      setCommittingTable(null)
    }
  }

  const schemas = useMemo(() => {
    const s = new Set(tables.map((t) => t.schema_name))
    return Array.from(s).sort()
  }, [tables])

  const filteredTables = useMemo(() => {
    let result = tables

    if (schemaFilter !== 'all') {
      result = result.filter((t) => t.schema_name === schemaFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.table_name.toLowerCase().includes(q) ||
          t.schema_name.toLowerCase().includes(q) ||
          t.ai_description?.toLowerCase().includes(q) ||
          t.columns?.some(
            (c) =>
              c.column_name.toLowerCase().includes(q) ||
              c.ai_description?.toLowerCase().includes(q)
          )
      )
    }

    result = [...result].sort((a, b) => {
      if (sortKey === 'name') return a.table_name.localeCompare(b.table_name)
      if (sortKey === 'row_count') return (b.row_count ?? 0) - (a.row_count ?? 0)
      if (sortKey === 'profiled_at') {
        if (!a.profiled_at) return 1
        if (!b.profiled_at) return -1
        return new Date(b.profiled_at).getTime() - new Date(a.profiled_at).getTime()
      }
      return 0
    })

    return result
  }, [tables, schemaFilter, search, sortKey])

  const profiledCount = tables.filter((t) => t.profiled_at).length
  const aiCount = tables.filter((t) => t.ai_description).length

  // — Demo mode —
  if (isDemoMode) {
    return (
      <Card className="mt-6">
        <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
          <BookOpen className="size-10 text-muted-foreground/40" />
          <p className="text-lg font-medium">Not available in Demo Mode</p>
          <p className="text-sm text-muted-foreground">Connect to a real Supabase project to use the Data Catalog.</p>
        </CardContent>
      </Card>
    )
  }

  // — No connection —
  if (!activeConnection) {
    return (
      <Card className="mt-6">
        <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
          <BookOpen className="size-10 text-muted-foreground/40" />
          <p className="text-lg font-medium">No connection selected</p>
          <p className="text-sm text-muted-foreground">Connect to a Supabase project to use the Data Catalog.</p>
        </CardContent>
      </Card>
    )
  }

  // — Loading —
  if (isLoading && schemaReady === null) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" />
        Loading catalog...
      </div>
    )
  }

  // — Setup required —
  if (schemaReady === false) {
    return (
      <div className="mt-6 max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-lg bg-primary/10">
                <BookOpen className="size-5 text-primary" />
              </div>
              <div>
                <CardTitle>Data Catalog</CardTitle>
                <CardDescription>Initialize schema to get started</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The catalog requires two tables in your Supabase project: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">catalog_tables</code> and{' '}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">catalog_columns</code>.
              Click below to create them. A Management API token is required.
            </p>
            <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              Also deploy the <code className="font-mono">catalog-generator</code> edge function and set{' '}
              <code className="font-mono">OPENAI_API_KEY</code> as a Supabase secret for AI descriptions.
            </div>
            <Button
              onClick={handleSetup}
              disabled={isSettingUp}
              className="w-full"
            >
              {isSettingUp ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Database className="mr-2 size-4" />
              )}
              Initialize Catalog Schema
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // — Main catalog view —
  return (
    <div className="space-y-4 mt-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <BookOpen className="size-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-base">Data Catalog</h2>
            <p className="text-xs text-muted-foreground">
              {tables.length} tables · {profiledCount} profiled · {aiCount} with AI descriptions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadCatalog}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleProfileAll}
            disabled={isProfilingAll}
            className="gap-1.5"
          >
            {isProfilingAll ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Profile All
          </Button>
          <Button
            size="sm"
            onClick={handleGenerateAll}
            disabled={isGeneratingAll || profiledCount === 0}
            className="gap-1.5"
          >
            {isGeneratingAll ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Generate All AI
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground border-b pb-2">
        <span className="flex items-center gap-1.5"><Database className="size-3" /><strong className="text-foreground">{tables.length}</strong> tables</span>
        <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-emerald-500" /><strong className="text-foreground">{profiledCount}</strong> profiled</span>
        <span className="flex items-center gap-1.5"><Sparkles className="size-3" /><strong className="text-foreground">{aiCount}</strong> with AI</span>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables, columns, descriptions..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={schemaFilter} onValueChange={setSchemaFilter}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All schemas</SelectItem>
            {schemas.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <ArrowUpDown className="size-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort: Name</SelectItem>
            <SelectItem value="row_count">Sort: Row count</SelectItem>
            <SelectItem value="profiled_at">Sort: Last profiled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table cards */}
      {filteredTables.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center gap-3">
            <BookOpen className="size-8 text-muted-foreground/40" />
            {tables.length === 0 ? (
              <>
                <p className="font-medium">No tables cataloged yet</p>
                <p className="text-sm text-muted-foreground">Click "Profile All" to scan your database.</p>
              </>
            ) : (
              <>
                <p className="font-medium">No tables match your search</p>
                <p className="text-sm text-muted-foreground">Try a different search term or clear the filter.</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-340px)]">
          <div className="space-y-2 pr-1">
            {filteredTables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                onReProfile={handleReProfile}
                onGenerateAI={handleGenerateAI}
                onCommit={handleCommit}
                isReprofiling={reprofilingTable === table.table_name}
                isGenerating={generatingTable === table.table_name || isGeneratingAll}
                isCommitting={committingTable === table.table_name}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
