'use client'

import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Globe,
  Calendar,
  Database,
  Shield,
  Zap,
  HardDrive,
  ExternalLink,
  Server,
  Activity,
  Clock,
  HeartPulse,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  TrendingUp,
  TableIcon,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSupabaseStore, type ActivityLogEntry, type ActivityType } from '@/store/supabase-store'
// Types used indirectly via SecurityScore component
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { SecurityScore } from '@/components/security-score'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { IndexViewer } from '@/components/index-viewer'
import { LatencyMonitor } from '@/components/latency-monitor'
import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

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

function getPlanBadge(plan: string) {
  switch (plan.toLowerCase()) {
    case 'free':
      return <Badge variant="outline" className="text-xs bg-muted/50">Free</Badge>
    case 'pro':
      return <Badge className="text-xs bg-emerald-500 hover:bg-emerald-600">Pro</Badge>
    case 'enterprise':
      return <Badge className="text-xs bg-amber-500 hover:bg-amber-600">Enterprise</Badge>
    default:
      return <span className="text-sm font-semibold">—</span>
  }
}

function getHealthIcon(status: string) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="size-4 text-emerald-500" />
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
    case 'schema': return 'bg-emerald-500'
    case 'rls': return 'bg-red-500'
    case 'function': return 'bg-amber-500'
    case 'sql': return 'bg-cyan-500'
    case 'connection': return 'bg-primary'
    default: return 'bg-muted-foreground'
  }
}

