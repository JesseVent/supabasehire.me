import type { TraceSpan } from '@evilmartians/agent-prism-types'
import { type BridgeAction, PAGE_AGENT_EXT_RESPONSE_CHANNEL } from '@/lib/bridge-events'

interface AgentActivity {
  type: 'thinking' | 'executing' | 'executed' | 'retrying' | 'error'
  tool?: string
  input?: unknown
  output?: string
  duration?: number
  attempt?: number
  maxAttempts?: number
  message?: string
}

interface AgentStepEvent {
  type: 'step'
  stepIndex: number
  reflection?: { evaluation_previous_goal?: string; memory?: string; next_goal?: string }
  action: { name: string; input?: unknown; output?: string }
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    cachedTokens?: number
    reasoningTokens?: number
  }
  rawRequest?: unknown
  rawResponse?: unknown
}

interface ObservationEvent {
  type: 'observation'
  content: string
}

interface RetryEvent {
  type: 'retry'
  message: string
  attempt: number
  maxAttempts: number
}

interface AgentErrorHistoryEvent {
  type: 'error'
  message: string
  rawResponse?: unknown
}

type HistoricalEvent = AgentStepEvent | ObservationEvent | RetryEvent | AgentErrorHistoryEvent | { type: string }

let bridgeInstance: AgentTraceBridge | null = null

export interface LiveTrace {
  id: string
  /** 32-hex W3C trace id — stamped as `traceparent` on project-host requests so gateway/edge logs join by it. */
  otlpTraceId: string
  /** True once `otlpTraceId` has actually gone out on a request. Extension-driven runs never set it. */
  propagated: boolean
  name: string
  startTime: number
  spans: TraceSpan[]
  status: 'running' | 'completed' | 'error' | 'idle'
}

export type TraceListener = (trace: LiveTrace) => void

/**
 * Bridge that intercepts window.PAGE_AGENT_EXT_RESPONSE postMessage events emitted
 * by the supa-agent content script and converts them into AgentPrism-compatible spans.
 *
 * When a caller invokes window.PAGE_AGENT_EXT.execute(task, config) the content
 * script broadcasts three event types back via window.postMessage:
 *   - status_change_event  → 'running' | 'completed' | 'error' | 'idle'
 *   - activity_event       → thinking / executing / executed / retrying / error
 *   - history_change_event → full HistoricalEvent[] array
 *   - execute_result       → final result (marks trace complete)
 *
 * Call startListening() to begin capturing and stopListening() to clean up.
 */
export class AgentTraceBridge {
  private listeners: Set<TraceListener> = new Set()
  private trace: LiveTrace = this.makeEmptyTrace()
  private completedTraces: LiveTrace[] = []
  private pendingSpans: Map<string, TraceSpan> = new Map()
  private renderedSteps: Set<number> = new Set()
  private isListening = false
  private spanSeq = 0
  private lastStepTime = Date.now()

  static getInstance(): AgentTraceBridge {
    if (!bridgeInstance) bridgeInstance = new AgentTraceBridge()
    return bridgeInstance
  }

  static reset(): void {
    bridgeInstance?.dispose()
    bridgeInstance = null
  }

  private makeEmptyTrace(): LiveTrace {
    return {
      id: `live-trace-${Date.now()}`,
      otlpTraceId: crypto.randomUUID().replaceAll('-', ''),
      propagated: false,
      name: 'Live Agent Execution',
      startTime: Date.now(),
      spans: [],
      status: 'idle',
    }
  }

