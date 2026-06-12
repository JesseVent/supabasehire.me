'use client'

import { useEffect, useState } from 'react'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import {
  type AgentPresenceInfo,
  getRealtimeTraceSource,
  type RealtimeTraceStatus,
} from '@/lib/realtime-trace-source'
import { useAgentStore } from '@/store/agent-store'
import { useSupabaseStore } from '@/store/supabase-store'

/**
 * Keeps the singleton RealtimeTraceSource paired with the active Supabase
 * connection and exposes its status + agent presence for badges/pickers.
 *
 * Pairing precedence: Management OAuth token (user-scoped, private channel,
 * backfill) → pasted extension auth token (public channel, live only).
 */
export function useRealtimeTrace() {
  const { connections, activeConnectionId } = useSupabaseStore()
  const traceFallbackToken = useAgentStore((s) => s.traceFallbackToken)
  const source = getRealtimeTraceSource()

  const [status, setStatus] = useState<RealtimeTraceStatus>(source.status)
  const [presence, setPresence] = useState<AgentPresenceInfo[]>([])

  useEffect(() => {
    const offStatus = source.onStatus(setStatus)
    const offPresence = source.onPresence(setPresence)
    return () => {
      offStatus()
      offPresence()
    }
  }, [source])

  useEffect(() => {
    const conn = connections.find((c) => c.id === activeConnectionId)
    const isDemo = activeConnectionId === DEMO_CONNECTION_ID
    if (!conn || isDemo || !conn.supabaseUrl || !conn.anonKey) {
      void source.disconnect()
      return
    }
    void source.connect({
      supabaseUrl: conn.supabaseUrl,
      anonKey: conn.anonKey,
      accessToken: conn.accessToken,
      fallbackToken: traceFallbackToken,
    })
  }, [source, connections, activeConnectionId, traceFallbackToken])

  const agentOnline = presence.some((p) => p.status === 'running')

  return { status, presence, agentOnline, mode: source.mode, lastError: source.lastError }
}
