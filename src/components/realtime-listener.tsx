'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Radio,
  Play,
  Square,
  Trash2,
  ChevronDown,
  ChevronRight,
  ArrowDown,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toggle } from '@/components/ui/toggle'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useSupabaseStore } from '@/store/supabase-store'
import { createSupabaseClient } from '@/lib/supabase-client'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ─── Types ───

type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE'

interface RealtimeEvent {
  id: string
  type: RealtimeEventType
  table: string
  record: Record<string, unknown>
  oldRecord?: Record<string, unknown>
  timestamp: Date
}

// ─── Relative time helper ───

function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec} seconds ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`
}

// ─── Event type badge colors ───

function getEventBadge(type: RealtimeEventType) {
  switch (type) {
    case 'INSERT':
      return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1 text-[10px] px-1.5 py-0">INSERT</Badge>
    case 'UPDATE':
      return <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1 text-[10px] px-1.5 py-0">UPDATE</Badge>
    case 'DELETE':
      return <Badge className="bg-red-500 hover:bg-red-600 text-white gap-1 text-[10px] px-1.5 py-0">DELETE</Badge>
  }
}

// ─── Demo data generators ───

const DEMO_NAMES = ['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Eve Williams']
const DEMO_EMAILS = ['alice@example.com', 'bob@example.com', 'charlie@example.com', 'diana@example.com', 'eve@example.com']
const DEMO_TITLES = ['Getting Started with Supabase', 'RLS Best Practices', 'Realtime Subscriptions Guide', 'Edge Functions Deep Dive', 'PostgreSQL Tips & Tricks']
const DEMO_MESSAGES = ['Great post!', 'Very helpful, thanks!', 'I learned a lot from this', 'Can you elaborate?', 'Awesome tutorial!']

function generateDemoEvent(tableName: string, eventType: RealtimeEventType): Record<string, unknown> {
  const randId = () => Math.random().toString(36).slice(2, 8)
  const randPick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

  switch (tableName) {
    case 'users':
      return {
        id: randId(),
        email: randPick(DEMO_EMAILS),
        name: randPick(DEMO_NAMES),
        created_at: new Date().toISOString(),
      }
    case 'posts':
      return {
        id: randId(),
        title: randPick(DEMO_TITLES),
        content: 'Lorem ipsum dolor sit amet...',
        user_id: randId(),
        created_at: new Date().toISOString(),
      }
    case 'comments':
      return {
        id: randId(),
        content: randPick(DEMO_MESSAGES),
        post_id: randId(),
        user_id: randId(),
        created_at: new Date().toISOString(),
      }
    case 'likes':
      return {
        id: randId(),
        post_id: randId(),
        user_id: randId(),
        created_at: new Date().toISOString(),
      }
    case 'categories':
      return {
        id: randId(),
        name: randPick(['Technology', 'Science', 'Art', 'Music', 'Sports']),
        slug: randPick(['technology', 'science', 'art', 'music', 'sports']),
      }
    case 'post_categories':
      return {
        id: randId(),
        post_id: randId(),
        category_id: randId(),
      }
    case 'audit_logs':
      return {
        id: randId(),
        action: randPick(['LOGIN', 'INSERT', 'UPDATE', 'DELETE']),
        table_name: randPick(['users', 'posts', 'comments']),
        user_id: randId(),
        created_at: new Date().toISOString(),
      }
    case 'notifications':
      return {
        id: randId(),
        user_id: randId(),
        message: randPick(['Welcome!', 'You have a new comment', 'Post liked', 'Account updated']),
        read: Math.random() > 0.5,
        created_at: new Date().toISOString(),
      }
    default:
      return { id: randId(), data: 'sample data' }
  }
}

// ─── Collapsible JSON View ───

function JsonCollapsible({ data, label }: { data: Record<string, unknown>; label: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span className="font-mono">{label}</span>
      </button>
      {open && (
        <pre className="mt-1 p-2 rounded-md bg-muted text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ─── Main Component ───

export function RealtimeListener() {
  const { tables, activeConnectionId, connections } = useSupabaseStore()
  const isDemoMode = activeConnectionId === '__demo__'
  const activeConnection = connections.find((c) => c.id === activeConnectionId) ?? null

  // State
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [eventFilters, setEventFilters] = useState<Record<RealtimeEventType, boolean>>({
    INSERT: true,
    UPDATE: true,
    DELETE: true,
  })
  const [events, setEvents] = useState<RealtimeEvent[]>([])
  const [isListening, setIsListening] = useState(false)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Set default table when tables change
  const effectiveTable = selectedTable || (tables.length > 0 ? tables[0].tableName : '')

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events, autoScroll])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (channelRef.current) channelRef.current.unsubscribe()
    }
  }, [])

  // Add event helper
  const addEvent = useCallback((type: RealtimeEventType, table: string, record: Record<string, unknown>, oldRecord?: Record<string, unknown>) => {
    const newEvent: RealtimeEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      table,
      record,
      oldRecord,
      timestamp: new Date(),
    }
    setEvents((prev) => [newEvent, ...prev].slice(0, 100))
  }, [])

  // Start/Stop listening
  const startListening = useCallback(() => {
    const tableToListen = effectiveTable
    if (!tableToListen) return

    setIsListening(true)
    setSubscribeError(null)

    if (isDemoMode) {
      // Demo mode: generate random events every 2-5 seconds
      const generateEvent = () => {
        const types: RealtimeEventType[] = ['INSERT', 'UPDATE', 'DELETE']
        // Weight towards INSERT and UPDATE
        const weights = [0.5, 0.35, 0.15]
        const rand = Math.random()
        let type: RealtimeEventType
        if (rand < weights[0]) type = 'INSERT'
        else if (rand < weights[0] + weights[1]) type = 'UPDATE'
        else type = 'DELETE'

        const record = generateDemoEvent(tableToListen, type)
        const oldRecord = type === 'UPDATE' ? generateDemoEvent(tableToListen, type) : undefined
        addEvent(type, tableToListen, record, oldRecord)

        // Schedule next event with random delay
        const nextDelay = 2000 + Math.random() * 3000
        intervalRef.current = setTimeout(generateEvent, nextDelay) as unknown as ReturnType<typeof setInterval>
      }

      // Initial event
      const initialRecord = generateDemoEvent(tableToListen, 'INSERT')
      addEvent('INSERT', tableToListen, initialRecord)

      // Start generating
      const nextDelay = 2000 + Math.random() * 3000
      intervalRef.current = setTimeout(generateEvent, nextDelay) as unknown as ReturnType<typeof setInterval>
    } else if (activeConnection) {
      // Real connection: subscribe via Supabase JS client.
      // createSupabaseClient is async — it exchanges new-format keys for a JWT
      // before creating the client so the WebSocket apikey param is a real JWT.
      createSupabaseClient(activeConnection, false).then((client) => {
      const channel = client
        .channel(`devtool-${tableToListen}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tableToListen },
          (payload) => {
            const eventType = payload.eventType === 'INSERT'
              ? 'INSERT'
              : payload.eventType === 'UPDATE'
              ? 'UPDATE'
              : 'DELETE'
            addEvent(
              eventType,
              tableToListen,
              (payload.new ?? {}) as Record<string, unknown>,
              payload.old && Object.keys(payload.old).length > 0
                ? (payload.old as Record<string, unknown>)
                : undefined,
            )
          },
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setSubscribeError(`Subscription ${status.toLowerCase()}${err ? `: ${err.message}` : ''}`)
            setIsListening(false)
          }
        })
      channelRef.current = channel
      })
    }
  }, [effectiveTable, isDemoMode, activeConnection, addEvent])

  const stopListening = useCallback(() => {
    setIsListening(false)
    if (intervalRef.current) {
      clearTimeout(intervalRef.current as unknown as ReturnType<typeof setTimeout>)
      intervalRef.current = null
    }
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
    }
  }, [])

  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])

  // Filtered events
  const filteredEvents = events.filter((e) => eventFilters[e.type])

  // Stats
  const insertCount = events.filter((e) => e.type === 'INSERT').length
  const updateCount = events.filter((e) => e.type === 'UPDATE').length
  const deleteCount = events.filter((e) => e.type === 'DELETE').length

  // Toggle event filter
  const toggleFilter = (type: RealtimeEventType) => {
    setEventFilters((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* No connection warning */}
      {!isDemoMode && !activeConnection && (
        <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <Radio className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            No active connection. Select a connection or use &quot;Try Demo&quot; to see simulated realtime events.
          </AlertDescription>
        </Alert>
      )}

      {/* Subscription error */}
      {subscribeError && (
        <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <Radio className="size-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="text-red-700 dark:text-red-300 font-mono text-xs">
            {subscribeError}
          </AlertDescription>
        </Alert>
      )}

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant="outline"
          className={`gap-1 cursor-pointer transition-colors ${eventFilters.INSERT ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30' : 'opacity-50'}`}
          onClick={() => toggleFilter('INSERT')}
        >
          <span className="size-2 rounded-full bg-emerald-500" />
          {insertCount} INSERT
        </Badge>
        <Badge
          variant="outline"
          className={`gap-1 cursor-pointer transition-colors ${eventFilters.UPDATE ? 'text-amber-600 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/30' : 'opacity-50'}`}
          onClick={() => toggleFilter('UPDATE')}
        >
          <span className="size-2 rounded-full bg-amber-500" />
          {updateCount} UPDATE
        </Badge>
        <Badge
          variant="outline"
          className={`gap-1 cursor-pointer transition-colors ${eventFilters.DELETE ? 'text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30' : 'opacity-50'}`}
          onClick={() => toggleFilter('DELETE')}
        >
          <span className="size-2 rounded-full bg-red-500" />
          {deleteCount} DELETE
        </Badge>
        <Separator orientation="vertical" className="h-5" />
        <Badge variant="secondary" className="gap-1">
          {events.length} total
        </Badge>
      </div>

      {/* Controls card */}
      <Card className={isListening ? 'ring-2 ring-emerald-500/20' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="size-5 text-primary" />
              <CardTitle className="text-base">Realtime Listener</CardTitle>
            </div>
            {/* Status indicator */}
            <div className="flex items-center gap-1.5">
              {isListening ? (
                <>
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Listening...</span>
                  <div className="flex items-center gap-0.5 ml-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-0.5 bg-emerald-500 rounded-full"
                        style={{
                          height: '8px',
                          animation: 'waveform 1s ease-in-out infinite',
                          animationDelay: `${i * 0.15}s`,
                        }}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground font-medium">Stopped</span>
                </>
              )}
            </div>
          </div>
          <CardDescription>
            Monitor Supabase Realtime events for table changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Table selector + Event type filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Select value={effectiveTable} onValueChange={setSelectedTable} disabled={isListening}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Select table..." />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((t) => (
                    <SelectItem key={t.tableName} value={t.tableName}>
                      {t.tableName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Event type toggles */}
              <div className="flex items-center gap-1">
                <Toggle
                  pressed={eventFilters.INSERT}
                  onPressedChange={() => toggleFilter('INSERT')}
                  size="sm"
                  className="data-[state=on]:bg-emerald-100 data-[state=on]:text-emerald-700 dark:data-[state=on]:bg-emerald-950/50 dark:data-[state=on]:text-emerald-400 text-xs gap-1"
                  aria-label="Toggle INSERT events"
                >
                  INSERT
                </Toggle>
                <Toggle
                  pressed={eventFilters.UPDATE}
                  onPressedChange={() => toggleFilter('UPDATE')}
                  size="sm"
                  className="data-[state=on]:bg-amber-100 data-[state=on]:text-amber-700 dark:data-[state=on]:bg-amber-950/50 dark:data-[state=on]:text-amber-400 text-xs gap-1"
                  aria-label="Toggle UPDATE events"
                >
                  UPDATE
                </Toggle>
                <Toggle
                  pressed={eventFilters.DELETE}
                  onPressedChange={() => toggleFilter('DELETE')}
                  size="sm"
                  className="data-[state=on]:bg-red-100 data-[state=on]:text-red-700 dark:data-[state=on]:bg-red-950/50 dark:data-[state=on]:text-red-400 text-xs gap-1"
                  aria-label="Toggle DELETE events"
                >
                  DELETE
                </Toggle>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {!isListening ? (
                <Button
                  onClick={startListening}
                  disabled={!effectiveTable}
                  size="sm"
                  className="gap-1.5"
                >
                  <Play className="size-3.5" />
                  Start Listening
                </Button>
              ) : (
                <Button
                  onClick={stopListening}
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                >
                  <Square className="size-3.5" />
                  Stop
                </Button>
              )}
              <Button
                onClick={clearEvents}
                variant="outline"
                size="sm"
                disabled={events.length === 0}
                className="gap-1.5"
              >
                <Trash2 className="size-3.5" />
                Clear Log
              </Button>
              <div className="ml-auto flex items-center gap-1.5">
                <Toggle
                  pressed={autoScroll}
                  onPressedChange={setAutoScroll}
                  size="sm"
                  className="text-xs gap-1"
                  aria-label="Toggle auto-scroll"
                >
                  <ArrowDown className="size-3" />
                  Auto-scroll
                </Toggle>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Event Log */}
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Event Log</CardTitle>
            {filteredEvents.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Radio className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {isListening
                  ? 'Waiting for events...'
                  : 'Start listening to capture realtime events'}
              </p>
              {isListening && isDemoMode && (
                <p className="text-xs text-muted-foreground mt-1">
                  Demo events will appear every 2-5 seconds
                </p>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[500px]" ref={scrollRef}>
              <div className="flex flex-col gap-2">
                {[...filteredEvents].reverse().map((event) => (
                  <div
                    key={event.id}
                    className={`rounded-lg border p-3 transition-colors hover:bg-accent/50 ${
                      event.type === 'INSERT'
                        ? 'border-l-4 border-l-emerald-500'
                        : event.type === 'UPDATE'
                        ? 'border-l-4 border-l-amber-500'
                        : 'border-l-4 border-l-red-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {getEventBadge(event.type)}
                      <span className="font-mono text-xs text-muted-foreground">
                        {event.table}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {getRelativeTime(event.timestamp)}
                      </span>
                    </div>

                    {/* Record data */}
                    <JsonCollapsible data={event.record} label="new" />
                    {event.oldRecord && (
                      <JsonCollapsible data={event.oldRecord} label="old" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
