'use client'

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit2,
  Layers,
  Loader2,
  Lock,
  Play,
  PlayCircle,
  Plus,
  Shield,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { type TestCase, type TestSuite, useSupabaseStore } from '@/store/supabase-store'

export function TestHarnessPanel() {
  const {
    activeConnectionId,
    connections,
    tables,
    edgeFunctions,
    sessions,
    testSuites,
    addTestSuite,
    updateTestSuite,
    removeTestSuite,
    addTestCase,
    updateTestCase,
    removeTestCase,
  } = useSupabaseStore()

  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null
  const activeSession = activeConnectionId ? sessions[activeConnectionId] || null : null

  // Active Connection Suites
  const suites = activeConnectionId
    ? testSuites.filter((s) => s.connectionId === activeConnectionId)
    : []

  // Component UI States
  const [runningSuiteId, setRunningSuiteId] = useState<string | null>(null)
  const [expandedSuites, setExpandedSuites] = useState<Record<string, boolean>>({})

  // Form states
  const [isSuiteDialogOpen, setIsSuiteDialogOpen] = useState(false)
  const [editingSuiteId, setEditingSuiteId] = useState<string | null>(null)
  const [suiteName, setSuiteName] = useState('')
  const [suiteDesc, setSuiteDesc] = useState('')

  const [isCaseDialogOpen, setIsCaseDialogOpen] = useState(false)
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null)
  const [caseSuiteId, setCaseSuiteId] = useState('')

  // Case inputs
  const [caseType, setCaseType] = useState<'rls' | 'edge-function'>('rls')
  // RLS Fields
  const [rlsTable, setRlsTable] = useState('')
  const [rlsOp, setRlsOp] = useState<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'>('SELECT')
  const [rlsRole, setRlsRole] = useState<'anon' | 'authenticated' | 'custom' | 'real_user'>('anon')
  const [rlsClaims, setRlsClaims] = useState('{}')
  const [rlsExpected, setRlsExpected] = useState<'success' | 'denied'>('success')
  const [rlsExpectedCount, setRlsExpectedCount] = useState<string>('')
  // Edge Function Fields
  const [efName, setEfName] = useState('')
  const [efMethod, setEfMethod] = useState<'GET' | 'POST'>('POST')
  const [efAuth, setEfAuth] = useState<'anon' | 'service_role' | 'user'>('anon')
  const [efPayload, setEfPayload] = useState('{}')
  const [efExpectedStatus, setEfExpectedStatus] = useState('200')
  const [efExpectedContains, setEfExpectedContains] = useState('')

  // Pre-fill demo data if in demo mode and no suites exist
  useEffect(() => {
    if (activeConnectionId === DEMO_CONNECTION_ID && suites.length === 0) {
      // Create a demo RLS suite
      addTestSuite({
        name: 'Demo RLS Assertion Suite',
        description:
          'Verifies row-level security boundaries for public and authenticated profiles.',
        connectionId: DEMO_CONNECTION_ID,
      })

      // We need to fetch the newly created suite's ID. Since addTestSuite is asynchronous in store,
      // we'll let the next render or store update handle adding the test cases.
    }
  }, [
    activeConnectionId,
    suites.length, // Create a demo RLS suite
    addTestSuite,
  ])

  // Watch for newly created demo suite to add cases
  useEffect(() => {
    if (
      activeConnectionId === DEMO_CONNECTION_ID &&
      suites.length === 1 &&
      suites[0].cases.length === 0
    ) {
      const suiteId = suites[0].id
      // Add demo cases
      addTestCase(suiteId, {
        type: 'rls',
        tableName: 'users',
        operation: 'SELECT',
        role: 'anon',
        expectedOutcome: 'denied',
        expectedRowCount: null,
      })
      addTestCase(suiteId, {
        type: 'rls',
        tableName: 'users',
        operation: 'SELECT',
        role: 'authenticated',
        expectedOutcome: 'success',
        expectedRowCount: null,
      })
      addTestCase(suiteId, {
        type: 'edge-function',
        functionName: 'hello-world',
        method: 'POST',
        authContext: 'anon',
        payload: JSON.stringify({ name: 'Tester' }, null, 2),
        expectedStatus: 200,
        expectedResponseContains: 'Hello',
      })
    }
  }, [suites, addTestCase, activeConnectionId])

  const toggleSuiteExpand = (id: string) => {
    setExpandedSuites((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Handle Suite Add/Edit Dialog
  const openSuiteDialog = (suite?: TestSuite) => {
    if (suite) {
      setEditingSuiteId(suite.id)
      setSuiteName(suite.name)
      setSuiteDesc(suite.description)
    } else {
      setEditingSuiteId(null)
      setSuiteName('')
      setSuiteDesc('')
    }
    setIsSuiteDialogOpen(true)
  }

  const saveSuite = () => {
    if (!suiteName.trim()) {
      toast.error('Suite Name is required')
      return
    }

    if (editingSuiteId) {
      updateTestSuite(editingSuiteId, { name: suiteName.trim(), description: suiteDesc.trim() })
      toast.success('Test Suite updated')
    } else if (activeConnectionId) {
      addTestSuite({
        name: suiteName.trim(),
        description: suiteDesc.trim(),
        connectionId: activeConnectionId,
      })
      toast.success('Test Suite created')
    }
    setIsSuiteDialogOpen(false)
  }

  // Handle Test Case Add/Edit Dialog
  const openCaseDialog = (suiteId: string, tc?: TestCase) => {
    setCaseSuiteId(suiteId)
    if (tc) {
      setEditingCaseId(tc.id)
      setCaseType(tc.type)
      if (tc.type === 'rls') {
        setRlsTable(tc.tableName || '')
        setRlsOp(tc.operation || 'SELECT')
        setRlsRole(tc.role || 'anon')
        setRlsClaims(tc.claims || '{}')
        setRlsExpected(tc.expectedOutcome || 'success')
        setRlsExpectedCount(
          tc.expectedRowCount !== null && tc.expectedRowCount !== undefined
            ? String(tc.expectedRowCount)
            : ''
        )
      } else {
        setEfName(tc.functionName || '')
        setEfMethod(tc.method || 'POST')
        setEfAuth(tc.authContext || 'anon')
        setEfPayload(tc.payload || '{}')
        setEfExpectedStatus(String(tc.expectedStatus || 200))
        setEfExpectedContains(tc.expectedResponseContains || '')
      }
    } else {
      setEditingCaseId(null)
      setCaseType('rls')
      setRlsTable(tables[0]?.tableName || '')
      setRlsOp('SELECT')
      setRlsRole('anon')
      setRlsClaims('{}')
      setRlsExpected('success')
      setRlsExpectedCount('')

      setEfName(edgeFunctions[0]?.name || '')
      setEfMethod('POST')
      setEfAuth('anon')
      setEfPayload('{}')
      setEfExpectedStatus('200')
      setEfExpectedContains('')
    }
    setIsCaseDialogOpen(true)
  }

  const saveCase = () => {
    const commonDetails: any = { type: caseType }

    if (caseType === 'rls') {
      if (!rlsTable) {
        toast.error('Table is required')
        return
      }
      try {
        if (rlsRole === 'custom') JSON.parse(rlsClaims)
      } catch {
        toast.error('Claims must be valid JSON')
        return
      }

      commonDetails.tableName = rlsTable
      commonDetails.operation = rlsOp
      commonDetails.role = rlsRole
      commonDetails.claims = rlsRole === 'custom' ? rlsClaims : '{}'
      commonDetails.expectedOutcome = rlsExpected
      commonDetails.expectedRowCount =
        rlsExpectedCount.trim() !== '' ? parseInt(rlsExpectedCount, 10) : null
    } else {
      if (!efName) {
        toast.error('Function Name is required')
        return
      }
      try {
        if (efPayload.trim()) JSON.parse(efPayload)
      } catch {
        toast.error('Payload must be valid JSON')
        return
      }

      commonDetails.functionName = efName
      commonDetails.method = efMethod
      commonDetails.authContext = efAuth
      commonDetails.payload = efPayload
      commonDetails.expectedStatus = parseInt(efExpectedStatus, 10) || 200
      commonDetails.expectedResponseContains = efExpectedContains
    }

    if (editingCaseId) {
      updateTestCase(caseSuiteId, editingCaseId, commonDetails)
      toast.success('Test Case updated')
    } else {
      addTestCase(caseSuiteId, commonDetails)
      toast.success('Test Case added')
    }
    setIsCaseDialogOpen(false)
  }

  // Executing Test Case
  const executeTestCase = async (
    suiteId: string,
    tc: TestCase
  ): Promise<{ status: 'passed' | 'failed'; error?: string; actual?: string }> => {
    updateTestCase(suiteId, tc.id, {
      status: 'running',
      errorDetails: undefined,
      actualResult: undefined,
    })

    // Demo Mode Execution
    if (activeConnectionId === DEMO_CONNECTION_ID) {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 300))
      if (tc.type === 'rls') {
        const pass =
          (tc.expectedOutcome === 'denied' && tc.role === 'anon') ||
          (tc.expectedOutcome === 'success' && tc.role === 'authenticated')
        return {
          status: pass ? 'passed' : 'failed',
          actual: pass
            ? `SELECT returned success (as expected)`
            : `SELECT returned unauthorized (but expected success)`,
          error: pass ? undefined : 'Assertion mismatch: expected success but got denied',
        }
      } else {
        const pass = tc.expectedStatus === 200
        return {
          status: pass ? 'passed' : 'failed',
          actual: `Status: 200, response matches expected string "${tc.expectedResponseContains}"`,
        }
      }
    }

    try {
      if (tc.type === 'rls') {
        const claimsObj = tc.role === 'custom' && tc.claims ? JSON.parse(tc.claims) : undefined
        const jwtToken = tc.role === 'real_user' ? activeSession?.access_token : undefined
        const postRole =
          tc.role === 'real_user'
            ? 'authenticated'
            : tc.role === 'custom'
              ? 'authenticated'
              : tc.role

        const res = await fetch('/api/rls/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionId: activeConnectionId,
            tableName: tc.tableName,
            operation: tc.operation,
            role: postRole,
            claims: claimsObj,
            jwt: jwtToken,
          }),
        })

        const data = await res.json()

        if (data.error) {
          const isDenied = /permission denied|insufficient privilege|Access denied/i.test(
            data.error
          )
          if (tc.expectedOutcome === 'denied' && isDenied) {
            return {
              status: 'passed',
              actual: `Blocked by RLS as expected. Error: ${data.error}`,
            }
          }
          return {
            status: 'failed',
            error: `RLS error: ${data.error}`,
            actual: `Failed with error: ${data.error}`,
          }
        }

        // It succeeded
        if (tc.expectedOutcome === 'denied') {
          return {
            status: 'failed',
            error: `Expected RLS Denial, but query succeeded instead.`,
            actual: `Succeeded returning ${data.rowCount || 0} rows`,
          }
        }

        // Succeed and expected success, check row count if specified
        if (tc.expectedRowCount !== null && tc.expectedRowCount !== undefined) {
          const actualCount = data.rowCount || 0
          if (actualCount !== tc.expectedRowCount) {
            return {
              status: 'failed',
              error: `Row count mismatch. Expected: ${tc.expectedRowCount}, Actual: ${actualCount}`,
              actual: `Succeeded but returned ${actualCount} rows (expected: ${tc.expectedRowCount})`,
            }
          }
        }

        return {
          status: 'passed',
          actual: `Succeeded returning ${data.rowCount || 0} rows (matching assertions)`,
        }
      } else {
        // Edge Function
        let payloadObj: any
        if (tc.payload?.trim()) {
          try {
            payloadObj = JSON.parse(tc.payload)
          } catch {}
        }

        let userJwt: string | undefined
        if (tc.authContext === 'user') {
          userJwt = activeSession?.access_token || undefined
        } else if (tc.authContext === 'anon') {
          userJwt = activeConnection?.anonKey || undefined
        } else if (tc.authContext === 'service_role') {
          userJwt = activeConnection?.serviceRoleKey || undefined
        }

        const res = await fetch('/api/edge-functions/invoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-supabase-url': activeConnection?.supabaseUrl || '',
            'x-supabase-anon-key': activeConnection?.anonKey || '',
          },
          body: JSON.stringify({
            functionName: tc.functionName,
            method: tc.method,
            body: payloadObj,
            userJwt,
          }),
        })

        const data = await res.json()
        const status = data.status || res.status

        if (status !== tc.expectedStatus) {
          return {
            status: 'failed',
            error: `Status code mismatch. Expected: ${tc.expectedStatus}, Got: ${status}`,
            actual: `Status: ${status}`,
          }
        }

        if (tc.expectedResponseContains) {
          const bodyStr = typeof data.data === 'string' ? data.data : JSON.stringify(data)
          if (!bodyStr.toLowerCase().includes(tc.expectedResponseContains.toLowerCase())) {
            return {
              status: 'failed',
              error: `Response body did not contain substring: "${tc.expectedResponseContains}"`,
              actual: `Status: ${status}, Response: ${bodyStr.slice(0, 100)}...`,
            }
          }
        }

        return {
          status: 'passed',
          actual: `Status: ${status} (matching assertions)`,
        }
      }
    } catch (err: any) {
      return {
        status: 'failed',
        error: err.message || 'Execution error',
        actual: 'Network/exception occurred during request',
      }
    }
  }

  // Run a Suite
  const runSuite = async (suite: TestSuite) => {
    if (runningSuiteId) return
    setRunningSuiteId(suite.id)
    setExpandedSuites((prev) => ({ ...prev, [suite.id]: true }))
    toast.info(`Running suite: ${suite.name}`)

    let passedCount = 0
    let failedCount = 0

    for (const tc of suite.cases) {
      const res = await executeTestCase(suite.id, tc)
      updateTestCase(suite.id, tc.id, {
        status: res.status,
        errorDetails: res.error,
        actualResult: res.actual,
      })
      if (res.status === 'passed') passedCount++
      else failedCount++
    }

    setRunningSuiteId(null)
    if (failedCount > 0) {
      toast.error(`Suite complete: ${passedCount} passed, ${failedCount} failed`)
    } else {
      toast.success(`Suite complete: All ${passedCount} tests passed!`)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header Panel */}
      <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-6">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Layers className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Test Harness</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Define, persist, and run assertion suites for RLS & Edge Functions
              </CardDescription>
            </div>
          </div>
          {activeConnectionId && (
            <Button
              onClick={() => openSuiteDialog()}
              size="sm"
              className="gap-1.5 text-xs font-semibold"
            >
              <Plus className="size-3.5" />
              New Test Suite
            </Button>
          )}
        </CardHeader>
      </Card>

      {!activeConnectionId ? (
        <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-sm">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Lock className="mb-3 size-12 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No connection selected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect to a Supabase project to write and execute automated tests
              </p>
            </div>
          </CardContent>
        </Card>
      ) : suites.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-sm">
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center space-y-4 max-w-sm mx-auto">
              <div className="p-3 rounded-full bg-zinc-900 border border-zinc-800 text-muted-foreground">
                <PlayCircle className="size-8 animate-pulse text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-200">No test suites created yet</p>
                <p className="text-xs text-muted-foreground">
                  Create a test suite to group assertion test cases and run automated checks.
                </p>
              </div>
              <Button onClick={() => openSuiteDialog()} size="sm" className="w-full">
                Create First Suite
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {suites.map((suite) => {
            const isExpanded = !!expandedSuites[suite.id]
            const totalCases = suite.cases.length
            const passed = suite.cases.filter((c) => c.status === 'passed').length
            const failed = suite.cases.filter((c) => c.status === 'failed').length
            const _running = suite.cases.filter((c) => c.status === 'running').length
            const isSuiteRunning = runningSuiteId === suite.id

            return (
              <Card
                key={suite.id}
                className="border-zinc-800 bg-zinc-950/40 backdrop-blur-sm overflow-hidden transition-all duration-200 hover:border-zinc-700/60"
              >
                <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-zinc-900/20">
                  {/* Suite Info */}
                  <div className="flex items-start gap-2.5 flex-1">
                    <button
                      onClick={() => toggleSuiteExpand(suite.id)}
                      className="mt-1 p-0.5 rounded hover:bg-zinc-850 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                        {suite.name}
                        {isSuiteRunning && (
                          <Loader2 className="size-3.5 animate-spin text-primary" />
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {suite.description || 'No description'}
                      </p>
                    </div>
                  </div>

                  {/* Suite stats & Action Controls */}
                  <div className="flex items-center gap-3.5 w-full md:w-auto shrink-0 justify-between md:justify-end">
                    {/* Progress Bar/Stats */}
                    {totalCases > 0 && (
                      <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-850 px-2.5 py-1 rounded-md text-[10px] font-semibold">
                        <span className="text-emerald-500">{passed} Passed</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-red-400">{failed} Failed</span>
                        {totalCases > passed + failed && (
                          <>
                            <span className="text-zinc-600">•</span>
                            <span className="text-zinc-400">
                              {totalCases - (passed + failed)} Idle
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <Button
                        onClick={() => runSuite(suite)}
                        disabled={isSuiteRunning || runningSuiteId !== null}
                        size="sm"
                        className="h-8 text-xs font-semibold gap-1.5"
                      >
                        {isSuiteRunning ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Play className="size-3.5" />
                        )}
                        Run Suite
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 border-zinc-800 hover:bg-zinc-900"
                        onClick={() => openCaseDialog(suite.id)}
                        disabled={isSuiteRunning}
                        title="Add Test Case"
                      >
                        <Plus className="size-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 border-zinc-800 hover:bg-zinc-900"
                        onClick={() => openSuiteDialog(suite)}
                        disabled={isSuiteRunning}
                        title="Edit Suite"
                      >
                        <Edit2 className="size-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 border-zinc-800 hover:bg-zinc-900 hover:text-destructive text-muted-foreground"
                        onClick={() => removeTestSuite(suite.id)}
                        disabled={isSuiteRunning}
                        title="Delete Suite"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-zinc-850">
                    {suite.cases.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground italic bg-zinc-950/20">
                        No test cases defined yet. Click the &apos;+&apos; button above to create
                        one.
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {suite.cases.map((tc, _index) => {
                          const isRls = tc.type === 'rls'
                          return (
                            <div
                              key={tc.id}
                              className="p-3.5 border-b border-zinc-850 last:border-b-0 hover:bg-zinc-900/20 transition-all flex flex-col gap-2.5"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                {/* Details */}
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                  <div className="mt-0.5 shrink-0">
                                    {isRls ? (
                                      <div
                                        className="p-1 rounded bg-primary/10 text-primary border border-primary/20"
                                        title="RLS Policy Test"
                                      >
                                        <Shield className="size-3.5" />
                                      </div>
                                    ) : (
                                      <div
                                        className="p-1 rounded bg-muted text-muted-foreground border border-border"
                                        title="Edge Function Test"
                                      >
                                        <Zap className="size-3.5" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-semibold text-zinc-200">
                                        {isRls
                                          ? `[RLS] Table: ${tc.tableName}`
                                          : `[Func] Name: ${tc.functionName}`}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="font-mono text-[9px] px-1 py-0 h-4 border-zinc-800 text-zinc-400"
                                      >
                                        {isRls
                                          ? `${tc.operation} as ${tc.role}`
                                          : `${tc.method} w/ ${tc.authContext}`}
                                      </Badge>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                      <span>Assertion:</span>
                                      <span className="text-zinc-400 font-medium">
                                        {isRls
                                          ? `Expects ${tc.expectedOutcome === 'success' ? 'ALLOWED' : 'DENIED'}${tc.expectedRowCount !== null && tc.expectedRowCount !== undefined ? ` (${tc.expectedRowCount} rows)` : ''}`
                                          : `Expects Status ${tc.expectedStatus}${tc.expectedResponseContains ? ` contains "${tc.expectedResponseContains}"` : ''}`}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Status & Case Controls */}
                                <div className="flex items-center gap-3 justify-between sm:justify-end shrink-0">
                                  {tc.status === 'passed' && (
                                    <Badge
                                      variant="secondary"
                                      className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] h-5 gap-1 font-semibold"
                                    >
                                      <CheckCircle2 className="size-3" /> Passed
                                    </Badge>
                                  )}
                                  {tc.status === 'failed' && (
                                    <Badge
                                      variant="destructive"
                                      className="bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] h-5 gap-1 font-semibold"
                                    >
                                      <XCircle className="size-3" /> Failed
                                    </Badge>
                                  )}
                                  {tc.status === 'running' && (
                                    <Badge
                                      variant="secondary"
                                      className="bg-zinc-800 text-zinc-300 border border-zinc-700 text-[9px] h-5 gap-1 font-semibold"
                                    >
                                      <Loader2 className="size-3 animate-spin text-primary" />{' '}
                                      Running
                                    </Badge>
                                  )}
                                  {tc.status === 'idle' && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] h-5 text-muted-foreground border-zinc-800"
                                    >
                                      Idle
                                    </Badge>
                                  )}

                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => openCaseDialog(suite.id, tc)}
                                      disabled={isSuiteRunning}
                                    >
                                      <Edit2 className="size-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      onClick={() => removeTestCase(suite.id, tc.id)}
                                      disabled={isSuiteRunning}
                                    >
                                      <Trash2 className="size-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              {/* Actual Result details */}
                              {tc.actualResult && (
                                <div className="ml-8 mt-1 p-2.5 rounded border border-zinc-900 bg-zinc-950 font-mono text-[10px] text-zinc-400 flex flex-col gap-1.5">
                                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                                    <ArrowRight className="size-2.5" /> Output / Result Details
                                  </div>
                                  <div className="text-zinc-300">{tc.actualResult}</div>
                                  {tc.errorDetails && (
                                    <div className="text-red-400 flex items-start gap-1 mt-1 border-t border-red-900/20 pt-1.5">
                                      <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                                      <span>{tc.errorDetails}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialogs */}

      {/* Suite Create/Edit Dialog */}
      <Dialog open={isSuiteDialogOpen} onOpenChange={setIsSuiteDialogOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 shadow-xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {editingSuiteId ? 'Edit Test Suite' : 'Create Test Suite'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Group related assertions for your project
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Suite Name</Label>
              <Input
                value={suiteName}
                onChange={(e) => setSuiteName(e.target.value)}
                placeholder="e.g. Public Table Security Assertions"
                className="text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={suiteDesc}
                onChange={(e) => setSuiteDesc(e.target.value)}
                placeholder="Briefly describe the purpose of this suite..."
                className="text-xs min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsSuiteDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveSuite}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Case Create/Edit Dialog */}
      <Dialog open={isCaseDialogOpen} onOpenChange={setIsCaseDialogOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {editingCaseId ? 'Edit Test Case' : 'Add Test Case'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Set up your test parameters and assertions
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2 max-h-[350px] overflow-y-auto pr-1">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Test Type</Label>
              <Select
                value={caseType}
                onValueChange={(v) => setCaseType(v as 'rls' | 'edge-function')}
                disabled={!!editingCaseId}
              >
                <SelectTrigger className="text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rls">Row Level Security (RLS)</SelectItem>
                  <SelectItem value="edge-function">Edge Function</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {caseType === 'rls' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Table Name</Label>
                    <Select value={rlsTable} onValueChange={setRlsTable}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue placeholder="Select table" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.map((t) => (
                          <SelectItem key={t.tableName} value={t.tableName}>
                            {t.tableName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Operation</Label>
                    <Select value={rlsOp} onValueChange={(v) => setRlsOp(v as any)}>
                      <SelectTrigger className="text-xs h-8">
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
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Role</Label>
                  <Select value={rlsRole} onValueChange={(v) => setRlsRole(v as any)}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anon">anon</SelectItem>
                      <SelectItem value="authenticated">authenticated</SelectItem>
                      <SelectItem value="real_user" disabled={!activeSession}>
                        Logged-in User{' '}
                        {activeSession ? `(${activeSession.user?.email})` : '(No Session)'}
                      </SelectItem>
                      <SelectItem value="custom">custom (claims simulation)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {rlsRole === 'custom' && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Claims Payload (JSON)</Label>
                    <Textarea
                      value={rlsClaims}
                      onChange={(e) => setRlsClaims(e.target.value)}
                      placeholder='{"role": "admin", "app_metadata": {"plan": "pro"}}'
                      className="font-mono text-[11px] min-h-[60px]"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Expected Outcome</Label>
                    <Select value={rlsExpected} onValueChange={(v) => setRlsExpected(v as any)}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="success">Success / Allowed</SelectItem>
                        <SelectItem value="denied">Access Denied / RLS Block</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Expected Row Count</Label>
                    <Input
                      type="number"
                      value={rlsExpectedCount}
                      onChange={(e) => setRlsExpectedCount(e.target.value)}
                      placeholder="Optional (e.g. 5)"
                      className="text-xs h-8"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Function Name</Label>
                    <Select value={efName} onValueChange={setEfName}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue placeholder="Select function" />
                      </SelectTrigger>
                      <SelectContent>
                        {edgeFunctions.map((fn) => (
                          <SelectItem key={fn.name} value={fn.name}>
                            {fn.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Method</Label>
                    <Select value={efMethod} onValueChange={(v) => setEfMethod(v as any)}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Auth Context</Label>
                  <Select value={efAuth} onValueChange={(v) => setEfAuth(v as any)}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anon">Anonymous (anonKey)</SelectItem>
                      {activeConnection?.serviceRoleKey && (
                        <SelectItem value="service_role">Service Role (admin)</SelectItem>
                      )}
                      <SelectItem value="user" disabled={!activeSession}>
                        Logged-in User{' '}
                        {activeSession ? `(${activeSession.user?.email})` : '(No Session)'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {efMethod === 'POST' && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Payload Body (JSON)</Label>
                    <Textarea
                      value={efPayload}
                      onChange={(e) => setEfPayload(e.target.value)}
                      placeholder='{"key": "value"}'
                      className="font-mono text-[11px] min-h-[60px]"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Expected Status Code</Label>
                    <Input
                      type="number"
                      value={efExpectedStatus}
                      onChange={(e) => setEfExpectedStatus(e.target.value)}
                      placeholder="e.g. 200"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Expected Substring</Label>
                    <Input
                      value={efExpectedContains}
                      onChange={(e) => setEfExpectedContains(e.target.value)}
                      placeholder="e.g. Success"
                      className="text-xs h-8"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsCaseDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveCase}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
