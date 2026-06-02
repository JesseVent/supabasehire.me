'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
	Bot,
	Send,
	StopCircle,
	Settings2,
	Trash2,
	Loader2,
	Wrench,
	Brain,
	Eye,
	ChevronDown,
	ChevronRight,
	Sparkles,
	X,
	AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useAgentStore, type AgentChatMessage } from '@/store/agent-store'
import { useDevtoolAgent } from '@/agent/use-devtool-agent'
import { AgentConfigPanel } from '@/components/agent-config-panel'

// ─── Status Indicator ───

function StatusDot({ status }: { status: string }) {
	return (
		<span
			className={cn(
				'size-2 rounded-full shrink-0',
				status === 'running' && 'bg-blue-500 animate-pulse',
				status === 'completed' && 'bg-primary',
				status === 'error' && 'bg-red-500',
				status === 'idle' && 'bg-muted-foreground/40'
			)}
		/>
	)
}

// ─── Reflection Collapsible ───

function ReflectionCard({
	reflection,
}: {
	reflection: NonNullable<AgentChatMessage['reflection']>
}) {
	const [open, setOpen] = useState(false)
	const hasContent =
		reflection.evaluation || reflection.memory || reflection.nextGoal

	if (!hasContent) return null

	return (
		<div className="mt-1.5">
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
			>
				<Brain className="size-3" />
				<span>Reasoning</span>
				{open ? (
					<ChevronDown className="size-3" />
				) : (
					<ChevronRight className="size-3" />
				)}
			</button>
			{open && (
				<div className="mt-1 text-[11px] text-muted-foreground space-y-1 pl-4 border-l border-border">
					{reflection.evaluation && (
						<p>
							<span className="text-foreground/70 font-medium">Eval:</span>{' '}
							{reflection.evaluation}
						</p>
					)}
					{reflection.memory && (
						<p>
							<span className="text-foreground/70 font-medium">Memory:</span>{' '}
							{reflection.memory}
						</p>
					)}
					{reflection.nextGoal && (
						<p>
							<span className="text-foreground/70 font-medium">Next:</span>{' '}
							{reflection.nextGoal}
						</p>
					)}
				</div>
			)}
		</div>
	)
}

// ─── Chat Message ───

function ChatMessage({ message }: { message: AgentChatMessage }) {
	const isUser = message.role === 'user'
	const isSystem = message.role === 'system'

	return (
		<div
			className={cn(
				'px-3 py-2.5 text-sm',
				isUser
					? 'bg-primary/5 border-l-2 border-primary/30'
					: isSystem
						? 'bg-amber-500/5 border-l-2 border-amber-500/30'
						: 'bg-muted/30'
			)}
		>
			{/* Header */}
			<div className="flex items-center gap-1.5 mb-1">
				{isUser ? (
					<span className="text-[11px] font-medium text-primary">You</span>
				) : isSystem ? (
					<span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
						<AlertCircle className="size-3" />
						System
					</span>
				) : (
					<span className="flex items-center gap-1 text-[11px] font-medium text-foreground">
						<Bot className="size-3" />
						Agent
						{message.stepIndex !== undefined && (
							<Badge variant="outline" className="ml-1 h-4 text-[10px] px-1">
								Step {message.stepIndex + 1}
							</Badge>
						)}
					</span>
				)}
			</div>

			{/* Content */}
			<div className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
				{message.content}
			</div>

			{/* Tool call details */}
			{message.toolCall && (
				<div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
					<Wrench className="size-3 mt-0.5 shrink-0" />
					<code className="break-all">
						{message.toolCall.name}(
						{JSON.stringify(message.toolCall.input).slice(0, 200)})
					</code>
				</div>
			)}

			{/* Reflection */}
			{message.reflection && <ReflectionCard reflection={message.reflection} />}

			{/* Token usage */}
			{message.usage && (
				<div className="mt-1 text-[10px] text-muted-foreground/60">
					Tokens: {message.usage.totalTokens.toLocaleString()}
				</div>
			)}
		</div>
	)
}

// ─── Main Chat Panel ───

