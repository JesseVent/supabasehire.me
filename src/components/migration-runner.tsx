'use client'

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  History,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
  Database,
  Plus,
  Columns3,
  Shield,
  Lock,
  FileCode2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSupabaseStore } from '@/store/supabase-store'
import type { MigrationRecord } from '@/store/supabase-store'
import type { SQLQueryResult } from '@/lib/supabase-types'

// ─── Migration Templates ───

interface MigrationTemplate {
  name: string
  description: string
  icon: React.ReactNode
  sql: string
  category: 'create' | 'alter' | 'security'
}

const MIGRATION_TEMPLATES: MigrationTemplate[] = [
  {
    name: 'Create Table',
    description: 'Basic table with id and created_at',
    icon: <Plus className="size-4" />,
    sql: `CREATE TABLE your_table_name (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);`,
    category: 'create',
  },
  {
    name: 'Add Column',
    description: 'ALTER TABLE ADD COLUMN',
    icon: <Columns3 className="size-4" />,
    sql: `ALTER TABLE your_table_name\nADD COLUMN new_column_name TEXT;`,
    category: 'alter',
  },
  {
    name: 'Create Index',
    description: 'CREATE INDEX on a column',
    icon: <Database className="size-4" />,
    sql: `CREATE INDEX idx_your_table_column\nON your_table_name (column_name);`,
    category: 'create',
  },
  {
    name: 'Add RLS Policy',
    description: 'CREATE POLICY for row-level security',
    icon: <Shield className="size-4" />,
    sql: `CREATE POLICY "Users can view own data"\nON your_table_name\nFOR SELECT\nUSING (auth.uid() = user_id);`,
    category: 'security',
  },
  {
    name: 'Enable RLS',
    description: 'ALTER TABLE ENABLE ROW LEVEL SECURITY',
    icon: <Lock className="size-4" />,
    sql: `ALTER TABLE your_table_name\nENABLE ROW LEVEL SECURITY;`,
    category: 'security',
  },
]

// ─── Destructive Keywords ───

const DESTRUCTIVE_KEYWORDS = ['DROP', 'ALTER', 'DELETE', 'TRUNCATE', 'DROP TABLE', 'DROP COLUMN']

function isDestructiveMigration(sql: string): boolean {
  const upperSQL = sql.toUpperCase().trim()
  return DESTRUCTIVE_KEYWORDS.some((keyword) => upperSQL.includes(keyword))
}

function getDestructiveKeywords(sql: string): string[] {
  const upperSQL = sql.toUpperCase().trim()
  return DESTRUCTIVE_KEYWORDS.filter((keyword) => upperSQL.includes(keyword))
}

// ─── Category Colors ───

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  create: {
    bg: 'bg-primary/10 dark:bg-primary/20',
    text: 'text-primary dark:text-primary',
    border: 'border-primary/20 dark:border-primary/30',
  },
  alter: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/20 dark:border-amber-500/30',
  },
  security: {
    bg: 'bg-sky-500/10 dark:bg-sky-500/20',
    text: 'text-sky-600 dark:text-sky-400',
    border: 'border-sky-500/20 dark:border-sky-500/30',
  },
}

