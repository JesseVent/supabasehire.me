'use client'

import '@/components/agent-prism/theme/theme.css'

import { openTelemetrySpanAdapter } from '@evilmartians/agent-prism-data'
import type { OpenTelemetryDocument, TraceRecord, TraceSpan } from '@evilmartians/agent-prism-types'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Grid3x3,
  Play,
  Radio,
  Square,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TraceViewer } from '@/components/agent-prism/TraceViewer/TraceViewer'
import { SkillCoverageMatrix } from '@/components/skill-coverage-matrix'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiFetch } from '@/lib/api-auth'
import { DEMO_CONNECTION_ID, DEMO_OTLP_TRACE, DEMO_TRACE_STEPS } from '@/lib/demo-data'
import { getAgentTraceBridge, type LiveTrace } from '@/lib/agent-trace-bridge'
import type { TraceEvent } from '@/lib/server-trace-bus'
import type { SupabaseConnection } from '@/lib/supabase-types'
import { useSupabaseStore } from '@/store/supabase-store'

interface Step {
  name: string
  durationMs: number
  result: unknown
}

interface AgentQueryResponse {
  steps: Step[]
  otlpTrace: OpenTelemetryDocument
}

function backendEventToSpan(event: TraceEvent): TraceSpan {
  const startTime = new Date(event.timestamp)
  const endTime = event.duration
    ? new Date(event.timestamp + event.duration)
    : startTime
  const status: TraceSpan['status'] =
    event.type === 'error'
      ? 'error'
      : event.type === 'retry'
        ? 'warning'
        : event.duration
          ? 'success'
          : 'pending'

  return {
    id: `srv-${event.timestamp}`,
    title: event.title,
    startTime,
    endTime,
    duration: event.duration ?? 0,
    type: event.type === 'llm_call' ? 'llm_call' : event.type === 'tool_execution' ? 'tool_execution' : event.type === 'error' ? 'event' : 'span',
    raw: event.output ?? event.error ?? event.input ?? '',
    status,
    attributes: [],
    metadata: event.metadata,
    children: [],
  }
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
  const [traceData, setTraceData] = useState<{
    traceRecord: TraceRecord
    spans: TraceSpan[]
  } | null>(
    isDemoMode ? buildTraceData(DEMO_OTLP_TRACE as OpenTelemetryDocument, DEMO_TRACE_STEPS) : null
  )

  // ── Live trace state ────────────────────────────────────────────────────
  const [isLive, setIsLive] = useState(false)
  const [liveTrace, setLiveTrace] = useState<LiveTrace | null>(null)
  const liveLogRef = useRef<HTMLDivElement>(null)

  async function runAgent() {
    if (!connection) return
    setRunning(true)
    setError(null)

    try {
      const res = await apiFetch('/api/edge-functions/invoke', connection, {
        functionName: 'agent-query',
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

  // ── Backend trace spans (from SSE) ──────────────────────────────────────
  const [backendSpans, setBackendSpans] = useState<TraceSpan[]>([])

  // ── Live trace bridge ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isLive) {
      setLiveTrace(null)
      setBackendSpans([])
      return
    }

    const bridge = getAgentTraceBridge()
    bridge.reset()
    bridge.startListening()

    const unsubscribe = bridge.subscribe((trace) => {
      setLiveTrace(trace)
      if (liveLogRef.current) {
        liveLogRef.current.scrollTop = liveLogRef.current.scrollHeight
      }
    })

    // ── Backend SSE connection ────────────────────────────────────────────
    const es = new EventSource('/api/agent/trace')
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as TraceEvent
        const span = backendEventToSpan(event)
        setBackendSpans((prev) => [...prev, span])
      } catch {
        // ignore malformed events
      }
    }
    es.onerror = () => {
      // SSE will auto-reconnect; no action needed
    }

    return () => {
      bridge.stopListening()
      unsubscribe()
      es.close()
    }
  }, [isLive])

  const mergedSpans = useMemo(() => {
    if (!liveTrace) return backendSpans
    return [...liveTrace.spans, ...backendSpans]
  }, [liveTrace, backendSpans])

  const liveTraceData = useCallback(() => {
    const spans = mergedSpans
    if (spans.length === 0) return null
    const totalMs = spans.reduce((sum, s) => sum + (s.duration || 0), 0)
    const traceRecord: TraceRecord = {
      id: liveTrace?.id ?? 'live-trace',
      name: liveTrace?.name ?? 'Live Agent Execution',
      spansCount: spans.length,
      durationMs: totalMs,
      agentDescription: 'live-agent',
    }
    return { traceRecord, spans }
  }, [mergedSpans, liveTrace?.id, liveTrace?.name])

  const activeTraceData = isLive ? liveTraceData() : traceData

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
                  <Badge variant="secondary" className="text-xs">
                    AgentPrism
                  </Badge>
                  {isLive && (
                    <Badge
                      variant="default"
                      className="text-xs gap-1 bg-red-500/10 text-red-500 border-red-500/20 animate-pulse"
                    >
                      <Radio className="size-3" />
                      LIVE
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground max-w-xl">
                  {isLive
                    ? 'Real-time trace stream from the running supa-agent. Every tool call, reflection, and LLM invocation is captured as it happens.'
                    : 'Runs an agentic edge function instrumented with OpenTelemetry — three chained SQL queries, each wrapped in an OTLP span — then visualizes the trace with '}
                  {!isLive && (
                    <a
                      href="https://github.com/evilmartians/agent-prism"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      AgentPrism
                    </a>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant={isLive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIsLive((prev) => !prev)}
                  className="gap-2"
                >
                  {isLive ? (
                    <>
                      <Square className="size-3.5" />
                      Stop Live
                    </>
                  ) : (
                    <>
                      <Radio className="size-3.5" />
                      Live Trace
                    </>
                  )}
                </Button>

                {!isLive && (
                  <Button
                    onClick={isDemoMode ? () => {} : runAgent}
                    disabled={!canRun || isDemoMode}
                    size="sm"
                    className="gap-2"
                  >
                    <Play className="size-3.5" />
                    {running ? 'Running…' : isDemoMode ? 'Demo trace' : 'Run agent'}
                  </Button>
                )}
              </div>
            </div>

            {/* Deploy notice (static mode only) */}
            {!isDemoMode && !isLive && (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-1 bg-muted/30">
                <p className="font-medium text-foreground">Before running:</p>
                <p>Deploy the edge function to your project first:</p>
                <code className="block mt-1 bg-muted rounded px-2 py-1 text-xs font-mono">
                  supabase functions deploy agent-query --no-verify-jwt
                </code>
              </div>
            )}

            {/* Live mode instructions */}
            {isLive && liveTrace?.status === 'idle' && (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-1 bg-muted/30">
                <p className="font-medium text-foreground">Waiting for agent…</p>
                {(window as any).PAGE_AGENT_EXT ? (
                  <p>
                    Extension detected. Open the agent sidebar and start a task — trace events will
                    stream here automatically.
                  </p>
                ) : (
                  <p>
                    Install the Supa Agent browser extension, open the agent sidebar (Bot button),
                    and start a task on this page.
                  </p>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Steps summary (static mode) */}
            {!isLive && steps && (
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

            {/* Live activity feed */}
            {isLive && mergedSpans.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-[11px]">
                  Activity Log
                </p>
                <ScrollArea
                  ref={liveLogRef}
                  className="h-48 rounded-lg border border-border bg-card"
                >
                  <div className="flex flex-col gap-1 p-2">
                    {mergedSpans.map((span) => (
                      <div
                        key={span.id}
                        className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-accent/50"
                      >
                        <span
                          className={`size-2 rounded-full shrink-0 ${
                            span.status === 'pending'
                              ? 'bg-amber-400 animate-pulse'
                              : span.status === 'error'
                                ? 'bg-red-500'
                                : span.status === 'warning'
                                  ? 'bg-orange-400'
                                  : 'bg-emerald-500'
                          }`}
                        />
                        <span className="font-mono text-muted-foreground shrink-0">
                          {span.startTime.toLocaleTimeString([], {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                        <span className="font-medium truncate">{span.title}</span>
                        {span.duration > 0 && (
                          <span className="text-muted-foreground ml-auto shrink-0">
                            {span.duration}ms
                          </span>
                        )}
                        {span.tokensCount && (
                          <span className="text-muted-foreground shrink-0">
                            {span.tokensCount} tok
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* AgentPrism TraceViewer */}
            {activeTraceData && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-[11px]">
                  {isLive ? 'Live trace stream' : 'OTLP trace — visualized with AgentPrism'}
                </p>
                <div
                  className="w-full rounded-xl border border-border shadow-sm overflow-hidden bg-card"
                  style={
                    {
                      height: '60vh',
                      minHeight: '400px',
                      '--agentprism-background': 'var(--card)',
                      '--agentprism-foreground': 'var(--card-foreground)',
                      '--agentprism-border': 'var(--border)',
                      '--agentprism-border-subtle':
                        'color-mix(in oklch, var(--border) 50%, transparent)',
                      '--agentprism-secondary': 'var(--muted)',
                      '--agentprism-muted': 'var(--muted)',
                    } as React.CSSProperties
                  }
                >
                  <TraceViewer data={[activeTraceData]} />
                </div>
              </div>
            )}

            {/* Empty state */}
            {!activeTraceData && !error && !isDemoMode && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center space-y-3">
                <Activity className="size-10 text-muted-foreground/40" />
                <p className="text-sm font-medium">No trace yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  {isLive
                    ? 'Start the agent from the sidebar to see a live trace stream.'
                    : 'Deploy the edge function, then click "Run agent" to generate a live OTLP trace.'}
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
