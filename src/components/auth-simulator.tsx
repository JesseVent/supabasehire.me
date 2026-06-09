'use client'

import {
  Check,
  CheckCircle2,
  Copy,
  Crown,
  EyeOff,
  Loader2,
  Play,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Star,
  User,
  XCircle,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import type { RLSPolicy, RLSTestResult, TableRLSInfo } from '@/lib/supabase-types'
import { useSupabaseStore } from '@/store/supabase-store'

// ─── Preset User Type ───

interface SimulatedUser {
  id: string
  email: string
  role: 'anon' | 'authenticated' | 'custom'
  claims: Record<string, unknown>
}

const PRESET_USERS: { label: string; icon: React.ReactNode; user: SimulatedUser }[] = [
  {
    label: 'Anonymous User',
    icon: <EyeOff className="size-3.5" />,
    user: {
      id: '',
      email: '',
      role: 'anon',
      claims: {},
    },
  },
  {
    label: 'Authenticated User',
    icon: <User className="size-3.5" />,
    user: {
      id: crypto.randomUUID?.() || 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'user@example.com',
      role: 'authenticated',
      claims: {},
    },
  },
  {
    label: 'Admin User',
    icon: <Crown className="size-3.5" />,
    user: {
      id: crypto.randomUUID?.() || 'f0e1d2c3-b4a5-6789-0abc-def123456789',
      email: 'admin@example.com',
      role: 'authenticated',
      claims: { role: 'admin', app_metadata: { plan: 'pro', role: 'admin' } },
    },
  },
  {
    label: 'Premium User',
    icon: <Star className="size-3.5" />,
    user: {
      id: crypto.randomUUID?.() || 'b1c2d3e4-f5a6-7890-abcd-ef1234567891',
      email: 'premium@example.com',
      role: 'authenticated',
      claims: { app_metadata: { plan: 'premium', subscription: 'active' } },
    },
  },
]

// ─── Access level type ───

type AccessLevel = 'full' | 'denied' | 'conditional'

interface RLSImpactEntry {
  tableName: string
  rlsEnabled: boolean
  access: AccessLevel
  matchingPolicies: RLSPolicy[]
}

// ─── Main Component ───

export function AuthSimulator() {
  const { activeConnectionId, rlsStatuses, addRlsTestResult, addActivityLog } = useSupabaseStore()

  // User configuration state
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState<'anon' | 'authenticated' | 'custom'>('anon')
  const [claimsText, setClaimsText] = useState('{}')
  const [claimsError, setClaimsError] = useState<string | null>(null)

  // Test result state
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<RLSTestResult | null>(null)
  const [testTable, setTestTable] = useState<string>('')
  const [copied, setCopied] = useState(false)

  // Apply a preset user
  const applyPreset = useCallback((preset: SimulatedUser) => {
    setUserId(preset.id)
    setUserEmail(preset.email)
    setUserRole(preset.role)
    setClaimsText(JSON.stringify(preset.claims, null, 2))
    setClaimsError(null)
    setTestResult(null)
  }, [])

  // Parse claims
  const parsedClaims = useMemo(() => {
    try {
      const parsed = JSON.parse(claimsText)
      setClaimsError(null)
      return parsed as Record<string, unknown>
    } catch {
      setClaimsError('Invalid JSON')
      return null
    }
  }, [claimsText])

  // Build token preview
  const tokenPreview = useMemo(() => {
    const token: Record<string, unknown> = {}
    if (userId) token.sub = userId
    if (userEmail) token.email = userEmail
    token.role = userRole
    if (parsedClaims && Object.keys(parsedClaims).length > 0) {
      token.claims = parsedClaims
    }
    return token
  }, [userId, userEmail, userRole, parsedClaims])

  // Compute RLS impact summary
  const rlsImpact = useMemo((): RLSImpactEntry[] => {
    return rlsStatuses.map((table: TableRLSInfo) => {
      if (!table.rlsEnabled) {
        return {
          tableName: table.tableName,
          rlsEnabled: false,
          access: 'full' as AccessLevel,
          matchingPolicies: [],
        }
      }

      // RLS is enabled, check for matching policies
      const matchingPolicies = getMatchingPolicies(table, userRole)

      if (matchingPolicies.length === 0) {
        return {
          tableName: table.tableName,
          rlsEnabled: true,
          access: 'denied' as AccessLevel,
          matchingPolicies: [],
        }
      }

      return {
        tableName: table.tableName,
        rlsEnabled: true,
        access: 'conditional' as AccessLevel,
        matchingPolicies,
      }
    })
  }, [rlsStatuses, userRole])

  // Get matching policies for a user role
  function getMatchingPolicies(table: TableRLSInfo, role: string): RLSPolicy[] {
    return table.policies.filter((policy: RLSPolicy) => {
      const policyRoles = policy.roles
        .replace(/[{}"]/g, '')
        .split(',')
        .map((r: string) => r.trim())
      return policyRoles.includes(role) || policyRoles.includes('public')
    })
  }

  // Run RLS test with simulated user
  const runTestWithUser = useCallback(async () => {
    if (!activeConnectionId || !testTable) return
    if (!parsedClaims && claimsText.trim() !== '{}') {
      toast.error('Invalid claims JSON')
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/rls/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: activeConnectionId,
          tableName: testTable,
          operation: 'SELECT',
          role: userRole === 'custom' ? 'authenticated' : userRole,
        }),
      })
      const data = await res.json()
      const result: RLSTestResult = data.error
        ? {
            success: false,
            error: data.error,
            operation: 'SELECT',
            role: (userRole === 'custom' ? 'authenticated' : userRole) as RLSTestResult['role'],
            tableName: testTable,
          }
        : data

      setTestResult(result)
      addRlsTestResult(result)
      addActivityLog({
        type: 'rls',
        action: `Auth Simulator test: SELECT on ${testTable}`,
        details: `Role: ${userRole}, User: ${userEmail || 'anon'}, Result: ${result.success ? 'Allowed' : 'Blocked'}`,
      })

      if (result.success) {
        toast.success('RLS test passed', { description: 'Access granted for simulated user' })
      } else {
        toast.error('RLS test failed', { description: 'Access denied for simulated user' })
      }
    } catch {
      setTestResult({
        success: false,
        error: 'Network error occurred',
        operation: 'SELECT',
        role: (userRole === 'custom' ? 'authenticated' : userRole) as RLSTestResult['role'],
        tableName: testTable,
      })
    } finally {
      setIsTesting(false)
    }
  }, [
    activeConnectionId,
    testTable,
    userRole,
    userEmail,
    parsedClaims,
    claimsText,
    addRlsTestResult,
    addActivityLog,
  ])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const getAccessBadge = (access: AccessLevel) => {
    switch (access) {
      case 'full':
        return (
          <Badge className="gap-1 bg-red-500 hover:bg-red-600 text-white">
            <ShieldX className="size-3" />
            Full Access
          </Badge>
        )
      case 'denied':
        return (
          <Badge variant="secondary" className="gap-1">
            <ShieldAlert className="size-3" />
            Denied
          </Badge>
        )
      case 'conditional':
        return (
          <Badge className="gap-1 bg-primary hover:bg-primary text-white">
            <ShieldCheck className="size-3" />
            Conditional
          </Badge>
        )
    }
  }

  const tableNames = rlsStatuses.map((t) => t.tableName)

  return (
    <div className="flex flex-col gap-4">
      {/* Preset Users */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="size-5 text-primary" />
            <CardTitle className="text-base">Quick Presets</CardTitle>
          </div>
          <CardDescription>Select a preset user to quickly configure the simulator</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PRESET_USERS.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => applyPreset(preset.user)}
              >
                {preset.icon}
                {preset.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User Configuration Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            <CardTitle className="text-base">User Configuration</CardTitle>
          </div>
          <CardDescription>Configure the simulated authenticated user context</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">User ID (UUID)</Label>
                <Input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="e.g., a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  type="email"
                  className="text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Role</Label>
              <Select
                value={userRole}
                onValueChange={(v) => setUserRole(v as 'anon' | 'authenticated' | 'custom')}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anon">anon</SelectItem>
                  <SelectItem value="authenticated">authenticated</SelectItem>
                  <SelectItem value="custom">custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Custom JWT Claims (JSON)</Label>
              <Textarea
                value={claimsText}
                onChange={(e) => setClaimsText(e.target.value)}
                placeholder='{"role": "admin", "app_metadata": {"plan": "pro"}}'
                className="font-mono text-xs min-h-[80px]"
              />
              {claimsError && <p className="text-xs text-destructive">{claimsError}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Token Preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <CardTitle className="text-base">Token Preview</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(JSON.stringify(tokenPreview, null, 2))}
              className="gap-1"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              Copy
            </Button>
          </div>
          <CardDescription>Decoded JWT-like preview of the simulated user context</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-48">
            <pre className="rounded-lg bg-muted p-4 font-mono text-xs overflow-x-auto">
              {JSON.stringify(tokenPreview, null, 2)}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Test Integration */}
      {activeConnectionId && rlsStatuses.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Play className="size-5 text-primary" />
              <CardTitle className="text-base">Test with this User</CardTitle>
            </div>
            <CardDescription>
              Run an RLS SELECT test using the configured user context
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Table</Label>
                  <Select value={testTable} onValueChange={setTestTable}>
                    <SelectTrigger className="w-[220px]">
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
                </div>

                <Button
                  onClick={runTestWithUser}
                  disabled={isTesting || !testTable}
                  size="sm"
                  className="gap-1.5"
                >
                  {isTesting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  Test with this user
                </Button>
              </div>

              {/* Test Result */}
              {testResult && (
                <div className="flex flex-col gap-3">
                  <Separator />
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
                      SELECT as {testResult.role}
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
                    <ScrollArea className="max-h-48">
                      <pre className="rounded-lg bg-muted p-3 font-mono text-xs overflow-x-auto">
                        {JSON.stringify(testResult.data.slice(0, 5), null, 2)}
                      </pre>
                    </ScrollArea>
                  )}

                  {testResult.success && testResult.data?.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Query returned 0 rows. RLS may be blocking access or the table is empty.
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* RLS Impact Summary */}
      {rlsStatuses.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-primary" />
              <CardTitle className="text-base">RLS Impact Summary</CardTitle>
            </div>
            <CardDescription>
              How this user would interact with RLS policies across all tables
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Table</TableHead>
                    <TableHead className="text-xs">RLS Status</TableHead>
                    <TableHead className="text-xs">Expected Access</TableHead>
                    <TableHead className="text-xs">Policy Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rlsImpact.map((entry) => (
                    <TableRow key={entry.tableName}>
                      <TableCell className="font-mono text-xs py-2">{entry.tableName}</TableCell>
                      <TableCell className="py-2">
                        {entry.rlsEnabled ? (
                          <Badge variant="default" className="gap-1 text-[10px]">
                            <ShieldCheck className="size-2.5" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1 text-[10px]">
                            <ShieldX className="size-2.5" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2">{getAccessBadge(entry.access)}</TableCell>
                      <TableCell className="py-2 max-w-[300px]">
                        {entry.matchingPolicies.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {entry.rlsEnabled
                              ? 'No matching policies'
                              : 'No RLS — all operations allowed'}
                          </span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {entry.matchingPolicies.map((p) => (
                              <div key={p.policyname} className="flex items-center gap-1">
                                <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                                  {p.cmd}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground truncate">
                                  {p.policyname}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* Summary stats */}
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t">
              <div className="flex items-center gap-1.5 text-xs">
                <ShieldX className="size-3.5 text-red-500" />
                <span className="text-muted-foreground">Full Access:</span>
                <span className="font-medium">
                  {rlsImpact.filter((e) => e.access === 'full').length} tables
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <ShieldAlert className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Denied:</span>
                <span className="font-medium">
                  {rlsImpact.filter((e) => e.access === 'denied').length} tables
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <ShieldCheck className="size-3.5 text-primary" />
                <span className="text-muted-foreground">Conditional:</span>
                <span className="font-medium">
                  {rlsImpact.filter((e) => e.access === 'conditional').length} tables
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state when no RLS data */}
      {rlsStatuses.length === 0 && activeConnectionId && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center space-y-3">
              <Shield className="size-12 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No RLS data loaded</p>
              <p className="text-xs text-muted-foreground">
                Load RLS policies first to see the impact summary and run tests.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state when no connection */}
      {!activeConnectionId && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center space-y-3">
              <User className="size-12 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No connection selected</p>
              <p className="text-xs text-muted-foreground">
                Connect to a Supabase project to use the Auth Simulator.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
