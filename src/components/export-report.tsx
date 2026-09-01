'use client'

import { Check, Copy, FileDown, FileText } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { calculateScore, type ScoreBreakdown } from '@/components/security-score'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import type { TableRLSInfo } from '@/lib/supabase-types'
import { useSupabaseStore } from '@/store/supabase-store'

function generateMarkdownReport(
  rlsStatuses: TableRLSInfo[],
  projectName: string,
  projectUrl: string,
  breakdown: ScoreBreakdown
): string {
  const securityScore = breakdown.score
  const lines: string[] = []

  lines.push('# Supabase RLS Security Report')
  lines.push('')
  lines.push(`**Generated:** ${new Date().toISOString()}`)
  lines.push(`**Project:** ${projectName}`)
  lines.push(`**URL:** ${projectUrl}`)
  lines.push('')

  // Security Score
  lines.push('## Security Score')
  lines.push('')
  const scoreLabel =
    securityScore >= 80
      ? 'Good'
      : securityScore >= 60
        ? 'Fair'
        : securityScore >= 40
          ? 'Poor'
          : 'Critical'
  lines.push(`**Score: ${securityScore}/100** (${scoreLabel})`)
  lines.push('')
  lines.push(
    `Policy coverage: **${breakdown.policyCoverage}%** of table operations (SELECT / INSERT / UPDATE / DELETE) are covered by at least one policy.`
  )
  lines.push('')
  lines.push('| Deduction | Count | Points |')
  lines.push('|-----------|-------|--------|')
  lines.push(
    `| Table without RLS | ${breakdown.tablesWithoutRLS.length} | −${breakdown.tablesWithoutRLS.length * 20} |`
  )
  lines.push(
    `| RLS on, no policies | ${breakdown.tablesWithRLSNoPolicies.length} | −${breakdown.tablesWithRLSNoPolicies.length * 5} |`
  )
  lines.push(
    `| RESTRICTIVE policy | ${breakdown.restrictivePolicies} | −${breakdown.restrictivePolicies * 3} |`
  )
  lines.push(
    `| SELECT-only table | ${breakdown.tablesOnlySelect.length} | −${breakdown.tablesOnlySelect.length * 2} |`
  )
  lines.push('')

  // Tables Summary
  const rlsEnabled = rlsStatuses.filter((t) => t.rlsEnabled)
  const rlsDisabled = rlsStatuses.filter((t) => !t.rlsEnabled)
  const withPolicies = rlsStatuses.filter((t) => t.rlsEnabled && t.policies.length > 0)
  const noPolicies = rlsStatuses.filter((t) => t.rlsEnabled && t.policies.length === 0)

  lines.push('## Summary')
  lines.push('')
  lines.push(`| Metric | Count |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Total Tables | ${rlsStatuses.length} |`)
  lines.push(`| RLS Enabled | ${rlsEnabled.length} |`)
  lines.push(`| RLS Disabled | ${rlsDisabled.length} |`)
  lines.push(`| Tables with Policies | ${withPolicies.length} |`)
  lines.push(`| Tables without Policies | ${noPolicies.length} |`)
  lines.push('')

  // RLS Status per Table
  lines.push('## Table RLS Status')
  lines.push('')
  lines.push('| Table | RLS Enabled | Policies | Risk |')
  lines.push('|-------|-------------|----------|------|')
  for (const rls of rlsStatuses) {
    const rlsStatus = rls.rlsEnabled ? '✅ Yes' : '❌ No'
    const policyCount = rls.policies.length
    const risk = !rls.rlsEnabled ? '🔴 Critical' : policyCount === 0 ? '🟡 Warning' : '🟢 Good'
    lines.push(`| \`${rls.tableName}\` | ${rlsStatus} | ${policyCount} | ${risk} |`)
  }
  lines.push('')

  // Detailed Policy List
  const tablesWithPolicies = rlsStatuses.filter((t) => t.policies.length > 0)
  if (tablesWithPolicies.length > 0) {
    lines.push('## Policy Details')
    lines.push('')
    for (const rls of tablesWithPolicies) {
      lines.push(`### \`${rls.tableName}\``)
      lines.push('')
      lines.push('| Policy | Command | Permissive | Roles |')
      lines.push('|--------|---------|------------|-------|')
      for (const p of rls.policies) {
        const roles = Array.isArray(p.roles) ? p.roles.join(', ') : p.roles || '—'
        lines.push(`| \`${p.policyname}\` | ${p.cmd} | ${p.permissive} | ${roles} |`)
      }
      lines.push('')
    }
  }

  // Recommendations
  lines.push('## Recommendations')
  lines.push('')

  if (breakdown.criticalTables.length > 0) {
    lines.push('### Unprotected tables with foreign keys into protected data (Highest priority)')
    lines.push('')
    lines.push(
      'These tables have no RLS but reference tables that do — they leak the protected rows by association:'
    )
    lines.push('')
    for (const t of breakdown.criticalTables) {
      lines.push(`- \`${t.tableName}\``)
    }
    lines.push('')
  }

  if (breakdown.tablesOnlySelect.length > 0) {
    lines.push('### Read-only policy coverage (Warning)')
    lines.push('')
    lines.push(
      'These tables define SELECT policies but nothing for INSERT / UPDATE / DELETE, so writes are silently denied:'
    )
    lines.push('')
    for (const t of breakdown.tablesOnlySelect) {
      lines.push(`- \`${t.tableName}\``)
    }
    lines.push('')
  }

  if (rlsDisabled.length > 0) {
    lines.push('### Tables without RLS (Critical)')
    lines.push('')
    lines.push(
      'The following tables have no row-level security enabled. All rows are accessible to all users:'
    )
    lines.push('')
    const criticalNames = new Set(breakdown.criticalTables.map((t) => t.tableName))
    for (const t of rlsDisabled) {
      lines.push(`- \`${t.tableName}\`${criticalNames.has(t.tableName) ? ' (listed above)' : ''}`)
    }
    lines.push('')
  }

  if (noPolicies.length > 0) {
    lines.push('### Tables with RLS but no policies (Warning)')
    lines.push('')
    lines.push(
      'The following tables have RLS enabled but no policies defined. This means all access is denied by default:'
    )
    lines.push('')
    for (const t of noPolicies) {
      lines.push(`- \`${t.tableName}\``)
    }
    lines.push('')
  }

  if (rlsDisabled.length === 0 && noPolicies.length === 0) {
    lines.push(
      'All tables have RLS enabled with policies defined. Your database security posture looks good! 🎉'
    )
    lines.push('')
  }

  // Generated SQL
  if (rlsDisabled.length > 0 || noPolicies.length > 0) {
    lines.push('## Generated SQL')
    lines.push('')
    lines.push('```sql')
    if (rlsDisabled.length > 0) {
      lines.push('-- Enable RLS on unprotected tables')
      for (const t of rlsDisabled) {
        lines.push(`ALTER TABLE ${t.tableName} ENABLE ROW LEVEL SECURITY;`)
      }
    }
    if (noPolicies.length > 0) {
      if (rlsDisabled.length > 0) lines.push('')
      lines.push('-- RLS is on but nothing is allowed through. Replace the USING clause with')
      lines.push('-- the real ownership condition for each table before running.')
      for (const t of noPolicies) {
        lines.push(
          `CREATE POLICY "${t.tableName}_owner_access" ON ${t.tableName} FOR ALL TO authenticated USING (auth.uid() = user_id);`
        )
      }
    }
    lines.push('```')
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('*Report generated by Supabase Debugging & RLS Visualization Tool*')

  return lines.join('\n')
}

export function ExportReport() {
  const { activeConnectionId, connections, tables, rlsStatuses } = useSupabaseStore()

  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const activeConnection = connections.find((c) => c.id === activeConnectionId)
  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID

  const breakdown = useMemo(() => calculateScore(rlsStatuses, tables), [rlsStatuses, tables])
  const securityScore = breakdown.score

  const report = useMemo(
    () =>
      generateMarkdownReport(
        rlsStatuses,
        activeConnection?.name || (isDemoMode ? 'Demo Project' : 'Unknown'),
        activeConnection?.supabaseUrl || '',
        breakdown
      ),
    [rlsStatuses, activeConnection, isDemoMode, breakdown]
  )

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Report copied to clipboard')
  }, [report])

  const downloadAsFile = useCallback(() => {
    const blob = new Blob([report], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rls-report-${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Report downloaded')
  }, [report])

  const canExport = rlsStatuses.length > 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!canExport}
          title={canExport ? 'Export RLS report as Markdown' : 'Connect to a project first'}
        >
          <FileText className="size-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="size-5 text-primary" />
            Export RLS Report
          </DialogTitle>
          <DialogDescription>
            Generate a comprehensive Markdown report of your database RLS configuration
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {/* Quick stats */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs">
              {rlsStatuses.length} tables
            </Badge>
            <Badge variant="outline" className="text-xs">
              Score: {securityScore}/100
            </Badge>
            <Badge variant="outline" className="text-xs">
              {breakdown.tablesWithoutRLS.length} without RLS
            </Badge>
            <Badge variant="outline" className="text-xs">
              {breakdown.policyCoverage}% policy coverage
            </Badge>
          </div>

          {/* Report preview */}
          <ScrollArea className="h-[min(55vh,420px)] rounded-lg border bg-muted/30">
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap text-foreground/90 leading-relaxed">
              {report}
            </pre>
          </ScrollArea>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={copyToClipboard} className="gap-1.5 flex-1">
              {copied ? (
                <>
                  <Check className="size-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy to Clipboard
                </>
              )}
            </Button>
            <Button variant="outline" onClick={downloadAsFile} className="gap-1.5 flex-1">
              <FileDown className="size-4" />
              Download .md
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
