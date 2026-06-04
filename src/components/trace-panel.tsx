'use client'

import '@/components/agent-prism/theme/theme.css'

import { useState } from 'react'
import { Activity, Play, AlertCircle, CheckCircle2, Clock, Grid3x3 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SkillCoverageMatrix } from '@/components/skill-coverage-matrix'
import { openTelemetrySpanAdapter } from '@evilmartians/agent-prism-data'
import type { OpenTelemetryDocument, TraceRecord, TraceSpan } from '@evilmartians/agent-prism-types'

import { TraceViewer } from '@/components/agent-prism/TraceViewer/TraceViewer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSupabaseStore } from '@/store/supabase-store'
import { DEMO_CONNECTION_ID, DEMO_OTLP_TRACE, DEMO_TRACE_STEPS } from '@/lib/demo-data'
import type { SupabaseConnection } from '@/lib/supabase-types'

interface Step {
  name: string
  durationMs: number
  result: unknown
}

interface AgentQueryResponse {
  steps: Step[]
  otlpTrace: OpenTelemetryDocument
}

function buildTraceData(otlpTrace: OpenTelemetryDocument, steps: Step[]) {
  const spans = openTelemetrySpanAdapter.convertRawDocumentsToSpans(otlpTrace)
  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0)

  const traceRecord: TraceRecord = {
    id: 'agent-query-trace',
    name: 'Schema Inspector Agent',
    spansCount: spans.length,
    durationMs: totalMs,
    agentDescription: 'schema-inspector',
  }

  return { traceRecord, spans }
}

interface TracePanelProps {
  connection: SupabaseConnection | null
  isDemoMode: boolean
}

export function TracePanel({ connection, isDemoMode }: TracePanelProps) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[] | null>(isDemoMode ? DEMO_TRACE_STEPS : null)
  const [traceData, setTraceData] = useState<{ traceRecord: TraceRecord; spans: TraceSpan[] } | null>(
    isDemoMode ? buildTraceData(DEMO_OTLP_TRACE as OpenTelemetryDocument, DEMO_TRACE_STEPS) : null
  )

  async function runAgent() {
    if (!connection) return
    setRunning(true)
    setError(null)

    try {
      const res = await fetch('/api/edge-functions/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection, functionName: 'agent-query' }),
      })
      const json = await res.json()

      if (json.error) {
        setError(json.error)
        return
      }

      const { steps: newSteps, otlpTrace } = json.data as AgentQueryResponse
      setSteps(newSteps)
      setTraceData(buildTraceData(otlpTrace, newSteps))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  const canRun = (isDemoMode || !!connection) && !running

  return (
    <div className="p-4">
    <Tabs defaultValue="traces">
      <TabsList className="mb-6">
        <TabsTrigger value="traces" className="gap-1.5">
          <Activity className="size-3.5" />
          Agent Traces
        </TabsTrigger>
        <TabsTrigger value="skills" className="gap-1.5">
          <Grid3x3 className="size-3.5" />
          Skill Coverage
        </TabsTrigger>
      </TabsList>

      <TabsContent value="skills">
        <SkillCoverageMatrix />
      </TabsContent>

      <TabsContent value="traces">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-violet-500" />
            <h2 className="text-lg font-semibold">Agent Traces</h2>
            <Badge variant="secondary" className="text-xs">AgentPrism</Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Runs an agentic edge function instrumented with OpenTelemetry — three chained SQL
            queries, each wrapped in an OTLP span — then visualizes the trace with{' '}
            <a
              href="https://github.com/evilmartians/agent-prism"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              AgentPrism
            </a>
            .
          </p>
        </div>

        <Button
          onClick={isDemoMode ? () => {} : runAgent}
          disabled={!canRun || isDemoMode}
          size="sm"
          className="gap-2 shrink-0"
        >
          <Play className="size-3.5" />
          {running ? 'Running…' : isDemoMode ? 'Demo trace' : 'Run agent'}
        </Button>
      </div>

      {/* Deploy notice */}
      {!isDemoMode && (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-1 bg-muted/30">
          <p className="font-medium text-foreground">Before running:</p>
          <p>Deploy the edge function to your project first:</p>
          <code className="block mt-1 bg-muted rounded px-2 py-1 text-xs font-mono">
            supabase functions deploy agent-query --no-verify-jwt
          </code>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Steps summary */}
      {steps && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-[11px]">
            Agent steps
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {steps.map((step, i) => (
              <div
                key={step.name}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 text-xs font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium font-mono truncate">{step.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="size-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{step.durationMs}ms</span>
                  </div>
                </div>
                <CheckCircle2 className="size-4 text-primary shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AgentPrism TraceViewer */}
      {traceData && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-[11px]">
            OTLP trace — visualized with AgentPrism
          </p>
          {/* Standard panel background — AgentPrism adapts via its own theme.css tokens. */}
          <div
            className="w-full rounded-xl border border-border shadow-sm overflow-hidden bg-card"
            style={{
              height: '60vh',
              minHeight: '400px',
              '--agentprism-background': 'var(--card)',
              '--agentprism-foreground': 'var(--card-foreground)',
              '--agentprism-border': 'var(--border)',
              '--agentprism-border-subtle': 'color-mix(in oklch, var(--border) 50%, transparent)',
              '--agentprism-secondary': 'var(--muted)',
              '--agentprism-muted': 'var(--muted)',
            } as React.CSSProperties}
          >
            <TraceViewer data={[traceData]} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!steps && !error && !isDemoMode && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center space-y-3">
          <Activity className="size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No trace yet</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Deploy the edge function, then click "Run agent" to generate a live OTLP trace.
          </p>
        </div>
      )}
      </div>
      </TabsContent>
    </Tabs>
    </div>
  )
}
