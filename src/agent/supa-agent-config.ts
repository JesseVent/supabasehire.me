import type { z } from 'zod'

/**
 * Helpers for configuring the supa-agent IIFE bundle (`/supa-agent.iife.js`).
 *
 * The IIFE exposes `window.SupaAgent`; everything here feeds its constructor.
 * `tool()` mirrors supa-agent's own factory, which is an identity function —
 * replicating it locally avoids a file: dependency on the sibling monorepo.
 */

export interface SupaAgentTool<TParams = unknown> {
  description: string
  inputSchema: z.ZodType<TParams>
  execute: (input: TParams) => Promise<string>
}

export function tool<TParams>(options: SupaAgentTool<TParams>): SupaAgentTool<TParams> {
  return options
}

export interface SupaAgentInstance {
  panel: { show: () => void; hide: () => void }
  disposed: boolean
  status: 'idle' | 'running' | 'completed' | 'error'
  execute: (task: string) => Promise<{ success: boolean; data: string }>
  stop: () => void
  dispose: () => void
  onAskUser?: (question: string) => Promise<string>
}

declare global {
  interface Window {
    SupaAgent?: new (config: Record<string, unknown>) => SupaAgentInstance
    supaAgent?: SupaAgentInstance
  }
}

/**
 * Create a custom fetch that routes LLM requests through our server-side proxy.
 * The proxy injects the real API key from an env var — the key never reaches the browser.
 *
 * The Supabase Management API OAuth access token (`oauthToken`) is forwarded as
 * `x-supabase-access-token` so the server can authenticate the caller — mirroring
 * the same pattern used by every other API route in the devtool (and the extension).
 */
export function createProxyFetch(
  provider: string,
  model: string,
  oauthToken: string | null = null
): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    // Only intercept requests to the LLM provider
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

    if (!url.includes('/chat/completions')) {
      // Not an LLM call — pass through
      return fetch(input, init)
    }

    // Forward to our server proxy — baseURL is resolved server-side from the provider name
    const body = init?.body ? JSON.parse(String(init.body)) : {}

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (oauthToken) headers['x-supabase-access-token'] = oauthToken

    return fetch('/api/agent/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider, model, body }),
      signal: init?.signal,
    })
  }
}

/**
 * Request-body patches for models with quirky OpenAI-compat surfaces.
 */
export function transformRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  const rawModel = typeof body.model === 'string' ? body.model : ''
  // Strip provider prefix: 'openai/gpt-5.5' → 'gpt-5.5'
  const modelName = rawModel.split('/').pop() ?? ''
  const normalizedModel = modelName.toLowerCase().replace(/[_.]/g, '')

  // minimax doesn't support tool_choice on OpenRouter
  if (normalizedModel.startsWith('minimax')) {
    delete body.tool_choice
  }

  // gpt-5.5 only supports verbosity:'medium'; supa-agent patches all gpt-* to 'low'
  if (modelName.startsWith('gpt-5.5') && body.verbosity === 'low') {
    body.verbosity = 'medium'
  }
  return body
}

/**
 * System prompt grounded in the tools that are actually registered.
 * `mcpToolNames` must be the real names of the loaded MCP tools — when empty,
 * the prompt says so explicitly instead of advertising tools that don't exist.
 */
export function buildSystemPrompt(mcpToolNames: string[]): string {
  const mcpSection = mcpToolNames.length
    ? `## Supabase MCP Tools (data access — always prefer these)

You have direct API access to the connected Supabase project via these MCP tools:
${mcpToolNames.map((n) => `- **${n}**`).join('\n')}

Use these for ALL data and project operations: SQL, schema introspection, RLS policies, storage, edge functions, auth, migrations, logs, and advisors.`
    : `## No Data-Access Tools Available

No Supabase project is connected via OAuth in this session, so you have NO database or project tools — only the devtool UI tools below. Do not invent, guess, or attempt to call tools that are not in your tool list. If the user asks for database work, explain that they need to connect a project (with an OAuth access token) in the Connections panel first, or use ask_user to clarify.`

  return `You are an AI assistant inside a Supabase development tool (supabasehire.me). Your primary capability is direct API access to connected Supabase projects via tool calls.

${mcpSection}

## Devtool UI Tools

You can interact with the devtool's own UI — not external websites:
- **click_element_by_index**: Click elements in the devtool UI
- **input_text**: Type into input fields in the devtool
- **scroll**: Scroll within the devtool page
- **done**: Complete the task with a response

## URL Restrictions

You operate within this devtool page only. Navigation to external URLs is not supported.
- Do NOT attempt to navigate to supabase.com, app.supabase.com, or any external URL — use the API tools instead.
- Do NOT attempt to open new tabs or navigate away from the devtool.
- If you unexpectedly see a blank page or an error, a navigation may have failed — switch to an API tool call instead.

## Guidelines

1. **Always use the MCP tools for data operations** when available — e.g. run SQL via the MCP tool instead of navigating the SQL panel.
2. **Use UI tools only** when interacting with the devtool's own panels, toggles, or visual elements.
3. **Be thorough**: When asked to "check RLS", query the policies and analyze the results, don't click buttons.
4. **SQL safety**: Only execute destructive SQL (DROP, DELETE without WHERE) if the user explicitly asks.
5. **Explain what you're doing**: Each step should have clear evaluation, memory, and next_goal.
6. **If you need clarification**, use ask_user.
7. **When done**, summarize findings clearly.

## Response Format
Always respond in clear, well-structured text. Use markdown for tables, code blocks for SQL.`
}
