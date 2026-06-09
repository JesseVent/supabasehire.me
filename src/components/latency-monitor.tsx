'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Clock,
  Loader2,
  Minus,
  Play,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api-auth'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { cn } from '@/lib/utils'
import { type LatencyRecord, useSupabaseStore } from '@/store/supabase-store'

// ─── Helpers ───

function getLatencyStatus(duration: number): LatencyRecord['status'] {
  if (duration < 100) return 'good'
  if (duration <= 500) return 'warning'
  return 'critical'
}

function getStatusColor(status: LatencyRecord['status']) {
  switch (status) {
    case 'good':
      return 'text-primary'
    case 'warning':
      return 'text-amber-500'
    case 'critical':
      return 'text-red-500'
  }
}

function getStatusBg(status: LatencyRecord['status']) {
  switch (status) {
    case 'good':
      return 'bg-primary'
    case 'warning':
      return 'bg-amber-500'
    case 'critical':
      return 'bg-red-500'
  }
}

function getStatusBgLight(status: LatencyRecord['status']) {
  switch (status) {
    case 'good':
      return 'bg-primary/10'
    case 'warning':
      return 'bg-amber-500/10'
    case 'critical':
      return 'bg-red-500/10'
  }
}

function getStatusRing(status: LatencyRecord['status']) {
  switch (status) {
    case 'good':
      return 'ring-primary/30'
    case 'warning':
      return 'ring-amber-500/30'
    case 'critical':
      return 'ring-red-500/30'
  }
}

function getStatusBadgeVariant(status: LatencyRecord['status']) {
  switch (status) {
    case 'good':
      return 'bg-primary/10 text-primary dark:text-primary border-primary/30 dark:border-primary/30'
    case 'warning':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
    case 'critical':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
  }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ts
  }
}

function getTrend(history: LatencyRecord[]): 'improving' | 'degrading' | 'stable' {
  if (history.length < 3) return 'stable'
  const recent = history.slice(0, 3)
  const older = history.slice(3, 6)
  if (older.length === 0) return 'stable'
  const recentAvg = recent.reduce((s, r) => s + r.duration, 0) / recent.length
  const olderAvg = older.reduce((s, r) => s + r.duration, 0) / older.length
  const diff = olderAvg - recentAvg
  if (diff > 20) return 'improving'
  if (diff < -20) return 'degrading'
  return 'stable'
}

// ─── Sparkline (pure CSS bar chart) ───

