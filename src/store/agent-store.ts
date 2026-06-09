'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── LLM Provider Types ───

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom'

export interface LLMProviderConfig {
  provider: LLMProvider
  baseURL: string
  apiKey: string
  model: string
}

export const PROVIDER_PRESETS: Record<LLMProvider, Omit<LLMProviderConfig, 'apiKey'>> = {
  openai: {
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-5.4',
  },
  anthropic: {
    provider: 'anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-6',
  },
  google: {
    provider: 'google',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
  },
  openrouter: {
    provider: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-3.1-flash-lite',
  },
  custom: {
    provider: 'custom',
    baseURL: '',
    model: '',
  },
}

// ─── Chat Message Types ───

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  /** Tool execution details */
  toolCall?: {
    name: string
    input: unknown
    output: string
    duration: number
  }
  /** Reflection metadata */
  reflection?: {
    evaluation?: string
    memory?: string
    nextGoal?: string
  }
  /** Step index from agent */
  stepIndex?: number
  /** Token usage */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// ─── Skill Router Config ───

export interface SkillRouterConfig {
  url: string
  key: string
  skill: string
}

// ─── Agent Store ───

interface AgentStore {
  // Config
  agentEnabled: boolean
  llmConfig: LLMProviderConfig
  skillRouterConfig: SkillRouterConfig
  maxSteps: number
  sidebarOpen: boolean

  // Chat state
  messages: AgentChatMessage[]
  currentTask: string
  agentStatus: 'idle' | 'running' | 'completed' | 'error'
  activityText: string | null

  // Actions
  setAgentEnabled: (enabled: boolean) => void
  setLLMConfig: (config: Partial<LLMProviderConfig>) => void
  setSkillRouterConfig: (config: Partial<SkillRouterConfig>) => void
  setMaxSteps: (steps: number) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void

  addMessage: (message: Omit<AgentChatMessage, 'id' | 'timestamp'>) => void
  clearMessages: () => void
  setCurrentTask: (task: string) => void
  setAgentStatus: (status: 'idle' | 'running' | 'completed' | 'error') => void
  setActivityText: (text: string | null) => void

  reset: () => void
}

const initialState = {
  agentEnabled: false as boolean,
  llmConfig: {
    ...PROVIDER_PRESETS.openrouter,
    apiKey: '',
  } as LLMProviderConfig,
  skillRouterConfig: {
    url: '',
    key: '',
    skill: '',
  } as SkillRouterConfig,
  maxSteps: 40,
  sidebarOpen: false as boolean,
  messages: [] as AgentChatMessage[],
  currentTask: '' as string,
  agentStatus: 'idle' as const,
  activityText: null as string | null,
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set) => ({
      ...initialState,

      setAgentEnabled: (enabled) => set({ agentEnabled: enabled }),
      setLLMConfig: (config) =>
        set((state) => ({
          llmConfig: { ...state.llmConfig, ...config },
        })),
      setSkillRouterConfig: (config) =>
        set((state) => ({
          skillRouterConfig: { ...state.skillRouterConfig, ...config },
        })),
      setMaxSteps: (steps) => set({ maxSteps: steps }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      addMessage: (message) =>
        set((state) => ({
          messages: [
            ...state.messages,
            {
              ...message,
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              timestamp: Date.now(),
            },
          ],
        })),
      clearMessages: () => set({ messages: [] }),
      setCurrentTask: (task) => set({ currentTask: task }),
      setAgentStatus: (status) => set({ agentStatus: status }),
      setActivityText: (text) => set({ activityText: text }),

      reset: () => set(initialState),
    }),
    {
      name: 'supabase-agent-config',
      partialize: (state) => ({
        agentEnabled: state.agentEnabled,
        llmConfig: state.llmConfig,
        skillRouterConfig: state.skillRouterConfig,
        maxSteps: state.maxSteps,
      }),
    }
  )
)