  subscribe(listener: TraceListener): () => void {
    this.listeners.add(listener)
    listener(this.trace)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.trace)
      } catch {
        // isolated per listener
      }
    }
  }

  startListening(): void {
    if (this.isListening) return
    this.isListening = true
    window.addEventListener('message', this.handleMessage)
  }

  stopListening(): void {
    if (!this.isListening) return
    this.isListening = false
    window.removeEventListener('message', this.handleMessage)
  }

  reset(): void {
    // Archive the current trace if it has content so the sidebar can show history.
    if (this.trace.spans.length > 0) {
      this.completedTraces.push({ ...this.trace, spans: [...this.trace.spans] })
    }
    this.trace = this.makeEmptyTrace()
    this.pendingSpans.clear()
    this.renderedSteps.clear()
    this.spanSeq = 0
    this.lastStepTime = this.trace.startTime
    this.emit()
  }

  /** All traces: completed runs in chronological order + the current run (if non-empty). */
  getAllTraces(): LiveTrace[] {
    if (this.trace.spans.length > 0 || this.trace.status !== 'idle') {
      return [...this.completedTraces, this.trace]
    }
    return [...this.completedTraces]
  }

  /** W3C trace id of the currently running trace (null when idle). */
  getActiveTraceId(): string | null {
    return this.trace.status === 'running' ? this.trace.otlpTraceId : null
  }

  /** Record that the running trace's id was stamped on an outgoing request. */
  markPropagated(): void {
    if (this.trace.propagated) return
    this.trace.propagated = true
    this.emit()
  }

  complete(): void {
    this.trace.status = 'completed'
    const now = Date.now()
    for (const span of this.trace.spans) {
      if (span.status === 'pending') {
        span.status = 'success'
        span.endTime = new Date(now)
        span.duration = now - span.startTime.getTime()
      }
    }
    this.emit()
  }

  dispose(): void {
    this.stopListening()
    this.listeners.clear()
    this.pendingSpans.clear()
  }

  // ── Transport-agnostic ingestion ─────────────────────────────────────────

  /**
   * Feed one bridge event into the trace, regardless of transport
   * (window.postMessage, Supabase Realtime broadcast, or backfill replay).
   */
  ingest(action: BridgeAction | string, payload: unknown): void {
    switch (action) {
      case 'status_change_event':
        this.onStatusChange(payload as string)
        break
      case 'activity_event':
        this.onActivity(payload as AgentActivity)
        break
      case 'history_change_event':
        this.onHistoryChange(payload as HistoricalEvent[])
        break
      case 'execute_result':
        this.complete()
        break
    }
  }

  // ── postMessage handler (tab-local transport) ────────────────────────────

  private handleMessage = (event: MessageEvent): void => {
    if (event.source !== window) return
    const data = event.data
    if (!data || typeof data !== 'object') return
    if (data.channel !== PAGE_AGENT_EXT_RESPONSE_CHANNEL) return

    const { action, payload } = data as { action: string; payload: unknown }
    this.ingest(action, payload)
  }

  // ── Span builders ────────────────────────────────────────────────────────

  private onStatusChange(status: string): void {
    if (status === 'running') {
      this.trace.status = 'running'
    } else if (status === 'completed') {
      this.complete()
    } else if (status === 'error') {
      this.trace.status = 'error'
    }
    this.emit()
  }

  private onActivity(activity: AgentActivity): void {
    if (!activity) return
    const now = Date.now()

    const seq = ++this.spanSeq

    switch (activity.type) {
      case 'thinking': {
        const span = this.makeSpan({
          id: `thinking-${seq}`,
          title: 'Thinking…',
          type: 'llm_call',
          status: 'pending',
          startTime: now,
        })
        this.trace.spans.push(span)
        this.pendingSpans.set('thinking', span)
        break
      }

      case 'executing': {
        this.closePending('thinking', now)
        const span = this.makeSpan({
          id: `exec-${activity.tool}-${seq}`,
          title: `Execute: ${activity.tool}`,
          type: 'tool_execution',
          status: 'pending',
          startTime: now,
          input: JSON.stringify(activity.input, null, 2),
        })
        this.trace.spans.push(span)
        this.pendingSpans.set(`exec-${activity.tool}`, span)
        break
      }

      case 'executed': {
        const key = `exec-${activity.tool}`
        const existing = this.pendingSpans.get(key)
        if (existing) {
          existing.status = 'success'
          existing.endTime = new Date(now)
          const existingStartMs = existing.startTime instanceof Date ? existing.startTime.getTime() : existing.startTime as number
          existing.duration = activity.duration ?? (now - existingStartMs)
          existing.output = activity.output
          this.pendingSpans.delete(key)
        } else {
          const inferredDuration = activity.duration ?? 0
          this.trace.spans.push(
            this.makeSpan({
              id: `exec-${activity.tool}-${seq}`,
              title: `Executed: ${activity.tool}`,
              type: 'tool_execution',
              status: 'success',
              startTime: now - inferredDuration,
              endTime: now,
              duration: inferredDuration,
              input: JSON.stringify(activity.input, null, 2),
              output: activity.output,
            })
          )
        }
        break
      }

      case 'retrying': {
        this.trace.spans.push(
          this.makeSpan({
            id: `retry-${seq}`,
            title: `Retry ${activity.attempt}/${activity.maxAttempts}`,
            type: 'event',
            status: 'warning',
            startTime: now,
            endTime: now,
            duration: 0,
          })
        )
        break
      }

      case 'error': {
        this.trace.spans.push(
          this.makeSpan({
            id: `error-${seq}`,
            title: 'Agent Error',
            type: 'event',
            status: 'error',
            startTime: now,
            endTime: now,
            duration: 0,
            output: activity.message,
          })
        )
        this.trace.status = 'error'
        break
      }
    }

    this.emit()
  }

  private onHistoryChange(history: HistoricalEvent[]): void {
    if (!Array.isArray(history) || history.length === 0) return

    // Process every event — the publisher may emit a single history_change_event
    // with the full history at run end (or one per event with cumulative history).
    // renderedSteps guards step dedup; non-step events are deduplicated by index position.
    let added = false
    for (let i = 0; i < history.length; i++) {
      const event = history[i]
      if (event.type === 'step') {
        const step = event as AgentStepEvent
        if (this.renderedSteps.has(step.stepIndex)) continue
        this.renderedSteps.add(step.stepIndex)
        this.buildStepSpan(step)
        added = true
      } else if (event.type === 'observation') {
        const obs = event as ObservationEvent
        const id = `obs-${i}`
        if (this.trace.spans.some((s) => s.id === id)) continue
        this.trace.spans.push(
          this.makeSpan({
            id,
            title: `Observation: ${obs.content.slice(0, 60)}${obs.content.length > 60 ? '…' : ''}`,
            type: 'event',
            status: 'success',
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 0,
            output: obs.content,
          })
        )
        added = true
      } else if (event.type === 'retry') {
        const ret = event as RetryEvent
        const id = `retry-hist-${i}`
        if (this.trace.spans.some((s) => s.id === id)) continue
        this.trace.spans.push(
          this.makeSpan({
            id,
            title: `Retry ${ret.attempt}/${ret.maxAttempts}`,
            type: 'event',
            status: 'warning',
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 0,
            output: ret.message,
          })
        )
        added = true
      } else if (event.type === 'error') {
        const err = event as AgentErrorHistoryEvent
        const id = `err-hist-${i}`
        if (this.trace.spans.some((s) => s.id === id)) continue
        this.trace.spans.push(
          this.makeSpan({
            id,
            title: 'Agent Error',
            type: 'event',
            status: 'error',
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 0,
            output: err.message,
            input: err.rawResponse != null ? JSON.stringify(err.rawResponse, null, 2) : undefined,
          })
        )
        this.trace.status = 'error'
        added = true
      }
    }

    if (added) this.emit()
  }

  private buildStepSpan(step: AgentStepEvent): void {
    const now = Date.now()
    const stepStart = this.lastStepTime
    this.lastStepTime = now
    const children: TraceSpan[] = []

    // ── LLM request (prompt sent to the model) ────────────────────────────
    if (step.rawRequest != null) {
      children.push(
        this.makeSpan({
          id: `llm-req-${step.stepIndex}`,
          title: 'LLM Request',
          type: 'llm_call',
          status: 'success',
          startTime: now,
          endTime: now,
          duration: 0,
          input: JSON.stringify(step.rawRequest, null, 2),
        })
      )
    }

    // ── LLM response (raw API response including reasoning tokens) ────────
    if (step.rawResponse != null) {
      const usageParts: string[] = []
      if (step.usage) {
        const u = step.usage
        if (u.promptTokens) usageParts.push(`prompt: ${u.promptTokens}`)
        if (u.completionTokens) usageParts.push(`completion: ${u.completionTokens}`)
        if (u.cachedTokens) usageParts.push(`cached: ${u.cachedTokens}`)
        if (u.reasoningTokens) usageParts.push(`reasoning: ${u.reasoningTokens}`)
        if (u.totalTokens) usageParts.push(`total: ${u.totalTokens}`)
      }
      children.push(
        this.makeSpan({
          id: `llm-res-${step.stepIndex}`,
          title: 'LLM Response',
          type: 'llm_call',
          status: 'success',
          startTime: now,
          endTime: now,
          duration: 0,
          output: JSON.stringify(step.rawResponse, null, 2),
          ...(usageParts.length > 0 ? { input: `Tokens — ${usageParts.join(', ')}` } : {}),
        })
      )
    }

    // ── Reflection ────────────────────────────────────────────────────────
    if (step.reflection) {
      const parts: string[] = []
      if (step.reflection.evaluation_previous_goal) parts.push(`Evaluation: ${step.reflection.evaluation_previous_goal}`)
      if (step.reflection.memory) parts.push(`Memory: ${step.reflection.memory}`)
      if (step.reflection.next_goal) parts.push(`Next Goal: ${step.reflection.next_goal}`)
      if (parts.length > 0) {
        children.push(
          this.makeSpan({
            id: `reflection-${step.stepIndex}`,
            title: 'Reflection',
            type: 'span',
            status: 'success',
            startTime: now,
            endTime: now,
            duration: 0,
            output: parts.join('\n'),
          })
        )
      }
    }

    // ── Action (tool execution) ───────────────────────────────────────────
    // step.action.input may be null when arguments only exist in rawResponse tool_calls
    let actionInput: unknown = step.action.input
    if (actionInput == null && step.rawResponse != null) {
      const resp = step.rawResponse as {
        choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string; name?: string } }> } } >
      }
      const toolCalls = resp.choices?.[0]?.message?.tool_calls
      if (toolCalls && toolCalls.length > 0) {
        const argStr = toolCalls[0].function?.arguments
        if (argStr) {
          try { actionInput = JSON.parse(argStr) } catch { actionInput = argStr }
        }
      }
    }
    children.push(
      this.makeSpan({
        id: `action-${step.stepIndex}`,
        title: `Action: ${step.action.name}`,
        type: 'tool_execution',
        status: 'success',
        startTime: now,
        endTime: now,
        duration: 0,
        input: actionInput != null ? JSON.stringify(actionInput, null, 2) : undefined,
        output: step.action.output,
      })
    )

    // ── Step root span ────────────────────────────────────────────────────
    // startTime is the previous step's arrival time — steps stream in as they
    // complete, so the gap between arrivals is the real wall-clock duration.
    this.trace.spans.push(
      this.makeSpan({
        id: `step-${step.stepIndex}`,
        title: `Step ${step.stepIndex + 1}${step.action.name === 'done' ? ' (done)' : ''}`,
        type: 'agent_invocation',
        status: 'success',
        startTime: stepStart,
        endTime: now,
        duration: now - stepStart,
        tokensCount: step.usage?.totalTokens,
        children,
      })
    )
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private closePending(key: string, now: number): void {
    const span = this.pendingSpans.get(key)
    if (span && span.status === 'pending') {
      span.status = 'success'
      span.endTime = new Date(now)
      const startMs = typeof span.startTime === 'number' ? span.startTime : span.startTime.getTime()
      span.duration = now - startMs
      this.pendingSpans.delete(key)
    }
  }

  private makeSpan(
    partial: Omit<TraceSpan, 'raw' | 'attributes'> & Partial<Pick<TraceSpan, 'raw' | 'attributes'>>
  ): TraceSpan {
    const raw = partial.output ?? partial.input ?? ''
    // Normalize startTime/endTime to Date so the UI can call .toLocaleTimeString()
    const startTime = partial.startTime instanceof Date ? partial.startTime : new Date(partial.startTime as number)
    // Fall back to startTime when endTime is absent so getDurationMs returns 0 instead of NaN
    const endTime = partial.endTime instanceof Date ? partial.endTime : partial.endTime != null ? new Date(partial.endTime as number) : startTime
    return {
      raw,
      attributes: [],
      ...partial,
      startTime,
      endTime,
    } as TraceSpan
  }
}

export function getAgentTraceBridge(): AgentTraceBridge {
  return AgentTraceBridge.getInstance()
}
