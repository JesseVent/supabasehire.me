'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Bot,
  Camera,
  CheckCircle2,
  ChevronDown,
  Database,
  DatabaseBackup,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  GitFork,
  HardDrive,
  HeartPulse,
  Info,
  Key,
  Keyboard,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Link2,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TableIcon,
  Terminal,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AnalyticsPanel } from '@/components/analytics-panel'
import { CommandPalette } from '@/components/command-palette'
import { DataCatalogPanel } from '@/components/data-catalog-panel'
import { DbViewsFunctions } from '@/components/db-views-functions'
import { EdgeFunctionsPanel } from '@/components/edge-functions-panel'
import { ExportReport } from '@/components/export-report'
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts'
import { ProjectDashboard } from '@/components/project-dashboard'
import { RLSPanel } from '@/components/rls-panel'
import { SchemaSnapshotPanel } from '@/components/schema-snapshot'
import { SQLPanel } from '@/components/sql-panel'
import { StorageBrowser } from '@/components/storage-browser'
import { TableDataViewer } from '@/components/table-data-viewer'
import { ThemeToggle } from '@/components/theme-toggle'
import { TracePanel } from '@/components/trace-panel'
import { TriggerViewer } from '@/components/trigger-viewer'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { apiFetch } from '@/lib/api-auth'
import {
  DEMO_CONNECTION,
  DEMO_CONNECTION_ID,
  DEMO_EDGE_FUNCTIONS,
  DEMO_FUNCTION_NOTES,
  DEMO_RLS_STATUSES,
  DEMO_TABLES,
} from '@/lib/demo-data'
import {
  fetchWithBackoff,
  recordAuthFailure,
  recordSuccess,
  shouldSkipConnection,
} from '@/lib/retry-with-backoff'
import {
  buildAuthorizeUrl,
  clearDcrCache,
  exchangeCode,
  generatePKCE,
  getCallbackUrl,
  getOrRegisterDcrClient,
  type OAuthProject,
  openOAuthPopup,
  waitForOAuthCallback,
} from '@/lib/supabase-oauth'
import type {
  ActivePanel,
  ColumnInfo,
  ForeignKeyInfo,
  RLSPolicy,
  SupabaseConnection,
  TableRLSInfo,
} from '@/lib/supabase-types'
import { useAgentStore } from '@/store/agent-store'
import { useSupabaseStore } from '@/store/supabase-store'

// import { SupabaseMcpClient } from '@/lib/supabase-mcp-client'

// Dynamic import for SchemaDiagram to avoid SSR issues with ReactFlow
const SchemaDiagram = dynamic(
  () => import('@/components/schema-diagram').then((mod) => mod.SchemaDiagram),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[500px] text-muted-foreground">
        <Loader2 className="mr-2 size-6 animate-spin" />
        Loading diagram...
      </div>
    ),
  }
)

function AppLogo({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" className={className} aria-hidden="true">
      <path fill="#1DD475" d="m98.6 61-27.8-56.1c-0.1-0.2-0.3-0.4-0.5-0.4l-15.9-0.1c-0.2 0-0.4 0.1-0.5 0.3l-52.6 96.2-0.1-0.3 7.5 14.9c0.3 0.6 1 0.7 1.3 0.2l14.1-24.3 15.3-0.5c0.6 0 1.2 0.7 0.9 1.4l-14.7 29c4.5 2.1 13.6 5.3 14.2 14.4 0 0.2 0.1 0.5 0.4 0.4l33.6-0.2c0.6-0.1 0.8-0.4 0.6-0.9l-6.8-15.7c0-0.2-0.2-0.3-0.4-0.3h-21c-0.6 0-1.1-0.6-0.8-1.1l29.8-57.8-8.6-16.2-15.2 30.1c-0.1 0.2-0.3 0.3-0.5 0.3l-14.3 0.4c-0.6 0-1.1-0.6-0.8-1.1l26.1-49.5c0.3-0.6 1.3-0.5 1.6 0.1l26.8 52.9 8.3-15.6v-0.5z"/>
      <path fill="currentColor" opacity="0.4" d="m85.8 25.3 6.7 14.9c0.1 0.7-0.5 0.2 20.7 0.5 0.7 0 1.2 0.7 0.7 1.5l-30.2 56.8 9 16.8 15.9-29.2c0.1-0.2 0.3-0.3 0.4-0.3l14-0.3c0.7-0.1 1 0.6 0.6 1.3l-26.4 48.4c-0.3 0.6-1.2 0.6-1.4 0l-26.5-53.5h-0.4l-8.7 15.8 28.1 57.1c0.1 0.2 0.4 0.4 0.7 0.4l15.9 0.1c0.2 0 0.4-0.1 0.5-0.3l53.6-96-8-14.9c-0.3-0.6-1-0.7-1.4-0.1l-13.9 24.3c-0.1 0.2-0.3 0.4-0.6 0.4l-14.9 0.2c-0.7 0-1.2-0.7-0.8-1.4l14.7-28.2c-5.4-2.2-13-4.9-13.8-15.2h-34.4l-0.1 0.9z"/>
    </svg>
  )
}

