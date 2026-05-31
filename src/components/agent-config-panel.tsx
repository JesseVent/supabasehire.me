'use client'

import {
	Settings2,
	Key,
	Globe,
	Cpu,
	ArrowRightLeft,
	ShieldCheck,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useAgentStore, PROVIDER_PRESETS, type LLMProvider } from '@/store/agent-store'

// Feature flag: if the server provides a key, hide the client-side key input
declare global {
	interface Window {
		__LLM_SERVER_KEY__?: boolean
	}
}

const PROVIDER_LABELS: Record<LLMProvider, string> = {
	openai: 'OpenAI',
	anthropic: 'Anthropic',
	google: 'Google',
	custom: 'Custom (OpenAI-compatible)',
}

const PROVIDER_MODELS: Record<LLMProvider, string[]> = {
	openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'],
	anthropic: ['claude-sonnet-4-20250514', 'claude-3.5-sonnet-20241022', 'claude-3.5-haiku-20241022'],
	google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
	custom: [],
}

export function AgentConfigPanel() {
	const { llmConfig, setLLMConfig, maxSteps, setMaxSteps } = useAgentStore()

	const handleProviderChange = (provider: LLMProvider) => {
		const preset = PROVIDER_PRESETS[provider]
		setLLMConfig({
			provider,
			baseURL: preset.baseURL,
			model: preset.model,
		})
	}

		const isConfigured = llmConfig.baseURL

		return (
		<div className="p-4 space-y-4 bg-muted/30">
			<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
				<Settings2 className="size-3.5" />
				Agent Configuration
			</div>

			{/* Provider selector */}
			<div className="space-y-1.5">
				<Label className="text-xs flex items-center gap-1.5">
					<ArrowRightLeft className="size-3" />
					LLM Provider
				</Label>
				<Select
					value={llmConfig.provider}
					onValueChange={(v) => handleProviderChange(v as LLMProvider)}
				>
					<SelectTrigger className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{Object.entries(PROVIDER_LABELS).map(([key, label]) => (
							<SelectItem key={key} value={key}>
								{label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Model selector */}
			<div className="space-y-1.5">
				<Label className="text-xs flex items-center gap-1.5">
					<Cpu className="size-3" />
					Model
				</Label>
				{PROVIDER_MODELS[llmConfig.provider].length > 0 ? (
					<Select
						value={llmConfig.model}
						onValueChange={(m) => setLLMConfig({ model: m })}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PROVIDER_MODELS[llmConfig.provider].map((m) => (
								<SelectItem key={m} value={m}>
									{m}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<Input
						value={llmConfig.model}
						onChange={(e) => setLLMConfig({ model: e.target.value })}
						placeholder="model-name"
						className="h-8 text-xs"
					/>
				)}
			</div>

			{/* Base URL */}
			<div className="space-y-1.5">
				<Label className="text-xs flex items-center gap-1.5">
					<Globe className="size-3" />
					Base URL
				</Label>
				<Input
					value={llmConfig.baseURL}
					onChange={(e) => setLLMConfig({ baseURL: e.target.value })}
					placeholder="https://api.openai.com/v1"
					className="h-8 text-xs font-mono"
				/>
			</div>

			{/* API Key — server-side preferred, client-side fallback */}
			<div className="space-y-1.5">
				<Label className="text-xs flex items-center gap-1.5">
					<Key className="size-3" />
					API Key
				</Label>
				<Input
					type="password"
					value={llmConfig.apiKey}
					onChange={(e) => setLLMConfig({ apiKey: e.target.value })}
					placeholder="Leave empty to use server-side key"
					className="h-8 text-xs font-mono"
				/>
				{!llmConfig.apiKey ? (
					<p className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
						<ShieldCheck className="size-3" />
						Server-side mode: key stays on the server. Set LLM_API_KEY in .env.
					</p>
				) : (
					<p className="text-[10px] text-amber-700 dark:text-amber-400">
						Client-side mode: key stored in your browser. Leave empty to use server key instead.
					</p>
				)}
			</div>

			{/* Max Steps */}
			<div className="space-y-1.5">
				<Label className="text-xs">Max Steps</Label>
				<Select
					value={String(maxSteps)}
					onValueChange={(v) => setMaxSteps(Number(v))}
				>
					<SelectTrigger className="h-8 text-xs w-24">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{[10, 20, 30, 40, 60, 80].map((n) => (
							<SelectItem key={n} value={String(n)}>
								{n} steps
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Status */}
			{!isConfigured && (
				<div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
					Configure an API key and base URL to enable the agent.
				</div>
			)}
		</div>
	)
}