export function MigrationRunner() {
  const {
    activeConnectionId,
    connections,
    migrationHistory,
    addMigration,
    clearMigrationHistory,
    addActivityLog,
  } = useSupabaseStore()

  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null

  const [migrationName, setMigrationName] = useState('')
  const [migrationSQL, setMigrationSQL] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [dryRun, setDryRun] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('none')
  const alertDialogRef = useRef<HTMLButtonElement>(null)

  const isDestructive = migrationSQL.trim() ? isDestructiveMigration(migrationSQL) : false
  const destructiveKeywords = migrationSQL.trim() ? getDestructiveKeywords(migrationSQL) : []

  // Line numbers for the SQL editor
  const lineCount = migrationSQL ? migrationSQL.split('\n').length : 1

  const applyTemplate = useCallback((templateName: string) => {
    if (templateName === 'none') return
    const template = MIGRATION_TEMPLATES.find((t) => t.name === templateName)
    if (template) {
      setMigrationSQL(template.sql)
      setSelectedTemplate(templateName)
    }
  }, [])

  const handleTemplateCardClick = useCallback((template: MigrationTemplate) => {
    setMigrationSQL(template.sql)
    setSelectedTemplate(template.name)
    setDryRunResult(null)
  }, [])

  const executeMigration = useCallback(async () => {
    if (!activeConnectionId || !migrationSQL.trim() || !migrationName.trim()) return

    setIsExecuting(true)
    setDryRunResult(null)

    try {
      if (dryRun) {
        // Dry run — just show what would be executed
        setDryRunResult(
          `[Dry Run] Migration "${migrationName}" would execute:\n\n${migrationSQL.trim()}\n\n${
            isDestructive
              ? `⚠️ WARNING: This migration contains destructive operations: ${destructiveKeywords.join(', ')}`
              : '✅ This migration appears to be safe (non-destructive).'
          }`
        )
        addMigration({
          name: migrationName.trim(),
          sql: migrationSQL.trim(),
          status: 'pending',
          connectionId: activeConnectionId,
        })
        addActivityLog({
          type: 'sql',
          action: 'Migration dry run',
          details: migrationName.trim(),
        })
        toast.info('Dry run completed', { description: 'No changes were applied to the database' })
        setIsExecuting(false)
        return
      }

      const res = await fetch('/api/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection: activeConnection,
          query: migrationSQL.trim(),
        }),
      })

      const data = await res.json()
      const sqlResult: SQLQueryResult = data.error
        ? { success: false, error: data.error }
        : data

      if (sqlResult.success) {
        addMigration({
          name: migrationName.trim(),
          sql: migrationSQL.trim(),
          status: 'success',
          connectionId: activeConnectionId,
        })
        addActivityLog({
          type: 'sql',
          action: 'Migration applied',
          details: migrationName.trim(),
        })
        toast.success('Migration applied', {
          description: `"${migrationName.trim()}" executed successfully`,
        })
      } else {
        addMigration({
          name: migrationName.trim(),
          sql: migrationSQL.trim(),
          status: 'failed',
          connectionId: activeConnectionId,
          error: sqlResult.error,
        })
        addActivityLog({
          type: 'sql',
          action: 'Migration failed',
          details: `${migrationName.trim()}: ${sqlResult.error || 'Unknown error'}`,
        })
        toast.error('Migration failed', {
          description: sqlResult.error || 'Unknown error',
        })
      }
    } catch {
      addMigration({
        name: migrationName.trim(),
        sql: migrationSQL.trim(),
        status: 'failed',
        connectionId: activeConnectionId,
        error: 'Network error occurred',
      })
      toast.error('Migration failed', { description: 'Network error occurred' })
    } finally {
      setIsExecuting(false)
    }
  }, [activeConnectionId, migrationSQL, migrationName, dryRun, isDestructive, destructiveKeywords, addMigration, addActivityLog])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!isDestructive) {
          executeMigration()
        } else {
          // Trigger the confirmation dialog
          alertDialogRef.current?.click()
        }
      }
    },
    [executeMigration, isDestructive]
  )

  const statusIcon = (status: MigrationRecord['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="size-3.5 text-primary" />
      case 'failed':
        return <XCircle className="size-3.5 text-red-500" />
      case 'pending':
        return <Eye className="size-3.5 text-amber-500" />
    }
  }

  const statusBadge = (status: MigrationRecord['status']) => {
    switch (status) {
      case 'success':
        return <Badge variant="secondary" className="bg-primary/10 text-primary dark:text-primary border-primary/20 text-[10px]">Success</Badge>
      case 'failed':
        return <Badge variant="destructive" className="text-[10px]">Failed</Badge>
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">Dry Run</Badge>
    }
  }

  // Filter migration history for the active connection
  const connectionMigrations = activeConnectionId
    ? migrationHistory.filter((m) => m.connectionId === activeConnectionId)
    : []

  if (!activeConnectionId) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Database className="mb-3 size-12 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              No connection selected
            </p>
            <p className="text-xs text-muted-foreground">
              Connect to a Supabase project to run migrations
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Migration Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileCode2 className="size-5 text-primary" />
            <CardTitle className="text-base">Migration Templates</CardTitle>
          </div>
          <CardDescription>
            Choose a preset template or write your own migration SQL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MIGRATION_TEMPLATES.map((template) => {
              const style = CATEGORY_STYLES[template.category]
              const isSelected = selectedTemplate === template.name
              return (
                <button
                  key={template.name}
                  onClick={() => handleTemplateCardClick(template)}
                  className={`flex flex-col gap-2 rounded-lg border p-3 text-left transition-all hover:shadow-sm ${
                    isSelected
                      ? `${style.bg} border-primary/50 ring-1 ring-primary/30`
                      : `border-border hover:border-primary/30 ${style.bg}/50`
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={style.text}>{template.icon}</span>
                    <span className="text-sm font-medium">{template.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{template.description}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Migration Editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Migration Editor</CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="dry-run"
                  checked={dryRun}
                  onCheckedChange={setDryRun}
                />
                <Label htmlFor="dry-run" className="text-xs font-medium cursor-pointer">
                  Dry Run
                </Label>
              </div>
              <Select value={selectedTemplate} onValueChange={applyTemplate}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Load Template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {MIGRATION_TEMPLATES.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Migration Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="migration-name" className="text-xs font-medium">
                Migration Name
              </Label>
              <Input
                id="migration-name"
                value={migrationName}
                onChange={(e) => setMigrationName(e.target.value)}
                placeholder="e.g., create_users_table"
                className="text-sm"
              />
            </div>

            {/* Destructive Warning */}
            {isDestructive && (
              <Alert className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10">
                <AlertTriangle className="size-4 text-amber-500" />
                <AlertDescription className="text-xs">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    Destructive migration detected:
                  </span>{' '}
                  This migration contains{' '}
                  {destructiveKeywords.map((kw, i) => (
                    <Badge key={kw} variant="destructive" className="mx-0.5 text-[10px] px-1 py-0">
                      {kw}
                    </Badge>
                  ))}{' '}
                  operations. A confirmation will be required before execution.
                </AlertDescription>
              </Alert>
            )}

            {/* SQL Editor */}
            <div className="relative flex rounded-lg overflow-hidden border border-zinc-800 dark:border-zinc-700 bg-zinc-950 dark:bg-zinc-900 focus-within:ring-1 focus-within:ring-zinc-600">
              {/* Line numbers */}
              <div className="flex-shrink-0 py-3 px-2 text-right select-none border-r border-zinc-800 dark:border-zinc-700 bg-zinc-900/50 dark:bg-zinc-800/50 overflow-hidden" aria-hidden="true">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} className="text-[11px] leading-[1.375rem] text-zinc-600 dark:text-zinc-500 font-mono">
                    {i + 1}
                  </div>
                ))}
              </div>
              <Textarea
                value={migrationSQL}
                onChange={(e) => {
                  setMigrationSQL(e.target.value)
                  setDryRunResult(null)
                }}
                onKeyDown={handleKeyDown}
                placeholder="-- Write your migration SQL here..."
                className="font-mono text-sm min-h-[150px] bg-transparent text-zinc-100 dark:text-zinc-200 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-zinc-600 dark:placeholder:text-zinc-500 resize-y pl-3 py-3"
              />
            </div>

            {/* Execute Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {migrationSQL.trim() ? `${migrationSQL.trim().length} characters` : 'Enter migration SQL'}
                </span>
                {isDestructive && (
                  <Badge variant="destructive" className="text-[10px] gap-1">
                    <AlertTriangle className="size-3" />
                    Destructive
                  </Badge>
                )}
                {dryRun && (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] gap-1">
                    <Eye className="size-3" />
                    Dry Run
                  </Badge>
                )}
              </div>

              {isDestructive && !dryRun ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      ref={alertDialogRef}
                      disabled={isExecuting || !migrationSQL.trim() || !migrationName.trim()}
                      size="sm"
                      variant="destructive"
                    >
                      {isExecuting ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <AlertTriangle className="mr-2 size-4" />
                      )}
                      Apply Migration
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="size-5 text-red-500" />
                        Destructive Migration
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="flex flex-col gap-3">
                          <p>
                            This migration contains destructive operations that may permanently modify or delete data:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {destructiveKeywords.map((kw) => (
                              <Badge key={kw} variant="destructive" className="text-xs">
                                {kw}
                              </Badge>
                            ))}
                          </div>
                          <div className="rounded-md bg-zinc-950 dark:bg-zinc-900 border border-zinc-800 dark:border-zinc-700 p-3 overflow-x-auto max-h-32">
                            <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">
                              {migrationSQL.trim().length > 300
                                ? migrationSQL.trim().slice(0, 300) + '...'
                                : migrationSQL.trim()}
                            </pre>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Are you sure you want to apply this migration? This action cannot be undone.
                          </p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={executeMigration} className="bg-destructive hover:bg-destructive/90">
                        Apply Migration
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  onClick={executeMigration}
                  disabled={isExecuting || !migrationSQL.trim() || !migrationName.trim()}
                  size="sm"
                  variant={dryRun ? 'secondary' : 'default'}
                >
                  {isExecuting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : dryRun ? (
                    <Eye className="mr-2 size-4" />
                  ) : (
                    <Play className="mr-2 size-4" />
                  )}
                  {dryRun ? 'Dry Run' : 'Apply Migration'}
                </Button>
              )}
            </div>

            {/* Dry Run Result */}
            {dryRunResult && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="size-4 text-amber-500" />
                  <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    Dry Run Result
                  </span>
                </div>
                <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">
                  {dryRunResult}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Migration History */}
      {connectionMigrations.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <button
              className="flex items-center justify-between w-full px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowHistory(!showHistory)}
            >
              <span className="flex items-center gap-1.5">
                <History className="size-3.5" />
                Migration History ({connectionMigrations.length})
              </span>
              {showHistory ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
            {showHistory && (
              <div className="border-t">
                <ScrollArea className="max-h-96">
                  <div className="flex flex-col">
                    {connectionMigrations.map((migration) => (
                      <div
                        key={migration.id}
                        className="flex items-start gap-3 px-4 py-3 border-b last:border-0 hover:bg-accent/50 transition-colors"
                      >
                        <div className="mt-0.5 shrink-0">{statusIcon(migration.status)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{migration.name}</span>
                            {statusBadge(migration.status)}
                          </div>
                          <code className="text-[11px] font-mono text-muted-foreground block mt-1 truncate">
                            {migration.sql.length > 100
                              ? migration.sql.slice(0, 100) + '...'
                              : migration.sql}
                          </code>
                          {migration.error && (
                            <p className="text-[11px] text-red-500 mt-1">{migration.error}</p>
                          )}
                          <span className="text-[10px] text-muted-foreground mt-1 block">
                            {new Date(migration.appliedAt).toLocaleString()}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-7 text-xs text-muted-foreground"
                          onClick={() => {
                            setMigrationSQL(migration.sql)
                            setMigrationName(migration.name)
                            setSelectedTemplate('none')
                            setDryRunResult(null)
                          }}
                        >
                          Re-use
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="px-4 py-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearMigrationHistory}
                    className="w-full gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                    Clear History
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
