'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { apiFetch } from '@/lib/api-auth'
import {
  Zap,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Database,
  Activity,
  Code2,
  ToggleLeft,
  ToggleRight,
  Clock,
  Table2,
  AlertCircle,
  RefreshCw,
  Loader2,
  Info,
  AlertTriangle,
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useSupabaseStore } from '@/store/supabase-store'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { cn } from '@/lib/utils'

// ─── Types ───

type TriggerEvent = 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE'
type TriggerTiming = 'BEFORE' | 'AFTER' | 'INSTEAD OF'
type TriggerOrientation = 'ROW' | 'STATEMENT'

interface TriggerInfo {
  name: string
  tableName: string
  events: TriggerEvent[]
  timing: TriggerTiming
  orientation: TriggerOrientation
  functionName: string
  functionBody: string
  condition: string | null
  enabled: boolean
  description: string
}

// ─── API Response Types ───

interface ApiTriggerRow {
  name: string
  tablename: string
  events: string // comma-separated string like "INSERT, UPDATE"
  timing: string // 'BEFORE' | 'AFTER' | 'INSTEAD OF'
  orientation: string // 'ROW' | 'STATEMENT'
  function_call: string
  condition: string | null
  enabled: boolean
}

interface ApiTriggersResponse {
  triggers: ApiTriggerRow[]
  _meta?: {
    limited: boolean
    note: string
  }
  error?: string
}

// ─── Demo Data ───

const DEMO_TRIGGERS: TriggerInfo[] = [
  {
    name: 'update_updated_at',
    tableName: 'users',
    events: ['UPDATE'],
    timing: 'BEFORE',
    orientation: 'ROW',
    functionName: 'public.set_updated_at()',
    functionBody: `BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;`,
    condition: null,
    enabled: true,
    description: 'Automatically updates the updated_at column on every row update',
  },
  {
    name: 'log_user_changes',
    tableName: 'users',
    events: ['INSERT', 'UPDATE'],
    timing: 'AFTER',
    orientation: 'ROW',
    functionName: 'public.audit_user_changes()',
    functionBody: `BEGIN
  INSERT INTO audit_logs (action, table_name, user_id, created_at)
  VALUES (
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    now()
  );
  RETURN COALESCE(NEW, OLD);
END;`,
    condition: null,
    enabled: true,
    description: 'Logs all user insertions and updates to the audit_logs table',
  },
  {
    name: 'validate_post_content',
    tableName: 'posts',
    events: ['INSERT'],
    timing: 'BEFORE',
    orientation: 'ROW',
    functionName: 'public.check_post_content()',
    functionBody: `BEGIN
  IF NEW.content IS NULL OR length(trim(NEW.content)) < 10 THEN
    RAISE EXCEPTION 'Post content must be at least 10 characters long';
  END IF;
  IF length(NEW.content) > 50000 THEN
    RAISE EXCEPTION 'Post content exceeds maximum length of 50000 characters';
  END IF;
  RETURN NEW;
END;`,
    condition: null,
    enabled: true,
    description: 'Validates post content length before insertion (min 10, max 50000 chars)',
  },
  {
    name: 'notify_new_comment',
    tableName: 'comments',
    events: ['INSERT'],
    timing: 'AFTER',
    orientation: 'ROW',
    functionName: 'public.send_comment_notification()',
    functionBody: `BEGIN
  INSERT INTO notifications (user_id, message, read, created_at)
  SELECT
    p.user_id,
    'Your post received a new comment',
    false,
    now()
  FROM posts p
  WHERE p.id = NEW.post_id;
  RETURN NEW;
END;`,
    condition: 'NEW.post_id IS NOT NULL',
    enabled: true,
    description: 'Creates a notification for the post author when a new comment is added',
  },
  {
    name: 'update_post_count',
    tableName: 'comments',
    events: ['INSERT', 'DELETE'],
    timing: 'AFTER',
    orientation: 'STATEMENT',
    functionName: 'public.refresh_post_comment_count()',
    functionBody: `BEGIN
  UPDATE posts p
  SET comment_count = (
    SELECT COUNT(*) FROM comments c
    WHERE c.post_id = p.id
  )
  WHERE p.id IN (
    SELECT DISTINCT post_id FROM comments
    WHERE post_id IS NOT NULL
  );
  RETURN NULL;
END;`,
    condition: null,
    enabled: false,
    description: 'Refreshes the denormalized comment_count column on the posts table',
  },
  {
    name: 'prevent_bulk_delete',
    tableName: 'audit_logs',
    events: ['DELETE'],
    timing: 'BEFORE',
    orientation: 'STATEMENT',
    functionName: 'public.block_audit_bulk_delete()',
    functionBody: `BEGIN
  RAISE EXCEPTION 'Bulk deletion from audit_logs is not permitted. Use individual row deletes with proper authorization.';
  RETURN NULL;
END;`,
    condition: null,
    enabled: true,
    description: 'Prevents bulk DELETE operations on the audit_logs table for data integrity',
  },
]

