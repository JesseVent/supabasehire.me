import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { getAgentTraceBridge } from '@/lib/agent-trace-bridge'
import {
  AGENT_TRACE_EVENTS_TABLE,
  AGENT_TRACE_TOKEN_FUNCTION,
  type BridgeAction,
  getChannelName,
  type TraceEventEnvelope,
} from '@/lib/bridge-events'

export type RealtimeTraceStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/** How the channel topic was derived. */
export type RealtimeTraceMode = 'user' | 'fallback'

export interface AgentPresenceInfo {
  runId: string
  status: string
  startedAt?: number
  endedAt?: number
}

export interface RealtimeTraceConnectOptions {
  supabaseUrl: string
  anonKey: string
  /** Management API access token — primary, user-scoped pairing (private channel + backfill). */
  accessToken?: string | null
  /**
   * Pre-shared extension auth token (Settings → User Auth Token in the
   * extension) — fallback pairing when not signed in. Public channel keyed by
   * the hashed token; live events only, no persistence/backfill.
   */
  fallbackToken?: string | null
}

const BRIDGE_ACTIONS: BridgeAction[] = [
  'status_change_event',
  'activity_event',
  'history_change_event',
  'execute_result',
]

/** Re-mint the project JWT this long before it actually expires. */
const TOKEN_SLACK_SECONDS = 120

interface MintedToken {
  token: string
  expiresAt: number
  userId: string
}

/**
 * Subscribes to the `agent-trace:{userScope}` Realtime topic on the connected
 * Supabase project and feeds events into the shared AgentTraceBridge, so the
 * existing trace UI renders remote runs exactly like tab-local postMessage ones.
 *
 * Requires the `supa_agent_trace` extension (database.dev) and the
 * `agent-trace-token` edge function installed on the connected project.
 *
 * Module singleton — multiple components may call connect() with the same
 * options; reconnects only happen when the connection identity changes.
 */
export class RealtimeTraceSource {
  status: RealtimeTraceStatus = 'disconnected'
  mode: RealtimeTraceMode | null = null
  lastError: string | null = null

  private client: SupabaseClient | null = null
  private channel: RealtimeChannel | null = null
  private minted: MintedToken | null = null
  private connectKey: string | null = null

  private currentRunId: string | null = null
  private seen = new Set<string>()

  private statusListeners = new Set<(status: RealtimeTraceStatus) => void>()
  private presenceListeners = new Set<(agents: AgentPresenceInfo[]) => void>()

  onStatus(listener: (status: RealtimeTraceStatus) => void): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  onPresence(listener: (agents: AgentPresenceInfo[]) => void): () => void {
    this.presenceListeners.add(listener)
    return () => this.presenceListeners.delete(listener)
  }

  /** Idempotent: reconnects only when the connection identity changes. */
  async connect(opts: RealtimeTraceConnectOptions): Promise<void> {
    const key = [opts.supabaseUrl, opts.anonKey, opts.accessToken ?? '', opts.fallbackToken ?? ''].join('|')
    if (this.connectKey === key && this.status !== 'error' && this.status !== 'disconnected') return
    await this.disconnect()
    this.connectKey = key
    this.setStatus('connecting')

    try {
      if (opts.accessToken) {
        await this.connectAsUser(opts)
      } else if (opts.fallbackToken?.trim()) {
        await this.connectWithFallbackToken(opts)
      } else {
        this.lastError = 'Sign in with Supabase or paste the extension auth token to pair.'
        this.setStatus('disconnected')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.lastError = msg
      if (/expired|invalid|unauthorized/i.test(msg)) {
        this.setStatus('disconnected')
      } else {
        this.setStatus('error')
      }
    }
  }

  async disconnect(): Promise<void> {
    this.connectKey = null
    this.currentRunId = null
    this.seen.clear()
    if (this.channel && this.client) {
      await this.client.removeChannel(this.channel).catch(() => {})
    }
    this.channel = null
    this.client?.realtime.disconnect()
    this.client = null
    this.minted = null
    this.mode = null
    this.setStatus('disconnected')
  }

  // ── Pairing modes ──────────────────────────────────────────────────────────

  private async connectAsUser(opts: RealtimeTraceConnectOptions): Promise<void> {
    this.mode = 'user'
    const minted = await this.mintToken(opts)
    this.minted = minted

    this.client = createClient(opts.supabaseUrl, opts.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: async () => (await this.refreshTokenIfNeeded(opts)).token,
    })
    
    // Explicitly set the auth token on the realtime client
    this.client.realtime.setAuth(minted.token)

    const topic = await getChannelName(minted.userId)
    this.subscribeChannel(topic, /* isPrivate */ true, /* withBackfill */ true)
  }

