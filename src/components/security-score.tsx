'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Copy,
  Check,
  Terminal,
  ArrowRight,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { TableRLSInfo, TableSchema } from '@/lib/supabase-types'
import { useSupabaseStore } from '@/store/supabase-store'

interface SecurityScoreProps {
  rlsStatuses: TableRLSInfo[]
  tables: TableSchema[]
}

interface ScoreBreakdown {
  score: number
  tablesWithoutRLS: TableRLSInfo[]
  tablesWithRLSNoPolicies: TableRLSInfo[]
  tablesFullyProtected: TableRLSInfo[]
  restrictivePolicies: number
  tablesOnlySelect: TableRLSInfo[]
  policyCoverage: number
  criticalTables: TableRLSInfo[]
}

function calculateScore(rlsStatuses: TableRLSInfo[], tables: TableSchema[]): ScoreBreakdown {
  let score = 100
  let restrictivePolicies = 0

  const tablesWithoutRLS = rlsStatuses.filter((t) => !t.rlsEnabled)
  const tablesWithRLSNoPolicies = rlsStatuses.filter(
    (t) => t.rlsEnabled && t.policies.length === 0
  )
  const tablesFullyProtected = rlsStatuses.filter(
    (t) => t.rlsEnabled && t.policies.length > 0
  )

  // -20 for each table without RLS enabled
  score -= tablesWithoutRLS.length * 20

  // -5 for each table with RLS enabled but no policies
  score -= tablesWithRLSNoPolicies.length * 5

  // -3 for each RESTRICTIVE policy
  rlsStatuses.forEach((t) => {
    t.policies.forEach((p) => {
      if (p.permissive === 'RESTRICTIVE') {
        restrictivePolicies++
        score -= 3
      }
    })
  })

  // -2 for each table with only SELECT policies (missing INSERT/UPDATE/DELETE protection)
  const tablesOnlySelect = rlsStatuses.filter((t) => {
    if (!t.rlsEnabled || t.policies.length === 0) return false
    const commands = new Set(t.policies.map((p) => p.cmd))
    return commands.has('SELECT') && !commands.has('INSERT') && !commands.has('UPDATE') && !commands.has('DELETE') && !commands.has('ALL')
  })
  score -= tablesOnlySelect.length * 2

  // Cap at 0
  score = Math.max(0, score)

  // Policy coverage: percentage of operations covered by at least one policy
  const totalOperations = rlsStatuses.length * 4 // SELECT, INSERT, UPDATE, DELETE per table
  let coveredOperations = 0
  rlsStatuses.forEach((t) => {
    if (!t.rlsEnabled) return // Tables without RLS don't count towards "covered"
    const commands = new Set(t.policies.map((p) => p.cmd))
    if (commands.has('SELECT') || commands.has('ALL')) coveredOperations++
    if (commands.has('INSERT') || commands.has('ALL')) coveredOperations++
    if (commands.has('UPDATE') || commands.has('ALL')) coveredOperations++
    if (commands.has('DELETE') || commands.has('ALL')) coveredOperations++
  })
  const policyCoverage = totalOperations > 0 ? Math.round((coveredOperations / totalOperations) * 100) : 0

  // Critical: Tables without RLS that have foreign keys to protected tables
  const protectedTableNames = new Set(tablesFullyProtected.map((t) => t.tableName))
  const criticalTables = tablesWithoutRLS.filter((t) => {
    const tableSchema = tables.find((ts) => ts.tableName === t.tableName)
    if (!tableSchema) return false
    return tableSchema.foreignKeys.some((fk) => protectedTableNames.has(fk.foreign_table_name))
  })

  return {
    score,
    tablesWithoutRLS,
    tablesWithRLSNoPolicies,
    tablesFullyProtected,
    restrictivePolicies,
    tablesOnlySelect,
    policyCoverage,
    criticalTables,
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-primary'
  if (score >= 60) return 'text-amber-500'
  if (score >= 40) return 'text-orange-500'
  return 'text-red-500'
}

function getScoreStroke(score: number): string {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  if (score >= 40) return '#f97316'
  return '#ef4444'
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Good'
  if (score >= 60) return 'Fair'
  if (score >= 40) return 'Poor'
  return 'Critical'
}

export function SecurityScore({ rlsStatuses, tables }: SecurityScoreProps) {
  const { setActivePanel, setSqlEditorContent } = useSupabaseStore()

  const breakdown = useMemo(
    () => calculateScore(rlsStatuses, tables),
    [rlsStatuses, tables]
  )

  const { score } = breakdown

  // RLS Toggle Simulation state
  const [simulatedRLS, setSimulatedRLS] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState(false)

  // Tables without RLS (for toggle simulation)
  const tablesWithoutRLS = breakdown.tablesWithoutRLS

  // Calculate simulated score
  const simulatedBreakdown = useMemo(() => {
    const simulatedStatuses = rlsStatuses.map((t) => {
      if (!t.rlsEnabled && simulatedRLS[t.tableName]) {
        // Simulate RLS enabled with a basic SELECT policy
        return {
          ...t,
          rlsEnabled: true,
          policies: [
            ...t.policies,
            {
              schemaname: 'public',
              tablename: t.tableName,
              policyname: `Allow authenticated users to view ${t.tableName}`,
              permissive: 'PERMISSIVE',
              roles: '{authenticated}',
              cmd: 'SELECT',
              qual: 'true',
              with_check: null,
            },
          ],
        }
      }
      return t
    })
    return calculateScore(simulatedStatuses, tables)
  }, [rlsStatuses, tables, simulatedRLS])

  const hasSimulatedChanges = Object.values(simulatedRLS).some((v) => v)
  const potentialScore = hasSimulatedChanges ? simulatedBreakdown.score : score

  // Generate ALTER TABLE statements for all unprotected tables
  const alterTableSQL = useMemo(() => {
    if (tablesWithoutRLS.length === 0) return ''
    return tablesWithoutRLS
      .map((t) => `ALTER TABLE ${t.tableName} ENABLE ROW LEVEL SECURITY;`)
      .join('\n')
  }, [tablesWithoutRLS])

  const handleToggleRLS = useCallback((tableName: string, enabled: boolean) => {
    setSimulatedRLS((prev) => ({ ...prev, [tableName]: enabled }))
  }, [])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const openInSQLRunner = useCallback(() => {
    const sql = tablesWithoutRLS
      .map((t) => {
        const tableSchema = tables.find((ts) => ts.tableName === t.tableName)
        const userCol = tableSchema?.columns.find(
          (c) =>
            c.column_name.toLowerCase() === 'user_id' ||
            c.column_name.toLowerCase().includes('user')
        )
        let sql = `ALTER TABLE ${t.tableName} ENABLE ROW LEVEL SECURITY;`
        if (userCol) {
          sql += `\n\nCREATE POLICY "${t.tableName}_select_own" ON ${t.tableName}\n  FOR SELECT\n  USING (auth.uid() = ${userCol.column_name});`
        } else {
          sql += `\n\nCREATE POLICY "${t.tableName}_select_auth" ON ${t.tableName}\n  FOR SELECT\n  TO authenticated\n  USING (true);`
        }
        return sql
      })
      .join('\n\n')
    setSqlEditorContent(sql)
    setActivePanel('sql')
  }, [tablesWithoutRLS, tables, setSqlEditorContent, setActivePanel])

  // SVG circle properties
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const potentialOffset = circumference - (potentialScore / 100) * circumference

  return (
    <div className="flex flex-col gap-4">
      {/* Main score display */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <CardTitle>Security Score</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px]">
                  Measures your database security posture based on RLS configuration
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <CardDescription>
            Overall RLS security posture for your database
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Circular progress indicator */}
            <div className="relative flex items-center justify-center">
              <svg width="180" height="180" className="-rotate-90">
                {/* Background circle */}
                <circle
                  cx="90"
                  cy="90"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="10"
                  fill="none"
                  className="text-muted/30"
                />
                {/* Current progress circle */}
                <circle
                  cx="90"
                  cy="90"
                  r={radius}
                  stroke={getScoreStroke(score)}
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  className="transition-all duration-1000 ease-out"
                />
                {/* Potential progress circle (if simulated) */}
                {hasSimulatedChanges && potentialScore !== score && (
                  <circle
                    cx="90"
                    cy="90"
                    r={radius - 6}
                    stroke={getScoreStroke(potentialScore)}
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * (radius - 6)}
                    strokeDashoffset={
                      2 * Math.PI * (radius - 6) - (potentialScore / 100) * 2 * Math.PI * (radius - 6)
                    }
                    className="transition-all duration-1000 ease-out opacity-50"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {hasSimulatedChanges && potentialScore !== score ? (
                  <>
                    <span className={`text-2xl font-bold tabular-nums line-through ${getScoreColor(score)}`}>
                      {score}
                    </span>
                    <span className={`text-3xl font-bold tabular-nums ${getScoreColor(potentialScore)}`}>
                      {potentialScore}
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {getScoreLabel(potentialScore)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={`text-4xl font-bold tabular-nums ${getScoreColor(score)}`}>
                      {score}
                    </span>
                    <span className="text-xs text-muted-foreground mt-1">
                      {getScoreLabel(score)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Risk badges */}
            <div className="flex flex-col gap-2 flex-1 w-full">
              {hasSimulatedChanges && potentialScore !== score && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/30 dark:border-primary/50/50 bg-primary/10 dark:bg-primary/20 p-3">
                  <ArrowRight className="size-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-primary dark:text-primary">
                      Score Improvement
                    </span>
                    <span className="text-xs text-primary dark:text-primary/80">
                      Current Score: {score} → Potential Score: {potentialScore} (+{potentialScore - score} points)
                    </span>
                  </div>
                </div>
              )}

              {breakdown.criticalTables.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3">
                  <XCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-red-700 dark:text-red-400">
                      Critical Risk
                    </span>
                    <span className="text-xs text-red-600 dark:text-red-400/80">
                      {breakdown.criticalTables.length} table{breakdown.criticalTables.length !== 1 ? 's' : ''} without RLS have foreign keys to protected tables
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {breakdown.criticalTables.map((t) => (
                        <Badge key={t.tableName} variant="destructive" className="text-[10px] px-1.5 py-0">
                          {t.tableName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {breakdown.tablesWithRLSNoPolicies.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Warning
                    </span>
                    <span className="text-xs text-amber-600 dark:text-amber-400/80">
                      {breakdown.tablesWithRLSNoPolicies.length} table{breakdown.tablesWithRLSNoPolicies.length !== 1 ? 's' : ''} with RLS enabled but no policies (all access denied)
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {breakdown.tablesWithRLSNoPolicies.map((t) => (
                        <Badge key={t.tableName} className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-600">
                          {t.tableName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {breakdown.tablesFullyProtected.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/30 dark:border-primary/50/50 bg-primary/10 dark:bg-primary/20 p-3">
                  <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-primary dark:text-primary">
                      Good
                    </span>
                    <span className="text-xs text-primary dark:text-primary/80">
                      {breakdown.tablesFullyProtected.length} table{breakdown.tablesFullyProtected.length !== 1 ? 's' : ''} properly protected with RLS policies
                    </span>
                  </div>
                </div>
              )}

              {breakdown.tablesWithoutRLS.length === 0 && breakdown.tablesWithRLSNoPolicies.length === 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/30 dark:border-primary/50/50 bg-primary/10 dark:bg-primary/20 p-3">
                  <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-primary dark:text-primary">
                      All tables secured
                    </span>
                    <span className="text-xs text-primary dark:text-primary/80">
                      All tables have RLS enabled with policies defined
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tables without RLS */}
        <Card className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldX className="size-4 text-red-500" />
              <span className="text-sm font-medium">Tables without RLS</span>
            </div>
            <div className="text-2xl font-bold text-red-500 mb-2">
              {breakdown.tablesWithoutRLS.length}
            </div>
            <TooltipProvider>
              <ScrollArea className="max-h-36">
                {breakdown.tablesWithoutRLS.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {breakdown.tablesWithoutRLS.map((t) => (
                      <Tooltip key={t.tableName}>
                        <TooltipTrigger asChild>
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 cursor-default">
                            {t.tableName}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>No RLS enabled — all access unrestricted</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">None — all tables have RLS</span>
                )}
              </ScrollArea>
            </TooltipProvider>
          </CardContent>
        </Card>

        {/* Tables with RLS but no policies */}
        <Card className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="size-4 text-amber-500" />
              <span className="text-sm font-medium">RLS but no policies</span>
            </div>
            <div className="text-2xl font-bold text-amber-500 mb-2">
              {breakdown.tablesWithRLSNoPolicies.length}
            </div>
            <TooltipProvider>
              <ScrollArea className="max-h-36">
                {breakdown.tablesWithRLSNoPolicies.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {breakdown.tablesWithRLSNoPolicies.map((t) => (
                      <Tooltip key={t.tableName}>
                        <TooltipTrigger asChild>
                          <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-600 cursor-default">
                            {t.tableName}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>RLS enabled but no policies — all access denied</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">None — all RLS tables have policies</span>
                )}
              </ScrollArea>
            </TooltipProvider>
          </CardContent>
        </Card>

        {/* Tables fully protected */}
        <Card className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="size-4 text-primary" />
              <span className="text-sm font-medium">Fully protected</span>
            </div>
            <div className="text-2xl font-bold text-primary mb-2">
              {breakdown.tablesFullyProtected.length}
            </div>
            <TooltipProvider>
              <ScrollArea className="max-h-36">
                {breakdown.tablesFullyProtected.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {breakdown.tablesFullyProtected.map((t) => (
                      <Tooltip key={t.tableName}>
                        <TooltipTrigger asChild>
                          <Badge className="text-[10px] px-1.5 py-0 bg-primary hover:bg-primary cursor-default">
                            {t.tableName}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>RLS enabled with {t.policies.length} polic{t.policies.length !== 1 ? 'ies' : 'y'}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">No fully protected tables</span>
                )}
              </ScrollArea>
            </TooltipProvider>
          </CardContent>
        </Card>

        {/* Policy coverage */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Info className="size-4 text-primary" />
              <span className="text-sm font-medium">Policy coverage</span>
            </div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className={`text-2xl font-bold ${
                breakdown.policyCoverage >= 80
                  ? 'text-primary'
                  : breakdown.policyCoverage >= 50
                    ? 'text-amber-500'
                    : 'text-red-500'
              }`}>
                {breakdown.policyCoverage}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mb-1">
              <div
                className={`h-2 rounded-full transition-all duration-700 ${
                  breakdown.policyCoverage >= 80
                    ? 'bg-primary'
                    : breakdown.policyCoverage >= 50
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${breakdown.policyCoverage}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              of CRUD operations covered
            </span>
            {breakdown.restrictivePolicies > 0 && (
              <div className="mt-2 flex items-center gap-1">
                <AlertTriangle className="size-3 text-amber-500" />
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  {breakdown.restrictivePolicies} restrictive polic{breakdown.restrictivePolicies !== 1 ? 'ies' : 'y'}
                </span>
              </div>
            )}
            {breakdown.tablesOnlySelect.length > 0 && (
              <div className="mt-1 flex items-center gap-1">
                <Info className="size-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">
                  {breakdown.tablesOnlySelect.length} table{breakdown.tablesOnlySelect.length !== 1 ? 's' : ''} only SELECT
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* RLS Toggle Simulation */}
      {tablesWithoutRLS.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-amber-500" />
              <CardTitle>Simulate RLS Changes</CardTitle>
            </div>
            <CardDescription>
              Toggle RLS on unprotected tables to see how your security score would improve. This is purely simulated — no database changes are made.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {/* Toggle list */}
              <div className="flex flex-col gap-2">
                {tablesWithoutRLS.map((t) => (
                  <div
                    key={t.tableName}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                      simulatedRLS[t.tableName]
                        ? 'border-primary/30 dark:border-primary/50/50 bg-primary/10 dark:bg-primary/20'
                        : 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {simulatedRLS[t.tableName] ? (
                        <ShieldCheck className="size-4 text-primary" />
                      ) : (
                        <ShieldX className="size-4 text-red-500" />
                      )}
                      <span className="font-mono text-sm font-medium">{t.tableName}</span>
                      <Badge
                        variant={simulatedRLS[t.tableName] ? 'default' : 'destructive'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {simulatedRLS[t.tableName] ? 'RLS Simulated' : 'No RLS'}
                      </Badge>
                    </div>
                    <Switch
                      checked={simulatedRLS[t.tableName] || false}
                      onCheckedChange={(checked) => handleToggleRLS(t.tableName, checked)}
                    />
                  </div>
                ))}
              </div>

              {/* Score impact message */}
              {hasSimulatedChanges && (
                <div className="flex items-center gap-2 text-sm">
                  <ArrowRight className="size-4 text-primary shrink-0" />
                  <span>
                    Current Score:{' '}
                    <span className={`font-bold ${getScoreColor(score)}`}>{score}</span>
                    {' → '}Potential Score:{' '}
                    <span className={`font-bold ${getScoreColor(potentialScore)}`}>{potentialScore}</span>
                    <span className="text-primary dark:text-primary ml-1">
                      (+{potentialScore - score} points)
                    </span>
                  </span>
                </div>
              )}

              <Separator />

              {/* Generate ALTER TABLE statements */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Generate ALTER TABLE statements</span>
                  <Badge variant="outline" className="text-[10px]">
                    {tablesWithoutRLS.length} table{tablesWithoutRLS.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                {alterTableSQL && (
                  <div className="relative rounded-lg overflow-hidden border border-zinc-800 dark:border-zinc-700 bg-zinc-950 dark:bg-zinc-900">
                    <pre className="p-4 font-mono text-sm text-zinc-100 dark:text-zinc-200 overflow-x-auto whitespace-pre-wrap">
                      <code>{alterTableSQL}</code>
                    </pre>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(alterTableSQL)}
                    className="gap-1.5"
                  >
                    {copied ? (
                      <Check className="size-3.5 text-primary" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copied ? 'Copied!' : 'Copy SQL'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={openInSQLRunner}
                    className="gap-1.5"
                  >
                    <ArrowRight className="size-3.5" />
                    <Terminal className="size-3.5" />
                    Open in SQL Runner
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
