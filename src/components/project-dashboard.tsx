'use client'

import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  HardDrive,
  HeartPulse,
  Info,
  Loader2,
  Server,
  Shield,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_INDEXES, IndexViewer } from '@/components/index-viewer'
import { LatencyMonitor, useLatencyPing } from '@/components/latency-monitor'
import { calculateScore, SecurityScore } from '@/components/security-score'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { apiFetch } from '@/lib/api-auth'
// Types used indirectly via SecurityScore component
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { cn } from '@/lib/utils'
import { type ActivityType, useSupabaseStore } from '@/store/supabase-store'

interface ProjectInfo {
  id: string
  name: string
  ref: string
  region: string
  created_at: string
  database_version: string
  plan_type: string
  project_url: string
  status: string
}

interface ProjectStats {
  tables_count: number
  rls_policies_count: number
  edge_functions_count: number
}

interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
}

// ─── Index summary (aggregates of /api/database/indexes) ───

interface ApiIndexRow {
  indexname: string
  scans: number
  size: string
}

interface IndexSummary {
  count: number
  bytes: number
  scans: number
  unused: number
  unusedBytes: number
  top: { name: string; scans: number }[]
}

const SIZE_UNITS: Record<string, number> = {
  bytes: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
}

/** pg_size_pretty output ("856 kB", "7.8 GB") back to bytes. */
function parseSize(size: string): number {
  const match = /^([\d.]+)\s*(bytes|kB|MB|GB|TB)$/i.exec(size.trim())
  if (!match) return 0
  return Number(match[1]) * (SIZE_UNITS[match[2].toLowerCase()] ?? 1)
}

function formatBytes(bytes: number): [string, string] {
  if (bytes >= 1024 ** 3) return [(bytes / 1024 ** 3).toFixed(1), 'GB']
  if (bytes >= 1024 ** 2) return [(bytes / 1024 ** 2).toFixed(1), 'MB']
  if (bytes >= 1024) return [(bytes / 1024).toFixed(0), 'kB']
  return [String(bytes), 'B']
}

/** 14_400_000 → ["14.4", "M"] so the number and its unit can be sized apart. */
function formatCount(n: number): [string, string] {
  if (n >= 1e9) return [(n / 1e9).toFixed(1), 'B']
  if (n >= 1e6) return [(n / 1e6).toFixed(1), 'M']
  if (n >= 1e3) return [(n / 1e3).toFixed(0), 'K']
  return [String(n), '']
}

function summarizeIndexes(rows: ApiIndexRow[]): IndexSummary {
  const unused = rows.filter((r) => (Number(r.scans) || 0) === 0)
  return {
    count: rows.length,
    bytes: rows.reduce((a, r) => a + parseSize(r.size || ''), 0),
    scans: rows.reduce((a, r) => a + (Number(r.scans) || 0), 0),
    unused: unused.length,
    unusedBytes: unused.reduce((a, r) => a + parseSize(r.size || ''), 0),
    top: [...rows]
      .sort((a, b) => (Number(b.scans) || 0) - (Number(a.scans) || 0))
      .slice(0, 3)
      .map((r) => ({ name: r.indexname, scans: Number(r.scans) || 0 })),
  }
}

/** Mono number + small unit + caption, the metric shape used across the grid. */
function Metric({
  value,
  unit,
  label,
  size = 'md',
  className,
}: {
  value: React.ReactNode
  unit?: string
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          'font-mono font-semibold tracking-tight truncate',
          size === 'sm' ? 'text-[15px]' : 'text-[22px]',
          className
        )}
      >
        {value}
        {unit && (
          <span
            className={cn(
              'font-normal text-muted-foreground',
              size === 'sm' ? 'text-[11px]' : 'text-[13px]'
            )}
          >
            {unit === '%' ? '' : ' '}
            {unit}
          </span>
        )}
      </div>
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

