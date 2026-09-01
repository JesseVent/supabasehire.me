'use client'

import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  Loader2,
  LockKeyhole,
  Package,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { track } from '@/lib/analytics'
import {
  type BackupOptions,
  type BackupStep,
  createBackup,
  DEFAULT_BACKUP_OPTIONS,
} from '@/lib/backup'
import type { SupabaseConnection } from '@/lib/supabase-types'

// ─── Types ───

interface BackupPanelProps {
  connection: SupabaseConnection | null
  isDemoMode: boolean
}

// ─── Component ───

export function BackupPanel({ connection, isDemoMode }: BackupPanelProps) {
  const [steps, setSteps] = useState<BackupStep[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultFilename, setResultFilename] = useState<string>('')
  const [options, setOptions] = useState<BackupOptions>(DEFAULT_BACKUP_OPTIONS)

  const hasOAuth = !!connection?.accessToken

  async function handleBackup() {
    if (!connection) return
    setIsRunning(true)
    setSteps([])
    setResultUrl(null)

    // Revoke any previous object URL
    const prevUrl = resultUrl
    if (prevUrl) URL.revokeObjectURL(prevUrl)

    try {
      const { bytes, filename, warnings } = await createBackup(connection, options, setSteps)
      const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      setResultUrl(url)
      setResultFilename(filename)

      // Trigger download
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      if (warnings.length > 0) {
        toast.success(
          `Backup created with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`
        )
      } else {
        toast.success('Backup created successfully')
      }

      track('backup_created', {
        include_data: options.includeData,
        row_limit: options.rowLimit,
        include_lite: options.includeLite,
        warning_count: warnings.length,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Backup failed', { description: msg })
      track('backup_failed', { error: msg })
    } finally {
      setIsRunning(false)
    }
  }

  // ─── Render: no connection ───

  if (!connection && !isDemoMode) {
    return (
      <EmptyState
        icon={<DatabaseBackup className="size-10 text-muted-foreground/40" />}
        title="No project connected"
        description="Connect a Supabase project to create a full backup of its schema, policies, edge functions, and data."
      />
    )
  }

  // ─── Render: demo mode ───

  if (isDemoMode) {
    return (
      <EmptyState
        icon={<DatabaseBackup className="size-10 text-muted-foreground/40" />}
        title="Backup not available in Demo mode"
        description="Connect a real Supabase project with an OAuth access token to create a restorable backup."
      />
    )
  }

  // ─── Render: no OAuth token ───

  if (!hasOAuth) {
    return (
      <EmptyState
        icon={<LockKeyhole className="size-10 text-muted-foreground/40" />}
        title="OAuth access token required"
        description="Backup uses the Management API to read schema DDL, edge functions, and migrations. Reconnect your project via OAuth to enable backups."
      />
    )
  }

  // ─── Render: main ───

  const completedCount = steps.filter((s) => s.status === 'done').length
  const errorCount = steps.filter((s) => s.status === 'error').length

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Package className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Project Backup</h2>
          <p className="text-sm text-muted-foreground">
            Export a restorable snapshot of your Supabase project — schema DDL, RLS policies, edge
            functions, storage buckets, migrations, and optionally row data.
          </p>
        </div>
      </div>

      {/* Options */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="include-data" className="text-sm font-medium">
                Include row data
              </Label>
              <p className="text-xs text-muted-foreground">
                Export {options.rowLimit ? `the first ${options.rowLimit}` : 'all'} rows from each
                table as JSON.
              </p>
            </div>
            <Switch
              id="include-data"
              checked={options.includeData}
              onCheckedChange={(checked) =>
                setOptions((prev) => ({ ...prev, includeData: checked }))
              }
              disabled={isRunning}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Row limit per table</Label>
              <p className="text-xs text-muted-foreground">Caps the number of rows exported.</p>
            </div>
            <div className="flex gap-1">
              {[100, 500, 1000, 0].map((n) => (
                <Button
                  key={n}
                  variant={options.rowLimit === n ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setOptions((prev) => ({ ...prev, rowLimit: n }))}
                  disabled={isRunning || !options.includeData}
                >
                  {n === 0 ? 'All' : n}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="include-lite" className="text-sm font-medium">
                Include Supabase Lite project
              </Label>
              <p className="text-xs text-muted-foreground">
                Adds <code>lite/</code>: unzip and run <code>node lite/restore.mjs</code> to bring
                the project back up locally.
              </p>
            </div>
            <Switch
              id="include-lite"
              checked={options.includeLite}
              onCheckedChange={(checked) =>
                setOptions((prev) => ({ ...prev, includeLite: checked }))
              }
              disabled={isRunning}
            />
          </div>
        </CardContent>
      </Card>

      {/* Action */}
      <div className="flex items-center gap-3">
        <Button onClick={handleBackup} disabled={isRunning} className="gap-1.5">
          {isRunning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {isRunning ? 'Creating backup…' : 'Create Backup'}
        </Button>
        {resultUrl && !isRunning && (
          <Button variant="outline" className="gap-1.5" asChild>
            <a href={resultUrl} download={resultFilename}>
              <Download className="size-4" />
              Re-download
            </a>
          </Button>
        )}
        {steps.length > 0 && !isRunning && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={errorCount > 0 ? 'destructive' : 'secondary'} className="text-[10px]">
              {completedCount}/{steps.length} done
            </Badge>
            {errorCount > 0 && (
              <span>
                {errorCount} error{errorCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Progress steps */}
      {steps.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              {steps.map((step, i) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-2.5 text-sm"
                >
                  <StepIcon status={step.status} />
                  <span className={step.status === 'pending' ? 'text-muted-foreground' : ''}>
                    {step.label}
                  </span>
                  {step.detail && (
                    <span className="text-xs text-muted-foreground truncate">{step.detail}</span>
                  )}
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contents legend */}
      {!isRunning && steps.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 text-sm font-medium">What's included</h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-primary" />
                Schema DDL — tables, columns, constraints, indexes
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-primary" />
                Views, functions, and triggers (via pg_get_*def)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-primary" />
                RLS policies (restorable CREATE POLICY statements)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-primary" />
                Edge function source code
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-primary" />
                Storage bucket configuration
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-primary" />
                Migration history
              </li>
              {options.includeData && (
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-primary" />
                  Row data (first {options.rowLimit} rows per table, JSON)
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Sub-components ───

function StepIcon({ status }: { status: BackupStep['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="size-4 text-primary shrink-0" />
    case 'error':
      return <AlertCircle className="size-4 text-destructive shrink-0" />
    case 'running':
      return <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
    default:
      return <div className="size-4 rounded-full border border-muted-foreground/30 shrink-0" />
  }
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {icon}
      <h3 className="mt-4 text-sm font-medium">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
