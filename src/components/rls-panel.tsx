'use client'

import {
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trash2,
  Unlock,
  User,
  Wand2,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AuthSimulator } from '@/components/auth-simulator'
import { PolicyGenerator } from '@/components/policy-generator'
import { SecurityScore } from '@/components/security-score'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api-auth'
import { DEMO_CONNECTION_ID, DEMO_RLS_STATUSES } from '@/lib/demo-data'
import type { RLSPolicy, RLSTestResult, TableRLSInfo } from '@/lib/supabase-types'
import { useSupabaseStore } from '@/store/supabase-store'

type RLSSubTab = 'policies' | 'score' | 'generator' | 'simulator'

export function RLSPanel({ initialTable }: { initialTable?: string }) {
  const {
    activeConnectionId,
    connections,
    rlsStatuses,
    setRlsStatuses,
    addRlsTestResult,
    tables,
    addActivityLog,
  } = useSupabaseStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null

  const [selectedTable, setSelectedTable] = useState<string>(initialTable ?? '')
  const [isLoadingRLS, setIsLoadingRLS] = useState(false)
  const [rlsError, setRlsError] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<RLSSubTab>('policies')
  const [deletingPolicy, setDeletingPolicy] = useState<string | null>(null)

  // RLS Test state
  const [testOperation, setTestOperation] = useState<string>('SELECT')
  const [testRole, setTestRole] = useState<string>('anon')
  const [testFilters, setTestFilters] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<RLSTestResult | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchRLSInfo = useCallback(async () => {
    if (!activeConnectionId) return
    setIsLoadingRLS(true)
    setRlsError(null)

    if (activeConnectionId === DEMO_CONNECTION_ID) {
      await new Promise((r) => setTimeout(r, 300))
      setRlsStatuses(DEMO_RLS_STATUSES)
      if (!selectedTable) setSelectedTable(DEMO_RLS_STATUSES[0].tableName)
      setIsLoadingRLS(false)
      return
    }

    try {
      const res = await apiFetch('/api/rls', activeConnection)
      const data = await res.json()
      if (data.error) {
        setRlsError(data.error)
      } else {
        setRlsStatuses(data.tables || [])
        if (!selectedTable && data.tables?.length > 0) {
          setSelectedTable(data.tables[0].tableName)
        }
      }
    } catch {
      setRlsError('Failed to fetch RLS info')
    } finally {
      setIsLoadingRLS(false)
    }
  }, [activeConnectionId, activeConnection, setRlsStatuses, selectedTable])

  useEffect(() => {
    if (activeConnectionId && rlsStatuses.length === 0) fetchRLSInfo()
  }, [activeConnectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const deletePolicy = useCallback(
    async (tableName: string, policyName: string) => {
      if (!activeConnection) return
      setDeletingPolicy(policyName)
      try {
        const sql = `DROP POLICY IF EXISTS "${policyName}" ON "${tableName}";`
        const res = await apiFetch('/api/sql', activeConnection, { query: sql })
        const data = await res.json()
        if (data.error) {
          toast.error('Failed to delete policy', { description: data.error })
        } else {
          toast.success(`Policy "${policyName}" deleted`)
          // Remove from local state immediately, then refresh
          setRlsStatuses(
            rlsStatuses.map((t) =>
              t.tableName === tableName
                ? { ...t, policies: t.policies.filter((p) => p.policyname !== policyName) }
                : t
            )
          )
        }
      } catch {
        toast.error('Failed to delete policy')
      } finally {
        setDeletingPolicy(null)
      }
    },
    [activeConnection, rlsStatuses, setRlsStatuses]
  )

  const runRLSTest = useCallback(async () => {
    if (!activeConnectionId || !selectedTable) return
    setIsTesting(true)
    setTestResult(null)

    // Demo mode: simulate RLS test result
    if (activeConnectionId === DEMO_CONNECTION_ID) {
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 300))
      const currentRls = rlsStatuses.find((r) => r.tableName === selectedTable)
      const rlsDisabled = !currentRls?.rlsEnabled
      const hasMatchingPolicy = currentRls?.policies.some(
        (p) => p.cmd === testOperation || p.cmd === 'ALL'
      )
      const success =
        rlsDisabled || testRole === 'authenticated' || (testRole === 'anon' && !!hasMatchingPolicy)
      const demoResult: RLSTestResult = {
        success,
        operation: testOperation as RLSTestResult['operation'],
        role: testRole as RLSTestResult['role'],
        tableName: selectedTable,
        rowCount: !success
          ? 0
          : rlsDisabled
            ? Math.floor(Math.random() * 200) + 50
            : testRole === 'authenticated'
              ? Math.floor(Math.random() * 50) + 1
              : Math.floor(Math.random() * 10) + 1,
        data: success
          ? [{ id: 'demo-id', name: 'Demo Data', created_at: new Date().toISOString() }]
          : [],
      }
      setTestResult(demoResult)
      addRlsTestResult(demoResult)
      addActivityLog({
        type: 'rls',
        action: `RLS test (demo): ${testOperation} on ${selectedTable}`,
        details: `Role: ${testRole}, Result: ${demoResult.success ? 'Allowed' : 'Blocked'}`,
      })
      if (demoResult.success) {
        toast.success('RLS test passed (demo)', { description: 'Access granted' })
      } else {
        toast.error('RLS test failed (demo)', { description: 'Access denied' })
      }
      setIsTesting(false)
      return
    }

    try {
      let filters: Record<string, unknown> | undefined
      if (testFilters.trim()) {
        try {
          filters = JSON.parse(testFilters)
        } catch {
          setTestResult({
            success: false,
            error: 'Invalid JSON in filters input',
            operation: testOperation as RLSTestResult['operation'],
            role: testRole as RLSTestResult['role'],
            tableName: selectedTable,
          })
          setIsTesting(false)
          return
        }
      }

      const res = await apiFetch('/api/rls/test', activeConnection, {
        tableName: selectedTable,
        operation: testOperation,
        role: testRole,
        filters,
      })
      const data = await res.json()
      const result: RLSTestResult = data.error
        ? {
            success: false,
            error: data.error,
            operation: testOperation as RLSTestResult['operation'],
            role: testRole as RLSTestResult['role'],
            tableName: selectedTable,
          }
        : data
      setTestResult(result)
      addRlsTestResult(result)
      addActivityLog({
        type: 'rls',
        action: `RLS test: ${testOperation} on ${selectedTable}`,
        details: `Role: ${testRole}, Result: ${result.success ? 'Allowed' : 'Blocked'}`,
      })
      if (result.success) {
        toast.success('RLS test passed', { description: 'Access granted' })
      } else {
        toast.error('RLS test failed', { description: 'Access denied' })
      }
    } catch {
      setTestResult({
        success: false,
        error: 'Network error occurred',
        operation: testOperation as RLSTestResult['operation'],
        role: testRole as RLSTestResult['role'],
        tableName: selectedTable,
      })
    } finally {
      setIsTesting(false)
    }
  }, [
    activeConnectionId,
    selectedTable,
    testOperation,
    testRole,
    testFilters,
    addRlsTestResult,
    addActivityLog,
  ])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const currentTableInfo: TableRLSInfo | undefined = rlsStatuses.find(
    (t) => t.tableName === selectedTable
  )

  const tableNames = rlsStatuses.map((t) => t.tableName)

  const getCommandBadgeVariant = (cmd: string) => {
    switch (cmd) {
      case 'SELECT':
        return 'default'
      case 'INSERT':
        return 'secondary'
      case 'UPDATE':
        return 'outline'
      case 'DELETE':
        return 'destructive'
      case 'ALL':
        return 'default'
      default:
        return 'outline'
    }
  }

  const getPermissiveIcon = (permissive: string) => {
    if (permissive === 'PERMISSIVE') {
      return <ShieldCheck className="size-4 text-primary" />
    }
    return <ShieldX className="size-4 text-red-500" />
  }

  return (
    <div className="h-full flex flex-col gap-3 p-3">
      {/* Compact header */}
      <div className="flex flex-wrap items-center gap-2">
        <Shield className="size-4 text-primary shrink-0" />
        <span className="font-semibold text-sm">Row Level Security</span>
        {activeConnectionId && (
          <Button onClick={fetchRLSInfo} disabled={isLoadingRLS} size="sm" className="h-7 text-xs ml-auto shrink-0">
            {isLoadingRLS ? (
              <Loader2 className="mr-1 size-3 animate-spin" />
            ) : (
              <ShieldAlert className="mr-1 size-3" />
            )}
            {rlsStatuses.length > 0 ? 'Refresh' : 'Load'}
          </Button>
        )}
        {rlsStatuses.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <Button
              variant={subTab === 'policies' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('policies')}
              className="h-7 text-xs gap-1"
            >
              <Shield className="size-3" />
              Policies
            </Button>
            <Button
              variant={subTab === 'score' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('score')}
              className="h-7 text-xs gap-1"
            >
              <BarChart3 className="size-3" />
              Score
            </Button>
            <Button
              variant={subTab === 'generator' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('generator')}
              className="h-7 text-xs gap-1"
            >
              <Wand2 className="size-3" />
              Generator
            </Button>
            <Button
              variant={subTab === 'simulator' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSubTab('simulator')}
              className="h-7 text-xs gap-1"
            >
              <User className="size-3" />
              Simulator
            </Button>
          </div>
        )}
      </div>

      {/* Error display */}
      {rlsError && (
        <Alert variant="destructive">
          <AlertDescription>{rlsError}</AlertDescription>
        </Alert>
      )}

      {/* Security Score Sub-Tab */}
      {subTab === 'score' && rlsStatuses.length > 0 && (
        <SecurityScore rlsStatuses={rlsStatuses} tables={tables} />
      )}

      {/* Policy Generator Sub-Tab */}
      {subTab === 'generator' && rlsStatuses.length > 0 && (
        <PolicyGenerator tables={tables} rlsStatuses={rlsStatuses} initialTable={selectedTable} />
      )}

      {/* Auth Simulator Sub-Tab */}
      {subTab === 'simulator' && <AuthSimulator />}

      {/* Policies & Tester Sub-Tab */}
      {(subTab === 'policies' || rlsStatuses.length === 0) && (
        <>
          {/* Table selector row */}
          {rlsStatuses.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedTable} onValueChange={setSelectedTable}>
                <SelectTrigger className="h-7 text-xs w-[220px]">
                  <SelectValue placeholder="Select table…" />
                </SelectTrigger>
                <SelectContent>
                  {rlsStatuses.map((t) => (
                    <SelectItem key={t.tableName} value={t.tableName}>
                      <div className="flex items-center gap-2">
                        {!t.rlsEnabled ? (
                          <ShieldX className="size-3 text-red-500 shrink-0" />
                        ) : t.policies.length === 0 ? (
                          <ShieldAlert className="size-3 text-amber-500 shrink-0" />
                        ) : (
                          <ShieldCheck className="size-3 text-primary shrink-0" />
                        )}
                        <span className="font-mono">{t.tableName}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentTableInfo && (
                !currentTableInfo.rlsEnabled ? (
                  <Badge variant="destructive" className="gap-1 text-[10px] h-5">
                    <ShieldX className="size-3" />RLS off
                  </Badge>
                ) : currentTableInfo.policies.length === 0 ? (
                  <Badge variant="outline" className="gap-1 text-amber-600 border-amber-400 text-[10px] h-5">
                    <ShieldAlert className="size-3" />No policies
                  </Badge>
                ) : (
                  <Badge variant="default" className="gap-1 text-[10px] h-5">
                    <ShieldCheck className="size-3" />{currentTableInfo.policies.length} polic{currentTableInfo.policies.length === 1 ? 'y' : 'ies'}
                  </Badge>
                )
              )}
            </div>
          )}

          {/* Policy details — full width */}
          {rlsStatuses.length > 0 && (
            <>
              {currentTableInfo && (
                <Card className="flex-1 flex flex-col min-h-0">
                  <div className="px-4 py-2 border-b border-border/60">
                    <span className="text-sm font-medium font-mono">{selectedTable}</span>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-3">
                    {currentTableInfo.policies.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
                        {!currentTableInfo.rlsEnabled ? (
                          <>
                            <div className="size-10 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center rls-pulse-red">
                              <Unlock className="size-5 text-red-500" />
                            </div>
                            <p className="text-sm font-medium text-red-600 dark:text-red-400">
                              RLS disabled — Table fully exposed
                            </p>
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="size-8 text-amber-500 mx-auto" />
                            <p className="text-xs text-amber-600">
                              RLS enabled but no policies — all access denied.
                            </p>
                          </>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1 gap-1 h-7 text-xs"
                          onClick={() => setSubTab('generator')}
                        >
                          <Wand2 className="size-3" />
                          Generate Policy
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {currentTableInfo.policies.map((policy: RLSPolicy) => (
                          <div
                            key={policy.policyname}
                            className={`rounded-lg border p-3 hover:shadow-sm transition-shadow ${
                              policy.cmd === 'SELECT'
                                ? 'border-l-4 border-l-primary'
                                : policy.cmd === 'INSERT'
                                  ? 'border-l-4 border-l-amber-500'
                                  : policy.cmd === 'UPDATE'
                                    ? 'border-l-4 border-l-blue-500'
                                    : policy.cmd === 'DELETE'
                                      ? 'border-l-4 border-l-red-500'
                                      : 'border-l-4 border-l-violet-500'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                              <span className="font-mono text-xs font-medium">{policy.policyname}</span>
                              <Badge variant={getCommandBadgeVariant(policy.cmd)} className="text-[10px] h-4 px-1">{policy.cmd}</Badge>
                              <div className="flex items-center gap-0.5">
                                {getPermissiveIcon(policy.permissive)}
                                <span className="text-[10px] text-muted-foreground">{policy.permissive}</span>
                              </div>
                              <div className="ml-auto">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                  disabled={deletingPolicy === policy.policyname}
                                  onClick={() => deletePolicy(selectedTable, policy.policyname)}
                                  title={`Drop policy "${policy.policyname}"`}
                                >
                                  {deletingPolicy === policy.policyname ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="size-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            <div className="ml-0 flex flex-col gap-0.5 text-xs">
                              <div className="flex items-start gap-2">
                                <span className="text-muted-foreground min-w-[50px]">Roles:</span>
                                <span className="font-mono">{policy.roles}</span>
                              </div>
                              {policy.qual && (
                                <div className="flex items-start gap-2">
                                  <span className="text-muted-foreground min-w-[50px]">USING:</span>
                                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{policy.qual}</code>
                                </div>
                              )}
                              {policy.with_check && (
                                <div className="flex items-start gap-2">
                                  <span className="text-muted-foreground min-w-[50px]">CHECK:</span>
                                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{policy.with_check}</code>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    </div>
                  </ScrollArea>
                </Card>
              )}
            </>
          )}

          {/* RLS Test Section */}
          {activeConnectionId && rlsStatuses.length > 0 && (
            <Card>
              <div className="px-4 py-2 border-b border-border/60 text-xs font-medium text-muted-foreground">
                RLS Policy Tester
              </div>
              <CardContent className="pt-3 pb-3">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-[11px] text-muted-foreground">Operation</Label>
                      <Select value={testOperation} onValueChange={setTestOperation}>
                        <SelectTrigger className="h-7 text-xs w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SELECT">SELECT</SelectItem>
                          <SelectItem value="INSERT">INSERT</SelectItem>
                          <SelectItem value="UPDATE">UPDATE</SelectItem>
                          <SelectItem value="DELETE">DELETE</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <Label className="text-[11px] text-muted-foreground">Role</Label>
                      <Select value={testRole} onValueChange={setTestRole}>
                        <SelectTrigger className="h-7 text-xs w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="anon">anon</SelectItem>
                          <SelectItem value="authenticated">authenticated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button onClick={runRLSTest} disabled={isTesting || !selectedTable} size="sm" className="h-7 text-xs">
                      {isTesting ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <Shield className="mr-1 size-3" />
                      )}
                      Run Test
                    </Button>
                  </div>

                  {/* Filters input */}
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">
                      JSON Filters (optional — for UPDATE, use &#123;&quot;_update&quot;:
                      &#123;...&#125;, key: &quot;eq.value&quot;&#125;)
                    </Label>
                    <Textarea
                      value={testFilters}
                      onChange={(e) => setTestFilters(e.target.value)}
                      placeholder='{"id": "eq.1"}'
                      className="font-mono text-xs min-h-[60px]"
                    />
                  </div>

                  <Separator />

                  {/* Test Results */}
                  {testResult && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        {testResult.success ? (
                          <CheckCircle2 className="size-5 text-primary" />
                        ) : (
                          <XCircle className="size-5 text-red-500" />
                        )}
                        <span className="font-medium text-sm">
                          {testResult.success ? 'Access Granted' : 'Access Denied / Error'}
                        </span>
                        <Badge variant="outline" className="font-mono text-xs">
                          {testResult.operation} as {testResult.role}
                        </Badge>
                        {testResult.rowCount !== undefined && (
                          <Badge variant="secondary" className="text-xs">
                            {testResult.rowCount} row{testResult.rowCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>

                      {testResult.error && (
                        <Alert variant="destructive">
                          <AlertDescription className="font-mono text-xs">
                            {testResult.error}
                          </AlertDescription>
                        </Alert>
                      )}

                      {testResult.data && testResult.data.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              Sample data (first 5 rows)
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                copyToClipboard(
                                  JSON.stringify(testResult.data?.slice(0, 5), null, 2)
                                )
                              }
                            >
                              {copied ? (
                                <Check className="mr-1 size-3" />
                              ) : (
                                <Copy className="mr-1 size-3" />
                              )}
                              Copy
                            </Button>
                          </div>
                          <ScrollArea>
                            <pre className="rounded-lg bg-muted p-3 font-mono text-xs overflow-x-auto">
                              {JSON.stringify(testResult.data.slice(0, 5), null, 2)}
                            </pre>
                          </ScrollArea>
                        </div>
                      )}

                      {testResult.success && testResult.data?.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Query returned 0 rows. This could mean RLS is blocking access or the table
                          is empty.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty state - no connection */}
      {!activeConnectionId && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Shield className="mb-3 size-12 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No connection selected</p>
              <p className="text-xs text-muted-foreground">
                Connect to a Supabase project to view RLS policies
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
