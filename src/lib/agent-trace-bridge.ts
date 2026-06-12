import type { TraceSpan } from '@evilmartians/agent-prism-types'

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
  usage?: { totalTokens?: number }
}

type HistoricalEvent = AgentStepEvent | { type: string }

let bridgeInstance: AgentTraceBridge | null = null

export interface LiveTrace {
  id: string
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
  private pendingSpans: Map<string, TraceSpan> = new Map()
  private isListening = false

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
    this.trace = this.makeEmptyTrace()
    this.pendingSpans.clear()
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

  // ── postMessage handler ──────────────────────────────────────────────────

  private handleMessage = (event: MessageEvent): void => {
    if (event.source !== window) return
    const data = event.data
    if (!data || typeof data !== 'object') return
    if (data.channel !== 'PAGE_AGENT_EXT_RESPONSE') return

    const { action, payload } = data as { action: string; payload: unknown }

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

    switch (activity.type) {
      case 'thinking': {
        const span = this.makeSpan({
          id: `thinking-${now}`,
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
          id: `exec-${activity.tool}-${now}`,
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
          existing.duration = activity.duration
          existing.output = activity.output
          this.pendingSpans.delete(key)
        } else {
          this.trace.spans.push(
            this.makeSpan({
              id: `exec-${activity.tool}-${now}`,
              title: `Executed: ${activity.tool}`,
              type: 'tool_execution',
              status: 'success',
              startTime: now - (activity.duration ?? 0),
              endTime: now,
              duration: activity.duration,
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
            id: `retry-${now}`,
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
            id: `error-${now}`,
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
    const lastEvent = history[history.length - 1]
    if (lastEvent.type !== 'step') return

    const step = lastEvent as AgentStepEvent
    const now = Date.now()
    const children: TraceSpan[] = []

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

    children.push(
      this.makeSpan({
        id: `action-${step.stepIndex}`,
        title: `Action: ${step.action.name}`,
        type: 'tool_execution',
        status: 'success',
        startTime: now,
        endTime: now,
        duration: 0,
        input: JSON.stringify(step.action.input, null, 2),
        output: step.action.output,
      })
    )

    this.trace.spans.push(
      this.makeSpan({
        id: `step-${step.stepIndex}`,
        title: `Step ${step.stepIndex + 1}`,
        type: 'agent_invocation',
        status: 'success',
        startTime: now,
        endTime: now,
        duration: 0,
        tokensCount: step.usage?.totalTokens,
        children,
      })
    )

    this.emit()
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
    return {
      raw,
      attributes: [],
      ...partial,
    } as TraceSpan
  }
}

export function getAgentTraceBridge(): AgentTraceBridge {
  return AgentTraceBridge.getInstance()
}