/** Card chrome shared by every tile in the overview grid. */
function GridCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col rounded-lg border border-border bg-card', className)}>
      {children}
    </div>
  )
}

function CardTop({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[18px] pt-4">
      <span className="text-[13px] font-medium">{title}</span>
      {action}
    </div>
  )
}

/** Text link with the design's trailing arrow. */
function CardLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] text-primary transition-colors hover:text-primary/80"
    >
      {children} →
    </button>
  )
}

function getHealthIcon(status: string) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="size-4 text-primary" />
    case 'degraded':
      return <AlertTriangle className="size-4 text-amber-500" />
    case 'unhealthy':
      return <XCircle className="size-4 text-red-500" />
    default:
      return <HeartPulse className="size-4 text-muted-foreground" />
  }
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

function getActivityDotColor(type: ActivityType): string {
  switch (type) {
    case 'schema':
      return 'bg-primary'
    case 'rls':
      return 'bg-red-500'
    case 'function':
      return 'bg-amber-500'
    case 'sql':
      return 'bg-cyan-500'
    case 'connection':
      return 'bg-primary'
    default:
      return 'bg-muted-foreground'
  }
}

function getActivityBadgeColor(type: ActivityType): string {
  switch (type) {
    case 'schema':
      return 'text-primary border-primary/30 dark:text-primary dark:border-primary/30'
    case 'rls':
      return 'text-red-600 border-red-200 dark:text-red-400 dark:border-red-800'
    case 'function':
      return 'text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800'
    case 'sql':
      return 'text-cyan-600 border-cyan-200 dark:text-cyan-400 dark:border-cyan-800'
    case 'connection':
      return 'text-primary border-primary/30'
    default:
      return ''
  }
}

function formatRelativeTime(timestamp: string): string {
  try {
    const now = Date.now()
    const then = new Date(timestamp).getTime()
    const diff = now - then
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 10) return 'just now'
    if (seconds < 60) return `${seconds} seconds ago`
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    return `${days} day${days !== 1 ? 's' : ''} ago`
  } catch {
    return timestamp
  }
}

/* ─── Animated Number with count-up effect ─── */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(0)
  const startValueRef = useRef(0)
  const animationRef = useRef<ReturnType<typeof requestAnimationFrame>>()

  useEffect(() => {
    startValueRef.current = displayValue
    const endValue = value
    const duration = 600
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - (1 - progress) ** 3
      const current = Math.round(startValueRef.current + (endValue - startValueRef.current) * eased)
      setDisplayValue(current)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [value, displayValue])

  return (
    <span key={value} className={`${className || ''} number-bounce`}>
      {displayValue}
    </span>
  )
}

