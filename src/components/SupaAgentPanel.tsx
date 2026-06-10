'use client'

import { useEffect } from 'react'

interface SupaAgentPanelProps {
  apiKey: string
  baseURL?: string
  model?: string
}

export function SupaAgentPanel({
  apiKey,
  baseURL = 'https://api.openai.com/v1',
  model = 'gpt-4o-mini',
}: SupaAgentPanelProps) {
  useEffect(() => {
    // Avoid double-injecting if HMR re-runs the effect
    if (document.getElementById('supa-agent-iife')) return

    const script = document.createElement('script')
    script.id = 'supa-agent-iife'
    script.src = `/supa-agent.iife.js?apiKey=${encodeURIComponent(apiKey)}&baseURL=${encodeURIComponent(baseURL)}&model=${encodeURIComponent(model)}&showPanel=true&autoInit=true`
    script.async = true

    document.body.appendChild(script)

    return () => {
      const existing = document.getElementById('supa-agent-iife')
      if (existing) existing.remove()
      // Dispose global agent instance if it exists
      if (
        typeof window !== 'undefined' &&
        (window as unknown as Record<string, unknown>).supaAgent
      ) {
        const agent = (window as unknown as Record<string, { dispose?: () => void }>).supaAgent
        agent?.dispose?.()
      }
    }
  }, [apiKey, baseURL, model])

  return null
}