function getActivityBadgeColor(type: ActivityType): string {
  switch (type) {
    case 'schema': return 'text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800'
    case 'rls': return 'text-red-600 border-red-200 dark:text-red-400 dark:border-red-800'
    case 'function': return 'text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800'
    case 'sql': return 'text-cyan-600 border-cyan-200 dark:text-cyan-400 dark:border-cyan-800'
    case 'connection': return 'text-primary border-primary/30'
    default: return ''
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
      const eased = 1 - Math.pow(1 - progress, 3)
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
  } = useSupabaseStore()

  const activeConnection = connections.find((c) => c.id === activeConnectionId)
  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID

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

  // Collapsible section states
  const [latencyOpen, setLatencyOpen] = useState(true)
  const [securityOpen, setSecurityOpen] = useState(true)
  const [indexOpen, setIndexOpen] = useState(true)
  const [activityOpen, setActivityOpen] = useState(true)

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
      const res = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: activeConnection }),
      })
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
  }, [activeConnectionId])

  // Fetch health check
  const fetchHealthCheck = useCallback(async () => {
    if (!activeConnectionId || isDemoMode) return
    setIsLoadingHealth(true)
    try {
      const res = await fetch(`/api/connections/${activeConnectionId}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: activeConnection }),
      })
      const data = await res.json()
      if (data.status) {
        setHealthStatus({ status: data.status, checks: data.checks || [] })
      }
    } catch {
      // silently fail
    } finally {
      setIsLoadingHealth(false)
    }
  }, [activeConnectionId, isDemoMode])

  useEffect(() => {
    fetchProjectInfo()
    fetchHealthCheck()
  }, [fetchProjectInfo, fetchHealthCheck])

  // Use computed stats (from store) which are always accurate,
  // falling back to API stats if needed
  const displayStats = {
    tables_count: computedStats.tables_count || projectStats?.tables_count || 0,
    rls_policies_count: computedStats.rls_policies_count || projectStats?.rls_policies_count || 0,
    edge_functions_count: computedStats.edge_functions_count || projectStats?.edge_functions_count || 0,
  }

  // Security score from rlsStatuses
  const securityScore = useMemo(() => {
    if (rlsStatuses.length === 0) return 0
    let score = 100
    score -= rlsStatuses.filter((r) => !r.rlsEnabled).length * 20
    score -= rlsStatuses.filter((r) => r.rlsEnabled && r.policies.length === 0).length * 5
    return Math.max(0, score)
  }, [rlsStatuses])

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500'
    if (score >= 60) return 'text-amber-500'
    if (score >= 40) return 'text-orange-500'
    return 'text-red-500'
  }

  const displayName = projectInfo?.name || activeConnection?.name || 'Unknown Project'
  const displayUrl = projectInfo?.project_url || activeConnection?.supabaseUrl || ''
  const displayRef = projectInfo?.ref || ''
  const displayRegion = projectInfo?.region || '—'
  const displayCreatedAt = projectInfo?.created_at || activeConnection?.createdAt || ''
  const displayDbVersion = (projectInfo?.database_version && projectInfo.database_version !== 'unknown')
    ? projectInfo.database_version
    : '—'
  const displayPlan = (projectInfo?.plan_type && projectInfo.plan_type !== 'unknown')
    ? projectInfo.plan_type
    : '—'

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-6"
    >
      {/* Project Info Card */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="size-5 text-primary" />
                <CardTitle>Project Overview</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchProjectInfo}
                disabled={isLoadingProject}
                className="gap-1.5"
              >
                {isLoadingProject ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Activity className="size-3.5" />
                )}
                Refresh
              </Button>
            </div>
            {projectError && (
              <CardDescription className="text-amber-600 dark:text-amber-400">
                {projectError}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Project Name */}
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Database className="size-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Project</p>
                  <p className="text-sm font-semibold truncate">{displayName}</p>
                  {displayRef && (
                    <p className="text-xs text-muted-foreground font-mono">{displayRef}</p>
                  )}
                </div>
              </div>

              {/* Region */}
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Globe className="size-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Region</p>
                  <p className="text-sm font-semibold">{displayRegion}</p>
                </div>
              </div>

              {/* Created */}
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Calendar className="size-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Created</p>
                  <p className="text-sm font-semibold">{displayCreatedAt ? formatDate(displayCreatedAt) : '—'}</p>
                </div>
              </div>

              {/* Database Version */}
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <HardDrive className="size-4 text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Database</p>
                  <p className="text-sm font-semibold">
                    {displayDbVersion !== '—' ? `PostgreSQL ${displayDbVersion}` : '—'}
                  </p>
                </div>
              </div>

              {/* Plan */}
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="size-4 text-violet-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Plan</p>
                  <div className="mt-0.5">
                    {displayPlan !== '—' ? getPlanBadge(displayPlan) : <span className="text-sm font-semibold">—</span>}
                  </div>
                </div>
              </div>

              {/* Project URL */}
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <ExternalLink className="size-4 text-cyan-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">URL</p>
                  {displayUrl ? (
                    <a
                      href={displayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline truncate block"
                    >
                      {displayUrl.replace('https://', '')}
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Stats Grid */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="size-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Tables</span>
              </div>
              <AnimatedNumber value={displayStats.tables_count} className="text-2xl font-bold tracking-tight" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="size-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">RLS Policies</span>
              </div>
              <AnimatedNumber value={displayStats.rls_policies_count} className="text-2xl font-bold tracking-tight" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="size-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Security Score</span>
              </div>
              <AnimatedNumber value={securityScore} className={`text-2xl font-bold tracking-tight ${getScoreColor(securityScore)}`} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="size-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Functions</span>
              </div>
              <AnimatedNumber value={displayStats.edge_functions_count} className="text-2xl font-bold tracking-tight" />
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Connection Latency Monitor — Collapsible */}
      <motion.div variants={itemVariants}>
        <Collapsible open={latencyOpen} onOpenChange={setLatencyOpen}>
          <div className="flex items-center gap-2 mb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 p-1 h-auto hover:bg-accent/50">
                {latencyOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                <Activity className="size-4 text-primary" />
                <span className="text-sm font-semibold">Connection Latency</span>
                <Badge variant="outline" className="text-[10px] ml-1">Monitor</Badge>
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
                {securityOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                <Shield className="size-4 text-primary" />
                <span className="text-sm font-semibold">Security &amp; Health</span>
                <Badge variant="secondary" className="text-[10px] ml-1">{securityScore}/100</Badge>
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
              <CardDescription>
                Real-time connection health status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isDemoMode ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="size-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
                    <AlertTriangle className="size-6 text-amber-500" />
                  </div>
                  <p className="text-sm font-medium mb-1">Demo Mode</p>
                  <p className="text-xs text-muted-foreground max-w-[240px]">
                    Health checks are not available in demo mode. Connect to a real project to see health status.
                  </p>
                </div>
              ) : healthStatus ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 mb-1">
                    {getHealthIcon(healthStatus.status)}
                    <span className="text-sm font-semibold capitalize">{healthStatus.status}</span>
                  </div>
                  {healthStatus.checks.map((check) => (
                    <div
                      key={check.name}
                      className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      {check.status === 'pass' ? (
                        <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
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
      <motion.div variants={itemVariants}>
        <Collapsible open={indexOpen} onOpenChange={setIndexOpen}>
          <div className="flex items-center gap-2 mb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 p-1 h-auto hover:bg-accent/50">
                {indexOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                <HardDrive className="size-4 text-primary" />
                <span className="text-sm font-semibold">Database Indexes</span>
                <Badge variant="outline" className="text-[10px] ml-1">Performance</Badge>
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
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Name</p>
                <p className="text-sm font-semibold">{activeConnection?.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">URL</p>
                <p className="text-sm font-mono text-muted-foreground truncate">
                  {activeConnection?.supabaseUrl || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Health</p>
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
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-sm text-emerald-600 dark:text-emerald-400">Healthy</span>
                        </>
                      )}
                      {healthStatus.status === 'degraded' && (
                        <>
                          <span className="size-2 rounded-full bg-amber-500" />
                          <span className="text-sm text-amber-600 dark:text-amber-400">Degraded</span>
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
      <motion.div variants={itemVariants}>
        <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
          <div className="flex items-center gap-2 mb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 p-1 h-auto hover:bg-accent/50">
                {activityOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
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
                  Actions like fetching schema, running RLS tests, executing SQL queries, and invoking edge functions will appear here.
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
                          className={cn('text-[10px] px-1.5 py-0 shrink-0', getActivityBadgeColor(entry.type))}
                        >
                          {entry.type}
                        </Badge>
                      </div>
                      {entry.details && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.details}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{formatRelativeTime(entry.timestamp)}</p>
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
