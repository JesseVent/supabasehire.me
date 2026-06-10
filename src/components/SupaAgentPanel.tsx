'use client'

import { useEffect } from 'react'
import { SkillRouterClient } from '@/agent/skill-router-client'
import {
  buildSystemPrompt,
  createProxyFetch,
  type SupaAgentTool,
  tool,
  transformRequestBody,
} from '@/agent/supa-agent-config'
import { adaptMcpToolsViaApi } from '@/lib/mcp-tool-adapter'
import type { SupabaseConnection } from '@/lib/supabase-types'
import { useAgentStore } from '@/store/agent-store'
import { useSupabaseStore } from '@/store/supabase-store'

const SCRIPT_ID = 'supa-agent-iife'

/** Load the prebuilt IIFE once with autoInit disabled; resolves when window.SupaAgent exists. */
function loadIifeScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.SupaAgent) {
      resolve()
      return
    }
    const onError = () => reject(new Error('Failed to load /supa-agent.iife.js'))
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', onError, { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = '/supa-agent.iife.js?autoInit=false'
    script.async = true
    script.onload = () => resolve()
    script.onerror = onError
    document.body.appendChild(script)
  })
}

/**
 * Floating supa-agent panel.
 *
 * Loads the IIFE bundle with autoInit=false, then constructs the agent itself:
 * Supabase MCP tools from the active connection, server-side LLM proxy when no
 * client API key is set, skill router, model request patches, and a grounded
 * system prompt. Config comes from the Zustand stores — no props, so no
 * server secrets can leak into the client payload.
 */
export function SupaAgentPanel() {
  const { llmConfig, skillRouterConfig, maxSteps } = useAgentStore()
  const { connections, activeConnectionId } = useSupabaseStore()

  useEffect(() => {
    if (!llmConfig.baseURL && !llmConfig.provider) return

    let cancelled = false

    async function init() {
      await loadIifeScript()
      if (cancelled || !window.SupaAgent) return

      // Load Supabase MCP tools via the server-side proxy for the active connection.
      const customTools: Record<string, SupaAgentTool> = {}
      const activeConn = connections.find((c: SupabaseConnection) => c.id === activeConnectionId)
      if (activeConn?.accessToken) {
        try {
          const mcpAdapted = await adaptMcpToolsViaApi(
            activeConn as unknown as Parameters<typeof adaptMcpToolsViaApi>[0]
          )
          for (const [name, mcpTool] of Object.entries(mcpAdapted)) {
            customTools[name] = tool({
              description: mcpTool.description,
              inputSchema: mcpTool.inputSchema,
              execute: async (input: unknown) => {
                try {
                  return await mcpTool.execute(input)
                } catch (err) {
                  return `MCP tool error: ${err instanceof Error ? err.message : String(err)}`
                }
              },
            })
          }
          console.debug(`[SupaAgentPanel] MCP: loaded ${Object.keys(mcpAdapted).length} tools`)
        } catch (err) {
          console.warn('[SupaAgentPanel] MCP tools unavailable:', err)
        }
      }

      if (cancelled) return

      // Replace any previous instance (config change, HMR, bookmarklet leftovers)
      if (window.supaAgent && !window.supaAgent.disposed) {
        window.supaAgent.dispose()
      }

      const skillRouter =
        skillRouterConfig.url && skillRouterConfig.key && skillRouterConfig.skill
          ? new SkillRouterClient(skillRouterConfig.url, skillRouterConfig.key).asAdapter(
              skillRouterConfig.skill
            )
          : undefined

      // Server-side key via /api/agent/chat unless the user entered their own key
      const useServerProxy = !llmConfig.apiKey

      const config: Record<string, unknown> = {
        baseURL: llmConfig.baseURL,
        model: llmConfig.model,
        maxSteps,
        enableMask: false,
        customSystemPrompt: buildSystemPrompt(Object.keys(customTools)),
        customTools,
        skillRouter,
        transformRequestBody,
      }

      if (useServerProxy) {
        config.customFetch = createProxyFetch(
          llmConfig.provider,
          llmConfig.model,
          activeConn?.accessToken ?? null
        )
        config.apiKey = 'proxy' // placeholder so the agent doesn't complain
      } else {
        config.apiKey = llmConfig.apiKey
      }

      const agent = new window.SupaAgent(config)
      window.supaAgent = agent
      agent.panel.show()
    }

    init().catch((err) => {
      console.error('[SupaAgentPanel] Init failed:', err)
    })

    return () => {
      cancelled = true
      if (window.supaAgent && !window.supaAgent.disposed) {
        window.supaAgent.dispose()
      }
      window.supaAgent = undefined
    }
    // Re-init when LLM config, maxSteps, skill router config, or active connection changes
    // so MCP tools are reloaded for the new project.
  }, [
    llmConfig.baseURL,
    llmConfig.model,
    llmConfig.apiKey,
    llmConfig.provider,
    maxSteps,
    skillRouterConfig.url,
    skillRouterConfig.key,
    skillRouterConfig.skill,
    activeConnectionId,
    connections,
  ])

  return null
}
