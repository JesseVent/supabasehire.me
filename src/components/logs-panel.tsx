'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  AlertTriangle,
  Bug,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileText,
  Filter,
  Info,
  Play,
  RefreshCw,
  ScrollText,
  Search,
  Square,
  Terminal,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { apiFetch } from '@/lib/api-auth'
import { DEMO_LOGS } from '@/lib/demo-data'
import type { LogEntry, LogService, SupabaseConnection } from '@/lib/supabase-types'
import { useSupabaseStore } from '@/store/supabase-store'
import { track } from '@/lib/analytics'

// ─── Types ───

interface LogsPanelProps {
  connection: SupabaseConnection | null
  isDemoMode: boolean
}

type TimeRange = '15m' | '30m' | '1h' | '6h' | '24h'

interface PatternGroup {
  key: string
  label: string
  match: (entry: LogEntry) => boolean
}

// ─── Constants ───

const SERVICES: { value: LogService; label: string }[] = [
  { value: 'postgres', label: 'Postgres' },
  { value: 'api', label: 'API' },
  { value: 'auth', label: 'Auth' },
  { value: 'edge-functions', label: 'Edge Functions' },
  { value: 'storage', label: 'Storage' },
  { value: 'realtime', label: 'Realtime' },
]

const TIME_RANGES: { value: TimeRange; label: string; minutes: number }[] = [
  { value: '15m', label: 'Last 15 min', minutes: 15 },
  { value: '30m', label: 'Last 30 min', minutes: 30 },
  { value: '1h', label: 'Last 1 hr', minutes: 60 },
  { value: '6h', label: 'Last 6 hr', minutes: 360 },
  { value: '24h', label: 'Last 24 hr', minutes: 1440 },
]

function getMinutesFromRange(range: TimeRange): number {
  return TIME_RANGES.find((r) => r.value === range)?.minutes ?? 30
}

const PATTERNS: PatternGroup[] = [
  {
    key: 'rls',
    label: 'RLS / Permission',
    match: (e) =>
      /row-level security/i.test(e.message) ||
      /42501/i.test(e.message) ||
      /permission denied/i.test(e.message),
  },
  {
    key: 'missing-relation',
    label: 'Missing Relation',
    match: (e) => /does not exist/i.test(e.message) || /42P01/i.test(e.message),
  },
  {
    key: 'constraint',
    label: 'Constraint',
    match: (e) =>
      /violates.*constraint/i.test(e.message) ||
      /foreign key/i.test(e.message) ||
      /23505|23503/i.test(e.message),
  },
  {
    key: 'syntax',
    label: 'Syntax',
    match: (e) => /syntax error/i.test(e.message) || /42601/i.test(e.message),
  },
  {
    key: 'connection',
    label: 'Connection / Timeout',
    match: (e) =>
      /timeout/i.test(e.message) ||
      /too many connections/i.test(e.message) ||
      /connection/i.test(e.message) ||
      /canceling statement/i.test(e.message),
  },
  {
    key: 'function-boot',
    label: 'Function Boot',
    match: (e) => /BOOT_ERROR/i.test(e.message) || /Worker failed to boot/i.test(e.message),
  },
  {
    key: 'jwt-auth',
    label: 'JWT / Auth',
    match: (e) =>
      /JWT/i.test(e.message) ||
      /token/i.test(e.message) ||
      /GoTrue/i.test(e.message) ||
      /auth/i.test(e.message),
  },
]

// ─── Helpers ───