export function ProjectDashboard() {
  const {
    activeConnectionId,
    connections,
    tables,
    rlsStatuses,
    edgeFunctions,
    activityLog,
    latencyHistory,
    setActivePanel,
  } = useSupabaseStore()

  const activeConnection = connections.find((c) => c.id === activeConnectionId)
  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID
  const { ping, isPinging } = useLatencyPing()

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null)
  const [isLoadingProject, setIsLoadingProject] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)

  // Health check state
  const [healthStatus, setHealthStatus] = useState<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    checks: HealthCheck[]
  } | null>(null)
  const [isLoadingHealth, setIsLoadingHealth] = useState(false)

  // Aggregates for the Indexes card. IndexViewer fetches the same endpoint for
  // its own table — one extra call on this panel, no shared state to thread.
  const [indexSummary, setIndexSummary] = useState<IndexSummary | null>(null)

  // Detail sections below the grid — collapsed until a grid card links into one.
  const [latencyOpen, setLatencyOpen] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [indexOpen, setIndexOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const indexSectionRef = useRef<HTMLDivElement>(null)
  const activitySectionRef = useRef<HTMLDivElement>(null)

  const reveal = (open: (v: boolean) => void, ref: React.RefObject<HTMLDivElement | null>) => {
    open(true)
    // Wait for the collapsible to lay out before scrolling to it.
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // Computed stats from store
  const computedStats = useMemo(() => {
    const totalPolicies = rlsStatuses.reduce((acc, r) => acc + r.policies.length, 0)
    return {
      tables_count: tables.length,
      rls_policies_count: totalPolicies,
      edge_functions_count: edgeFunctions.length,
    }
  }, [tables, rlsStatuses, edgeFunctions])

  // Fetch project info
  const fetchProjectInfo = useCallback(async () => {
    if (!activeConnectionId) return
    setIsLoadingProject(true)
    setProjectError(null)
    try {
      const res = await apiFetch('/api/project', activeConnection)
      const data = await res.json()
      if (data.project) {
        setProjectInfo(data.project)
      }
      if (data.stats) {
        setProjectStats(data.stats)
      }
      if (data.error) {
        setProjectError(data.error)
      }
    } catch {
      setProjectError('Failed to fetch project info')
    } finally {
      setIsLoadingProject(false)
    }
  }, [activeConnectionId, activeConnection])

  // Fetch health check
  const fetchHealthCheck = useCallback(async () => {
    if (!activeConnectionId || isDemoMode) return
    setIsLoadingHealth(true)
    try {
      const res = await apiFetch(`/api/connections/${activeConnectionId}/health`, activeConnection)
      const data = await res.json()
      if (data.status) {
        setHealthStatus({ status: data.status, checks: data.checks || [] })
      }
    } catch {
      // silently fail
    } finally {
      setIsLoadingHealth(false)
    }
  }, [activeConnectionId, isDemoMode, activeConnection])

  // Fetch index aggregates
  const fetchIndexSummary = useCallback(async () => {
    if (isDemoMode) {
      // Same sample set the Index viewer below renders, so the two agree.
      setIndexSummary(
        summarizeIndexes(
          DEMO_INDEXES.map((i) => ({ indexname: i.indexName, scans: i.scans, size: i.size }))
        )
      )
      return
    }
    if (!activeConnection) return
    try {
      const res = await apiFetch('/api/database/indexes', activeConnection)
      const data = await res.json()
      if (Array.isArray(data.indexes)) {
        setIndexSummary(summarizeIndexes(data.indexes as ApiIndexRow[]))
      }
    } catch {
      // The Indexes card degrades to em-dashes; the Index viewer below reports the error.
    }
  }, [isDemoMode, activeConnection])

  useEffect(() => {
    fetchProjectInfo()
    fetchHealthCheck()
    fetchIndexSummary()
  }, [fetchProjectInfo, fetchHealthCheck, fetchIndexSummary])

  // Use computed stats (from store) which are always accurate,
  // falling back to API stats if needed
  const displayStats = {
    tables_count: computedStats.tables_count || projectStats?.tables_count || 0,
    rls_policies_count: computedStats.rls_policies_count || projectStats?.rls_policies_count || 0,
    edge_functions_count:
      computedStats.edge_functions_count || projectStats?.edge_functions_count || 0,
  }

  // Same breakdown the SecurityScore card below renders, so the two never disagree.
  const security = useMemo(() => calculateScore(rlsStatuses, tables), [rlsStatuses, tables])
  const securityScore = rlsStatuses.length === 0 ? 0 : security.score

  const latency = useMemo(() => {
    if (latencyHistory.length === 0) return null
    const durations = latencyHistory.map((r) => r.duration)
    return {
      avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      min: Math.min(...durations),
      max: Math.max(...durations),
      // Oldest → newest, capped at 20 points, for the sparkline.
      series: latencyHistory
        .slice(0, 20)
        .map((r) => r.duration)
        .reverse(),
    }
  }, [latencyHistory])

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-primary'
    if (score >= 60) return 'text-amber-500'
    if (score >= 40) return 'text-orange-500'
    return 'text-red-500'
  }

  const displayName = projectInfo?.name || activeConnection?.name || 'Unknown Project'
  const displayUrl = projectInfo?.project_url || activeConnection?.supabaseUrl || ''
  const displayRef = projectInfo?.ref || ''
  const displayRegion = projectInfo?.region || '—'
  const displayCreatedAt = projectInfo?.created_at || activeConnection?.createdAt || ''
  const displayDbVersion =
    projectInfo?.database_version && projectInfo.database_version !== 'unknown'
      ? projectInfo.database_version
      : '—'
  const displayPlan =
    projectInfo?.plan_type && projectInfo.plan_type !== 'unknown' ? projectInfo.plan_type : '—'

  // The header prints only what the project API actually knows — an "unknown"
  // region or a missing Postgres version is left out, not shown as a dash.
  const headerFacts = [
    displayDbVersion !== '—' && `Postgres ${displayDbVersion}`,
    displayPlan !== '—' && displayPlan,
    displayRegion !== '—' && displayRegion !== 'unknown' && displayRegion,
    displayCreatedAt && `Created ${formatDate(displayCreatedAt)}`,
  ].filter((fact): fact is string => Boolean(fact))

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-6"
    >
      {/* Project header — name, status, and the facts that fit on one line */}
      <motion.div variants={itemVariants}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2.5">
              <span className="text-[18px] font-medium tracking-tight">{displayName}</span>
              {isDemoMode ? (
                <Badge variant="outline" className="gap-1.5 text-[11px]">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Demo
                </Badge>
              ) : healthStatus ? (
                <Badge
                  variant="outline"
                  className={cn(
                    'gap-1.5 text-[11px] capitalize',
                    healthStatus.status === 'healthy' && 'border-primary/40 text-primary',
                    healthStatus.status === 'degraded' && 'border-amber-500/40 text-amber-500',
                    healthStatus.status === 'unhealthy' && 'border-red-500/40 text-red-500'
                  )}
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      healthStatus.status === 'healthy' && 'bg-primary',
                      healthStatus.status === 'degraded' && 'bg-amber-500',
                      healthStatus.status === 'unhealthy' && 'bg-red-500'
                    )}
                  />
                  {healthStatus.status}
                </Badge>
              ) : null}
            </div>
            {displayRef && (
              <span className="font-mono text-[11px] text-muted-foreground">{displayRef}</span>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden items-center gap-6 text-[12px] whitespace-nowrap text-muted-foreground lg:flex">
              {headerFacts.map((fact) => (
                <span key={fact} className="capitalize">
                  {fact}
                </span>
              ))}
              {displayUrl && (
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary transition-colors hover:text-primary/80"
                >
                  {displayUrl.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchProjectInfo()
                fetchIndexSummary()
              }}
              disabled={isLoadingProject}
              className="h-[26px] gap-1.5 text-xs"
            >
              {isLoadingProject ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Activity className="size-3" />
              )}
              Refresh
            </Button>
          </div>
        </div>
        {projectError && (
          <p className="pt-2 text-xs text-amber-600 dark:text-amber-400">{projectError}</p>
        )}
      </motion.div>

      {/* At-a-glance grid */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
          {/* ── Security ── */}
          <GridCard className="xl:col-span-5">
            <CardTop
              title="Security"
              action={<CardLink onClick={() => setActivePanel('rls')}>Open RLS</CardLink>}
            />
            <div className="flex items-baseline gap-2 px-[18px] pt-3.5">
              <span
                className={cn(
                  'text-[40px] font-extrabold leading-none tracking-tight',
                  getScoreColor(securityScore)
                )}
              >
                <AnimatedNumber value={securityScore} />
              </span>
              <span className="text-[13px] text-muted-foreground">/ 100 security score</span>
            </div>
            <div className="px-[18px] pt-3.5 pb-1">
              <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
                <span>Policy coverage</span>
                <span className="text-foreground/70">{security.policyCoverage}%</span>
              </div>
              <div className="h-1 rounded-sm bg-muted">
                <div
                  className="h-1 rounded-sm bg-primary transition-[width] duration-500"
                  style={{ width: `${security.policyCoverage}%` }}
                />
              </div>
            </div>
            <div className="mt-auto flex flex-col px-2 pt-2.5 pb-2">
              <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5">
                <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="flex-1 text-[13px] text-foreground/70">
                  {security.tablesFullyProtected.length} tables fully protected
                </span>
              </div>
              <div
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2.5',
                  security.tablesWithRLSNoPolicies.length > 0 && 'bg-amber-500/10'
                )}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    security.tablesWithRLSNoPolicies.length > 0
                      ? 'bg-amber-500'
                      : 'bg-muted-foreground/40'
                  )}
                />
                <span
                  className={cn(
                    'flex-1 text-[13px]',
                    security.tablesWithRLSNoPolicies.length > 0
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {security.tablesWithRLSNoPolicies.length} tables have RLS enabled but no policies
                </span>
                {security.tablesWithRLSNoPolicies.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setActivePanel('rls')}
                    className="h-[26px] bg-amber-500 text-[12px] text-black hover:bg-amber-500/90"
                  >
                    Add policies
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5">
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    security.tablesWithoutRLS.length > 0 ? 'bg-red-500' : 'bg-muted-foreground/40'
                  )}
                />
                <span
                  className={cn(
                    'flex-1 text-[13px]',
                    security.tablesWithoutRLS.length > 0
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {security.tablesWithoutRLS.length} tables without RLS
                </span>
              </div>
            </div>
          </GridCard>

          {/* ── Indexes ── */}
          <GridCard className="xl:col-span-4">
            <CardTop
              title="Indexes"
              action={
                <CardLink onClick={() => reveal(setIndexOpen, indexSectionRef)}>
                  Open viewer
                </CardLink>
              }
            />
            <div className="grid grid-cols-3 gap-2 px-[18px] pt-3.5 pb-1.5">
              <Metric value={indexSummary?.count ?? '—'} label="indexes" />
              <Metric
                value={indexSummary ? formatBytes(indexSummary.bytes)[0] : '—'}
                unit={indexSummary ? formatBytes(indexSummary.bytes)[1] : undefined}
                label="total size"
              />
              <Metric
                value={indexSummary ? formatCount(indexSummary.scans)[0] : '—'}
                unit={indexSummary ? formatCount(indexSummary.scans)[1] : undefined}
                label="scans"
              />
            </div>
            {indexSummary && indexSummary.unused > 0 && (
              <button
                type="button"
                onClick={() => reveal(setIndexOpen, indexSectionRef)}
                className="mx-3 mt-2 flex items-center gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-left transition-colors hover:bg-amber-500/15"
              >
                <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                <span className="flex-1">
                  <span className="block text-[13px] font-medium">
                    {indexSummary.unused} unused indexes
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    0 scans — removing them reclaims ~
                    {formatBytes(indexSummary.unusedBytes).join(' ')}
                  </span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            )}
            <div className="mt-auto px-[18px] pt-3.5 pb-4">
              <div className="mb-2 text-[11px] text-muted-foreground">Most scanned</div>
              <div className="flex flex-col gap-[7px]">
                {indexSummary?.top.length ? (
                  indexSummary.top.map((idx) => {
                    const max = indexSummary.top[0].scans || 1
                    return (
                      <div key={idx.name} className="flex items-center gap-2">
                        <span className="w-[150px] truncate font-mono text-[11px] text-foreground/70">
                          {idx.name}
                        </span>
                        <div className="h-1.5 flex-1 rounded-sm bg-muted">
                          <div
                            className="h-1.5 rounded-sm bg-primary"
                            style={{ width: `${Math.max(2, (idx.scans / max) * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatCount(idx.scans).join('')}
                        </span>
                      </div>
                    )
                  })
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {isDemoMode ? 'Not available in demo mode' : 'No index statistics yet'}
                  </span>
                )}
              </div>
            </div>
          </GridCard>

          {/* ── Latency ── */}
          <GridCard className="xl:col-span-3">
            <CardTop
              title="Latency"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={ping}
                  disabled={isPinging || !activeConnectionId}
                  className="h-[26px] text-xs"
                >
                  {isPinging ? <Loader2 className="size-3 animate-spin" /> : 'Ping'}
                </Button>
              }
            />
            <div className="px-[18px] pt-3">
              {latency && latency.series.length > 1 ? (
                <svg
                  width="100%"
                  height="44"
                  viewBox="0 0 220 44"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`Latency trend, ${latency.series.length} samples`}
                >
                  <polyline
                    points={latency.series
                      .map((d, i) => {
                        const x = (i / (latency.series.length - 1)) * 220
                        // Clamp the plot to 4–40 so a flat series still reads as a line.
                        const y = 40 - Math.min(1, d / Math.max(latency.max, 1)) * 36
                        return `${x.toFixed(1)},${y.toFixed(1)}`
                      })
                      .join(' ')}
                    fill="none"
                    stroke="var(--brand-supabase)"
                    strokeWidth="1.5"
                  />
                </svg>
              ) : (
                <div className="flex h-[44px] items-center text-[11px] text-muted-foreground">
                  Ping to start measuring
                </div>
              )}
            </div>
            <div className="mt-auto grid grid-cols-3 gap-2 px-[18px] pt-2.5 pb-4">
              <Metric
                size="sm"
                value={latency?.avg ?? '—'}
                unit={latency ? 'ms' : undefined}
                label="avg"
              />
              <Metric
                size="sm"
                value={latency?.min ?? '—'}
                unit={latency ? 'ms' : undefined}
                label="min"
              />
              <Metric
                size="sm"
                value={latency?.max ?? '—'}
                unit={latency ? 'ms' : undefined}
                label="max"
              />
            </div>
          </GridCard>

          {/* ── Connection health ── */}
          <GridCard className="xl:col-span-7">
            <CardTop
              title="Connection health"
              action={
                !isDemoMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchHealthCheck}
                    disabled={isLoadingHealth}
                    className="h-[26px] text-xs"
                  >
                    {isLoadingHealth ? <Loader2 className="size-3 animate-spin" /> : 'Check'}
                  </Button>
                )
              }
            />
            {isDemoMode ? (
              <p className="px-[18px] py-5 text-[13px] text-muted-foreground">
                Health checks need a real project — demo mode has no credentials to verify.
              </p>
            ) : healthStatus ? (
              <div className="grid grid-cols-1 gap-x-4 px-2 pt-3 pb-2.5 sm:grid-cols-2">
                {healthStatus.checks.map((check) => (
                  <div key={check.name} className="flex items-center gap-2.5 px-2.5 py-2">
                    {check.status === 'pass' ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                    ) : check.status === 'warn' ? (
                      <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <XCircle className="size-3.5 shrink-0 text-red-500" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[13px] text-foreground/70">{check.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {check.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 px-[18px] py-5">
                {isLoadingHealth ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <span className="text-[13px] text-muted-foreground">No health check yet</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchHealthCheck}
                      className="h-[26px] text-xs"
                    >
                      Run check
                    </Button>
                  </>
                )}
              </div>
            )}
          </GridCard>

          {/* ── Database ── */}
          <GridCard className="xl:col-span-5">
            <CardTop
              title="Database"
              action={
                <CardLink onClick={() => reveal(setActivityOpen, activitySectionRef)}>
                  Activity log
                </CardLink>
              }
            />
            <div className="grid grid-cols-3 gap-2 px-[18px] pt-3 pb-4">
              <Metric value={<AnimatedNumber value={displayStats.tables_count} />} label="tables" />
              <Metric
                value={<AnimatedNumber value={displayStats.rls_policies_count} />}
                label="RLS policies"
              />
              <Metric
                value={<AnimatedNumber value={displayStats.edge_functions_count} />}
                label="functions"
              />
            </div>
            <div className="mt-auto flex gap-2 border-t border-border px-[18px] py-2.5 text-[11px] text-muted-foreground">
              {activityLog.length > 0 ? (
                <>
                  <span
                    className={cn(
                      'mt-1 size-1.5 shrink-0 rounded-full',
                      getActivityDotColor(activityLog[0].type)
                    )}
                  />
                  <span className="truncate">
                    {activityLog[0].action}
                    {activityLog[0].details ? ` · ${activityLog[0].details}` : ''} ·{' '}
                    {formatRelativeTime(activityLog[0].timestamp)}
                  </span>
                </>
              ) : (
                <span>No activity recorded yet</span>
              )}
            </div>
          </GridCard>
        </div>
      </motion.div>

      {/* Connection Latency Monitor — Collapsible */}
      <motion.div variants={itemVariants}>
        <Collapsible open={latencyOpen} onOpenChange={setLatencyOpen}>
          <div className="flex items-center gap-2 mb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 p-1 h-auto hover:bg-accent/50">
                {latencyOpen ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
                <Activity className="size-4 text-primary" />
                <span className="text-sm font-semibold">Connection Latency</span>
                <Badge variant="outline" className="text-[10px] ml-1">
                  Monitor
                </Badge>
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <LatencyMonitor />
          </CollapsibleContent>
        </Collapsible>
      </motion.div>

      {/* Security Score + Connection Health Row — Collapsible */}
      <motion.div variants={itemVariants}>
        <Collapsible open={securityOpen} onOpenChange={setSecurityOpen}>
          <div className="flex items-center gap-2 mb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 p-1 h-auto hover:bg-accent/50">
                {securityOpen ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
                <Shield className="size-4 text-primary" />
                <span className="text-sm font-semibold">Security &amp; Health</span>
                <Badge variant="secondary" className="text-[10px] ml-1">
                  {securityScore}/100
                </Badge>
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Security Score */}
              <div className="flex flex-col gap-0">
                <SecurityScore rlsStatuses={rlsStatuses} tables={tables} />
              </div>

              {/* Connection Health */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HeartPulse className="size-5 text-primary" />
                      <CardTitle>Connection Health</CardTitle>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="size-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[220px]">
                            Verifies your Supabase credentials and connectivity
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {!isDemoMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchHealthCheck}
                        disabled={isLoadingHealth}
                        className="gap-1.5"
                      >
                        {isLoadingHealth ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Activity className="size-3.5" />
                        )}
                        Check
                      </Button>
                    )}
                  </div>
                  <CardDescription>Real-time connection health status</CardDescription>
                </CardHeader>
                <CardContent>
                  {isDemoMode ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="size-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
                        <AlertTriangle className="size-6 text-amber-500" />
                      </div>
                      <p className="text-sm font-medium mb-1">Demo Mode</p>
                      <p className="text-xs text-muted-foreground max-w-[240px]">
                        Health checks are not available in demo mode. Connect to a real project to
                        see health status.
                      </p>
                    </div>
                  ) : healthStatus ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 mb-1">
                        {getHealthIcon(healthStatus.status)}
                        <span className="text-sm font-semibold capitalize">
                          {healthStatus.status}
                        </span>
                      </div>
                      {healthStatus.checks.map((check) => (
                        <div
                          key={check.name}
                          className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          {check.status === 'pass' ? (
                            <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
                          ) : check.status === 'warn' ? (
                            <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{check.name}</p>
                            <p className="text-xs text-muted-foreground">{check.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !isLoadingHealth ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <HeartPulse className="size-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">No health check data yet</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchHealthCheck}
                        className="mt-3"
                      >
                        Run Health Check
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </motion.div>

      {/* Database Index Viewer — Collapsible */}
      <motion.div variants={itemVariants} ref={indexSectionRef}>
        <Collapsible open={indexOpen} onOpenChange={setIndexOpen}>
          <div className="flex items-center gap-2 mb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 p-1 h-auto hover:bg-accent/50">
                {indexOpen ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
                <HardDrive className="size-4 text-primary" />
                <span className="text-sm font-semibold">Database Indexes</span>
                <Badge variant="outline" className="text-[10px] ml-1">
                  Performance
                </Badge>
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <IndexViewer />
          </CollapsibleContent>
        </Collapsible>
      </motion.div>

      {/* Connection Info Card */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="size-5 text-primary" />
              <CardTitle>Connection Info</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                  Name
                </p>
                <p className="text-sm font-semibold">{activeConnection?.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                  URL
                </p>
                <p className="text-sm font-mono text-muted-foreground truncate">
                  {activeConnection?.supabaseUrl || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                  Health
                </p>
                <div className="flex items-center gap-1.5">
                  {isDemoMode ? (
                    <>
                      <span className="size-2 rounded-full bg-amber-500" />
                      <span className="text-sm text-amber-600 dark:text-amber-400">Demo</span>
                    </>
                  ) : healthStatus ? (
                    <>
                      {healthStatus.status === 'healthy' && (
                        <>
                          <span className="size-2 rounded-full bg-primary animate-pulse" />
                          <span className="text-sm text-primary dark:text-primary">Healthy</span>
                        </>
                      )}
                      {healthStatus.status === 'degraded' && (
                        <>
                          <span className="size-2 rounded-full bg-amber-500" />
                          <span className="text-sm text-amber-600 dark:text-amber-400">
                            Degraded
                          </span>
                        </>
                      )}
                      {healthStatus.status === 'unhealthy' && (
                        <>
                          <span className="size-2 rounded-full bg-red-500" />
                          <span className="text-sm text-red-600 dark:text-red-400">Unhealthy</span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="size-2 rounded-full bg-muted-foreground/40" />
                      <span className="text-sm text-muted-foreground">Not checked</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Activity — Activity Timeline — Collapsible */}
      <motion.div variants={itemVariants} ref={activitySectionRef}>
        <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
          <div className="flex items-center gap-2 mb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 p-1 h-auto hover:bg-accent/50">
                {activityOpen ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
                <Clock className="size-4 text-primary" />
                <span className="text-sm font-semibold">Recent Activity</span>
                {activityLog.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-1">
                    {activityLog.length} event{activityLog.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <Card>
              <CardContent>
                {activityLog.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="size-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                      <Activity className="size-7 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium mb-1">No activity yet</p>
                    <p className="text-xs text-muted-foreground max-w-[280px]">
                      Actions like fetching schema, running RLS tests, executing SQL queries, and
                      invoking edge functions will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="relative max-h-96 overflow-y-auto space-y-0">
                    {activityLog.slice(0, 10).map((entry, index) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 py-3 animate-slide-in-left"
                        style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
                      >
                        {/* Timeline dot + line */}
                        <div className="flex flex-col items-center shrink-0">
                          <div
                            className={cn(
                              'size-3 rounded-full ring-2 ring-background shrink-0 mt-1',
                              getActivityDotColor(entry.type)
                            )}
                          />
                          {index < Math.min(activityLog.length, 10) - 1 && (
                            <div className="w-px flex-1 bg-border mt-1 min-h-6" />
                          )}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{entry.action}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] px-1.5 py-0 shrink-0',
                                getActivityBadgeColor(entry.type)
                              )}
                            >
                              {entry.type}
                            </Badge>
                          </div>
                          {entry.details && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {entry.details}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            {formatRelativeTime(entry.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </motion.div>
    </motion.div>
  )
}