export default function Home() {
  const {
    connections,
    activeConnectionId,
    activePanel,
    tables,
    rlsStatuses,
    setActiveConnectionId,
    setActivePanel,
    addConnection,
    removeConnection,
    setTables,
    setRlsStatuses,
    setEdgeFunctions,
    selectedTable,
    setSelectedTable,
    setShowShortcutsDialog,
    addActivityLog,
    reset,
    functionNotes,
    setFunctionNotes,
  } = useSupabaseStore()

  const { sidebarOpen, toggleSidebar } = useAgentStore()

  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID

  const [connectionHealthMap, setConnectionHealthMap] = useState<
    Record<string, 'healthy' | 'degraded' | 'unhealthy' | 'checking'>
  >({})
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  // New connection form
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newAnonKey, setNewAnonKey] = useState('')
  const [newServiceRoleKey, setNewServiceRoleKey] = useState('')
  const [newAccessToken, setNewAccessToken] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isPrefilling, setIsPrefilling] = useState(false)

  // OAuth DCR flow
  const [isOAuthConnecting, setIsOAuthConnecting] = useState(false)
  const [oauthProjects, setOauthProjects] = useState<OAuthProject[] | null>(null)
  const [oauthAccessToken, setOauthAccessToken] = useState<string | null>(null)
  const [oauthRefreshToken, setOauthRefreshToken] = useState<string | null>(null)

  const applyOAuthProject = useCallback(
    async (project: OAuthProject, accessToken: string, refreshToken?: string) => {
      setIsOAuthConnecting(true)
      setCreateError(null)
      try {
        // Fetch the publishable (anon) key via project-scoped MCP.
        // Service role key is not exposed by MCP — user can paste it manually in Settings.
        let anonKey = ''
        try {
          const keyRes = await fetch('/api/mcp/account-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken,
              name: 'get_publishable_keys',
              args: {},
              projectRef: project.ref,
            }),
          })
          if (keyRes.ok) {
            const keyData = await keyRes.json()
            const keyRaw = keyData.result ?? ''
            try {
              const parsed = JSON.parse(keyRaw)
              if (Array.isArray(parsed?.keys)) {
                // Prefer the new sb_publishable_ key — legacy JWT anon keys may
                // be disabled on the project, and PostgREST then rejects them
                // with "Unregistered API key".
                const keys = parsed.keys as {
                  name?: string
                  type?: string
                  api_key?: string
                  disabled?: boolean
                }[]
                const pick =
                  keys.find(
                    (k) => !k.disabled && (k.api_key?.startsWith('sb_publishable_') ?? false)
                  ) ??
                  keys.find((k) => !k.disabled && k.type === 'publishable') ??
                  keys.find((k) => !k.disabled && (k.name === 'anon' || k.type === 'legacy'))
                anonKey = pick?.api_key ?? ''
              } else if (typeof parsed === 'string') {
                anonKey = parsed
              } else {
                anonKey = parsed?.key ?? parsed?.anon_key ?? ''
              }
            } catch {
              anonKey = keyRaw.trim()
            }
          }
        } catch {
          toast.warning('Connected with limited access', {
            description: 'Could not fetch API key automatically. Add it manually in Settings.',
            duration: 8000,
          })
        }

        const now = new Date().toISOString()
        const newConnection = {
          id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: project.name,
          supabaseUrl: `https://${project.ref}.supabase.co`,
          anonKey,
          serviceRoleKey: null as null,
          accessToken,
          refreshToken: refreshToken ?? null,
          s3KeyId: null as null,
          s3Secret: null as null,
          s3Warehouse: null as null,
          createdAt: now,
          updatedAt: now,
        }
        addConnection(newConnection)
        setActiveConnectionId(newConnection.id)
        addActivityLog({ type: 'connection', action: 'Connected via OAuth', details: project.name })

        if (anonKey) {
          toast.success('Connected', { description: project.name })
        } else {
          toast.success('Project linked via OAuth', {
            description: `${project.name} — add your Publishable / Secret key in Settings to enable full access`,
            duration: 6000,
          })
        }

        setShowNewDialog(false)
        setOauthProjects(null)
        setOauthAccessToken(null)
        setOauthRefreshToken(null)
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : 'Failed to load project details')
      } finally {
        setIsOAuthConnecting(false)
      }
    },
    [addConnection, setActiveConnectionId, addActivityLog]
  )

  const connectWithOAuth = useCallback(async () => {
    setIsOAuthConnecting(true)
    setCreateError(null)
    try {
      const redirectUri = getCallbackUrl()

      const runFlow = async (force = false) => {
        const { clientId, clientSecret } = await getOrRegisterDcrClient(redirectUri, force)

        const { codeVerifier, codeChallenge } = await generatePKCE()
        const state = crypto.randomUUID()
        const authorizeUrl = buildAuthorizeUrl(clientId, redirectUri, codeChallenge, state)

        const popup = openOAuthPopup(authorizeUrl)
        if (!popup) throw new Error('Popup blocked — allow popups for this site and try again.')

        const code = await waitForOAuthCallback(state, popup)
        return exchangeCode(clientId, code, codeVerifier, redirectUri, clientSecret)
      }

      let tokens: { accessToken: string; refreshToken?: string }
      try {
        tokens = await runFlow()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/unrecognized.client/i.test(msg)) {
          clearDcrCache()
          tokens = await runFlow(true)
        } else {
          throw err
        }
      }

      const { accessToken, refreshToken } = tokens

      // List projects via Management API REST — faster and more reliable than MCP on Vercel
      const projectsRes = await fetch('/api/oauth/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      })
      if (!projectsRes.ok) {
        const err = await projectsRes.json().catch(() => ({}))
        throw new Error(err.error ?? `Project list failed (${projectsRes.status})`)
      }
      const projectsData = await projectsRes.json()
      const projects: OAuthProject[] = Array.isArray(projectsData.projects)
        ? projectsData.projects
        : []
      if (projects.length === 0) throw new Error('No Supabase projects found in this account.')

      if (projects.length === 1) {
        // Auto-select the only project
        await applyOAuthProject(projects[0], accessToken, refreshToken)
      } else {
        // Let the user pick
        setOauthAccessToken(accessToken)
        setOauthRefreshToken(refreshToken ?? null)
        setOauthProjects(projects)
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'OAuth connection failed')
    } finally {
      setIsOAuthConnecting(false)
    }
  }, [applyOAuthProject])

  const prefillFromEnv = useCallback(async () => {
    setIsPrefilling(true)
    try {
      const res = await fetch('/api/seed-connection')
      const data = await res.json()
      if (data.available) {
        setNewName(data.name || '')
        setNewUrl(data.url || '')
        setNewAnonKey(data.anonKey || '')
        setNewServiceRoleKey(data.serviceRoleKey || '')
        setNewAccessToken(data.accessToken || '')
      } else {
        toast.info('No SEED_* variables found in .env')
      }
    } catch {
      toast.error('Failed to load .env values')
    } finally {
      setIsPrefilling(false)
    }
  }, [])

  // Schema diagram search & filter
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')

  // Data viewer sheet
  const [dataViewerOpen, setDataViewerOpen] = useState(false)
  const [dataViewerTable, setDataViewerTable] = useState<string | null>(null)

  // Onboarding tip banner
  const [showTipBanner, setShowTipBanner] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem('supabase-debug-tip-dismissed')
    setShowTipBanner(!dismissed)
  }, [])

  // DB paused overlay
  const [dbPaused, setDbPaused] = useState(false)
  const [dbPausedVisible, setDbPausedVisible] = useState(false)
  const [dbPausedPhase, setDbPausedPhase] = useState<'video' | 'picker'>('video')

  useEffect(() => {
    const orig = window.fetch
    window.fetch = async function (...args) {
      const res = await orig.apply(window, args)
      const url =
        typeof args[0] === 'string'
          ? args[0]
          : args[0] instanceof URL
            ? args[0].href
            : (args[0] as Request).url
      if (url.includes('/api/mcp/account-call') && res.status === 502) {
        setDbPausedPhase('video')
        setDbPaused(true)
        requestAnimationFrame(() => setDbPausedVisible(true))
      }
      return res
    }
    return () => {
      window.fetch = orig
    }
  }, [])

  const dismissTipBanner = useCallback(() => {
    setShowTipBanner(false)
    localStorage.setItem('supabase-debug-tip-dismissed', 'true')
  }, [])

  // Key on connection IDs, not the array reference: apiFetch's 401 auto-refresh
  // writes new tokens back to the store, and re-running health checks on every
  // token write would loop (check → 401 → refresh → store write → re-check …).
  const connectionIdsKey = connections.map((c) => c.id).join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: connectionIdsKey is an intentional re-run key; the hook reads fresh connections via getState()
  useEffect(() => {
    const conns = useSupabaseStore.getState().connections
    const realConnections = conns.filter((c) => c.id !== DEMO_CONNECTION_ID)
    if (realConnections.length === 0) return
    const checking: Record<string, 'checking'> = {}
    realConnections.forEach((c) => {
      checking[c.id] = 'checking'
    })
    setConnectionHealthMap((prev) => ({ ...prev, ...checking }))
    realConnections.forEach(async (c) => {
      try {
        const res = await apiFetch(`/api/connections/${c.id}/health`, c)
        const data = await res.json()
        if (!data.error && data.status) {
          setConnectionHealthMap((prev) => ({
            ...prev,
            [c.id]: data.status as 'healthy' | 'degraded' | 'unhealthy',
          }))
        } else {
          setConnectionHealthMap((prev) => ({ ...prev, [c.id]: 'unhealthy' }))
        }
      } catch {
        setConnectionHealthMap((prev) => ({ ...prev, [c.id]: 'unhealthy' }))
      }
    })
  }, [connectionIdsKey])

  const createConnection = useCallback(async () => {
    if (!newName.trim() || !newUrl.trim() || !newAnonKey.trim()) return
    setIsCreating(true)
    setCreateError(null)
    try {
      // Validate URL format
      try {
        new URL(newUrl.trim())
      } catch {
        setCreateError('Invalid Supabase URL format')
        setIsCreating(false)
        return
      }

      const now = new Date().toISOString()
      const newConnection: SupabaseConnection = {
        id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: newName.trim(),
        supabaseUrl: newUrl.trim(),
        anonKey: newAnonKey.trim(),
        serviceRoleKey: newServiceRoleKey.trim() || null,
        accessToken: newAccessToken.trim() || null,
        refreshToken: null,
        s3KeyId: null,
        s3Secret: null,
        s3Warehouse: null,
        createdAt: now,
        updatedAt: now,
      }
      addConnection(newConnection)
      setActiveConnectionId(newConnection.id)
      addActivityLog({
        type: 'connection',
        action: 'Connection created',
        details: newConnection.name,
      })
      toast.success('Connection created', { description: newConnection.name })
      setShowNewDialog(false)
      setNewName('')
      setNewUrl('')
      setNewAnonKey('')
      setNewServiceRoleKey('')
      setNewAccessToken('')
    } catch {
      setCreateError('Failed to create connection')
    } finally {
      setIsCreating(false)
    }
  }, [
    newName,
    newUrl,
    newAnonKey,
    newServiceRoleKey,
    newAccessToken,
    addConnection,
    setActiveConnectionId,
    addActivityLog,
  ])

  const deleteConnection = useCallback(
    (id: string) => {
      const conn = connections.find((c) => c.id === id)
      removeConnection(id)
      addActivityLog({
        type: 'connection',
        action: 'Connection deleted',
        details: conn?.name || id,
      })
      toast.info('Connection deleted')
    },
    [removeConnection, connections, addActivityLog]
  )

  // Stable ref so fetchSchemaAndRLS doesn't recreate when connections array changes
  // (prevents the auto-fetch useEffect from re-running and switching to schema panel)
  const connectionsRef = useRef(connections)
  connectionsRef.current = connections

  // Fetch schema and RLS data
  const fetchSchemaAndRLS = useCallback(async () => {
    if (!activeConnectionId) return
    const activeConn = connectionsRef.current.find((c) => c.id === activeConnectionId)
    if (!activeConn) return

    // Skip connections that have consistently failed auth — stop retry storms
    if (shouldSkipConnection(activeConnectionId)) {
      setSchemaError('Connection has repeated auth failures. Check your OAuth token or reconnect.')
      return
    }

    setIsLoadingSchema(true)
    setSchemaError(null)
    try {
      // Fetch schema with exponential backoff — stops on 401/403/429
      const schemaRes = await fetchWithBackoff(() => apiFetch('/api/schema', activeConn), {
        key: `${activeConnectionId}:schema`,
      })
      if (schemaRes.status === 401 || schemaRes.status === 403) {
        recordAuthFailure(activeConnectionId)
        setSchemaError('Authentication failed. Reconnect this project via OAuth.')
        return
      }
      recordSuccess(activeConnectionId)
      const schemaData = await schemaRes.json()
      if (schemaData.error) {
        setSchemaError(schemaData.error)
      } else {
        setTables(schemaData.tables || [])
        addActivityLog({
          type: 'schema',
          action: 'Schema fetched',
          details: `${schemaData.tables?.length || 0} tables loaded`,
        })
      }

      // Fetch RLS info with exponential backoff
      const rlsRes = await fetchWithBackoff(() => apiFetch('/api/rls', activeConn), {
        key: `${activeConnectionId}:rls`,
      })
      if (rlsRes.status === 401 || rlsRes.status === 403) {
        recordAuthFailure(activeConnectionId)
        return
      }
      const rlsData = await rlsRes.json()
      if (rlsData.error) {
        if (!schemaData.error) setSchemaError(rlsData.error)
      } else {
        setRlsStatuses(rlsData.tables || [])
      }
    } catch {
      setSchemaError('Failed to fetch schema and RLS data')
    } finally {
      setIsLoadingSchema(false)
    }
  }, [activeConnectionId, setTables, setRlsStatuses, addActivityLog])

  // Load demo data
  const loadDemoData = useCallback(() => {
    // Add demo connection if not present
    const existingDemo = connections.find((c) => c.id === DEMO_CONNECTION_ID)
    if (!existingDemo) {
      addConnection(DEMO_CONNECTION)
    }
    setActiveConnectionId(DEMO_CONNECTION_ID)
    setTables(DEMO_TABLES)
    setRlsStatuses(DEMO_RLS_STATUSES)
    setEdgeFunctions(DEMO_EDGE_FUNCTIONS)
    for (const [key, notes] of Object.entries(DEMO_FUNCTION_NOTES)) {
      if (!functionNotes[key]) setFunctionNotes(key, notes)
    }
    setSelectedTable(null)
    setActivePanel('schema')
    const noRlsCount = DEMO_RLS_STATUSES.filter((t) => !t.rlsEnabled).length
    toast.warning(`${DEMO_TABLES.length} tables loaded · ${noRlsCount} without RLS protection`, {
      description: 'Hover a table on the canvas to trace its foreign key relationships.',
      duration: 6000,
    })
  }, [
    connections,
    addConnection,
    setActiveConnectionId,
    setTables,
    setRlsStatuses,
    setEdgeFunctions,
    functionNotes,
    setFunctionNotes,
    setSelectedTable,
    setActivePanel,
  ])

  // Auto-fetch when connection changes
  useEffect(() => {
    if (activeConnectionId) {
      if (activeConnectionId === DEMO_CONNECTION_ID) {
        // Demo mode: if tables are empty (e.g., after page reload), reload demo data
        if (tables.length === 0) {
          setTables(DEMO_TABLES)
          setRlsStatuses(DEMO_RLS_STATUSES)
          setEdgeFunctions(DEMO_EDGE_FUNCTIONS)
          for (const [key, notes] of Object.entries(DEMO_FUNCTION_NOTES)) {
            if (!functionNotes[key]) setFunctionNotes(key, notes)
          }
          const existingDemo = connections.find((c) => c.id === DEMO_CONNECTION_ID)
          if (!existingDemo) {
            addConnection(DEMO_CONNECTION)
          }
        }
        return
      }
      setTables([])
      setRlsStatuses([])
      setSelectedTable(null)
      setActivePanel('schema')
      fetchSchemaAndRLS()
    }
  }, [
    activeConnectionId,
    setTables,
    setSelectedTable,
    setEdgeFunctions,
    setRlsStatuses,
    setActivePanel,
    setFunctionNotes,
    fetchSchemaAndRLS,
    addConnection,
  ])

  const activeConnection = connections.find((c) => c.id === activeConnectionId)

  // Stats
  const tableCount = tables.length
  const rlsEnabledCount = rlsStatuses.filter((r) => r.rlsEnabled).length
  const rlsDisabledCount = rlsStatuses.filter((r) => !r.rlsEnabled).length
  const totalPolicies = rlsStatuses.reduce((acc, r) => acc + r.policies.length, 0)

  // Filtered tables & rlsStatuses for the schema diagram
  const filteredTables = useMemo(() => {
    let result = tables
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((t) => t.tableName.toLowerCase().includes(q))
    }
    // Type filter
    if (filterType !== 'all') {
      const rlsMap = new Map(rlsStatuses.map((r) => [r.tableName, r]))
      result = result.filter((t) => {
        const rls = rlsMap.get(t.tableName)
        switch (filterType) {
          case 'rls-enabled':
            return rls?.rlsEnabled === true
          case 'no-rls':
            return rls?.rlsEnabled === false
          case 'with-policies':
            return (rls?.policies.length ?? 0) > 0
          case 'without-policies':
            return (rls?.policies.length ?? 0) === 0
          default:
            return true
        }
      })
    }
    return result
  }, [tables, rlsStatuses, searchQuery, filterType])

  const filteredRlsStatuses = useMemo(() => {
    const filteredNames = new Set(filteredTables.map((t) => t.tableName))
    return rlsStatuses.filter((r) => filteredNames.has(r.tableName))
  }, [rlsStatuses, filteredTables])

  const filteredCount = filteredTables.length

  const getHealthDot = (connectionId: string) => {
    const status = connectionHealthMap[connectionId] ?? 'checking'
    const styles: Record<string, React.CSSProperties> = {
      healthy: {
        background: 'var(--status-ok)',
        boxShadow: '0 0 6px color-mix(in oklch, var(--status-ok) 60%, transparent)',
      },
      degraded: {
        background: 'var(--status-warn)',
        boxShadow: '0 0 6px color-mix(in oklch, var(--status-warn) 60%, transparent)',
      },
      unhealthy: {
        background: 'var(--status-err)',
        boxShadow: '0 0 6px color-mix(in oklch, var(--status-err) 60%, transparent)',
      },
      checking: {
        background: 'oklch(0.60 0 0)',
      },
    }
    return (
      <div
        title={`Status: ${status}`}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 12,
          height: 12,
          borderRadius: '50%',
          flexShrink: 0,
          animation: status === 'checking' ? 'pulse 1.5s ease-in-out infinite' : undefined,
          ...styles[status],
        }}
      />
    )
  }

  // Selected table info
  const selectedTableInfo = useMemo(() => {
    if (!selectedTable) return null
    const schema = tables.find((t) => t.tableName === selectedTable)
    const rls = rlsStatuses.find((r) => r.tableName === selectedTable)
    return { schema, rls }
  }, [selectedTable, tables, rlsStatuses])

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* DB-paused overlay */}
      {dbPaused && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85"
          style={{ opacity: dbPausedVisible ? 1 : 0, transition: 'opacity 1.2s ease' }}
        >
          {dbPausedPhase === 'video' ? (
            <video
              autoPlay
              playsInline
              src="https://kdwgvyczmsrvuuddsgwi.supabase.co/storage/v1/object/public/public-files/AQN1MvCWJWWSZsWMfeFREoyaYTgkbZ1MNxCCGJq_X8XyLZdOqE7BmwT33_gDAtOg2N697K-S2YLPWzBZQ7SBtNIkV41ydD7sriU.mp4"
              className="max-w-2xl w-full rounded-xl shadow-2xl cursor-pointer"
              onClick={() => setDbPausedPhase('picker')}
              onEnded={() => setDbPausedPhase('picker')}
            />
          ) : (
            <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
              <div className="px-6 pt-6 pb-4 border-b border-border">
                <h2 className="text-lg font-semibold">Switch Project</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This project&apos;s database is paused. Connect to a different one.
                </p>
              </div>
              <div className="divide-y divide-border max-h-80 overflow-y-auto">
                {connections.filter((c) => c.id !== DEMO_CONNECTION_ID).map((c) => (
                  <button
                    key={c.id}
                    className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-muted transition-colors"
                    onClick={() => {
                      setActiveConnectionId(c.id)
                      setDbPaused(false)
                      setDbPausedVisible(false)
                    }}
                  >
                    <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.supabaseUrl}</p>
                    </div>
                    {c.id === activeConnectionId && (
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">active</span>
                    )}
                  </button>
                ))}
                {connections.filter((c) => c.id !== DEMO_CONNECTION_ID).length === 0 && (
                  <p className="px-6 py-8 text-sm text-muted-foreground text-center">
                    No saved connections. Add one from the main UI.
                  </p>
                )}
              </div>
              <div className="px-6 py-4 border-t border-border">
                <button
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setDbPaused(false); setDbPausedVisible(false) }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top navigation bar */}
      <header
        className="bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 header-gradient"
        style={{
          background: 'var(--surface-1)',
          backdropFilter: 'var(--background-blur)',
          WebkitBackdropFilter: 'var(--background-blur)',
        }}
      >
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden p-1">
              <AppLogo className="w-full h-full" />
            </div>
            <h1
              className="font-sans text-[22px] leading-none tracking-tight text-foreground"
              style={{ fontWeight: 800 }}
            >
              supabasehire.me
            </h1>
          </div>

          {/* Connection selector + Status + Theme toggle */}
          <div className="flex items-center gap-2">
            {/* Quick Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Zap className="size-3.5" />
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={loadDemoData}>
                  <Eye className="mr-2 size-4" />
                  Try Demo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}} disabled={!activeConnectionId}>
                  <FileText className="mr-2 size-4" />
                  Export RLS Report
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowShortcutsDialog(true)}>
                  <Keyboard className="mr-2 size-4" />
                  Keyboard Shortcuts
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActivePanel('settings')}>
                  <HeartPulse className="mr-2 size-4" />
                  Health Check
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className={`h-8 w-8 p-0 hover:text-foreground ${sidebarOpen ? 'text-foreground bg-accent' : 'text-muted-foreground'}`}
              title="AI Agent"
            >
              <Bot className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowShortcutsDialog(true)}
              className="hidden sm:inline-flex h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Keyboard shortcuts (Ctrl+/)"
            >
              <Keyboard className="size-3.5" />
            </Button>
            <a
              href="https://github.com/JesseVent/supabase-devtool"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="GitHub"
            >
              <span className="sr-only">GitHub</span>
              <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/in/jessevent/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="LinkedIn"
            >
              <span className="sr-only">LinkedIn</span>
              <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            <a
              href="https://agenticlab.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex h-8 items-center justify-center rounded-md px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="AgenticLab"
            >
              agenticlab.com.au
            </a>
            {activeConnection ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1 px-2 py-1">
                  <CheckCircle2 className="size-3 text-emerald-500" />
                  <span className="font-mono text-xs">{activeConnection.name}</span>
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteConnection(activeConnection.id)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ) : connections.length > 0 ? (
              <Select value={activeConnectionId || ''} onValueChange={setActiveConnectionId}>
                <SelectTrigger className="w-[140px] sm:w-[200px] h-8">
                  <SelectValue placeholder="Select connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => {
                    const status = connectionHealthMap[c.id] ?? 'checking'
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center justify-between w-full gap-2">
                          <span>{c.name}</span>
                          <span
                            className={`text-[9px] uppercase font-mono px-1 rounded ${
                              status === 'healthy'
                                ? 'text-emerald-500 bg-emerald-500/10'
                                : status === 'degraded'
                                  ? 'text-amber-500 bg-amber-500/10'
                                  : status === 'unhealthy'
                                    ? 'text-rose-500 bg-rose-500/10'
                                    : 'text-zinc-500 bg-zinc-500/10'
                            }`}
                          >
                            {status}
                          </span>
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            ) : null}

            {/* Export Report button (when connected) */}
            {activeConnectionId && <ExportReport />}

            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
              <DialogTrigger asChild>
                <button className="flex items-center" aria-label="Connect to Supabase">
                  <img
                    src="/connect-supabase-dark.svg"
                    alt="Connect with Supabase"
                    className="h-8 hidden dark:block"
                  />
                  <img
                    src="/connect-supabase-light.svg"
                    alt="Connect with Supabase"
                    className="h-8 block dark:hidden"
                  />
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle>Connect to Supabase</DialogTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={prefillFromEnv}
                      disabled={isPrefilling}
                      className="gap-1.5 text-xs h-7"
                    >
                      {isPrefilling ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <FileText className="size-3" />
                      )}
                      Prefill from .env
                    </Button>
                  </div>
                  <DialogDescription>
                    Enter your Supabase project credentials to get started
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                  {createError && (
                    <Alert variant="destructive">
                      <AlertDescription>{createError}</AlertDescription>
                    </Alert>
                  )}

                  {/* OAuth project picker — shown after successful auth with multiple projects */}
                  {oauthProjects ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">Select a project to connect:</p>
                      {oauthProjects.map((p) => (
                        <Button
                          key={p.ref}
                          variant="outline"
                          className="justify-start gap-2 h-auto py-2.5"
                          disabled={isOAuthConnecting}
                          onClick={() =>
                            applyOAuthProject(
                              p,
                              oauthAccessToken ?? '',
                              oauthRefreshToken ?? undefined
                            )
                          }
                        >
                          {isOAuthConnecting ? (
                            <Loader2 className="size-3.5 shrink-0 animate-spin" />
                          ) : (
                            <Database className="size-3.5 shrink-0" />
                          )}
                          <div className="text-left">
                            <div className="text-sm font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.ref} · {p.region}
                            </div>
                          </div>
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1"
                        onClick={() => {
                          setOauthProjects(null)
                          setOauthAccessToken(null)
                        }}
                      >
                        ← Back
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Primary: OAuth */}
                      <button
                        onClick={connectWithOAuth}
                        disabled={isOAuthConnecting}
                        className="flex items-center justify-center w-full disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Connect with Supabase"
                      >
                        {isOAuthConnecting ? (
                          <div className="flex items-center gap-2 h-10 px-4 rounded-md border border-border text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            Connecting…
                          </div>
                        ) : (
                          <>
                            <img
                              src="/connect-supabase-dark.svg"
                              alt="Connect with Supabase"
                              className="h-10 hidden dark:block"
                            />
                            <img
                              src="/connect-supabase-light.svg"
                              alt="Connect with Supabase"
                              className="h-10 block dark:hidden"
                            />
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground">or enter manually</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      {/* Fallback: manual form */}
                      <div className="flex flex-col gap-1.5">
                        <Label>Connection Name</Label>
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="My Project"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Supabase URL</Label>
                        <Input
                          value={newUrl}
                          onChange={(e) => setNewUrl(e.target.value)}
                          placeholder="https://yourproject.supabase.co"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Publishable Key</Label>
                        <Input
                          value={newAnonKey}
                          onChange={(e) => setNewAnonKey(e.target.value)}
                          placeholder="sb_publishable_..."
                          type="password"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <Label>Secret Key</Label>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            Local only
                          </span>
                        </div>
                        <Input
                          value={newServiceRoleKey}
                          onChange={(e) => setNewServiceRoleKey(e.target.value)}
                          placeholder="Bypasses RLS — use with caution"
                          type="password"
                        />
                      </div>
                      <Button onClick={createConnection} disabled={isCreating}>
                        {isCreating ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Plug className="mr-2 size-4" />
                        )}
                        Connect
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Onboarding tip banner */}
      {showTipBanner && !activeConnectionId && connections.length === 0 && (
        <div className="bg-muted/40 border-b">
          <div className="container mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Lightbulb className="size-4 shrink-0" />
              <span className="text-sm">
                Tip: Click &apos;Try Demo&apos; to explore with sample data, or connect your
                Supabase project.
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissTipBanner}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Demo mode banner */}
      {isDemoMode && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b">
          <div className="container mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Eye className="size-4" />
              <span className="text-sm font-medium">Demo Mode</span>
              <span className="text-xs text-amber-600 dark:text-amber-500">
                — Viewing sample data. Connect to a real project for live data.
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveConnectionId(null)}
              className="h-7 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300"
            >
              Exit Demo
            </Button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto min-h-0 container mx-auto px-4 py-4">
        {!activeConnectionId ? (
          /* Welcome / empty state with animated gradient background */
          <div className="relative flex flex-col items-center justify-center py-12 sm:py-20 text-center overflow-hidden animated-gradient-bg">
            {/* Grid pattern overlay */}
            <div className="absolute inset-0 -z-10 grid-pattern opacity-50" />

            {/* Decorative gradient blobs */}
            <div className="absolute inset-0 -z-10 overflow-hidden">
              <div className="absolute top-1/4 left-1/4 size-96 rounded-full bg-primary/5 blur-3xl" />
              <div className="absolute bottom-1/4 right-1/4 size-96 rounded-full bg-red-500/5 blur-3xl" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[600px] rounded-full bg-emerald-500/3 blur-3xl" />
            </div>

            {/* Floating decorative elements */}
            <div className="absolute inset-0 -z-5 overflow-hidden pointer-events-none">
              <div className="absolute top-[15%] left-[8%] float-animation opacity-[0.07] dark:opacity-[0.05]">
                <Shield className="size-8 text-foreground" />
              </div>
              <div className="absolute top-[25%] right-[12%] float-animation-delay-1 opacity-[0.07] dark:opacity-[0.05]">
                <Database className="size-10 text-foreground" />
              </div>
              <div className="absolute bottom-[20%] left-[15%] float-animation-delay-2 opacity-[0.07] dark:opacity-[0.05]">
                <Key className="size-7 text-foreground" />
              </div>
              <div className="absolute bottom-[30%] right-[8%] float-animation-delay-3 opacity-[0.07] dark:opacity-[0.05]">
                <Server className="size-9 text-foreground" />
              </div>
              <div className="absolute top-[50%] left-[5%] float-animation-delay-1 opacity-[0.05] dark:opacity-[0.04]">
                <GitFork className="size-6 text-foreground" />
              </div>
              <div className="absolute top-[10%] right-[30%] float-animation-delay-2 opacity-[0.05] dark:opacity-[0.04]">
                <ShieldAlert className="size-7 text-red-500" />
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative mb-6"
            >
              <div className="size-20 rounded-2xl bg-muted flex items-center justify-center ring-1 ring-border shadow-lg overflow-hidden p-3">
                <AppLogo className="w-full h-full" />
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 20 }}
                className="absolute -bottom-1 -right-1 size-7 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/40"
              >
                <Zap className="size-3.5 text-primary-foreground" />
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="mb-3"
            >
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight font-display">
                Supabase devtools,
                <br />
                in your browser.
              </h2>
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.4 }}
              className="text-sm sm:text-base text-muted-foreground mb-8 max-w-sm leading-relaxed px-2"
            >
              Schema maps, RLS audits, SQL runner, realtime monitor, and AI data catalog.
              Connect your project or try the demo.
            </motion.p>

            {connections.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45, duration: 0.3 }}
                className="w-full max-w-lg"
              >
                <div className="flex items-center justify-between mb-3 w-full">
                  <p className="text-sm font-semibold text-foreground">Your connections</p>
                  {connections.some((c) => connectionHealthMap[c.id] === 'unhealthy') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const unhealthyConns = connections.filter(
                          (c) => connectionHealthMap[c.id] === 'unhealthy'
                        )
                        if (unhealthyConns.length === 0) return
                        if (
                          window.confirm(
                            `Are you sure you want to delete all ${unhealthyConns.length} broken/unauthorized connections?`
                          )
                        ) {
                          unhealthyConns.forEach((c) => {
                            deleteConnection(c.id)
                          })
                        }
                      }}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 gap-1 animate-fade-in"
                    >
                      <Trash2 className="size-3" />
                      Prune broken connections
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 justify-center mb-6">
                  {connections.map((c, i) => {
                    const status = connectionHealthMap[c.id] ?? 'checking'
                    return (
                      /* biome-ignore lint/a11y/useSemanticElements: entity-card is a complex styled interactive block element */
                      <div
                        key={c.id}
                        className="entity-card"
                        style={
                          {
                            '--card-accent': `var(--accent-${['cyan', 'blue', 'purple', 'green', 'orange', 'coral'][i % 6]})`,
                            position: 'relative',
                          } as React.CSSProperties
                        }
                        onClick={() => setActiveConnectionId(c.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveConnectionId(c.id)}
                      >
                        {getHealthDot(c.id)}
                        <div className="entity-card__tags">
                          <span className="tag--solid">{c.name}</span>
                          <span
                            className={`tag--solid uppercase text-[9px] px-1.5 py-0.5 rounded ${
                              status === 'healthy'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : status === 'degraded'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : status === 'unhealthy'
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    : 'bg-zinc-500/10 text-zinc-400'
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                        <div className="entity-card__icon">
                          <Database size={28} />
                        </div>
                        <div className="entity-card__details">
                          <div className="entity-card__title">{c.name}</div>
                          <div className="entity-card__meta">
                            <span className="host">{c.supabaseUrl.replace('https://', '')}</span>
                          </div>
                        </div>
                        {c.id !== DEMO_CONNECTION_ID && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (
                                window.confirm(
                                  `Are you sure you want to delete connection "${c.name}"?`
                                )
                              ) {
                                deleteConnection(c.id)
                              }
                            }}
                            className="absolute bottom-3 right-3 p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-rose-400 transition-colors z-10"
                            title="Delete connection"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="size-4" />
                        Add new connection
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadDemoData}
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <Eye className="size-4" />
                    Try Demo
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45, duration: 0.3 }}
                className="flex flex-col sm:flex-row items-center gap-3"
              >
                <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
                  <DialogTrigger asChild>
                    <Button
                      size="lg"
                      className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow"
                    >
                      <Plus className="size-5" />
                      Connect to Supabase
                    </Button>
                  </DialogTrigger>
                </Dialog>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={loadDemoData}
                  className="gap-2 transition-all hover:shadow-md hover:border-primary/50"
                >
                  <Eye className="size-5" />
                  Try Demo
                </Button>
              </motion.div>
            )}

            {/* Feature cards with staggered entrance */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl w-full">
              <FeatureCard
                icon={<LayoutDashboard className="size-4.5" />}
                title="Project Dashboard"
                description="Live overview with latency heatmaps, security scoring, and index analysis — all pulled from Management API and PostgREST in real time."
                delay={0.55}
                index={0}
              />
              <FeatureCard
                icon={<GitFork className="size-4.5" />}
                title="Schema Visualizer"
                description="Interactive ER diagrams built with React Flow and dagre auto-layout. Click any table to trace foreign key relationships across the graph."
                delay={0.55}
                index={1}
              />
              <FeatureCard
                icon={<ShieldAlert className="size-4.5" />}
                title="RLS Inspector"
                description="Full security audit with at-a-glance RLS status. Spot unprotected tables instantly and review every policy definition inline."
                delay={0.55}
                index={2}
              />
              <FeatureCard
                icon={<Terminal className="size-4.5" />}
                title="SQL Runner"
                description="In-browser SQL editor with syntax highlighting, query history, and CSV/JSON export. Runs directly against PostgREST with service-role bypass."
                delay={0.55}
                index={3}
              />
              <FeatureCard
                icon={<Zap className="size-4.5" />}
                title="Edge Functions"
                description="Browse, invoke, and debug Supabase Edge Functions from the UI with live request/response logs and custom payload editing."
                delay={0.55}
                index={4}
              />
              <FeatureCard
                icon={<HardDrive className="size-4.5" />}
                title="Storage Browser"
                description="Navigate buckets, folders, and files. Preview Parquet files using DuckDB compiled to WASM — zero server round-trips."
                delay={0.55}
                index={5}
              />
              <FeatureCard
                icon={<BookOpen className="size-4.5" />}
                title="Data Catalog"
                description="Auto-profile every table and generate human-readable documentation via LLM. Stores descriptions back to your project catalog."
                delay={0.55}
                index={6}
              />
              <FeatureCard
                icon={<Layers className="size-4.5" />}
                title="Iceberg"
                description="Query Apache Iceberg tables entirely in the browser via DuckDB WASM. Connects to S3-compatible storage with no backend required."
                delay={0.55}
                index={7}
              />
              <FeatureCard
                icon={<Activity className="size-4.5" />}
                title="Realtime Traces"
                description="Live trace monitoring with OpenTelemetry integration. Watch agent execution steps, latency breakdowns, and skill coverage in real time."
                delay={0.55}
                index={8}
              />
            </div>
          </div>
        ) : (
          /* Connected: show tabs layout */
          <Tabs
            value={activePanel}
            onValueChange={(val) => setActivePanel(val as ActivePanel)}
            className="w-full"
          >
            <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 -mx-4 px-4 py-2 border-b border-border/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="w-full overflow-x-auto scrollbar-none">
                  <TabsList className="flex w-max min-w-full sm:min-w-0 sm:w-auto">
                    <TabsTrigger
                      value="dashboard"
                      className="gap-1.5 transition-all duration-200 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      title="Dashboard"
                    >
                      <LayoutDashboard className="size-3.5" />
                      <span className="hidden sm:inline">Dashboard</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="schema"
                      className="gap-1.5 transition-all duration-200 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      title="Schema"
                    >
                      <GitFork className="size-3.5" />
                      <span className="hidden sm:inline">Schema</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="rls"
                      className="gap-1.5 transition-all duration-200 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      title="Row Level Security"
                    >
                      <Shield className="size-3.5" />
                      <span className="hidden sm:inline">RLS</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="edge-functions"
                      className="gap-1.5 transition-all duration-200 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      title="Edge Functions"
                    >
                      <Zap className="size-3.5" />
                      <span className="hidden sm:inline">Functions</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="sql"
                      className="gap-1.5 transition-all duration-200 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      title="SQL Editor"
                    >
                      <Terminal className="size-3.5" />
                      <span className="hidden sm:inline">SQL</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="storage"
                      className="gap-1.5 transition-all duration-200 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      title="Storage"
                    >
                      <HardDrive className="size-3.5" />
                      <span className="hidden sm:inline">Storage</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="catalog"
                      className="gap-1.5 transition-all duration-200 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      title="Data Catalog"
                    >
                      <BookOpen className="size-3.5" />
                      <span className="hidden sm:inline">Catalog</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="traces"
                      className="gap-1.5 transition-all duration-200 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      title="Traces"
                    >
                      <Activity className="size-3.5" />
                      <span className="hidden sm:inline">Traces</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="iceberg"
                      className="gap-1.5 transition-all duration-200 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      title="Analytics"
                    >
                      <Layers className="size-3.5" />
                      <span className="hidden sm:inline">Iceberg</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="settings"
                      className="gap-1.5 transition-all duration-200 data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      title="Settings"
                    >
                      <Settings className="size-3.5" />
                      <span className="hidden sm:inline">Settings</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Schema tab actions */}
                {activePanel === 'schema' && (
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActivePanel('settings')}
                            disabled={!activeConnectionId || tables.length === 0}
                            className="gap-1.5"
                          >
                            <Camera className="size-3.5" />
                            <span className="inline">Snapshot</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Take a schema snapshot</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchSchemaAndRLS}
                      disabled={isLoadingSchema}
                      className="gap-1.5"
                    >
                      {isLoadingSchema ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      Refresh
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Dashboard Tab */}
            <TabsContent
              value="dashboard"
              className="mt-0"
              forceMount={activePanel === 'dashboard' ? true : undefined}
            >
              <AnimatePresence mode="wait">
                {activePanel === 'dashboard' && (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <ProjectDashboard />
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>

            {/* Schema Tab */}
            <TabsContent
              value="schema"
              className="mt-0"
              forceMount={activePanel === 'schema' ? true : undefined}
            >
              <AnimatePresence mode="wait">
                {activePanel === 'schema' && (
                  <motion.div
                    key="schema"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    {schemaError && (
                      <Alert variant="destructive" className="mb-4">
                        <AlertDescription>{schemaError}</AlertDescription>
                      </Alert>
                    )}

                    {/* Limited mode banner when RLS status is unknown */}
                    {rlsStatuses.some((r) => r.rlsUnknown) && (
                      <Alert className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                        <Info className="size-4 text-amber-600 dark:text-amber-400" />
                        <AlertDescription className="text-amber-700 dark:text-amber-300">
                          <span className="font-medium">Limited schema info:</span> RLS status could
                          not be determined without a management API token. Tables are shown with
                          amber <span className="font-semibold">RLS ?</span> badges. Add a Supabase
                          management API token in Settings for full RLS policy information.
                        </AlertDescription>
                      </Alert>
                    )}

                    {isLoadingSchema ? (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <Skeleton className="h-6 w-24" />
                          <Skeleton className="h-6 w-28" />
                          <Skeleton className="h-6 w-20" />
                        </div>
                        <div className="flex gap-4 min-h-[600px]">
                          <Skeleton className="flex-1 rounded-lg" />
                        </div>
                      </div>
                    ) : tables.length === 0 ? (
                      /* Enhanced empty state when connected but no data */
                      <Card>
                        <CardContent className="py-16">
                          <div className="flex flex-col items-center justify-center text-center space-y-5">
                            {/* Visual illustration */}
                            <div className="relative">
                              <div className="size-20 rounded-2xl bg-muted flex items-center justify-center ring-4 ring-border/40">
                                <GitFork className="size-10 text-muted-foreground/50" />
                              </div>
                              <div className="absolute -bottom-1 -right-1 size-7 rounded-full bg-muted flex items-center justify-center border">
                                <Database className="size-3.5 text-muted-foreground" />
                              </div>
                            </div>
                            <div className="space-y-2 max-w-md">
                              <p className="text-lg font-medium">Your schema will appear here</p>
                              <p className="text-sm text-muted-foreground">
                                {activeConnection
                                  ? `Connected to "${activeConnection.name}" but no tables were found. This could mean the public schema is empty or there was a connection issue.`
                                  : 'Connect to a Supabase project and fetch the schema to visualize your database.'}
                              </p>
                            </div>
                            {activeConnectionId && (
                              <div className="flex items-center gap-2">
                                <Button
                                  onClick={fetchSchemaAndRLS}
                                  disabled={isLoadingSchema}
                                  className="gap-2"
                                >
                                  {isLoadingSchema ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="size-4" />
                                  )}
                                  Retry
                                </Button>
                                <Button variant="outline" onClick={loadDemoData} className="gap-2">
                                  <Eye className="size-4" />
                                  Try Demo
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {/* Stats bar - badges are clickable */}
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge
                            variant="outline"
                            className="gap-1 cursor-pointer hover:bg-accent transition-colors"
                            onClick={() => {
                              setFilterType('all')
                              setSearchQuery('')
                            }}
                          >
                            <Database className="size-3" />
                            {tableCount} table{tableCount !== 1 ? 's' : ''}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="gap-1 text-emerald-600 border-emerald-200 cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                            onClick={() =>
                              setFilterType(filterType === 'rls-enabled' ? 'all' : 'rls-enabled')
                            }
                          >
                            <ShieldCheck className="size-3" />
                            {rlsEnabledCount} RLS enabled
                          </Badge>
                          {rlsDisabledCount > 0 && (
                            <Badge
                              variant="destructive"
                              className="gap-1 cursor-pointer hover:bg-destructive/90 transition-colors"
                              onClick={() =>
                                setFilterType(filterType === 'no-rls' ? 'all' : 'no-rls')
                              }
                            >
                              <ShieldAlert className="size-3" />
                              {rlsDisabledCount} no RLS
                            </Badge>
                          )}
                          <Badge
                            variant="secondary"
                            className="gap-1 cursor-pointer hover:bg-secondary/80 transition-colors"
                            onClick={() =>
                              setFilterType(
                                filterType === 'with-policies' ? 'all' : 'with-policies'
                              )
                            }
                          >
                            {totalPolicies} polic{totalPolicies !== 1 ? 'ies' : 'y'}
                          </Badge>
                        </div>

                        {/* Search & Filter bar */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <Input
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search tables..."
                              className="pl-9 h-9"
                            />
                          </div>
                          <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger className="w-full sm:w-[180px] h-9">
                              <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Tables</SelectItem>
                              <SelectItem value="rls-enabled">RLS Enabled</SelectItem>
                              <SelectItem value="no-rls">No RLS</SelectItem>
                              <SelectItem value="with-policies">With Policies</SelectItem>
                              <SelectItem value="without-policies">Without Policies</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground whitespace-nowrap self-center">
                            {filteredCount} of {tableCount} table{tableCount !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Diagram + side panel */}
                        <div className="flex flex-col lg:flex-row gap-4 h-[600px] min-h-[600px]">
                          {/* Diagram area */}
                          <div className="flex-1 border border-border rounded-xl overflow-hidden bg-card shadow-sm relative h-full">
                            {filteredTables.length > 0 ? (
                              <SchemaDiagram
                                tables={filteredTables}
                                rlsStatuses={filteredRlsStatuses}
                                selectedTable={selectedTable}
                                onSelectTable={setSelectedTable}
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full min-h-[400px] text-muted-foreground">
                                <div className="text-center space-y-3">
                                  <Search className="size-10 mx-auto text-muted-foreground/40" />
                                  <p className="text-sm font-medium">No tables match your filter</p>
                                  <p className="text-xs text-muted-foreground">
                                    Try adjusting the search or filter criteria
                                  </p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSearchQuery('')
                                      setFilterType('all')
                                    }}
                                  >
                                    Clear Filters
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Legend overlay */}
                            <div className="absolute bottom-3 left-3 bg-background/90 dark:bg-background/80 backdrop-blur-sm border rounded-lg p-3 shadow-lg z-10 text-xs space-y-2">
                              <div className="flex items-center gap-1.5 font-medium text-muted-foreground uppercase tracking-wide text-[10px] mb-1.5">
                                <Info className="size-3" />
                                Legend
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="size-4 rounded border border-brand/30 shadow-sm shadow-emerald-200/60 dark:shadow-emerald-900/40 bg-background shrink-0" />
                                <span>RLS on + policies</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="size-4 rounded border border-amber-400/30 shadow-sm shadow-amber-200/60 dark:shadow-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 shrink-0" />
                                <span>
                                  RLS on, <span className="text-amber-500">no policies</span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="size-4 rounded border border-red-400/30 shadow-sm shadow-red-200/60 dark:shadow-red-900/40 bg-red-50/40 dark:bg-red-950/10 shrink-0" />
                                <span>
                                  No RLS <span className="text-red-500">(Security Risk)</span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-4 h-0.5 bg-emerald-500 shrink-0" />
                                <span>FK from RLS table</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-4 h-0.5 bg-red-500 shrink-0 relative">
                                  <span className="absolute inset-0 animate-pulse bg-red-400" />
                                </span>
                                <span>FK from no-RLS table</span>
                              </div>
                            </div>
                          </div>

                          {/* Side panel - table details */}
                          {selectedTable && selectedTableInfo && (
                            <motion.div
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.2 }}
                              className="w-full lg:w-[420px] shrink-0 border rounded-lg overflow-hidden h-full"
                            >
                              <ScrollArea className="h-full">
                                <TableDetailPanel
                                  tableName={selectedTable}
                                  schema={selectedTableInfo.schema}
                                  rlsInfo={selectedTableInfo.rls}
                                  onClose={() => setSelectedTable(null)}
                                  onViewData={() => {
                                    setDataViewerTable(selectedTable)
                                    setDataViewerOpen(true)
                                  }}
                                  onTestRLS={() => {
                                    setActivePanel('rls')
                                  }}
                                  onGeneratePolicy={() => {
                                    setActivePanel('rls')
                                  }}
                                  onNavigateToTable={(targetTable: string) => {
                                    setSelectedTable(targetTable)
                                  }}
                                />
                              </ScrollArea>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>

            <TabsContent
              value="rls"
              className="mt-0"
              forceMount={activePanel === 'rls' ? true : undefined}
            >
              <AnimatePresence mode="wait">
                {activePanel === 'rls' && (
                  <motion.div
                    key="rls"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <RLSPanel initialTable={selectedTable ?? undefined} />
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>

            <TabsContent
              value="edge-functions"
              className="mt-0"
              forceMount={activePanel === 'edge-functions' ? true : undefined}
            >
              <AnimatePresence mode="wait">
                {activePanel === 'edge-functions' && (
                  <motion.div
                    key="edge-functions"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <EdgeFunctionsPanel />
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>

            <TabsContent
              value="sql"
              className="mt-0"
              forceMount={activePanel === 'sql' ? true : undefined}
            >
              <AnimatePresence mode="wait">
                {activePanel === 'sql' && (
                  <motion.div
                    key="sql"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <SQLPanel />
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>

            <TabsContent
              value="storage"
              className="mt-0"
              forceMount={activePanel === 'storage' ? true : undefined}
            >
              <AnimatePresence mode="wait">
                {activePanel === 'storage' && (
                  <motion.div
                    key="storage"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <StorageBrowser connection={activeConnection || null} isDemoMode={isDemoMode} />
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>

            {/* Data Catalog Tab */}
            <TabsContent
              value="catalog"
              className="mt-0"
              forceMount={activePanel === 'catalog' ? true : undefined}
            >
              <AnimatePresence mode="wait">
                {activePanel === 'catalog' && (
                  <motion.div
                    key="catalog"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <DataCatalogPanel
                      connection={activeConnection || null}
                      isDemoMode={isDemoMode}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>

            <TabsContent
              value="iceberg"
              className="mt-0 h-[calc(100vh-120px)]"
              forceMount
            >
              <div className="h-full" style={{ display: activePanel === 'iceberg' ? undefined : 'none' }}>
                <AnalyticsPanel connection={activeConnection || null} isDemoMode={isDemoMode} />
              </div>
            </TabsContent>

            <TabsContent
              value="traces"
              className="mt-0"
              forceMount={activePanel === 'traces' ? true : undefined}
            >
              <AnimatePresence mode="wait">
                {activePanel === 'traces' && (
                  <motion.div
                    key="traces"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <TracePanel connection={activeConnection || null} isDemoMode={isDemoMode} />
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>

            <TabsContent
              value="settings"
              className="mt-0"
              forceMount={activePanel === 'settings' ? true : undefined}
            >
              <AnimatePresence mode="wait">
                {activePanel === 'settings' && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    {activeConnection ? (
                      <SettingsPanel
                        connection={activeConnection}
                        isDemoMode={isDemoMode}
                        onDelete={() => {
                          deleteConnection(activeConnection.id)
                        }}
                        onReset={reset}
                      />
                    ) : (
                      <Card>
                        <CardContent className="py-16">
                          <div className="flex flex-col items-center justify-center text-center space-y-3">
                            <Settings className="size-10 text-muted-foreground/40" />
                            <p className="text-lg font-medium">No connection selected</p>
                            <p className="text-sm text-muted-foreground">
                              Select or create a connection to view settings.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* Data Viewer Sheet */}
      <Sheet open={dataViewerOpen} onOpenChange={setDataViewerOpen}>
        <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <TableIcon className="size-5 text-muted-foreground" />
              <span className="font-mono">{dataViewerTable}</span>
              <span className="text-sm font-normal text-muted-foreground">Row Data</span>
            </SheetTitle>
            <SheetDescription>
              Browse the row data for this table. {isDemoMode && 'Showing demo data.'}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <TableDataViewer
              connection={activeConnection || null}
              tableName={dataViewerTable}
              isDemoMode={isDemoMode}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcuts />
      <CommandPalette />

      {/* Footer */}
    </div>
  )
}

/* ─── Feature Card ─── */

function FeatureCard({
  icon,
  title,
  description,
  delay,
  index,
}: {
  icon: React.ReactNode
  title: string
  description: string
  delay: number
  index?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: delay + (index ?? 0) * 0.06,
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="group rounded-xl border bg-card p-5 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-1 hover:border-primary/30 cursor-default"
    >
      <div className="mb-3 size-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:bg-muted/80 transition-colors">
        {icon}
      </div>
      <h3 className="text-sm font-semibold mb-1.5">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  )
}

/* ─── Column Type Color Helper ─── */

function getColumnTypeColor(type: string): string {
  switch (type) {
    case 'uuid':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
    case 'text':
    case 'character varying':
    case 'varchar':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
    case 'timestamptz':
    case 'timestamp':
    case 'date':
    case 'time':
    case 'timetz':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
    case 'boolean':
    case 'bool':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400'
    case 'integer':
    case 'bigint':
    case 'numeric':
    case 'smallint':
    case 'real':
    case 'double precision':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400'
    case 'jsonb':
    case 'json':
      return 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/* ─── Table Detail Side Panel ─── */

function TableDetailPanel({
  tableName,
  schema,
  rlsInfo,
  onClose,
  onViewData,
  onTestRLS,
  onGeneratePolicy,
  onNavigateToTable,
}: {
  tableName: string
  schema: { tableName: string; columns: ColumnInfo[]; foreignKeys: ForeignKeyInfo[] } | undefined
  rlsInfo: TableRLSInfo | undefined
  onClose: () => void
  onViewData: () => void
  onTestRLS: () => void
  onGeneratePolicy: () => void
  onNavigateToTable: (tableName: string) => void
}) {
  const rlsEnabled = rlsInfo?.rlsEnabled ?? false
  const policies = rlsInfo?.policies ?? []

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${rlsEnabled ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}
      >
        <div className="flex items-center gap-2">
          {rlsEnabled ? (
            <ShieldCheck className="size-4 text-emerald-500" />
          ) : (
            <ShieldAlert className="size-4 text-red-500" />
          )}
          <span className="font-mono text-sm font-bold">{tableName}</span>
          <Badge
            variant={rlsEnabled ? 'default' : 'destructive'}
            className="text-[9px] px-1.5 py-0"
          >
            {rlsEnabled ? 'RLS ON' : 'RLS OFF'}
          </Badge>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-3 border-b">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Quick Actions
        </h4>
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewData}
            className="w-full gap-2 justify-start"
          >
            <TableIcon className="size-3.5" />
            View Data
          </Button>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onTestRLS}
              className="flex-1 gap-2 justify-start"
            >
              <Shield className="size-3.5" />
              Test RLS
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onGeneratePolicy}
              className="flex-1 gap-2 justify-start"
            >
              <ShieldCheck className="size-3.5" />
              Gen Policy
            </Button>
          </div>
        </div>
      </div>

      {/* Columns */}
      {schema && (
        <div className="px-4 py-3 border-b">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Columns ({schema.columns.length})
          </h4>
          <div className="flex flex-col gap-1.5">
            {schema.columns.map((col) => {
              const fkForCol = schema.foreignKeys.find((fk) => fk.column_name === col.column_name)
              const isPk = col.column_name === 'id' || col.column_default?.includes('nextval')
              const isNullable = col.is_nullable === 'YES'

              return (
                <div
                  key={`${tableName}-${col.column_name}`}
                  className="flex flex-col gap-0.5 text-xs py-1"
                >
                  <div className="flex items-center gap-1.5">
                    {/* PK / FK icon */}
                    <span className="w-4 h-4 flex items-center justify-center shrink-0">
                      {isPk && <Key className="w-3 h-3 text-amber-500" />}
                      {fkForCol && !isPk && <Link2 className="w-3 h-3 text-blue-500" />}
                    </span>
                    <span className="font-mono font-medium truncate">{col.column_name}</span>
                    {/* Data type badge */}
                    <span
                      className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0 max-w-[120px] truncate ${getColumnTypeColor(col.data_type)}`}
                      title={col.data_type}
                    >
                      {col.data_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-[22px]">
                    {/* Nullable indicator */}
                    {isNullable && (
                      <span className="text-[9px] font-medium px-1 py-0 rounded bg-muted text-muted-foreground">
                        NULL
                      </span>
                    )}
                    {/* Default value */}
                    {col.column_default && !col.column_default.includes('nextval') && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        ={' '}
                        <code className="bg-muted px-1 rounded font-mono">
                          {col.column_default}
                        </code>
                      </span>
                    )}
                    {/* FK target link */}
                    {fkForCol && (
                      <button
                        type="button"
                        onClick={() => onNavigateToTable(fkForCol.foreign_table_name)}
                        className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline text-[10px] ml-auto shrink-0"
                      >
                        <ArrowUpRight className="size-2.5" />
                        {fkForCol.foreign_table_name}.{fkForCol.foreign_column_name}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* RLS Policies */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            RLS Policies ({policies.length})
          </h4>
          {!rlsEnabled && (
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0 gap-1">
              <ShieldAlert className="size-2.5" />
              Not Protected
            </Badge>
          )}
        </div>
        {policies.length === 0 ? (
          <div className="text-center py-3">
            {rlsEnabled ? (
              <>
                <ShieldAlert className="size-6 text-amber-500 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">RLS enabled but no policies defined</p>
                <p className="text-xs text-amber-600">All access will be denied!</p>
              </>
            ) : (
              <>
                <ShieldAlert className="size-6 text-red-500 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">No RLS policies</p>
                <p className="text-xs text-red-600">Table is fully exposed!</p>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {policies.map((policy: RLSPolicy) => (
              <div key={policy.policyname} className="rounded border p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-mono text-xs font-medium">{policy.policyname}</span>
                  <Badge
                    variant={policy.cmd === 'ALL' ? 'default' : 'outline'}
                    className="text-[9px] px-1 py-0"
                  >
                    {policy.cmd}
                  </Badge>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {policy.permissive === 'PERMISSIVE' ? '✓ Permissive' : '✗ Restrictive'}
                  {' · '}
                  Roles: {policy.roles}
                </div>
                {policy.qual && (
                  <div className="mt-1 text-[10px]">
                    <span className="text-muted-foreground">USING: </span>
                    <code className="rounded bg-muted px-1 font-mono">{policy.qual}</code>
                  </div>
                )}
                {policy.with_check && (
                  <div className="mt-0.5 text-[10px]">
                    <span className="text-muted-foreground">CHECK: </span>
                    <code className="rounded bg-muted px-1 font-mono">{policy.with_check}</code>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Foreign Keys */}
      {schema && schema.foreignKeys.length > 0 && (
        <div className="px-4 py-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Foreign Keys ({schema.foreignKeys.length})
          </h4>
          <div className="flex flex-col gap-1.5">
            {schema.foreignKeys.map((fk) => (
              <button
                type="button"
                key={`${fk.column_name}-${fk.foreign_table_name}`}
                onClick={() => onNavigateToTable(fk.foreign_table_name)}
                className="flex items-center gap-1.5 text-xs rounded border p-1.5 hover:bg-accent transition-colors text-left w-full"
              >
                <Link2 className="size-3 text-blue-500 shrink-0" />
                <span className="font-mono">{fk.column_name}</span>
                <ArrowUpRight className="size-3 text-muted-foreground shrink-0" />
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  {fk.foreign_table_name}.{fk.foreign_column_name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Health Check Types ─── */

interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
}

interface HealthCheckResult {
  urlReachable: boolean
  publishableKeyValid: boolean
  accessTokenValid: boolean
  secretKeyValid: boolean
  projectRef: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  checks: HealthCheck[]
}

/* ─── Settings Panel ─── */

function SettingsPanel({
  connection,
  isDemoMode,
  onDelete,
  onReset,
}: {
  connection?: SupabaseConnection | null
  isDemoMode: boolean
  onDelete: () => void
  onReset: () => void
}) {
  const { updateConnection } = useSupabaseStore()
  const [name, setName] = useState(connection?.name || '')
  const [supabaseUrl, setSupabaseUrl] = useState(connection?.supabaseUrl || '')
  const [publishableKey, setPublishableKey] = useState(connection?.anonKey || '')
  const [secretKey, setSecretKey] = useState(connection?.serviceRoleKey || '')
  const [accessToken, _setAccessToken] = useState(connection?.accessToken || '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Health check state
  const [isRunningHealthCheck, setIsRunningHealthCheck] = useState(false)
  const [healthCheckResult, setHealthCheckResult] = useState<HealthCheckResult | null>(null)
  const [healthCheckError, setHealthCheckError] = useState<string | null>(null)

  const saveSettings = useCallback(async () => {
    if (isDemoMode || !connection?.id) return
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      // Validate URL format
      try {
        new URL(supabaseUrl.trim())
      } catch {
        setSaveError('Invalid Supabase URL format')
        setIsSaving(false)
        return
      }
      // accessToken is intentionally not written here — it is managed by the
      // OAuth flow (and auto-refresh) and the dialog's snapshot may be stale.
      updateConnection(connection.id, {
        name: name.trim(),
        supabaseUrl: supabaseUrl.trim(),
        anonKey: publishableKey.trim(),
        serviceRoleKey: secretKey.trim() || null,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setSaveError('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }, [
    connection?.id,
    name,
    supabaseUrl,
    publishableKey,
    secretKey,
    accessToken,
    isDemoMode,
    updateConnection,
  ])

  const runHealthCheck = useCallback(async () => {
    if (isDemoMode) {
      // Return simulated health check for demo mode
      setHealthCheckResult({
        urlReachable: true,
        publishableKeyValid: true,
        accessTokenValid: true,
        secretKeyValid: true,
        projectRef: 'demo-project',
        status: 'healthy',
        checks: [
          { name: 'Supabase URL', status: 'pass', message: 'URL is reachable (demo)' },
          { name: 'Publishable Key', status: 'pass', message: 'Publishable key is valid (demo)' },
          { name: 'Secret Key', status: 'pass', message: 'Secret key is valid (demo)' },
        ],
      })
      return
    }
    if (!connection) return
    setIsRunningHealthCheck(true)
    setHealthCheckError(null)
    try {
      const res = await apiFetch(`/api/connections/${connection.id}/health`, connection)
      const data = await res.json()
      if (data.error) {
        setHealthCheckError(data.error)
      } else {
        setHealthCheckResult(data)
      }
    } catch {
      setHealthCheckError('Failed to run health check')
    } finally {
      setIsRunningHealthCheck(false)
    }
  }, [connection, isDemoMode])

  const getStatusBadge = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    switch (status) {
      case 'healthy':
        return (
          <Badge className="gap-1 bg-emerald-500 hover:bg-emerald-600">
            <CheckCircle2 className="size-3" />
            Healthy
          </Badge>
        )
      case 'degraded':
        return (
          <Badge className="gap-1 bg-amber-500 hover:bg-amber-600">
            <AlertTriangle className="size-3" />
            Degraded
          </Badge>
        )
      case 'unhealthy':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="size-3" />
            Unhealthy
          </Badge>
        )
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      {/* Demo mode notice */}
      {isDemoMode && (
        <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <Eye className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            You are in Demo Mode. Settings are read-only. Connect to a real Supabase project to edit
            credentials.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="size-5 text-muted-foreground" />
            <CardTitle>Connection Settings</CardTitle>
          </div>
          <CardDescription>Update your Supabase connection credentials</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            {saveSuccess && (
              <Alert>
                <CheckCircle2 className="size-4 text-emerald-500" />
                <AlertDescription>Settings saved successfully</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Connection Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isDemoMode} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Supabase URL</Label>
              <Input
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                disabled={isDemoMode}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Publishable Key</Label>
              <Input
                value={publishableKey}
                onChange={(e) => setPublishableKey(e.target.value)}
                type="password"
                placeholder="sb_publishable_..."
                disabled={isDemoMode}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Secret Key</Label>
              <Input
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                type="password"
                placeholder="Optional — bypasses RLS"
                disabled={isDemoMode}
              />
            </div>
            {!isDemoMode && (
              <div className="flex items-center gap-3 pt-2">
                <Button onClick={saveSettings} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Health Check Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HeartPulse className="size-5 text-muted-foreground" />
            <CardTitle>Connection Health Check</CardTitle>
          </div>
          <CardDescription>
            Verify your Supabase connection credentials are valid and reachable
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Button
              onClick={runHealthCheck}
              disabled={isRunningHealthCheck}
              size="sm"
              className="w-fit"
            >
              {isRunningHealthCheck ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <HeartPulse className="mr-2 size-4" />
              )}
              Run Health Check
            </Button>

            {healthCheckError && (
              <Alert variant="destructive">
                <AlertDescription>{healthCheckError}</AlertDescription>
              </Alert>
            )}

            {healthCheckResult && (
              <div className="flex flex-col gap-3">
                {/* Overall status */}
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm font-medium">Overall Status</span>
                  {getStatusBadge(healthCheckResult.status)}
                </div>

                {/* Project ref */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Server className="size-3" />
                  Project ref: <span className="font-mono">{healthCheckResult.projectRef}</span>
                </div>

                {/* Individual checks */}
                <div className="flex flex-col gap-2">
                  {healthCheckResult.checks.map((check) => (
                    <div
                      key={check.name}
                      className="flex items-start gap-2 p-2 rounded-md border text-sm"
                    >
                      {check.status === 'pass' && (
                        <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                      )}
                      {check.status === 'warn' && (
                        <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                      )}
                      {check.status === 'fail' && (
                        <XCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-xs">{check.name}</span>
                        <span className="text-xs text-muted-foreground">{check.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-red-500" />
            <CardTitle className="text-red-600 dark:text-red-400">Danger Zone</CardTitle>
          </div>
          <CardDescription>
            Irreversible actions that affect your data and connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Delete Connection */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium">Delete Connection</p>
                <p className="text-xs text-muted-foreground">
                  Remove this connection and its stored credentials. This cannot be undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-1.5 shrink-0">
                    <Trash2 className="size-3.5" />
                    Delete Connection
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Connection</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete &quot;{connection?.name || 'this connection'}
                      &quot;? This will remove the connection and all its stored credentials. This
                      action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Reset All Data */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium">Reset All Data</p>
                <p className="text-xs text-muted-foreground">
                  Clear all connections, schema data, query history, and settings. This cannot be
                  undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 shrink-0"
                  >
                    <RefreshCw className="size-3.5" />
                    Reset All Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset All Data</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will clear all connections, schema data, RLS statuses, query history, and
                      settings. You will be returned to the welcome screen. This action cannot be
                      undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onReset} className="bg-red-600 hover:bg-red-700">
                      Reset Everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schema Snapshots */}
      <Card>
        <CardContent className="pt-6">
          <SchemaSnapshotPanel />
        </CardContent>
      </Card>

      {/* Database Triggers */}
      <Card>
        <CardContent className="pt-6">
          <TriggerViewer />
        </CardContent>
      </Card>

      {/* Database Views & Functions */}
      <Card>
        <CardContent className="pt-6">
          <DbViewsFunctions />
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="size-5 text-muted-foreground" />
            <CardTitle>About</CardTitle>
          </div>
          <CardDescription>Application information and tech stack</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Version */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <Badge variant="outline" className="font-mono">
                1.0.0
              </Badge>
            </div>

            <Separator />

            {/* Tech Stack */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">Tech Stack</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="gap-1">
                  <span className="size-2 rounded-full bg-black dark:bg-white" />
                  Next.js
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <span className="size-2 rounded-full bg-sky-500" />
                  React
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <span className="size-2 rounded-full bg-blue-600" />
                  TypeScript
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Prisma
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <span className="size-2 rounded-full bg-cyan-500" />
                  Tailwind
                </Badge>
              </div>
            </div>

            <Separator />

            {/* GitHub Link */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Source Code</span>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a
                  href="https://github.com/JesseVent/supabase-devtool"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-3.5" />
                  GitHub
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