export function AgentChatPanel() {
	const { sidebarOpen, setSidebarOpen, messages, clearMessages } =
		useAgentStore()
	const { status, activityText, isReady, error, execute, stop, answerQuestion } =
		useDevtoolAgent()
	const [input, setInput] = useState('')
	const [showConfig, setShowConfig] = useState(false)
	const scrollRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLTextAreaElement>(null)

	// Auto-scroll on new messages
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [messages, activityText])

	// Check if last message is a system question (ask_user)
	const lastMessage = messages[messages.length - 1]
	const isWaitingForAnswer =
		lastMessage?.role === 'system' &&
		lastMessage.content.startsWith('Agent asks:')

	const handleSubmit = useCallback(() => {
		const trimmed = input.trim()
		if (!trimmed) return

		if (isWaitingForAnswer) {
			answerQuestion(trimmed)
		} else {
			execute(trimmed)
		}
		setInput('')
	}, [input, isWaitingForAnswer, answerQuestion, execute])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault()
				handleSubmit()
			}
		},
		[handleSubmit]
	)

	const isRunning = status === 'running'

	return (
		<>
			<Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
				<SheetContent
					side="right"
					className="w-[420px] sm:w-[480px] p-0 flex flex-col gap-0"
				>
					{/* Header */}
					<SheetHeader className="px-4 py-3 border-b shrink-0">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<SheetTitle className="text-sm flex items-center gap-2">
									<Sparkles className="size-4 text-primary" />
									AI Agent
								</SheetTitle>
								<StatusDot status={status} />
								<span className="text-[11px] text-muted-foreground capitalize">
									{status}
								</span>
							</div>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									onClick={() => setShowConfig(!showConfig)}
									title="Agent settings"
								>
									<Settings2 className="size-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									onClick={clearMessages}
									title="Clear chat"
								>
									<Trash2 className="size-3.5" />
								</Button>
							</div>
						</div>

						{/* Activity text */}
						{activityText && (
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
								<Loader2 className="size-3 animate-spin" />
								{activityText}
							</div>
						)}
					</SheetHeader>

					{/* Config panel (collapsible) */}
					{showConfig && (
						<>
							<AgentConfigPanel />
							<Separator />
						</>
					)}

					{/* Error state */}
					{error && !isReady && (
						<div className="mx-4 mt-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
							{error}
						</div>
					)}

					{/* Chat messages */}
					<ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
						{messages.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground px-6">
								<Bot className="size-10 mb-3 opacity-30" />
								<p className="text-sm font-medium mb-1">AI Agent</p>
								<p className="text-xs text-center leading-relaxed">
									Ask me to inspect your Supabase database, check RLS policies,
									run queries, or navigate the tool for you.
								</p>
								<div className="mt-4 flex flex-wrap gap-1.5 justify-center">
									{[
										'Show me the database schema',
										'Check RLS policies',
										'Find tables without RLS',
										'List edge functions',
									].map((suggestion) => (
										<button
											key={suggestion}
											onClick={() => {
												setInput(suggestion)
												inputRef.current?.focus()
											}}
											className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-muted transition-colors"
										>
											{suggestion}
										</button>
									))}
								</div>
							</div>
						) : (
							<div className="divide-y divide-border/50">
								{messages.map((msg) => (
									<ChatMessage key={msg.id} message={msg} />
								))}
							</div>
						)}
					</ScrollArea>

					{/* Input area */}
					<div className="border-t p-3 shrink-0">
						{isWaitingForAnswer && (
							<div className="mb-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
								<Eye className="size-3" />
								Agent is waiting for your answer
							</div>
						)}
						<div className="flex gap-2">
							<Textarea
								ref={inputRef}
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder={
									isWaitingForAnswer
										? 'Type your answer...'
										: isReady
											? 'Ask the agent to do something...'
											: 'Configure an LLM provider first...'
								}
								disabled={isRunning || !isReady}
								rows={2}
								className="min-h-[44px] max-h-[120px] resize-none text-sm"
							/>
							<div className="flex flex-col gap-1">
								{isRunning ? (
									<Button
										size="icon"
										variant="destructive"
										onClick={stop}
										className="size-9 shrink-0"
										title="Stop"
									>
										<StopCircle className="size-4" />
									</Button>
								) : (
									<Button
										size="icon"
										onClick={handleSubmit}
										disabled={!input.trim() || !isReady}
										className="size-9 shrink-0"
										title="Send"
									>
										<Send className="size-4" />
									</Button>
								)}
							</div>
						</div>
					</div>
				</SheetContent>
			</Sheet>
		</>
	)
}