function getSeverityColor(severity: LogEntry['severity']): string {
  switch (severity) {
    case 'ERROR':
      return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800'
    case 'WARN':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800'
    case 'INFO':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800'
    case 'DEBUG':
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function getSeverityIcon(severity: LogEntry['severity']) {
  switch (severity) {
    case 'ERROR':
      return <AlertCircle className="size-4 text-red-500" />
    case 'WARN':
      return <AlertTriangle className="size-4 text-amber-500" />
    case 'INFO':
      return <Info className="size-4 text-blue-500" />
    case 'DEBUG':
      return <Bug className="size-4 text-zinc-500" />
    default:
      return <FileText className="size-4 text-muted-foreground" />
  }
}

function getPattern(entry: LogEntry): PatternGroup | null {
  return PATTERNS.find((p) => p.match(entry)) ?? null
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  } catch {
    return iso
  }
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function LogsPanel({ connection, isDemoMode }: LogsPanelProps) {
  const {
    logs,
    logsLoading,
    logsError,
    logsService,
    logsStartTime,
    logsEndTime,
    logsSearch,
    setLogs,
    setLogsLoading,
    setLogsError,
    setLogsFilter,
  } = useSupabaseStore()

  const [timeRange, setTimeRange] = useState<TimeRange>('30m')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Initialize default time range on first mount
  useEffect(() => {
    if (!logsStartTime || !logsEndTime) {
      const end = new Date()
      const start = new Date(end.getTime() - 30 * 60 * 1000)
      setLogsFilter({ logsStartTime: start.toISOString(), logsEndTime: end.toISOString() })
    }
  }, [logsStartTime, logsEndTime, setLogsFilter])

  const fetchLogs = useCallback(async () => {
    if (!logsStartTime || !logsEndTime) return

    setLogsLoading(true)
    setLogsError(null)
    track('logs_fetch', { service: logsService, is_demo: isDemoMode })

    if (isDemoMode) {
      setLogs(
        DEMO_LOGS.filter(
          (entry) => !logsService || entry.service === logsService
        ).map((entry) => ({
          ...entry,
          service: logsService,
        }))
      )
      setLogsLoading(false)
      return
    }

    if (!connection) {
      setLogsError('No connection selected')
      setLogsLoading(false)
      return
    }

    try {
      const res = await apiFetch('/api/logs', connection, {
        service: logsService,
        startTime: logsStartTime,
        endTime: logsEndTime,
        filter: logsSearch.trim() || undefined,
        limit: 500,
      })
      const data = (await res.json()) as { logs?: LogEntry[]; error?: string }

      if (data.error) {
        setLogsError(data.error)
        setLogs([])
      } else {
        setLogs(data.logs ?? [])
      }
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : 'Failed to fetch logs')
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }, [
    connection,
    isDemoMode,
    logsEndTime,
    logsSearch,
    logsService,
    logsStartTime,
    setLogs,
    setLogsError,
    setLogsLoading,
  ])

  // Fetch on filter changes (debounce search)
  useEffect(() => {
    if (!logsStartTime || !logsEndTime) return
    const timer = setTimeout(() => {
      fetchLogs()
    }, logsSearch ? 400 : 0)
    return () => clearTimeout(timer)
  }, [fetchLogs, logsSearch, logsStartTime, logsEndTime])

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      const end = new Date()
      const start = new Date(end.getTime() - getMinutesFromRange(timeRange) * 60 * 1000)
      setLogsFilter({ logsEndTime: end.toISOString(), logsStartTime: start.toISOString() })
      fetchLogs()
    }, 30000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefresh, fetchLogs, setLogsFilter, timeRange])

  function updateTimeRange(range: TimeRange) {
    setTimeRange(range)
    const end = new Date()
    const start = new Date(end.getTime() - getMinutesFromRange(range) * 60 * 1000)
    setLogsFilter({ logsStartTime: start.toISOString(), logsEndTime: end.toISOString() })
  }

  const filteredLogs = useMemo(() => {
    const term = logsSearch.trim().toLowerCase()
    if (!term) return logs
    return logs.filter(
      (entry) =>
        entry.message.toLowerCase().includes(term) ||
        JSON.stringify(entry.metadata).toLowerCase().includes(term)
    )
  }, [logs, logsSearch])

  const groupedLogs = useMemo(() => {
    const groups: Record<string, LogEntry[]> = {
      ERROR: [],
      WARN: [],
      INFO: [],
      DEBUG: [],
      UNKNOWN: [],
    }
    for (const entry of filteredLogs) {
      groups[entry.severity] ??= []
      groups[entry.severity].push(entry)
    }
    return groups
  }, [filteredLogs])

  const patternCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const entry of filteredLogs) {
      const pattern = getPattern(entry)
      if (pattern) {
        counts[pattern.key] = (counts[pattern.key] ?? 0) + 1
      }
    }
    return counts
  }, [filteredLogs])

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  function formatLogAsMarkdown(entry: LogEntry): string {
    const lines: string[] = []
    lines.push(`### ${entry.severity} — ${entry.service} — ${formatTimestamp(entry.timestamp)}`)
    lines.push('')
    lines.push(entry.message)
    if (Object.keys(entry.metadata).length > 0) {
      lines.push('')
      lines.push('**Metadata:**')
      for (const [key, value] of Object.entries(entry.metadata)) {
        const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
        lines.push(`- \`${key}\`: ${text}`)
      }
    }
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(entry.raw, null, 2))
    lines.push('```')
    return lines.join('\n')
  }

  function copyLogs() {
    const markdown = filteredLogs.map(formatLogAsMarkdown).join('\n---\n\n')
    navigator.clipboard.writeText(markdown || 'No logs to copy.')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Logs copied as Markdown')
  }

  function downloadLogs() {
    const payload = JSON.stringify(filteredLogs, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeService = sanitizeFilename(logsService)
    const safeStart = logsStartTime ? new Date(logsStartTime).toISOString().split('T')[0] : 'unknown'
    a.href = url
    a.download = `supabasehire-logs-${safeService}-${safeStart}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Logs downloaded')
    track('logs_downloaded', { service: logsService, count: filteredLogs.length })
  }

  const totalErrors = groupedLogs.ERROR.length
  const totalWarnings = groupedLogs.WARN.length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <ScrollText className="size-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-none">Database Logs</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fetch and triage Supabase service logs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={copyLogs}
            disabled={filteredLogs.length === 0}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={downloadLogs}
            disabled={filteredLogs.length === 0}
          >
            <Download className="size-3.5" />
            Download
          </Button>
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setAutoRefresh((prev) => !prev)}
            disabled={!connection && !isDemoMode}
          >
            {autoRefresh ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
            {autoRefresh ? 'Pause' : 'Live'}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={fetchLogs}
            disabled={logsLoading || (!connection && !isDemoMode)}
          >
            {logsLoading ? <RefreshCw className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Filter className="size-4 text-muted-foreground shrink-0" />
              <Select
                value={logsService}
                onValueChange={(value) => setLogsFilter({ logsService: value as LogService })}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Service" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={timeRange} onValueChange={(value) => updateTimeRange(value as TimeRange)}>
                <SelectTrigger className="w-[140px]">
                  <Clock className="size-3.5 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Time range" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search logs by message or metadata..."
                value={logsSearch}
                onChange={(e) => setLogsFilter({ logsSearch: e.target.value })}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{filteredLogs.length}</span> total
        </span>
        <span className="text-muted-foreground/40">|</span>
        <span className="text-red-600">
          <span className="font-medium">{totalErrors}</span> errors
        </span>
        <span className="text-muted-foreground/40">|</span>
        <span className="text-amber-600">
          <span className="font-medium">{totalWarnings}</span> warnings
        </span>
        {Object.entries(patternCounts).length > 0 && (
          <>
            <span className="text-muted-foreground/40">|</span>
            <span className="flex items-center gap-1">
              Patterns:
              {Object.entries(patternCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([key, count]) => (
                  <Badge key={key} variant="outline" className="text-[10px]">
                    {PATTERNS.find((p) => p.key === key)?.label ?? key}: {count}
                  </Badge>
                ))}
            </span>
          </>
        )}
      </div>

      {/* Error */}
      {logsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Could not load logs</p>
            <p className="text-xs">{logsError}</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!logsLoading && filteredLogs.length === 0 && !logsError && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center gap-4">
              <div className="size-16 rounded-xl bg-primary/5 flex items-center justify-center ring-4 ring-primary/5">
                <Terminal className="size-8 text-primary/30" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <p className="text-sm font-medium">No logs found</p>
                <p className="text-xs text-muted-foreground">
                  Try a wider time range, a different service, or remove the search filter.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {logsLoading && filteredLogs.length === 0 && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="opacity-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="size-4 rounded-full bg-muted" />
                  <div className="flex-1 h-4 bg-muted rounded" />
                </div>
                <div className="mt-2 h-3 w-2/3 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Logs list */}
      {filteredLogs.length > 0 && (
        <ScrollArea className="h-[calc(100vh-420px)] min-h-[300px]" ref={listRef}>
          <div className="space-y-2 pr-4">
            <AnimatePresence initial={false}>
              {filteredLogs.map((entry) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  <Collapsible
                    open={expanded.has(entry.id)}
                    onOpenChange={() => toggleExpanded(entry.id)}
                  >
                    <Card className="overflow-hidden hover:border-primary/30 transition-colors">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="w-full text-left p-3 sm:p-4 flex items-start gap-3"
                        >
                          <div className="mt-0.5 shrink-0">{getSeverityIcon(entry.severity)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${getSeverityColor(entry.severity)}`}
                              >
                                {entry.severity}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {formatRelativeTime(entry.timestamp)}
                              </span>
                              {getPattern(entry) && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {getPattern(entry)?.label}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm truncate font-mono leading-snug">
                              {entry.message}
                            </p>
                          </div>
                          <div className="shrink-0 mt-1">
                            {expanded.has(entry.id) ? (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-4 text-muted-foreground" />
                            )}
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-4 pl-11 sm:pl-12 space-y-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              {formatTimestamp(entry.timestamp)}
                            </span>
                            <span className="size-1 rounded-full bg-muted-foreground/30" />
                            <span className="font-mono">ID: {entry.id}</span>
                            <span className="size-1 rounded-full bg-muted-foreground/30" />
                            <span className="font-mono">Service: {entry.service}</span>
                          </div>

                          {Object.keys(entry.metadata).length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">
                                Metadata
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(entry.metadata).map(([key, value]) => (
                                  <Badge key={key} variant="outline" className="text-[10px] gap-1">
                                    <span className="font-mono text-muted-foreground">{key}:</span>
                                    <span className="font-mono truncate max-w-[200px]">
                                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </span>
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-1">
                            <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">
                              Raw JSON
                            </p>
                            <pre className="p-3 rounded-lg bg-muted/50 text-[10px] font-mono overflow-x-auto">
                              {JSON.stringify(entry.raw, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
