'use client'

import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Shield,
  User,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useSupabaseStore } from '@/store/supabase-store'

// Helper to decode JWT claims client-side
function decodeJwt(token: string) {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

export function AuthPanel() {
  const { activeConnectionId, connections, sessions, setSession } = useSupabaseStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null
  const currentSession = activeConnectionId ? sessions[activeConnectionId] || null : null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [copied, setCopied] = useState(false)

  // Clear inputs when connection changes
  useEffect(() => {
    setEmail('')
    setPassword('')
  }, [])

  if (!activeConnection) {
    return (
      <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-sm">
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Lock className="mb-3 size-12 text-muted-foreground/30 animate-pulse" />
            <p className="text-sm font-medium text-muted-foreground">No connection selected</p>
            <p className="text-xs text-muted-foreground mt-1">
              Select or configure a connection to authenticate users
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Missing fields', { description: 'Please enter both email and password' })
      return
    }

    setIsLoading(true)

    try {
      const endpoint =
        mode === 'login'
          ? `${activeConnection.supabaseUrl}/auth/v1/token?grant_type=password`
          : `${activeConnection.supabaseUrl}/auth/v1/signup`

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: activeConnection.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Authentication failed')
      }

      if (mode === 'signup') {
        // Supabase sign up behavior varies based on whether email confirmation is enabled.
        if (data.active === false || (!data.access_token && data.id)) {
          toast.success('Registration successful!', {
            description: 'Check your email for confirmation link if enabled in project settings.',
          })
          setMode('login')
          setPassword('')
        } else if (data.access_token) {
          toast.success('Sign up complete', { description: 'Automatically logged in.' })
          setSession(activeConnection.id, {
            user: data.user,
            access_token: data.access_token,
          })
        }
      } else {
        toast.success('Successfully logged in')
        setSession(activeConnection.id, {
          user: data.user,
          access_token: data.access_token,
        })
      }
    } catch (err: any) {
      toast.error('Auth Error', { description: err.message || 'An error occurred' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = () => {
    setSession(activeConnection.id, null)
    toast.success('Logged out successfully')
  }

  const handleCopyToken = () => {
    if (currentSession?.access_token) {
      navigator.clipboard.writeText(currentSession.access_token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Token copied to clipboard')
    }
  }

  // Decode and format token claims
  const claims = currentSession?.access_token ? decodeJwt(currentSession.access_token) : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Auth Control Card */}
      <Card className="lg:col-span-5 border-zinc-800 bg-zinc-950/40 backdrop-blur-sm shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Shield className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Project Authentication</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {currentSession
                  ? 'Manage active session'
                  : `Authenticate on ${activeConnection.name}`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {currentSession ? (
            <div className="flex flex-col gap-4">
              {/* Logged In Status Card */}
              <div className="flex flex-col gap-3.5 p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      <User className="size-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">Active User</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                        {currentSession.user?.email || 'Anonymous User'}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase font-semibold tracking-wider"
                  >
                    {currentSession.user?.role || 'authenticated'}
                  </Badge>
                </div>
                <Separator className="bg-zinc-800" />
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block font-medium">User ID</span>
                    <span
                      className="font-mono text-zinc-300 truncate block mt-0.5 select-all"
                      title={currentSession.user?.id}
                    >
                      {currentSession.user?.id}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">
                      Authenticated At
                    </span>
                    <span className="text-zinc-300 block mt-0.5">
                      {currentSession.user?.last_sign_in_at
                        ? new Date(currentSession.user.last_sign_in_at).toLocaleDateString()
                        : new Date().toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                variant="destructive"
                className="w-full gap-2 text-xs font-semibold transition-all hover:bg-red-900/40"
                onClick={handleLogout}
              >
                <LogOut className="size-3.5" />
                Sign Out / Clear Session
              </Button>
            </div>
          ) : (
            <form onSubmit={handleAuth} className="flex flex-col gap-4">
              <div className="flex rounded-md bg-zinc-900 p-0.5 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-sm transition-all ${
                    mode === 'login'
                      ? 'bg-zinc-800 text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-sm transition-all ${
                    mode === 'signup'
                      ? 'bg-zinc-800 text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-zinc-300">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 size-4 text-muted-foreground/60" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="pl-9 text-sm border-zinc-800 bg-zinc-900/60 focus-visible:ring-zinc-700"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-zinc-300">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-2.5 size-4 text-muted-foreground/60" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 pr-9 text-sm border-zinc-800 bg-zinc-900/60 focus-visible:ring-zinc-700"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 text-xs font-semibold"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Authenticating...
                  </>
                ) : mode === 'login' ? (
                  'Sign In to Connected Project'
                ) : (
                  'Create Project User'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Session Details / JWT / Claims Card */}
      <Card className="lg:col-span-7 border-zinc-800 bg-zinc-950/40 backdrop-blur-sm shadow-xl min-h-[350px]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Key className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">JSON Web Token (JWT)</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Decoded claims & payloads
              </CardDescription>
            </div>
          </div>
          {currentSession?.access_token && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 border-zinc-800 hover:bg-zinc-900 gap-1.5"
              onClick={handleCopyToken}
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? 'Copied' : 'Copy JWT'}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {currentSession ? (
            <div className="flex flex-col gap-4">
              {/* Raw JWT Token */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-zinc-300">Raw Access Token</span>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-[10px] text-zinc-400 select-all max-h-[70px] overflow-y-auto break-all scrollbar-thin">
                  {currentSession.access_token}
                </div>
              </div>

              {/* Decoded Claims */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Shield className="size-3.5 text-primary" />
                  Claims Payload
                </span>
                {claims ? (
                  <ScrollArea className="h-[210px] rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[11px]">
                      {Object.entries(claims).map(([key, val]) => {
                        let displayVal = ''
                        if (typeof val === 'object' && val !== null) {
                          displayVal = JSON.stringify(val)
                        } else {
                          displayVal = String(val)
                        }

                        // Style specific keys for better visibility
                        const isHighlight = ['sub', 'email', 'role', 'exp', 'aud'].includes(key)

                        return (
                          <div
                            key={key}
                            className="flex flex-col border-b border-zinc-900/60 pb-1.5 last:border-0 last:pb-0"
                          >
                            <span className="text-[10px] text-muted-foreground font-semibold uppercase">
                              {key}
                            </span>
                            <span
                              className={`truncate mt-0.5 ${isHighlight ? 'text-primary' : 'text-zinc-300'}`}
                              title={displayVal}
                            >
                              {key === 'exp' && typeof val === 'number'
                                ? new Date(val * 1000).toLocaleString()
                                : displayVal}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center gap-2 p-3.5 rounded-lg border border-red-900/30 bg-red-950/10 text-red-400 text-xs">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>Failed to decode JWT claims. The token may be malformed or invalid.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Key className="size-12 text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium">No active session</p>
              <p className="text-xs mt-1">
                Sign in with a user credentials on the left to inspect the JWT.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
