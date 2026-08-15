'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Cpu, Radio, Send, Settings2, Square, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AgentConfigPanel } from '@/components/agent-config-panel'
import { buildSystemPrompt } from '@/agent/supa-agent-config'
import { useRealtimeTrace } from '@/hooks/use-realtime-trace'
import { getAgentTraceBridge } from '@/lib/agent-trace-bridge'
import { cn } from '@/lib/utils'
import type { AgentChatMessage } from '@/store/agent-store'
import { useAgentStore } from '@/store/agent-store'
import { useSupabaseStore } from '@/store/supabase-store'

// Typed handle for window.PAGE_AGENT_EXT exposed by the supa-agent extension
interface PageAgentExt {
  execute: (task: string, config: {
    baseURL: string
    model: string
    apiKey?: string
    systemInstruction?: string
  }) => Promise<unknown>
  stop: () => void
}

declare global {
  interface Window {
    PAGE_AGENT_EXT?: PageAgentExt
  }
}

export function AgentSidebar() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { sidebarOpen, toggleSidebar, llmConfig, messages, addMessage, clearMessages, agentStatus, setAgentStatus } =
    useAgentStore()
  const { connections, activeConnectionId } = useSupabaseStore()
  const activeConn = connections.find((c) => c.id === activeConnectionId)

  const [input, setInput] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [extensionAvailable, setExtensionAvailable] = useState(false)
  const { status: realtimeStatus, agentOnline } = useRealtimeTrace()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Extension injects main-world.js slightly after DOMContentLoaded; poll briefly
  useEffect(() => {
    const check = () => setExtensionAvailable(!!window.PAGE_AGENT_EXT)
    check()
    const t = setTimeout(check, 1500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  async function sendViaExtension(text: string) {
    if (!window.PAGE_AGENT_EXT) return

    const bridge = getAgentTraceBridge()
    bridge.reset()
    bridge.startListening()

    try {
      const result = await window.PAGE_AGENT_EXT.execute(text, {
        baseURL: llmConfig.baseURL || 'https://api.openai.com/v1',
        model: llmConfig.model,
        apiKey: llmConfig.apiKey,
        systemInstruction: buildSystemPrompt([]),
      })

      const summary = typeof result === 'object' && result !== null && 'summary' in result
        ? String((result as { summary: unknown }).summary)
        : 'Task completed.'
      addMessage({ role: 'assistant', content: summary })
      setAgentStatus('completed')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        addMessage({ role: 'assistant', content: `Error: ${(err as Error).message}` })
        setAgentStatus('error')
      }
    } finally {
      bridge.stopListening()
      setStreamingContent(null)
      abortRef.current = null
    }
  }

  async function sendViaChat(text: string) {
    const history = [
      { role: 'system', content: buildSystemPrompt([]) },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ]

    abortRef.current = new AbortController()

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (activeConn?.accessToken) headers['x-supabase-access-token'] = activeConn.accessToken

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: llmConfig.provider,
          model: llmConfig.model,
          body: { model: llmConfig.model, messages: history, stream: true },
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        addMessage({ role: 'assistant', content: `Error: ${err.error ?? res.statusText}` })
        setAgentStatus('error')
        setStreamingContent(null)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content ?? ''
            if (delta) {
              accumulated += delta
              setStreamingContent(accumulated)
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      addMessage({ role: 'assistant', content: accumulated || '(empty response)' })
      setAgentStatus('completed')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        addMessage({ role: 'assistant', content: `Error: ${(err as Error).message}` })
        setAgentStatus('error')
      }
    } finally {
      setStreamingContent(null)
      abortRef.current = null
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || agentStatus === 'running') return

    setInput('')
    addMessage({ role: 'user', content: text })
    setAgentStatus('running')
    setStreamingContent('')

    if (extensionAvailable && window.PAGE_AGENT_EXT) {
      await sendViaExtension(text)
    } else {
      await sendViaChat(text)
    }
  }

  function stop() {
    if (extensionAvailable && window.PAGE_AGENT_EXT) {
      window.PAGE_AGENT_EXT.stop()
      getAgentTraceBridge().stopListening()
    } else {
      abortRef.current?.abort(new DOMException('User stopped generation', 'AbortError'))
    }
    setStreamingContent(null)
    setAgentStatus('idle')
  }

  const visibleMessages = messages.filter((m) => m.role !== 'system')

  if (!mounted) return null

  return (
    <div
      className={cn(
        'fixed right-0 top-0 h-dvh w-[420px] z-50 flex flex-col',
        'border-l border-border bg-background shadow-xl',
        'transition-transform duration-200 ease-in-out',
        sidebarOpen ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Bot className="size-4 text-primary" />
        <span className="font-semibold text-sm flex-1">AI Assistant</span>
        {extensionAvailable && (
          <Badge
            variant="secondary"
            className="text-[10px] gap-1 text-primary border-primary/30 bg-primary/10"
            title="Supa Agent extension detected — tasks will run via the browser agent"
          >
            <Cpu className="size-2.5" />
            extension
          </Badge>
        )}
        {realtimeStatus === 'connected' ? (
          <Badge
            variant="secondary"
            className="text-[10px] gap-1 text-primary border-primary/30 bg-primary/10"
            title={
              agentOnline
                ? 'Live trace over Supabase Realtime — agent currently running'
                : 'Live trace over Supabase Realtime — waiting for an agent run'
            }
          >
            <Radio className={cn('size-2.5', agentOnline && 'animate-pulse')} />
            realtime
          </Badge>
        ) : (
          !extensionAvailable && (
            <Badge
              variant="secondary"
              className="text-[10px] gap-1 text-muted-foreground"
              title="No trace transport — install the extension or pair via Supabase Realtime"
            >
              disconnected
            </Badge>
          )
        )}
        {activeConn && (
          <Badge variant="secondary" className="text-[10px] font-mono max-w-[120px] truncate">
            {activeConn.name ?? activeConn.projectRef ?? 'connected'}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setShowConfig((p) => !p)}
          title="Configure model"
        >
          <Settings2 className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={clearMessages}
          title="Clear chat"
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={toggleSidebar}
          title="Close"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Inline config panel (collapsible) */}
      {showConfig && (
        <div className="border-b border-border shrink-0 overflow-y-auto max-h-[45%]">
          <AgentConfigPanel onSave={() => setShowConfig(false)} />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {visibleMessages.length === 0 && streamingContent === null && (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center gap-3 text-muted-foreground">
            <Bot className="size-8 opacity-20" />
            <p className="text-sm">Ask me anything about your Supabase project</p>
          </div>
        )}

        {visibleMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {streamingContent !== null && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent || '…',
              timestamp: Date.now(),
            }}
            streaming
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border shrink-0 space-y-2">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask about schema, RLS, queries… (Enter to send)"
            className="min-h-[64px] max-h-[128px] resize-none text-sm"
            disabled={agentStatus === 'running'}
          />
          {agentStatus === 'running' ? (
            <Button variant="outline" size="sm" onClick={stop} className="h-10 shrink-0 gap-1.5">
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={send}
              disabled={!input.trim()}
              className="h-10 shrink-0"
            >
              <Send className="size-3.5" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground text-right">
          {llmConfig.provider} · {llmConfig.model}
        </p>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  streaming,
}: {
  message: Pick<AgentChatMessage, 'id' | 'role' | 'content'>
  streaming?: boolean
}) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3 py-2 text-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
          streaming && 'opacity-80'
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
      </div>
    </div>
  )
}
