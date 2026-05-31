'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAgentStore, type AgentChatMessage } from '@/store/agent-store'
import { useSupabaseStore } from '@/store/supabase-store'
import type { SupabaseConnection } from '@/lib/supabase-types'
import { supabaseTools, type ConnectionData } from '@/agent/supabase-tools'

// Types we need from page-agent (imported dynamically to avoid SSR issues)
type AgentStatus = 'idle' | 'running' | 'completed' | 'error'
type HistoricalEvent =
	| { type: 'step'; stepIndex: number; reflection: { evaluation_previous_goal?: string; memory?: string; next_goal?: string }; action: { name: string; input: unknown; output: string }; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }
	| { type: 'observation'; content: string }
	| { type: 'error'; message: string }
	| { type: 'retry'; message: string; attempt: number; maxAttempts: number }
	| { type: 'user_takeover' }

type PageAgentCore = {
	status: AgentStatus
	history: HistoricalEvent[]
	task: string
	disposed: boolean
	onAskUser?: (question: string) => Promise<string>
	execute(task: string): Promise<{ success: boolean; data: string; history: HistoricalEvent[] }>
	stop(): void
	dispose(): void
	addEventListener(type: string, listener: EventListener): void
	removeEventListener(type: string, listener: EventListener): void
}

export interface UseDevtoolAgentReturn {
	status: AgentStatus
	messages: AgentChatMessage[]
	activityText: string | null
	isReady: boolean
	error: string | null
	execute: (task: string) => Promise<void>
	stop: () => void
	answerQuestion: (answer: string) => void
	dispose: () => void
}

/**
 * Hook that manages the PageAgent lifecycle integrated with the Supabase devtool.
 *
 * - Creates PageAgentCore with custom Supabase tools + DOM tools
 * - Wires agent events to Zustand store
 * - Manages the ask_user question/answer flow
 */