  private async connectWithFallbackToken(opts: RealtimeTraceConnectOptions): Promise<void> {
    this.mode = 'fallback'
    this.client = createClient(opts.supabaseUrl, opts.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const topic = await getChannelName(opts.fallbackToken as string)
    // Public channel: pairing security rests on the unguessable hashed topic.
    this.subscribeChannel(topic, /* isPrivate */ false, /* withBackfill */ false)
  }

  private subscribeChannel(topic: string, isPrivate: boolean, withBackfill: boolean): void {
    const client = this.client
    if (!client) return

    const channel = client.channel(topic, { config: { private: isPrivate } })
    this.channel = channel

    for (const action of BRIDGE_ACTIONS) {
      channel.on('broadcast', { event: action }, (message) => {
        this.handleEnvelope(message.payload as TraceEventEnvelope)
      })
    }

    channel.on('presence', { event: 'sync' }, () => {
      const flattened: AgentPresenceInfo[] = Object.values(channel.presenceState())
        .flat()
        .filter((p): p is AgentPresenceInfo & { presence_ref: string } =>
          typeof (p as { runId?: unknown }).runId === 'string'
        )
        .map(({ runId, status, startedAt, endedAt }) => ({ runId, status, startedAt, endedAt }))
      for (const listener of this.presenceListeners) listener(flattened)
    })

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        this.setStatus('connected')
        if (withBackfill) void this.backfillLatestRun()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.lastError = err?.message ?? `channel ${status}`
        this.setStatus('error')
      } else if (status === 'CLOSED' && this.connectKey) {
        this.setStatus('disconnected')
      }
    })
  }

  // ── Event handling ─────────────────────────────────────────────────────────

  private handleEnvelope(envelope: TraceEventEnvelope | undefined): void {
    if (!envelope || typeof envelope.runId !== 'string') return

    const dedupeKey = `${envelope.runId}:${envelope.seq}`
    if (this.seen.has(dedupeKey)) return
    this.seen.add(dedupeKey)
    if (this.seen.size > 5000) this.seen.clear()

    const bridge = getAgentTraceBridge()
    if (envelope.runId !== this.currentRunId) {
      // A new run started — restart the live trace; ignore stragglers from old runs.
      if (this.currentRunId !== null && envelope.seq > 0 && envelope.action !== 'status_change_event') {
        return
      }
      this.currentRunId = envelope.runId
      bridge.reset()
    }
    bridge.ingest(envelope.action, envelope.payload)
  }

  /** Replay the most recent persisted run, then live events take over. */
  private async backfillLatestRun(): Promise<void> {
    const client = this.client
    if (!client) return
    try {
      const { data: latest, error: latestError } = await client
        .from(AGENT_TRACE_EVENTS_TABLE)
        .select('run_id')
        .order('id', { ascending: false })
        .limit(1)
      if (latestError) throw new Error(latestError.message)
      const runId = latest?.[0]?.run_id as string | undefined
      if (!runId || runId === this.currentRunId) return

      const { data: rows, error } = await client
        .from(AGENT_TRACE_EVENTS_TABLE)
        .select('run_id, seq, action, payload, created_at')
        .eq('run_id', runId)
        .order('seq', { ascending: true })
      if (error) throw new Error(error.message)
      if (!rows?.length) return

      const bridge = getAgentTraceBridge()
      bridge.reset()
      this.currentRunId = runId
      for (const row of rows) {
        this.seen.add(`${row.run_id}:${row.seq}`)
        bridge.ingest(row.action as BridgeAction, row.payload)
      }
    } catch (err) {
      // Backfill is best-effort; live streaming still works without it.
      console.warn('[RealtimeTraceSource] backfill failed:', err)
    }
  }

  // ── Token exchange ─────────────────────────────────────────────────────────

  private async refreshTokenIfNeeded(opts: RealtimeTraceConnectOptions): Promise<MintedToken> {
    const now = Math.floor(Date.now() / 1000)
    if (this.minted && this.minted.expiresAt - now > TOKEN_SLACK_SECONDS) return this.minted
    this.minted = await this.mintToken(opts)
    // Sync refreshed token to Realtime client
    this.client?.realtime.setAuth(this.minted.token)
    return this.minted
  }

  private async mintToken(opts: RealtimeTraceConnectOptions): Promise<MintedToken> {
    const base = opts.supabaseUrl.replace(/\/$/, '')
    const res = await fetch(`${base}/functions/v1/${AGENT_TRACE_TOKEN_FUNCTION}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        apikey: opts.anonKey,
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(
        res.status === 401
          ? 'agent-trace-token: access token expired or invalid — re-authenticate with Supabase.'
          : res.status === 404
            ? 'agent-trace-token function not found — install supa_agent_trace on this project first.'
            : `agent-trace-token failed (${res.status}): ${body.replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[token]').slice(0, 200)}`
      )
    }
    const minted = (await res.json()) as MintedToken
    if (!minted.token || !minted.userId) throw new Error('agent-trace-token returned no token/userId')
    return minted
  }

  private setStatus(status: RealtimeTraceStatus): void {
    this.status = status
    for (const listener of this.statusListeners) listener(status)
  }
}

let sourceInstance: RealtimeTraceSource | null = null

export function getRealtimeTraceSource(): RealtimeTraceSource {
  if (!sourceInstance) sourceInstance = new RealtimeTraceSource()
  return sourceInstance
}
