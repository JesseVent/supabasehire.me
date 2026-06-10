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
const PANEL_ID = 'supa-agent-runtime_agent-panel'

// Track which (connectionId, token) pairs have already been attempted for MCP tools.
// Prevents hammering mcp.supabase.com on every re-render when the token isn't a valid JWT.
// Cleared automatically when the token changes (so a fresh OAuth token will be tried).
const mcpTriedTokens = new Map<string, string>() // connectionId → last accessToken tried

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

/** Wait for the IIFE panel element to appear in the DOM (it's appended during SupaAgent construction). */
function waitForPanelElement(timeoutMs = 2000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = document.getElementById(PANEL_ID)
    if (existing) {
      resolve(existing)
      return
    }
    const observer = new MutationObserver(() => {
      const el = document.getElementById(PANEL_ID)
      if (el) {
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeoutMs)
  })
}

/**
 * Reposition the IIFE's floating center panel as a right-side sidebar.
 * The IIFE sets inline transform/opacity on show/hide, so we monkey-patch
 * those methods to use a right-slide animation instead of center-translate.
 */
async function applyRightSidebarMode(agent: NonNullable<typeof window.supaAgent>): Promise<void> {
  const el = await waitForPanelElement()
  if (!el) return

  // One-time sidebar positioning
  Object.assign(el.style, {
    position: 'fixed',
    right: '0',
    top: '0',
    left: 'auto',
    bottom: 'auto',
    width: '420px',
    height: '100dvh',
    borderRadius: '0',
    zIndex: '50',
    transition: 'transform 0.25s ease, opacity 0.2s ease',
    display: 'none',
    transform: 'translateX(100%)',
    opacity: '0',
  })

  // Patch show: slide in from right
  agent.panel.show = () => {
    const panelEl = document.getElementById(PANEL_ID)
    if (!panelEl) return
    panelEl.style.display = 'block'
    panelEl.offsetHeight // force reflow before transitioning
    panelEl.style.transform = 'translateX(0)'
    panelEl.style.opacity = '1'
  }

  // Patch hide: slide out to right
  agent.panel.hide = () => {
    const panelEl = document.getElementById(PANEL_ID)
    if (!panelEl) return
    panelEl.style.transform = 'translateX(100%)'
    panelEl.style.opacity = '0'
    setTimeout(() => {
      if (panelEl.style.opacity === '0') panelEl.style.display = 'none'
    }, 300)
  }
}

/**
 * Floating supa-agent panel — repositioned as a right-side sidebar.
 *
 * Loads the IIFE bundle with autoInit=false, then constructs the agent itself:
 * Supabase MCP tools from the active connection, server-side LLM proxy when no
 * client API key is set, skill router, model request patches, and a grounded
 * system prompt. Config comes from the Zustand stores — no props, so no
 * server secrets can leak into the client payload.
 *
 * The IIFE panel is repositioned via monkey-patched show/hide to slide in from
 * the right instead of floating in the center. Toggle visibility via the Bot
 * button in the header (writes to agent-store.sidebarOpen).
 */
export function SupaAgentPanel() {
  const { llmConfig, skillRouterConfig, maxSteps, sidebarOpen } = useAgentStore()
  const { connections, activeConnectionId } = useSupabaseStore()

  const activeConn = connections.find((c: SupabaseConnection) => c.id === activeConnectionId)
  const activeAccessToken = activeConn?.accessToken

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeAccessToken is an intentional re-init key; the hook reads the fresh connection via getState()
  useEffect(() => {
    if (!llmConfig.baseURL && !llmConfig.provider) return

    let cancelled = false

    async function init() {
      await loadIifeScript()
      if (cancelled || !window.SupaAgent) return

      // Load Supabase MCP tools via the server-side proxy for the active connection.
      const customTools: Record<string, SupaAgentTool> = {}
      const activeConn = useSupabaseStore
        .getState()
        .connections.find((c: SupabaseConnection) => c.id === activeConnectionId)
      const connId = activeConnectionId ?? ''
      const lastTriedToken = mcpTriedTokens.get(connId)
      if (activeConn?.accessToken && lastTriedToken !== activeConn.accessToken) {
        // Record the attempt before trying — so a failure still marks it as tried
        mcpTriedTokens.set(connId, activeConn.accessToken)
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
          // Token stays in mcpTriedTokens — skips future attempts with this same token.
          // A new OAuth token (activeAccessToken dep change) will re-trigger init and try again.
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
        // instructions.system extends the core system prompt (untrusted-data rules,
        // output contract) — customSystemPrompt would replace it and strip both.
        instructions: { system: buildSystemPrompt(Object.keys(customTools)) },
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

      // Reposition the IIFE panel as a right-side sidebar
      await applyRightSidebarMode(agent)

      if (cancelled) return

      // Show only if the sidebar is already toggled open
      if (useAgentStore.getState().sidebarOpen) {
        agent.panel.show()
      }
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
    // Re-init when LLM config, maxSteps, skill router config, the active connection,
    // or its access token changes (so MCP tools are re-adapted with fresh auth).
    // Deliberately NOT the whole `connections` array — edits to other connections or
    // token refreshes elsewhere must not dispose a mid-run agent.
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
    activeAccessToken,
  ])

  // Show / hide the sidebar when the toggle changes (agent already initialized)
  useEffect(() => {
    if (!window.supaAgent || window.supaAgent.disposed) return
    if (sidebarOpen) {
      window.supaAgent.panel.show()
    } else {
      window.supaAgent.panel.hide()
    }
  }, [sidebarOpen])

  return null
}