// ─── API Data Mapper ───

function mapApiTriggerToTriggerInfo(row: ApiTriggerRow): TriggerInfo {
  // Split events string by comma and trim each event
  const events: TriggerEvent[] = (row.events || '')
    .split(',')
    .map((e: string) => e.trim())
    .filter((e: string): e is TriggerEvent =>
      ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'].includes(e)
    )

  // Map timing
  const timing = (['BEFORE', 'AFTER', 'INSTEAD OF'].includes(row.timing)
    ? row.timing
    : 'AFTER') as TriggerTiming

  // Map orientation
  const orientation = (row.orientation === 'STATEMENT' ? 'STATEMENT' : 'ROW') as TriggerOrientation

  // Generate description from timing + events + tableName
  const eventStr = events.length > 0 ? events.join(', ') : 'UNKNOWN'
  const description = `${timing} ${eventStr} on ${row.tablename}`

  return {
    name: row.name,
    tableName: row.tablename,
    events,
    timing,
    orientation,
    functionName: row.function_call || '',
    functionBody: row.function_call || '',
    condition: row.condition || null,
    enabled: !!row.enabled,
    description,
  }
}

// ─── Helpers ───

function getEventBadgeColor(event: TriggerEvent): string {
  switch (event) {
    case 'INSERT':
      return 'bg-primary/15 text-primary border-primary/30 dark:bg-primary/40 dark:text-primary dark:border-primary/30'
    case 'UPDATE':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
    case 'DELETE':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800'
    case 'TRUNCATE':
      return 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-400 dark:border-pink-800'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function getTimingBorderColor(timing: TriggerTiming): string {
  switch (timing) {
    case 'BEFORE':
      return 'border-l-amber-500'
    case 'AFTER':
      return 'border-l-primary'
    case 'INSTEAD OF':
      return 'border-l-violet-500'
    default:
      return 'border-l-muted'
  }
}

function getTimingBgColor(timing: TriggerTiming): string {
  switch (timing) {
    case 'BEFORE':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    case 'AFTER':
      return 'bg-primary/10 text-primary dark:text-primary'
    case 'INSTEAD OF':
      return 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function getTimingIcon(timing: TriggerTiming) {
  switch (timing) {
    case 'BEFORE':
      return <Clock className="size-3" />
    case 'AFTER':
      return <Activity className="size-3" />
    case 'INSTEAD OF':
      return <Zap className="size-3" />
    default:
      return null
  }
}

// ─── Component ───

export function TriggerViewer() {
  const { activeConnectionId, connections } = useSupabaseStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null
  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID

  // Data state
  const [triggers, setTriggers] = useState<TriggerInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metaNote, setMetaNote] = useState<string | null>(null)
  const [isLimited, setIsLimited] = useState(false)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [tableFilter, setTableFilter] = useState<string>('all')
  const [eventFilter, setEventFilter] = useState<string>('all')
  const [expandedTriggers, setExpandedTriggers] = useState<Set<string>>(new Set())

  // Fetch triggers from API
  const fetchTriggers = useCallback(async () => {
    if (!activeConnectionId) {
      setTriggers([])
      setError(null)
      setMetaNote(null)
      setIsLimited(false)
      return
    }

    if (isDemoMode) {
      setTriggers(DEMO_TRIGGERS)
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
      const res = await apiFetch('/api/database/triggers', activeConnection)

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || `Failed to fetch triggers (${res.status})`)
      }

      const data: ApiTriggersResponse = await res.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const mapped = (data.triggers || []).map(mapApiTriggerToTriggerInfo)
      setTriggers(mapped)

      if (data._meta?.limited) {
        setIsLimited(true)
        setMetaNote(data._meta.note || null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trigger data')
      setTriggers([])
    } finally {
      setIsLoading(false)
    }
  }, [activeConnectionId, isDemoMode])

  // Fetch on mount and when connection changes
  useEffect(() => {
    fetchTriggers()
  }, [fetchTriggers])

  // In demo mode, always use demo data
  const displayTriggers = isDemoMode ? DEMO_TRIGGERS : triggers

  // Derived data
  const tableNames = useMemo(
    () => [...new Set(displayTriggers.map((t) => t.tableName))].sort(),
    [displayTriggers]
  )

  // Filtered triggers
  const filteredTriggers = useMemo(() => {
    let result = displayTriggers

    if (tableFilter !== 'all') {
      result = result.filter((t) => t.tableName === tableFilter)
    }

    if (eventFilter !== 'all') {
      result = result.filter((t) => t.events.includes(eventFilter as TriggerEvent))
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.tableName.toLowerCase().includes(q) ||
          t.functionName.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      )
    }

    return result
  }, [displayTriggers, tableFilter, eventFilter, searchQuery])

  // Stats
  const totalTriggers = displayTriggers.length
  const activeTriggers = displayTriggers.filter((t) => t.enabled).length
  const perTableCount = useMemo(() => {
    const map = new Map<string, number>()
    displayTriggers.forEach((t) => {
      map.set(t.tableName, (map.get(t.tableName) || 0) + 1)
    })
    return map
  }, [displayTriggers])

  const eventDistribution = useMemo(() => {
    const counts: Record<TriggerEvent, number> = { INSERT: 0, UPDATE: 0, DELETE: 0, TRUNCATE: 0 }
    displayTriggers.forEach((t) => {
      t.events.forEach((e) => {
        counts[e]++
      })
    })
    return counts
  }, [displayTriggers])

  // Toggle expanded
  const toggleExpanded = (name: string) => {
    setExpandedTriggers((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  if (!activeConnectionId) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-center space-y-3">
            <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Zap className="size-8 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              Connect to a Supabase project to view database triggers.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header + Filter Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="size-5 text-primary" />
              <CardTitle>Database Triggers</CardTitle>
              {isDemoMode && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 gap-1"
                >
                  <FlaskConical className="size-3" />
                  Demo Data
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isDemoMode && activeConnectionId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchTriggers}
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
            View and inspect database triggers, their timing, events, and associated functions
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
                placeholder="Search triggers by name, table, or function..."
                className="pl-9 h-9"
              />
            </div>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-9">
                <Table2 className="size-3.5 mr-1.5 text-muted-foreground" />
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
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-full sm:w-[150px] h-9">
                <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Event" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="INSERT">INSERT</SelectItem>
                <SelectItem value="UPDATE">UPDATE</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
                <SelectItem value="TRUNCATE">TRUNCATE</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <Loader2 className="size-8 text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Loading trigger data...</p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && !isLoading && activeConnectionId && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            <span className="font-semibold">Failed to load triggers:</span> {error}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTriggers}
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
                    <Zap className="size-3.5 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Total Triggers</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{totalTriggers}</p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-cyan-400 to-cyan-600" />
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <ToggleRight className="size-3.5 text-cyan-500" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Active</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-cyan-600 dark:text-cyan-400">{activeTriggers}</p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-600" />
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Database className="size-3.5 text-amber-500" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Tables with Triggers</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{perTableCount.size}</p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-violet-400 to-violet-600" />
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="size-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Activity className="size-3.5 text-violet-500" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Event Types</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {(['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] as TriggerEvent[]).map((evt) => (
                    eventDistribution[evt] > 0 && (
                      <Badge
                        key={evt}
                        variant="outline"
                        className={cn('text-[10px] px-1.5 py-0 border', getEventBadgeColor(evt))}
                      >
                        {evt}:{eventDistribution[evt]}
                      </Badge>
                    )
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Limited data — empty state with helpful message */}
          {isLimited && displayTriggers.length === 0 && (
            <Card>
              <CardContent className="py-10 flex flex-col items-center justify-center text-center">
                <Zap className="size-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No trigger data available</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Trigger information requires a Management API token with SQL query access.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Trigger Cards */}
          {displayTriggers.length > 0 && (
            <ScrollArea className="max-h-[600px]">
              <div className="flex flex-col gap-3 pr-3">
                <AnimatePresence mode="popLayout">
                  {filteredTriggers.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Card>
                        <CardContent className="py-12">
                          <div className="flex flex-col items-center justify-center text-center space-y-3">
                            <div className="size-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                              <AlertCircle className="size-7 text-muted-foreground/40" />
                            </div>
                            <p className="text-sm text-muted-foreground">
                              No triggers found matching your filters.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ) : (
                    filteredTriggers.map((trigger) => {
                      const isExpanded = expandedTriggers.has(trigger.name)

                      return (
                        <motion.div
                          key={trigger.name}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Card
                            className={cn(
                              'border-l-4 transition-all duration-200 hover:shadow-md cursor-pointer',
                              getTimingBorderColor(trigger.timing),
                              !trigger.enabled && 'opacity-60'
                            )}
                            onClick={() => toggleExpanded(trigger.name)}
                          >
                            <CardContent className="p-4">
                              {/* Header row */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                    <h3 className="font-mono text-sm font-semibold truncate">
                                      {trigger.name}
                                    </h3>
                                    {/* Timing badge */}
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        'text-[10px] px-1.5 py-0 gap-1',
                                        getTimingBgColor(trigger.timing)
                                      )}
                                    >
                                      {getTimingIcon(trigger.timing)}
                                      {trigger.timing}
                                    </Badge>
                                    {/* Orientation badge */}
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0"
                                    >
                                      {trigger.orientation}
                                    </Badge>
                                    {/* Enabled/disabled */}
                                    {trigger.enabled ? (
                                      <Badge className="text-[10px] px-1.5 py-0 bg-primary hover:bg-primary gap-0.5">
                                        <ToggleRight className="size-2.5" />
                                        ENABLED
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0 text-muted-foreground border-muted gap-0.5"
                                      >
                                        <ToggleLeft className="size-2.5" />
                                        DISABLED
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {trigger.description}
                                  </p>
                                </div>

                                {/* Expand/collapse icon */}
                                <div className="shrink-0 mt-0.5">
                                  {isExpanded ? (
                                    <ChevronDown className="size-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="size-4 text-muted-foreground" />
                                  )}
                                </div>
                              </div>

                              {/* Event badges + table name row */}
                              <div className="flex items-center gap-2 mt-3 flex-wrap">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Events:</span>
                                {trigger.events.map((evt) => (
                                  <Badge
                                    key={evt}
                                    variant="outline"
                                    className={cn('text-[10px] px-1.5 py-0 border font-semibold', getEventBadgeColor(evt))}
                                  >
                                    {evt}
                                  </Badge>
                                ))}
                                <Separator orientation="vertical" className="h-3.5 mx-1" />
                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">On:</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono gap-1">
                                  <Table2 className="size-2.5" />
                                  {trigger.tableName}
                                </Badge>
                              </div>

                              {/* Expandable details */}
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-4 space-y-3">
                                      {/* Function */}
                                      <div>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                          <Code2 className="size-3.5 text-primary" />
                                          <span className="text-xs font-medium">Trigger Function</span>
                                        </div>
                                        <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 p-3">
                                          <code className="text-[11px] font-mono text-primary/80 block mb-2">
                                            {trigger.functionName}
                                          </code>
                                          <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto leading-relaxed">
                                            {trigger.functionBody}
                                          </pre>
                                        </div>
                                      </div>

                                      {/* Condition (WHEN clause) */}
                                      {trigger.condition && (
                                        <div>
                                          <div className="flex items-center gap-1.5 mb-1.5">
                                            <AlertCircle className="size-3.5 text-amber-500" />
                                            <span className="text-xs font-medium">WHEN Condition</span>
                                          </div>
                                          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                                            <code className="text-[11px] font-mono text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
                                              {trigger.condition}
                                            </code>
                                          </div>
                                        </div>
                                      )}

                                      {/* Metadata summary */}
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="rounded-lg border p-2.5">
                                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Timing</span>
                                          <span className="text-xs font-semibold">{trigger.timing}</span>
                                        </div>
                                        <div className="rounded-lg border p-2.5">
                                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Orientation</span>
                                          <span className="text-xs font-semibold">{trigger.orientation === 'ROW' ? 'Per-Row' : 'Per-Statement'}</span>
                                        </div>
                                        <div className="rounded-lg border p-2.5">
                                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Status</span>
                                          <span className={cn(
                                            'text-xs font-semibold',
                                            trigger.enabled ? 'text-primary dark:text-primary' : 'text-muted-foreground'
                                          )}>
                                            {trigger.enabled ? 'Enabled' : 'Disabled'}
                                          </span>
                                        </div>
                                        <div className="rounded-lg border p-2.5">
                                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Table</span>
                                          <span className="text-xs font-mono font-semibold">{trigger.tableName}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )
                    })
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  )
}
