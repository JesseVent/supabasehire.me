/**
 * Server-side in-memory trace event bus.
 *
 * This is a lightweight pub/sub used to stream agent trace events from the
 * backend (e.g., the LLM proxy in /api/agent/chat) to connected clients via
 * Server-Sent Events.
 *
 * ⚠️ In-memory only — events are NOT persisted. On server restart or cold-start
 * (Next.js dev mode), the bus resets. For production persistence, swap the
 * Map for Redis / Upstash / etc.
 */

export interface TraceEvent {
  type: 'llm_call' | 'tool_execution' | 'error' | 'retry' | 'step' | 'status'
  timestamp: number
  traceId: string
  /** Human-readable label */
  title: string
  /** Duration in ms (optional for pending events) */
  duration?: number
  /** Optional metadata */
  metadata?: Record<string, unknown>
  /** Raw input / output for detail views */
  input?: string
  output?: string
  /** Error message if type === 'error' */
  error?: string
}

export interface TraceSubscriber {
  id: string
  write: (event: TraceEvent) => void
  close: () => void
}

class TraceBus {
  private subscribers = new Map<string, TraceSubscriber>()
  private traceId = `srv-${Date.now()}`
  private seq = 0

  get currentTraceId(): string {
    return this.traceId
  }

  resetTrace(): void {
    this.traceId = `srv-${Date.now()}`
    this.seq = 0
  }

  subscribe(sub: TraceSubscriber): () => void {
    this.subscribers.set(sub.id, sub)
    return () => {
      this.subscribers.delete(sub.id)
    }
  }

  publish(event: Omit<TraceEvent, 'timestamp' & 'traceId'>): void {
    const fullEvent: TraceEvent = {
      ...event,
      timestamp: Date.now(),
      traceId: this.traceId,
    }
    for (const sub of this.subscribers.values()) {
      try {
        sub.write(fullEvent)
      } catch {
        // Subscriber disconnected — clean up lazily on next publish
        this.subscribers.delete(sub.id)
        try {
          sub.close()
        } catch {
          // ignore
        }
      }
    }
  }

  subscriberCount(): number {
    return this.subscribers.size
  }
}

/** Singleton server-side trace bus */
export const serverTraceBus = new TraceBus()
