'use client'

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatTile } from '@/components/ui/stat-tile'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { track } from '@/lib/analytics'
import { apiFetch } from '@/lib/api-auth'
import { DEMO_ADVISOR_LINTS } from '@/lib/demo-data'
import type {
  AdvisorLint,
  AdvisorsResult,
  AdvisorType,
  SupabaseConnection,
} from '@/lib/supabase-types'

interface ResourceWarningsPanelProps {
  connection: SupabaseConnection | null
  isDemoMode: boolean
}

const LEVEL_ORDER: AdvisorLint['level'][] = ['ERROR', 'WARN', 'INFO']

function levelBadge(level: AdvisorLint['level']) {
  if (level === 'ERROR') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3" /> Error
      </Badge>
    )
  }
  if (level === 'WARN') {
    return (
      <Badge variant="default" className="gap-1 bg-amber-500/90 hover:bg-amber-500">
        <AlertTriangle className="size-3" /> Warning
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Info className="size-3" /> Info
    </Badge>
  )
}

/** Advisor prose wraps object and keyword names in backticks — render them as code. */
function Ticked({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className ?? 'text-xs text-muted-foreground leading-relaxed'}>
      {text.split(/`([^`]+)`/).map((part, i) =>
        i % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: split output, index is the identity
          <code key={i} className="font-mono text-[11px] text-foreground/90">
            {part}
          </code>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: split output, index is the identity
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

export function ResourceWarningsPanel({ connection, isDemoMode }: ResourceWarningsPanelProps) {
  const [lints, setLints] = useState<AdvisorLint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<AdvisorType>('security')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchAdvisors = useCallback(async () => {
    if (!connection && !isDemoMode) return
    setLoading(true)
    setError(null)
    track('advisors_fetch', { is_demo: isDemoMode })
    try {
      if (isDemoMode) {
        setLints(DEMO_ADVISOR_LINTS)
        return
      }
      const res = await apiFetch('/api/advisors', connection!)
      const json = (await res.json()) as AdvisorsResult
      if (!res.ok || json.error) {
        setError(json.error ?? `Fetch failed (${res.status})`)
        setLints([])
        return
      }
      setLints(json.lints ?? [])
    } catch {
      setError('Failed to fetch advisors')
      setLints([])
    } finally {
      setLoading(false)
    }
  }, [connection, isDemoMode])

  useEffect(() => {
    fetchAdvisors()
  }, [fetchAdvisors])

  const shown = useMemo(() => lints.filter((l) => l.type === type), [lints, type])

  // Group by lint name: one rule fires once per offending object, so 136 findings are
  // usually a dozen rules — the rule is the unit worth reading.
  const groups = useMemo(() => {
    const byName = new Map<string, AdvisorLint[]>()
    for (const lint of shown) {
      const existing = byName.get(lint.name)
      if (existing) existing.push(lint)
      else byName.set(lint.name, [lint])
    }
    return [...byName.values()].sort(
      (a, b) =>
        LEVEL_ORDER.indexOf(a[0].level) - LEVEL_ORDER.indexOf(b[0].level) || b.length - a.length
    )
  }, [shown])

  const counts = useMemo(
    () => ({
      ERROR: shown.filter((l) => l.level === 'ERROR').length,
      WARN: shown.filter((l) => l.level === 'WARN').length,
      INFO: shown.filter((l) => l.level === 'INFO').length,
    }),
    [shown]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Advisors</h2>
          <p className="text-sm text-muted-foreground">
            Security and performance findings from the Supabase database linter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={type} onValueChange={(v) => setType(v as AdvisorType)}>
            <TabsList className="h-8">
              <TabsTrigger value="security" className="text-xs gap-1.5 h-7">
                <ShieldAlert className="size-3.5" />
                Security
              </TabsTrigger>
              <TabsTrigger value="performance" className="text-xs gap-1.5 h-7">
                <Zap className="size-3.5" />
                Performance
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAdvisors}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Could not load advisors</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile
              label="Errors"
              value={counts.ERROR}
              icon={AlertTriangle}
              iconClassName={counts.ERROR > 0 ? 'text-destructive' : undefined}
              valueClassName={counts.ERROR > 0 ? 'text-destructive' : undefined}
            />
            <StatTile
              label="Warnings"
              value={counts.WARN}
              icon={AlertTriangle}
              iconClassName={counts.WARN > 0 ? 'text-amber-500' : undefined}
              valueClassName={counts.WARN > 0 ? 'text-amber-500' : undefined}
            />
            <StatTile label="Info" value={counts.INFO} icon={Info} />
          </div>

          {shown.length === 0 && !loading && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" /> No {type} findings for this project.
            </div>
          )}

          {groups.map((group) => {
            const head = group[0]
            const open = expanded.has(head.name)
            return (
              <Card key={head.name} className="gap-0 py-0 overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => {
                    const next = new Set(expanded)
                    open ? next.delete(head.name) : next.add(head.name)
                    setExpanded(next)
                  }}
                >
                  {open ? (
                    <ChevronDown className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{head.title}</span>
                      {levelBadge(head.level)}
                      <Badge variant="secondary" className="text-[10px] h-5">
                        {group.length} {group.length === 1 ? 'object' : 'objects'}
                      </Badge>
                    </div>
                    <Ticked
                      text={head.description}
                      className="block text-xs text-muted-foreground mt-1 leading-relaxed"
                    />
                  </div>
                </button>

                {open && (
                  <CardContent className="px-4 pb-3 pt-0">
                    <div className="border-t pt-2 flex flex-col gap-1.5">
                      {group.map((lint) => (
                        <Ticked key={lint.cacheKey} text={lint.detail} />
                      ))}
                      {head.remediation && (
                        <a
                          href={head.remediation}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5 w-fit"
                        >
                          How to fix this
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </>
      )}

      {loading && lints.length === 0 && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" />
          Loading advisors…
        </div>
      )}
    </div>
  )
}