export function useDevtoolAgent(): UseDevtoolAgentReturn {
	const {
		llmConfig,
		maxSteps,
		setAgentStatus,
		setActivityText,
		addMessage,
		clearMessages,
		messages,
		agentStatus,
		activityText,
	} = useAgentStore()

	const { connections, activeConnectionId } = useSupabaseStore()

	const agentRef = useRef<PageAgentCore | null>(null)
	const questionResolveRef = useRef<((answer: string) => void) | null>(null)

	const [isReady, setIsReady] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Get active connection data for Supabase tools
	const getActiveConnection = useCallback(async (): Promise<ConnectionData> => {
		const conn = connections.find((c: SupabaseConnection) => c.id === activeConnectionId)
		if (!conn) {
			throw new Error('No active Supabase connection. Connect to a project first.')
		}
		return {
			supabaseUrl: conn.supabaseUrl,
			anonKey: conn.anonKey,
			serviceRoleKey: conn.serviceRoleKey,
			accessToken: conn.accessToken,
		}
	}, [connections, activeConnectionId])

	// Initialize the agent
	useEffect(() => {
		if (!llmConfig.baseURL) {
			setIsReady(false)
			setError('Configure an LLM provider in the agent settings.')
			return
		}

		let cancelled = false

		async function init() {
			try {
				// Dynamic import to avoid SSR issues — page-agent is browser-only
				const { PageAgentCore, tool } = await import('page-agent')

				if (cancelled) return

				// Build Supabase tools as page-agent-compatible tools
				const customToolEntries: Record<string, unknown> = {}

				for (const [name, sTool] of Object.entries(supabaseTools)) {
					customToolEntries[name] = tool({
						description: sTool.description,
						inputSchema: sTool.inputSchema,
						execute: async function (this: PageAgentCore, input: unknown) {
							try {
								const conn = await getActiveConnection()
								return await sTool.execute(input, () => Promise.resolve(conn))
							} catch (err) {
								return `Error: ${err instanceof Error ? err.message : String(err)}`
							}
						},
					})
				}

				// Custom system prompt with Supabase context
				const systemPrompt = buildSystemPrompt()

				// Decide: server-side key (preferred) vs client-side key (fallback)
				const useServerProxy = !llmConfig.apiKey

				// No-op pageController — PageAgentCore requires this object even when
				// we only use custom tools and never touch the DOM.
				const noopPageController = {
					showMask: () => {},
					hideMask: () => {},
					cleanUpHighlights: () => {},
					dispose: () => {},
					getLastUpdateTime: () => Date.now(),
					getBrowserState: async () => ({
						url: window.location.href,
						title: document.title,
						header: `Current Page: [${document.title}](${window.location.href})`,
						content: '',
						footer: '',
					}),
				}

				const agentConfig: Record<string, unknown> = {
					baseURL: llmConfig.baseURL,
					model: llmConfig.model,
					maxSteps,
					customSystemPrompt: systemPrompt,
					customTools: customToolEntries,
					pageController: noopPageController,
				}

				if (useServerProxy) {
					// Route through our server proxy — key stays on the server
					agentConfig.customFetch = createProxyFetch(llmConfig.provider, llmConfig.model)
					agentConfig.apiKey = 'proxy' // placeholder so page-agent doesn't complain
				} else {
					// Fallback: client-side key (user entered one in the UI)
					agentConfig.apiKey = llmConfig.apiKey
				}

				const agent = new PageAgentCore(agentConfig as any) as PageAgentCore

				// Wire up ask_user handler
				agent.onAskUser = (question: string) => {
					return new Promise<string>((resolve) => {
						questionResolveRef.current = resolve
						addMessage({
							role: 'system',
							content: `Agent asks: ${question}`,
						})
					})
				}

				// Wire agent events
				agent.addEventListener('statuschange', () => {
					setAgentStatus(agent.status)
				})

				agent.addEventListener('activity', ((e: Event) => {
					const detail = (e as CustomEvent).detail
					if (detail.type === 'thinking') {
						setActivityText('Thinking...')
					} else if (detail.type === 'executing') {
						setActivityText(`Executing ${detail.tool}...`)
					} else if (detail.type === 'executed') {
						setActivityText(null)
					} else if (detail.type === 'error') {
						setActivityText(`Error: ${detail.message}`)
					}
				}) as EventListener)

				agentRef.current = agent
				setIsReady(true)
				setError(null)
			} catch (err) {
				console.error('[DevtoolAgent] Init failed:', err)
				setError(err instanceof Error ? err.message : 'Failed to initialize agent')
				setIsReady(false)
			}
		}

		init()

		return () => {
			cancelled = true
			if (agentRef.current && !agentRef.current.disposed) {
				agentRef.current.dispose()
			}
			agentRef.current = null
		}
	// Re-init when LLM config or maxSteps changes
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [llmConfig.baseURL, llmConfig.model, llmConfig.apiKey, llmConfig.provider, maxSteps])

	const execute = useCallback(async (task: string) => {
		const agent = agentRef.current
		if (!agent) {
			setError('Agent not initialized')
			return
		}

		// Clear previous messages and add user message
		clearMessages()
		addMessage({ role: 'user', content: task })

		try {
			const result = await agent.execute(task)

			// Process history into chat messages
			const historyMsgs = agent.history
				.filter((e) => e.type === 'step')
				.map((e) => {
					const step = e as Extract<HistoricalEvent, { type: 'step' }>
					const msg: Omit<AgentChatMessage, 'id' | 'timestamp'> = {
						role: 'assistant',
						content: step.action.output || 'No output',
						stepIndex: step.stepIndex,
						reflection: {
							evaluation: step.reflection.evaluation_previous_goal,
							memory: step.reflection.memory,
							nextGoal: step.reflection.next_goal,
						},
						toolCall:
							step.action.name !== 'done'
								? {
										name: step.action.name,
										input: step.action.input,
										output: step.action.output,
										duration: 0,
									}
								: undefined,
						usage: step.usage,
					}
					return msg
				})

			for (const msg of historyMsgs) {
				addMessage(msg)
			}

			// Final result message
			addMessage({
				role: 'assistant',
				content: result.data,
			})
		} catch (err) {
			addMessage({
				role: 'system',
				content: `Error: ${err instanceof Error ? err.message : String(err)}`,
			})
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const stop = useCallback(() => {
		agentRef.current?.stop()
	}, [])

	const answerQuestion = useCallback((answer: string) => {
		if (questionResolveRef.current) {
			questionResolveRef.current(answer)
			questionResolveRef.current = null
		}
	}, [])

	const dispose = useCallback(() => {
		if (agentRef.current && !agentRef.current.disposed) {
			agentRef.current.dispose()
		}
		agentRef.current = null
		setIsReady(false)
	}, [])

	return {
		status: agentStatus,
		messages,
		activityText,
		isReady,
		error,
		execute,
		stop,
		answerQuestion,
		dispose,
	}
}

/**
 * Create a custom fetch that routes LLM requests through our server-side proxy.
 * The proxy injects the real API key from an env var — the key never reaches the browser.
 */
function createProxyFetch(
	provider: string,
	model: string
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

		const res = await fetch('/api/agent/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ provider, model, body }),
			signal: init?.signal,
		})

		return res
	}
}

function buildSystemPrompt(): string {
	return `You are an AI assistant inside a Supabase development tool. You have TWO sets of capabilities:

## 1. Supabase Database Tools (use these for structured data operations)

You have direct API access to the connected Supabase project:
- **execute_sql**: Execute any SQL query (SELECT, INSERT, UPDATE, DELETE, DDL, etc.)
- **get_schema**: Inspect database tables, columns, types, foreign keys
- **get_rls_policies**: Check Row Level Security status and policies for tables
- **list_storage**: Browse storage buckets and files
- **list_edge_functions**: List deployed edge functions
- **get_project_info**: Get project metadata (region, size, status)
- **get_indexes**: Get index usage statistics
- **get_triggers**: List database triggers
- **get_views_functions**: List views and stored functions

## 2. Browser Automation Tools (use these for UI navigation)

You can interact with the devtool UI itself:
- **click_element_by_index**: Click elements in the UI
- **input_text**: Type into input fields
- **scroll**: Scroll the page
- **done**: Complete the task with a response

## Guidelines

1. **Prefer Supabase tools over UI clicking** for data operations. Use \`execute_sql\` instead of navigating the SQL panel.
2. **Use UI tools** when you need to navigate to different panels, toggle views, or interact with visual elements.
3. **Be thorough**: When asked to "check RLS", use \`get_rls_policies\` and analyze the results, don't just click buttons.
4. **SQL safety**: Only execute destructive SQL (DROP, DELETE without WHERE) if the user explicitly asks.
5. **Explain what you're doing**: Each step should have clear evaluation, memory, and next_goal.
6. **If you need clarification**, use ask_user.
7. **When done**, summarize findings clearly.

## Response Format
Always respond in clear, well-structured text. Use markdown for tables, code blocks for SQL.`
}