function Sparkline({ data, maxPoints = 20 }: { data: number[]; maxPoints?: number }) {
  const points = data.slice(0, maxPoints)
  if (points.length === 0) return null

  const max = Math.max(...points, 1)

  return (
    <div className="flex items-end gap-[2px] h-10 w-full">
      {points.map((value, i) => {
        const height = Math.max(4, (value / max) * 100)
        const status = getLatencyStatus(value)
        const colorClass =
          status === 'good'
            ? 'bg-primary/70'
            : status === 'warning'
              ? 'bg-amber-500/70'
              : 'bg-red-500/70'
        return (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${height}%` }}
            transition={{ duration: 0.3, delay: i * 0.02 }}
            className={cn('flex-1 rounded-t-sm min-w-[3px] transition-colors', colorClass)}
          />
        )
      })}
    </div>
  )
}

// ─── Main Component ───

export function LatencyMonitor() {
  const { activeConnectionId, connections, latencyHistory, addLatencyRecord, clearLatencyHistory } =
    useSupabaseStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null

  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID
  const [isPinging, setIsPinging] = useState(false)
  const [autoPing, setAutoPing] = useState(false)
  const autoPingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const demoInitialized = useRef(false)

  // Current latency = most recent record
  const currentLatency = latencyHistory.length > 0 ? latencyHistory[0] : null

  // Stats
  const stats = useMemo(() => {
    if (latencyHistory.length === 0) return null
    const durations = latencyHistory.map((r) => r.duration)
    return {
      avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      min: Math.min(...durations),
      max: Math.max(...durations),
    }
  }, [latencyHistory])

  // Trend
  const trend = useMemo(() => getTrend(latencyHistory), [latencyHistory])

  // Sparkline data (last 20, reversed to be chronological)
  const sparklineData = useMemo(
    () =>
      latencyHistory
        .slice(0, 20)
        .map((r) => r.duration)
        .reverse(),
    [latencyHistory]
  )

  // Measure latency
  const measureLatency = useCallback(async () => {
    if (!activeConnectionId || isPinging) return
    setIsPinging(true)

    try {
      let duration: number

      if (isDemoMode) {
        // Simulate latency for demo mode
        await new Promise((r) => setTimeout(r, 50))
        const spike = Math.random() < 0.1
        duration = spike
          ? Math.round(500 + Math.random() * 500)
          : Math.round(30 + Math.random() * 170)
      } else {
        // Real connection — ping /api/project
        const start = performance.now()
        await apiFetch('/api/project', activeConnection)
        duration = Math.round(performance.now() - start)
      }

      const status = getLatencyStatus(duration)
      addLatencyRecord({
        timestamp: new Date().toISOString(),
        duration,
        status,
      })
    } catch {
      // If ping fails, record a critical measurement
      addLatencyRecord({
        timestamp: new Date().toISOString(),
        duration: 9999,
        status: 'critical',
      })
    } finally {
      setIsPinging(false)
    }
  }, [activeConnectionId, isDemoMode, isPinging, addLatencyRecord])

  // Auto-ping every 30 seconds
  useEffect(() => {
    if (autoPing && activeConnectionId) {
      autoPingRef.current = setInterval(() => {
        measureLatency()
      }, 30_000)
    }
    return () => {
      if (autoPingRef.current) {
        clearInterval(autoPingRef.current)
        autoPingRef.current = null
      }
    }
  }, [autoPing, activeConnectionId, measureLatency])

  // Generate 5 initial demo data points on mount in demo mode
  useEffect(() => {
    if (isDemoMode && !demoInitialized.current && latencyHistory.length === 0) {
      demoInitialized.current = true
      const now = Date.now()
      for (let i = 4; i >= 0; i--) {
        const spike = Math.random() < 0.1
        const duration = spike
          ? Math.round(500 + Math.random() * 500)
          : Math.round(30 + Math.random() * 170)
        addLatencyRecord({
          timestamp: new Date(now - i * 30_000).toISOString(),
          duration,
          status: getLatencyStatus(duration),
        })
      }
    }
  }, [isDemoMode, latencyHistory.length, addLatencyRecord])

  // No connection
  if (!activeConnectionId) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <WifiOff className="size-5 text-muted-foreground" />
            <CardTitle>Connection Latency</CardTitle>
          </div>
          <CardDescription>Measure API response times for your Supabase connection</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <WifiOff className="size-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium mb-1">No Connection</p>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Connect to a Supabase project or enter demo mode to start measuring latency.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const currentStatus = currentLatency?.status ?? 'good'

  return (
    <div className="flex flex-col gap-6">
      {/* Current Latency + Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Current Latency Card */}
        <Card className="lg:col-span-2 overflow-hidden stat-card-enhanced">
          <div
            className={cn(
              'h-1.5 bg-gradient-to-r',
              currentStatus === 'good'
                ? 'from-primary to-primary'
                : currentStatus === 'warning'
                  ? 'from-amber-400 to-amber-600'
                  : 'from-red-400 to-red-600'
            )}
          />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="size-5 text-primary" />
                <CardTitle>Connection Latency</CardTitle>
                {isDemoMode && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                  >
                    Demo
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Auto-ping toggle */}
                <div className="flex items-center gap-2">
                  <Switch
                    id="auto-ping"
                    checked={autoPing}
                    onCheckedChange={setAutoPing}
                    disabled={!activeConnectionId}
                  />
                  <Label
                    htmlFor="auto-ping"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Auto-ping
                  </Label>
                </div>
                {/* Measure button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={measureLatency}
                  disabled={isPinging || !activeConnectionId}
                  className="gap-1.5"
                >
                  {isPinging ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  Ping
                </Button>
              </div>
            </div>
            <CardDescription>API response time for your Supabase connection</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              {/* Current latency value + pulse */}
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'size-12 rounded-full flex items-center justify-center ring-4',
                    getStatusBgLight(currentStatus),
                    getStatusRing(currentStatus)
                  )}
                >
                  <div
                    className={cn('size-4 rounded-full animate-pulse', getStatusBg(currentStatus))}
                  />
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        'text-4xl font-bold tracking-tight',
                        getStatusColor(currentStatus)
                      )}
                    >
                      {currentLatency ? currentLatency.duration : '—'}
                    </span>
                    <span className="text-sm text-muted-foreground font-medium">ms</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] px-1.5 py-0',
                        getStatusBadgeVariant(currentStatus)
                      )}
                    >
                      {currentStatus === 'good'
                        ? 'Fast'
                        : currentStatus === 'warning'
                          ? 'Slow'
                          : 'Critical'}
                    </Badge>
                    {currentLatency && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatTimestamp(currentLatency.timestamp)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <div className="flex-1 min-w-0 w-full sm:w-auto">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1.5">
                  Recent Measurements
                </p>
                {sparklineData.length > 0 ? (
                  <Sparkline data={sparklineData} />
                ) : (
                  <div className="h-10 flex items-center justify-center text-xs text-muted-foreground">
                    No data yet — click Ping to start
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Average */}
          <Card className="overflow-hidden stat-card-enhanced group press-effect">
            <div className="h-1 bg-gradient-to-r from-sky-400 to-sky-600" />
            <div className="bg-gradient-to-b from-sky-500/5 to-transparent">
              <CardContent className="pt-3 pb-3 px-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="size-6 rounded-md bg-sky-500/10 flex items-center justify-center">
                    <Clock className="size-3 text-sky-500" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">Average</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">
                  {stats ? `${stats.avg}` : '—'}
                  <span className="text-xs text-muted-foreground font-normal ml-0.5">ms</span>
                </p>
              </CardContent>
            </div>
          </Card>

          {/* Min */}
          <Card className="overflow-hidden stat-card-enhanced group press-effect">
            <div className="h-1 bg-gradient-to-r from-primary to-primary" />
            <div className="bg-gradient-to-b from-primary/5 to-transparent">
              <CardContent className="pt-3 pb-3 px-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="size-6 rounded-md bg-primary/10 flex items-center justify-center">
                    <TrendingDown className="size-3 text-primary" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">Min</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-primary dark:text-primary">
                  {stats ? `${stats.min}` : '—'}
                  <span className="text-xs text-muted-foreground font-normal ml-0.5">ms</span>
                </p>
              </CardContent>
            </div>
          </Card>

          {/* Max */}
          <Card className="overflow-hidden stat-card-enhanced group press-effect">
            <div className="h-1 bg-gradient-to-r from-red-400 to-red-600" />
            <div className="bg-gradient-to-b from-red-500/5 to-transparent">
              <CardContent className="pt-3 pb-3 px-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="size-6 rounded-md bg-red-500/10 flex items-center justify-center">
                    <TrendingUp className="size-3 text-red-500" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">Max</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">
                  {stats ? `${stats.max}` : '—'}
                  <span className="text-xs text-muted-foreground font-normal ml-0.5">ms</span>
                </p>
              </CardContent>
            </div>
          </Card>

          {/* Trend */}
          <Card className="overflow-hidden stat-card-enhanced group press-effect">
            <div
              className={cn(
                'h-1 bg-gradient-to-r',
                trend === 'improving'
                  ? 'from-primary to-primary'
                  : trend === 'degrading'
                    ? 'from-amber-400 to-amber-600'
                    : 'from-muted-foreground/40 to-muted-foreground/60'
              )}
            />
            <div
              className={cn(
                'bg-gradient-to-b to-transparent',
                trend === 'improving'
                  ? 'from-primary/5'
                  : trend === 'degrading'
                    ? 'from-amber-500/5'
                    : 'from-muted-foreground/5'
              )}
            >
              <CardContent className="pt-3 pb-3 px-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div
                    className={cn(
                      'size-6 rounded-md flex items-center justify-center',
                      trend === 'improving'
                        ? 'bg-primary/10'
                        : trend === 'degrading'
                          ? 'bg-amber-500/10'
                          : 'bg-muted-foreground/10'
                    )}
                  >
                    {trend === 'improving' ? (
                      <TrendingDown className="size-3 text-primary" />
                    ) : trend === 'degrading' ? (
                      <TrendingUp className="size-3 text-amber-500" />
                    ) : (
                      <Minus className="size-3 text-muted-foreground" />
                    )}
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">Trend</span>
                </div>
                <p
                  className={cn(
                    'text-lg font-bold tracking-tight capitalize',
                    trend === 'improving'
                      ? 'text-primary dark:text-primary'
                      : trend === 'degrading'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                  )}
                >
                  {trend}
                </p>
              </CardContent>
            </div>
          </Card>
        </div>
      </div>

      {/* Latency History */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="size-5 text-primary" />
              <CardTitle className="text-base">Latency History</CardTitle>
              {latencyHistory.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {latencyHistory.length} measurement{latencyHistory.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {latencyHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearLatencyHistory}
                className="gap-1.5 text-muted-foreground hover:text-red-500"
              >
                <Trash2 className="size-3.5" />
                Clear
              </Button>
            )}
          </div>
          <CardDescription>Recent latency measurements with status indicators</CardDescription>
        </CardHeader>
        <CardContent>
          {latencyHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <Wifi className="size-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium mb-1">No measurements yet</p>
              <p className="text-xs text-muted-foreground max-w-[240px]">
                Click the Ping button to measure your connection latency, or enable auto-ping for
                continuous monitoring.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-72">
              <div className="flex flex-col gap-1">
                <AnimatePresence mode="popLayout">
                  {latencyHistory.slice(0, 10).map((record, index) => (
                    <motion.div
                      key={record.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2, delay: index * 0.03 }}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                        'hover:bg-muted/50',
                        index === 0 && 'bg-muted/30'
                      )}
                    >
                      {/* Pulse dot */}
                      <div className="relative shrink-0">
                        <div className={cn('size-2.5 rounded-full', getStatusBg(record.status))} />
                        {index === 0 && (
                          <div
                            className={cn(
                              'absolute inset-0 size-2.5 rounded-full animate-ping opacity-40',
                              getStatusBg(record.status)
                            )}
                          />
                        )}
                      </div>

                      {/* Duration */}
                      <span
                        className={cn(
                          'text-sm font-semibold tabular-nums min-w-[60px]',
                          getStatusColor(record.status)
                        )}
                      >
                        {record.duration >= 9999 ? 'Timeout' : `${record.duration}ms`}
                      </span>

                      {/* Status badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] px-1.5 py-0 shrink-0',
                          getStatusBadgeVariant(record.status)
                        )}
                      >
                        {record.status}
                      </Badge>

                      {/* Timestamp */}
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {formatTimestamp(record.timestamp)}
                      </span>

                      {/* Bar indicator */}
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden shrink-0 hidden sm:block">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            record.status === 'good'
                              ? 'bg-primary'
                              : record.status === 'warning'
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          )}
                          style={{ width: `${Math.min(100, (record.duration / 1000) * 100)}%` }}
                        />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
