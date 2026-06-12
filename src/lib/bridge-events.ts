/**
 * Mirror of `@supa-agent/bridge-events` (supa-agent monorepo, v1.8.2).
 *
 * The contract is owned by the publisher repo (JesseVent/supa-agent,
 * packages/bridge-events). Replace this file with the npm package once it is
 * published: `npm i @supa-agent/bridge-events` and re-export from there.
 * Until then this local copy keeps Vercel builds self-contained.
 *
 * The action names and `getChannelName` derivation are a stable wire
 * contract — do not modify them here.
 */

/** window.postMessage channel used by the tab-local bridge (legacy transport) */
export const PAGE_AGENT_EXT_RESPONSE_CHANNEL = 'PAGE_AGENT_EXT_RESPONSE'

/** Realtime topic prefix; full topic is `agent-trace:{sha256hex(scopeId)}` */
export const AGENT_TRACE_TOPIC_PREFIX = 'agent-trace:'

/** Table the publisher persists trace events to (broadcasts via DB trigger) */
export const AGENT_TRACE_EVENTS_TABLE = 'agent_trace_events'

/** Edge function that exchanges a Management API token for a project JWT */
export const AGENT_TRACE_TOKEN_FUNCTION = 'agent-trace-token'

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error'

export type BridgeAction =
  | 'status_change_event'
  | 'activity_event'
  | 'history_change_event'
  | 'execute_result'

/**
 * Envelope persisted to `agent_trace_events` and broadcast over Realtime.
 * `seq` is monotonic per run so subscribers can order, dedupe and backfill.
 */
export interface TraceEventEnvelope {
  runId: string
  seq: number
  ts: number
  action: BridgeAction
  payload: unknown
}

/** SHA-256 hex digest via Web Crypto. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Derive the Realtime topic for a pairing scope (shared platform user id, or a
 * pre-shared token in fallback mode). Must stay byte-identical to the SQL
 * helper `public.agent_trace_topic(uuid)` installed by supa_agent_trace:
 * 'agent-trace:' || encode(extensions.digest(lower(uid::text), 'sha256'), 'hex')
 */
export async function getChannelName(scopeId: string): Promise<string> {
  const scope = await sha256Hex(scopeId.trim().toLowerCase())
  return `${AGENT_TRACE_TOPIC_PREFIX}${scope}`
}
