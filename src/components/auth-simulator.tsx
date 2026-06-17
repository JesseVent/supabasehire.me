'use client'

import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
import { Card, CardContent } from '@/components/ui/card'
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
import { track } from '@/lib/analytics'

interface SimulatedUser {
  id: string
  email: string
  role: 'anon' | 'authenticated' | 'custom'
  claims: Record<string, unknown>
}

const PRESET_USERS: { label: string; icon: React.ReactNode; user: SimulatedUser }[] = [
  {
    label: 'Anon',
    icon: <EyeOff className="size-3" />,
    user: { id: '', email: '', role: 'anon', claims: {} },
  },
  {
    label: 'User',
    icon: <User className="size-3" />,
    user: {
      id: crypto.randomUUID?.() || 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'user@example.com',
      role: 'authenticated',
      claims: {},
    },
  },
  {
    label: 'Admin',
    icon: <Crown className="size-3" />,
    user: {
      id: crypto.randomUUID?.() || 'f0e1d2c3-b4a5-6789-0abc-def123456789',
      email: 'admin@example.com',
      role: 'authenticated',
      claims: { role: 'admin', app_metadata: { plan: 'pro', role: 'admin' } },
    },
  },
  {
    label: 'Premium',
    icon: <Star className="size-3" />,
    user: {
      id: crypto.randomUUID?.() || 'b1c2d3e4-f5a6-7890-abcd-ef1234567891',
      email: 'premium@example.com',
      role: 'authenticated',
      claims: { app_metadata: { plan: 'premium', subscription: 'active' } },
    },
  },
]

type AccessLevel = 'full' | 'denied' | 'conditional'

interface RLSImpactEntry {
  tableName: string
  rlsEnabled: boolean
  access: AccessLevel
  matchingPolicies: RLSPolicy[]
}

