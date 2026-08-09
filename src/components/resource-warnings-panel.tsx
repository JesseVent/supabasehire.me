'use client'

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  Lock,
  Mail,
  MemoryStick,
  RefreshCw,
  ShieldAlert,
  Timer,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api-auth'
import { DEMO_RESOURCE_WARNINGS } from '@/lib/demo-data'
import type { ResourceSeverity, ResourceWarning, SupabaseConnection } from '@/lib/supabase-types'
import { track } from '@/lib/analytics'

interface ResourceWarningsPanelProps {
  connection: SupabaseConnection | null
  isDemoMode: boolean
}

// Exhaustion metrics that report a severity. auth_rate_limit_exhaustion is
// handled separately because the API never returns 'critical' for it.
interface MetricDef {
  key: keyof ResourceWarning
  label: string
  description: string
  icon: typeof HardDrive
}

const METRICS: MetricDef[] = [
  {
    key: 'disk_io_exhaustion',
    label: 'Disk IO',
    description: 'Sustained IOPS at the volume limit — queries are queuing on disk.',
    icon: HardDrive,
  },
  {
    key: 'cpu_exhaustion',
    label: 'CPU',
    description: 'Compute is maxed out; consider scaling up the instance.',
    icon: Zap,
  },
  {
    key: 'memory_and_swap_exhaustion',
    label: 'Memory & Swap',
    description: 'Available memory exhausted and swapping is heavy.',
    icon: MemoryStick,
  },
  {
    key: 'disk_space_exhaustion',
    label: 'Disk Space',
    description: 'Disk is running out of space; auto-grow may be disabled.',
    icon: Database,
  },
]

function severityBadge(sev: ResourceSeverity) {
  if (!sev) {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" /> Healthy
      </Badge>
    )
  }
  if (sev === 'critical') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3" /> Critical
      </Badge>
    )
  }
  return (
    <Badge variant="default" className="gap-1 bg-amber-500/90 hover:bg-amber-500">
      <AlertTriangle className="size-3" /> Warning
    </Badge>
  )
}

export function ResourceWarningsPanel({ connection, isDemoMode }: ResourceWarningsPanelProps) {
  const [data, setData] = useState<ResourceWarning | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWarnings = useCallback(async () => {
    if (!connection && !isDemoMode) return
    setLoading(true)
    setError(null)
    track('resource_warnings_fetch', { is_demo: isDemoMode })
    try {
      if (isDemoMode) {
        setData(DEMO_RESOURCE_WARNINGS)
        return
      }
      const res = await apiFetch('/api/resource-warnings', connection!)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `Fetch failed (${res.status})`)
        return
      }
      setData(json as ResourceWarning)
    } catch {
      setError('Failed to fetch resource warnings')
    } finally {
      setLoading(false)
    }
  }, [connection, isDemoMode])

  useEffect(() => {
    fetchWarnings()
  }, [fetchWarnings])

  const activeMetricCount = METRICS.filter((m) => data?.[m.key] as ResourceSeverity).length
  const readonlyMode = data?.is_readonly_mode_enabled
  const needPitr = data?.need_pitr
  const authRateLimit = data?.auth_rate_limit_exhaustion
  const authEmailOffender = data?.auth_email_offender
  const authRestricted = data?.auth_restricted_email_sending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Resource Warnings</h2>
          <p className="text-sm text-muted-foreground">
            Platform-level health issues reported by Supabase for this project.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchWarnings} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Could not load warnings</AlertTitle>
          <AlertDescription>
            {error}
            {error.includes('access token') && ' — reconnect this project via OAuth.'}
          </AlertDescription>
        </Alert>
      )}

      {!error && data && (
        <>
          {/* Critical banner: read-only mode */}
          {readonlyMode && (
            <Alert variant="destructive">
              <Lock className="size-4" />
              <AlertTitle>Project is in read-only mode</AlertTitle>
              <AlertDescription>
                The database has been placed in read-only mode, likely due to disk space exhaustion.
                Writes are blocked until the issue is resolved.
              </AlertDescription>
            </Alert>
          )}

          {/* Summary */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {activeMetricCount === 0 && !readonlyMode && !authRateLimit && !needPitr ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" /> No active resource warnings.
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="size-4" />
                {activeMetricCount + (authRateLimit ? 1 : 0) + (readonlyMode ? 1 : 0)} active
                warning{activeMetricCount + (authRateLimit ? 1 : 0) + (readonlyMode ? 1 : 0) !== 1 ? 's' : ''}.
              </span>
            )}
          </div>

          {/* Metric cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            {METRICS.map((m) => {
              const sev = data[m.key] as ResourceSeverity
              const Icon = m.icon
              return (
                <Card key={m.key} className={sev ? 'border-amber-500/40' : undefined}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">{m.label}</CardTitle>
                      </div>
                      {severityBadge(sev)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-xs leading-relaxed">
                      {sev ? m.description : 'No issues detected.'}
                    </CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Auth rate limit — warning only */}
          <Card className={authRateLimit ? 'border-amber-500/40' : undefined}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Auth Rate Limit</CardTitle>
                </div>
                {authRateLimit ? (
                  <Badge variant="default" className="gap-1 bg-amber-500/90 hover:bg-amber-500">
                    <AlertTriangle className="size-3" /> Warning
                  </Badge>
                ) : (
                  severityBadge(null)
                )}
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs leading-relaxed">
                {authRateLimit
                  ? 'Auth endpoints are being rate-limited. A spike in auth traffic or a misbehaving client may be the cause.'
                  : 'No issues detected.'}
              </CardDescription>
            </CardContent>
          </Card>

          {/* PITR recommendation */}
          {needPitr && (
            <Alert>
              <Timer className="size-4" />
              <AlertTitle>Point-in-time recovery recommended</AlertTitle>
              <AlertDescription>
                Supabase recommends enabling PITR for this project so the database can be restored to a
                specific point in time.
              </AlertDescription>
            </Alert>
          )}

          {/* Auth email restrictions */}
          {(authEmailOffender || authRestricted) && (
            <Alert>
              <Mail className="size-4" />
              <AlertTitle>Auth email sending restricted</AlertTitle>
              <AlertDescription className="space-y-1">
                {authEmailOffender && (
                  <p>
                    A project on this account (<code className="text-xs">{authEmailOffender}</code>) is
                    sending high volumes of auth emails and restricting delivery for others.
                  </p>
                )}
                {authRestricted && (
                  <p>Outgoing auth emails from this project are currently restricted.</p>
                )}
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      {!error && !data && loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" />
          Loading resource warnings…
        </div>
      )}
    </div>
  )
}