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
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-primary" />
              <CardTitle>Row Level Security</CardTitle>
            </div>
            {activeConnectionId && (
              <Button onClick={fetchRLSInfo} disabled={isLoadingRLS} size="sm">
                {isLoadingRLS ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <ShieldAlert className="mr-2 size-4" />
                )}
                {rlsStatuses.length > 0 ? 'Refresh RLS Info' : 'Load RLS Policies'}
              </Button>
            )}
          </div>
          <CardDescription>Inspect and test RLS policies for your Supabase tables</CardDescription>
        </CardHeader>
        {rlsStatuses.length > 0 && (
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-1">
              <Button
                variant={subTab === 'policies' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSubTab('policies')}
                className="gap-1.5"
              >
                <Shield className="size-3.5" />
                Policies & Tester
              </Button>
              <Button
                variant={subTab === 'score' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSubTab('score')}
                className="gap-1.5"
              >
                <BarChart3 className="size-3.5" />
                Security Score
              </Button>
              <Button
                variant={subTab === 'generator' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSubTab('generator')}
                className="gap-1.5"
              >
                <Wand2 className="size-3.5" />
                Policy Generator
              </Button>
              <Button
                variant={subTab === 'simulator' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSubTab('simulator')}
                className="gap-1.5"
              >
                <User className="size-3.5" />
                Auth Simulator
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

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
          {/* Table selector + RLS status */}
          {rlsStatuses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Table Selector</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-4">
                  <Select value={selectedTable} onValueChange={setSelectedTable}>
                    <SelectTrigger className="w-[240px]">
                      <SelectValue placeholder="Select a table" />
                    </SelectTrigger>
                    <SelectContent>
                      {tableNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {currentTableInfo && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">RLS Status:</span>
                      {!currentTableInfo.rlsEnabled ? (
                        <Badge variant="destructive" className="gap-1">
                          <ShieldX className="size-3" />
                          Disabled
                        </Badge>
                      ) : currentTableInfo.policies.length === 0 ? (
                        <Badge variant="outline" className="gap-1 text-amber-600 border-amber-400">
                          <ShieldAlert className="size-3" />
                          No Policies
                        </Badge>
                      ) : (
                        <Badge variant="default" className="gap-1">
                          <ShieldCheck className="size-3" />
                          Enabled
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Policy List */}
          {currentTableInfo && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Policies for <span className="font-mono">{selectedTable}</span>
                </CardTitle>
                <CardDescription>
                  {currentTableInfo.policies.length} polic
                  {currentTableInfo.policies.length === 1 ? 'y' : 'ies'} defined
                </CardDescription>
              </CardHeader>
              <CardContent>
                {currentTableInfo.policies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                    {!currentTableInfo.rlsEnabled ? (
                      <>
                        <div className="size-14 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center rls-pulse-red">
                          <Unlock className="size-7 text-red-500" />
                        </div>
                        <p className="text-sm font-medium text-red-600 dark:text-red-400">
                          RLS is disabled — Table is fully exposed!
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Anyone with the anon key can read, insert, update, and delete all rows.
                        </p>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="size-10 text-amber-500 mx-auto" />
                        <p className="text-sm text-muted-foreground">
                          No RLS policies defined for this table.
                        </p>
                        <p className="text-xs text-amber-600">
                          RLS is enabled but no policies exist — all access will be denied.
                        </p>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 gap-1.5"
                      onClick={() => setSubTab('generator')}
                    >
                      <Wand2 className="size-3.5" />
                      Generate Policy
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="flex flex-col gap-3">
                      {currentTableInfo.policies.map((policy: RLSPolicy, idx: number) => (
                        <div
                          key={policy.policyname}
                          className={`rounded-lg border p-4 hover:shadow-md transition-shadow ${
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
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <ChevronRight className="size-4 text-muted-foreground" />
                            <span className="font-mono text-sm font-medium">
                              {policy.policyname}
                            </span>
                            <Badge variant={getCommandBadgeVariant(policy.cmd)}>{policy.cmd}</Badge>
                            <div className="flex items-center gap-1">
                              {getPermissiveIcon(policy.permissive)}
                              <span className="text-xs text-muted-foreground">
                                {policy.permissive}
                              </span>
                            </div>
                            <div className="ml-auto">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                disabled={deletingPolicy === policy.policyname}
                                onClick={() => deletePolicy(selectedTable, policy.policyname)}
                                title={`Drop policy "${policy.policyname}"`}
                              >
                                {deletingPolicy === policy.policyname ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="size-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <div className="ml-6 flex flex-col gap-1 text-sm">
                            <div className="flex items-start gap-2">
                              <span className="text-muted-foreground min-w-[60px]">Roles:</span>
                              <span className="font-mono text-xs">{policy.roles}</span>
                            </div>
                            {policy.qual && (
                              <div className="flex items-start gap-2">
                                <span className="text-muted-foreground min-w-[60px]">USING:</span>
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                  {policy.qual}
                                </code>
                              </div>
                            )}
                            {policy.with_check && (
                              <div className="flex items-start gap-2">
                                <span className="text-muted-foreground min-w-[60px]">CHECK:</span>
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                  {policy.with_check}
                                </code>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}

          {/* RLS Test Section */}
          {activeConnectionId && rlsStatuses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">RLS Policy Tester</CardTitle>
                <CardDescription>
                  Simulate queries with different roles to test your RLS policies
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Table</Label>
                      <Select value={selectedTable} onValueChange={setSelectedTable}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Select table" />
                        </SelectTrigger>
                        <SelectContent>
                          {tableNames.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Operation</Label>
                      <Select value={testOperation} onValueChange={setTestOperation}>
                        <SelectTrigger className="w-[130px]">
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

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Role</Label>
                      <Select value={testRole} onValueChange={setTestRole}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="anon">anon</SelectItem>
                          <SelectItem value="authenticated">authenticated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button onClick={runRLSTest} disabled={isTesting || !selectedTable} size="sm">
                      {isTesting ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Shield className="mr-2 size-4" />
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
