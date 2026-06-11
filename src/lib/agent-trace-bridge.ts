import type { TraceSpan, TraceSpanCategory, TraceSpanStatus } from '@evilmartians/agent-prism-types'

// IIFE event payload types (kept for the extension bridge postMessage protocol)
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
 * Bridge that listens to supa-agent events and converts them to AgentPrism-compatible spans.
 *
 * The supa-agent IIFE emits three event types on its EventTarget:
 *   - `statuschange`  → agent status transitions
 *   - `activity`      → transient real-time feedback (thinking, executing, executed, retrying, error)
 *   - `historychange` → persistent history events (step, observation, retry, error)
 *
 * This bridge subscribes to all three, builds OTLP-style spans incrementally,
 * and notifies listeners so the UI can render a live AgentPrism trace.
 *
 * Usage:
 *   const bridge = getAgentTraceBridge()
 *   bridge.subscribe((trace) => setLiveTrace(trace))
 *   bridge.attach(window.supaAgent)
 */
export class AgentTraceBridge {
  private listeners: Set<TraceListener> = new Set()
  private trace: LiveTrace = this.makeEmptyTrace()
  private pendingSpans: Map<string, TraceSpan> = new Map()
  private attachedAgent: EventTarget | null = null
  private boundHandlers = {
    status: this.onStatusChange.bind(this),
    activity: this.onActivity.bind(this),
    history: this.onHistoryChange.bind(this),
  }

  /** Return the singleton bridge instance */
  static getInstance(): AgentTraceBridge {
    if (!bridgeInstance) bridgeInstance = new AgentTraceBridge()
    return bridgeInstance
  }

  /** Destroy the singleton (mainly for tests/HMR) */
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
    // Immediately emit current state so subscriber doesn't miss anything
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
        // isolated per-listener so one bad UI component can't kill the stream
      }
    }
  }

  /** Attach to a running supa-agent instance */
  attach(agent: EventTarget | null | undefined): void {
    if (!agent || this.attachedAgent === agent) return
    this.detach()
    this.attachedAgent = agent
    agent.addEventListener('statuschange', this.boundHandlers.status)
    agent.addEventListener('activity', this.boundHandlers.activity)
    agent.addEventListener('historychange', this.boundHandlers.history)
  }

  /** Detach from the current agent */
  detach(): void {
    if (!this.attachedAgent) return
    this.attachedAgent.removeEventListener('statuschange', this.boundHandlers.status)
    this.attachedAgent.removeEventListener('activity', this.boundHandlers.activity)
    this.attachedAgent.removeEventListener('historychange', this.boundHandlers.history)
    this.attachedAgent = null
  }

  /** Reset the trace to empty (call when a new task starts) */
  reset(): void {
    this.trace = this.makeEmptyTrace()
    this.pendingSpans.clear()
    this.emit()
  }

  /** Mark the trace as completed and finalize any pending spans */
  complete(): void {
    this.trace.status = 'completed'
    // Close out any spans still marked pending
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
    this.detach()
    this.listeners.clear()
    this.pendingSpans.clear()
  }

  // ── Event handlers ──────────────────────────────────────────────────────

  private onStatusChange(_event: Event): void {
    // The event itself doesn't carry data; read from agent if needed.
    // We mainly use this as a heartbeat.
    this.emit()
  }

  private onActivity(event: Event): void {
    const activity = (event as CustomEvent<AgentActivity>).detail
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
        // Close previous thinking span if still open
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
          // Late event — append as closed span
          this.trace.spans.push(
            this.makeSpan({
              id: `exec-${activity.tool}-${now}`,
              title: `Executed: ${activity.tool}`,
              type: 'tool_execution',
              status: 'success',
              startTime: now - activity.duration,
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

  private onHistoryChange(event: Event): void {
    const history = (event as CustomEvent<HistoricalEvent[]>).detail
    if (!Array.isArray(history) || history.length === 0) return

    const lastEvent = history[history.length - 1]
    if (lastEvent.type !== 'step') return

    const step = lastEvent as AgentStepEvent
    const now = Date.now()

    // Build a parent span for the whole step with reflection + action as children
    const children: TraceSpan[] = []

    if (step.reflection) {
      const reflectionParts: string[] = []
      if (step.reflection.evaluation_previous_goal) {
        reflectionParts.push(`Evaluation: ${step.reflection.evaluation_previous_goal}`)
      }
      if (step.reflection.memory) {
        reflectionParts.push(`Memory: ${step.reflection.memory}`)
      }
      if (step.reflection.next_goal) {
        reflectionParts.push(`Next Goal: ${step.reflection.next_goal}`)
      }
      if (reflectionParts.length > 0) {
        children.push(
          this.makeSpan({
            id: `reflection-${step.stepIndex}`,
            title: 'Reflection',
            type: 'span',
            status: 'success',
            startTime: now,
            endTime: now,
            duration: 0,
            output: reflectionParts.join('\n'),
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
      span.duration = now - span.startTime.getTime()
      this.pendingSpans.delete(key)
    }
  }

  private makeSpan(partial: Omit<TraceSpan, 'raw'> & Partial<Pick<TraceSpan, 'raw'>>): TraceSpan {
    const raw = partial.output ?? partial.input ?? ''
    return {
      raw,
      attributes: [],
      ...partial,
    } as TraceSpan
  }
}

/** Convenience singleton accessor */
export function getAgentTraceBridge(): AgentTraceBridge {
  return AgentTraceBridge.getInstance()
}