export function AuthSimulator() {
  const { activeConnectionId, rlsStatuses, addRlsTestResult, addActivityLog } = useSupabaseStore()

  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState<'anon' | 'authenticated' | 'custom'>('anon')
  const [claimsText, setClaimsText] = useState('{}')
  const [claimsError, setClaimsError] = useState<string | null>(null)

  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<RLSTestResult | null>(null)
  const [testTable, setTestTable] = useState<string>('')
  const [copied, setCopied] = useState(false)

  // Single accordion for config + token + test — collapsed by default
  const [configOpen, setConfigOpen] = useState(false)

  const applyPreset = useCallback((preset: SimulatedUser) => {
    setUserId(preset.id)
    setUserEmail(preset.email)
    setUserRole(preset.role)
    setClaimsText(JSON.stringify(preset.claims, null, 2))
    setClaimsError(null)
    setTestResult(null)
  }, [])

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

  const tokenPreview = useMemo(() => {
    const token: Record<string, unknown> = {}
    if (userId) token.sub = userId
    if (userEmail) token.email = userEmail
    token.role = userRole
    if (parsedClaims && Object.keys(parsedClaims).length > 0) token.claims = parsedClaims
    return token
  }, [userId, userEmail, userRole, parsedClaims])

  const rlsImpact = useMemo((): RLSImpactEntry[] => {
    return rlsStatuses.map((table: TableRLSInfo) => {
      if (!table.rlsEnabled) {
        return { tableName: table.tableName, rlsEnabled: false, access: 'full' as AccessLevel, matchingPolicies: [] }
      }
      const matchingPolicies = getMatchingPolicies(table, userRole)
      return {
        tableName: table.tableName,
        rlsEnabled: true,
        access: matchingPolicies.length === 0 ? ('denied' as AccessLevel) : ('conditional' as AccessLevel),
        matchingPolicies,
      }
    })
  }, [rlsStatuses, userRole])

  function getMatchingPolicies(table: TableRLSInfo, role: string): RLSPolicy[] {
    return table.policies.filter((policy: RLSPolicy) => {
      const policyRoles = policy.roles.replace(/[{}"]/g, '').split(',').map((r: string) => r.trim())
      return policyRoles.includes(role) || policyRoles.includes('public')
    })
  }

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
        ? { success: false, error: data.error, operation: 'SELECT', role: (userRole === 'custom' ? 'authenticated' : userRole) as RLSTestResult['role'], tableName: testTable }
        : data
      track('auth_simulation_run', { role: userRole, table: testTable, passed: result.success })
      setTestResult(result)
      addRlsTestResult(result)
      addActivityLog({ type: 'rls', action: `Auth Simulator test: SELECT on ${testTable}`, details: `Role: ${userRole}, User: ${userEmail || 'anon'}, Result: ${result.success ? 'Allowed' : 'Blocked'}` })
      if (result.success) toast.success('RLS test passed', { description: 'Access granted for simulated user' })
      else toast.error('RLS test failed', { description: 'Access denied for simulated user' })
    } catch {
      setTestResult({ success: false, error: 'Network error occurred', operation: 'SELECT', role: (userRole === 'custom' ? 'authenticated' : userRole) as RLSTestResult['role'], tableName: testTable })
    } finally {
      setIsTesting(false)
    }
  }, [activeConnectionId, testTable, userRole, userEmail, parsedClaims, claimsText, addRlsTestResult, addActivityLog])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const getAccessBadge = (access: AccessLevel) => {
    switch (access) {
      case 'full': return <Badge className="gap-1 bg-red-500 hover:bg-red-600 text-white text-[10px] h-4 px-1"><ShieldX className="size-2.5" />Full</Badge>
      case 'denied': return <Badge variant="secondary" className="gap-1 text-[10px] h-4 px-1"><ShieldAlert className="size-2.5" />Denied</Badge>
      case 'conditional': return <Badge className="gap-1 bg-primary hover:bg-primary text-white text-[10px] h-4 px-1"><ShieldCheck className="size-2.5" />Conditional</Badge>
    }
  }

  const tableNames = rlsStatuses.map((t) => t.tableName)

  return (
    <div className="flex flex-col gap-2">
      {/* Preset buttons — always visible */}
      <Card>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="text-xs text-muted-foreground shrink-0">As:</span>
          {PRESET_USERS.map((preset) => (
            <Button
              key={preset.label}
              variant={userRole === preset.user.role && userEmail === preset.user.email ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1 px-2"
              onClick={() => applyPreset(preset.user)}
            >
              {preset.icon}
              {preset.label}
            </Button>
          ))}
          <span className="text-[10px] text-muted-foreground font-mono border border-border/60 rounded px-1.5 py-0.5">
            {userRole}{userEmail ? ` · ${userEmail}` : ''}
          </span>
        </div>
      </Card>

      {/* Combined collapsible: User Config + Token Preview + Test */}
      <Card>
        <button
          className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setConfigOpen(!configOpen)}
        >
          <span className="flex items-center gap-1.5">
            <Shield className="size-3.5" />
            Configure &amp; Test
          </span>
          {configOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        {configOpen && (
          <CardContent className="pt-0 pb-3 flex flex-col gap-3">
            {/* User config fields */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">User ID (UUID)</Label>
                  <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="a1b2c3d4-..." className="font-mono text-xs h-7" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Email</Label>
                  <Input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="user@example.com" type="email" className="text-xs h-7" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground">Role</Label>
                <Select value={userRole} onValueChange={(v) => setUserRole(v as 'anon' | 'authenticated' | 'custom')}>
                  <SelectTrigger className="h-7 text-xs w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anon">anon</SelectItem>
                    <SelectItem value="authenticated">authenticated</SelectItem>
                    <SelectItem value="custom">custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground">Custom JWT Claims (JSON)</Label>
                <Textarea value={claimsText} onChange={(e) => setClaimsText(e.target.value)} placeholder='{"role": "admin"}' className="font-mono text-xs min-h-[60px]" />
                {claimsError && <p className="text-xs text-destructive">{claimsError}</p>}
              </div>
            </div>

            <Separator />

            {/* Token preview */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1"><ShieldCheck className="size-3" />Token Preview</span>
                <button
                  onClick={() => copyToClipboard(JSON.stringify(tokenPreview, null, 2))}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  Copy
                </button>
              </div>
              <pre className="rounded-lg bg-muted p-2 font-mono text-xs overflow-x-auto">
                {JSON.stringify(tokenPreview, null, 2)}
              </pre>
            </div>

            {activeConnectionId && rlsStatuses.length > 0 && (
              <>
                <Separator />
                {/* Test row */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={testTable} onValueChange={setTestTable}>
                      <SelectTrigger className="h-7 text-xs w-[200px]">
                        <SelectValue placeholder="Select table…" />
                      </SelectTrigger>
                      <SelectContent>
                        {tableNames.map((name) => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={runTestWithUser} disabled={isTesting || !testTable} size="sm" className="h-7 text-xs gap-1">
                      {isTesting ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                      Test SELECT
                    </Button>
                    {testResult && (
                      <div className="flex items-center gap-1.5">
                        {testResult.success ? <CheckCircle2 className="size-4 text-primary" /> : <XCircle className="size-4 text-red-500" />}
                        <span className="text-xs font-medium">{testResult.success ? 'Allowed' : 'Denied'}</span>
                        {testResult.rowCount !== undefined && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">{testResult.rowCount} rows</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  {testResult?.error && (
                    <Alert variant="destructive">
                      <AlertDescription className="font-mono text-xs">{testResult.error}</AlertDescription>
                    </Alert>
                  )}
                  {testResult?.data && testResult.data.length > 0 && (
                    <pre className="rounded-lg bg-muted p-2 font-mono text-xs overflow-x-auto max-h-32">
                      {JSON.stringify(testResult.data.slice(0, 5), null, 2)}
                    </pre>
                  )}
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* RLS Impact Summary table — always visible */}
      {rlsStatuses.length > 0 && (
        <Card>
          <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="size-3.5" />
              RLS Impact — all tables
            </span>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span><span className="text-red-500 font-medium">{rlsImpact.filter((e) => e.access === 'full').length}</span> full</span>
              <span><span className="font-medium">{rlsImpact.filter((e) => e.access === 'denied').length}</span> denied</span>
              <span><span className="text-primary font-medium">{rlsImpact.filter((e) => e.access === 'conditional').length}</span> conditional</span>
            </div>
          </div>
          <ScrollArea className="max-h-72">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs py-1.5">Table</TableHead>
                  <TableHead className="text-xs py-1.5">RLS</TableHead>
                  <TableHead className="text-xs py-1.5">Access</TableHead>
                  <TableHead className="text-xs py-1.5">Policies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rlsImpact.map((entry) => (
                  <TableRow key={entry.tableName}>
                    <TableCell className="font-mono text-xs py-1.5">{entry.tableName}</TableCell>
                    <TableCell className="py-1.5">
                      {entry.rlsEnabled
                        ? <Badge variant="default" className="gap-1 text-[9px] h-4 px-1"><ShieldCheck className="size-2.5" />on</Badge>
                        : <Badge variant="destructive" className="gap-1 text-[9px] h-4 px-1"><ShieldX className="size-2.5" />off</Badge>}
                    </TableCell>
                    <TableCell className="py-1.5">{getAccessBadge(entry.access)}</TableCell>
                    <TableCell className="py-1.5 max-w-[240px]">
                      {entry.matchingPolicies.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">
                          {entry.rlsEnabled ? 'No matching policies' : 'All ops allowed'}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-0.5">
                          {entry.matchingPolicies.map((p) => (
                            <span key={p.policyname} className="inline-flex items-center gap-0.5">
                              <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono h-4">{p.cmd}</Badge>
                              <span className="text-[10px] text-muted-foreground">{p.policyname}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      {rlsStatuses.length === 0 && activeConnectionId && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <Shield className="size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Load RLS policies first to see the impact summary.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!activeConnectionId && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <User className="size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Connect to a Supabase project to use the Auth Simulator.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
