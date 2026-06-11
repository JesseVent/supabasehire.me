import { NextResponse, type NextRequest } from 'next/server'
import { serverTraceBus } from '@/lib/server-trace-bus'

/**
 * GET /api/agent/trace — Server-Sent Events stream of backend agent traces.
 *
 * Connect with:
 *   const es = new EventSource('/api/agent/trace')
 *   es.onmessage = (e) => console.log(JSON.parse(e.data))
 *
 * Events pushed:
 *   - llm_call      → LLM request/response via /api/agent/chat
 *   - tool_execution → MCP tool calls (future)
 *   - error        → Backend errors
 *   - retry        → Rate-limit or transient retries
 *   - status       → Agent status transitions
 *
 * The connection stays open until the client disconnects.
 */

export const dynamic = 'force-dynamic' // Never cache SSE

export async function GET(_request: NextRequest) {
  const encoder = new TextEncoder()
  const subId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection ack
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ traceId: serverTraceBus.currentTraceId })}\n\n`)
      )

      const unsubscribe = serverTraceBus.subscribe({
        id: subId,
        write(event) {
          const payload = JSON.stringify(event)
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
        },
        close() {
          try {
            controller.close()
          } catch {
            // already closed
          }
        },
      })

      // Heartbeat to keep connection alive through proxies / idle timeouts
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
          unsubscribe()
        }
      }, 30_000)

      // Cleanup on client disconnect
      _request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // ignore
        }
      })
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
