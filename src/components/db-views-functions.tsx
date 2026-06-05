'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api-auth'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye,
  Code2,
  Layers,
  Search,
  ChevronDown,
  ChevronRight,
  Database,
  FunctionSquare,
  AlertCircle,
  FileCode2,
  ArrowUpDown,
  Braces,
  Shield,
  RefreshCw,
  Loader2,
  Info,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { useSupabaseStore } from '@/store/supabase-store'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { cn } from '@/lib/utils'

// ─── Types ───

interface ViewColumn {
  name: string
  type: string
  nullable: boolean
}

interface DbView {
  name: string
  schema: string
  columns: ViewColumn[]
  definition: string
  dependencies: string[]
  description: string
}

interface FunctionParameter {
  name: string
  type: string
  mode: 'IN' | 'OUT' | 'INOUT' | 'VARIADIC'
  default: string | null
}

type FunctionVolatility = 'IMMUTABLE' | 'STABLE' | 'VOLATILE'
type FunctionLanguage = 'plpgsql' | 'sql' | 'c' | 'internal'

interface DbFunction {
  name: string
  schema: string
  returnType: string
  language: FunctionLanguage
  parameters: FunctionParameter[]
  sourceCode: string
  volatility: FunctionVolatility
  strict: boolean
  description: string
}

// ─── API Response Types ───

interface ApiViewColumn {
  view_name: string
  name: string
  type: string
  nullable: string
}

interface ApiView {
  name: string
  definition: string
}

interface ApiFunction {
  name: string
  source_code: string
  return_type: string
  language: string
  volatility: string
  strict: boolean
  arguments: string
}

interface ApiResponseMeta {
  limited: boolean
  note: string
}

interface ApiResponse {
  views: ApiView[]
  columns: ApiViewColumn[]
  functions: ApiFunction[]
  _meta?: ApiResponseMeta
}

// ─── Demo Data ───

const DEMO_VIEWS: DbView[] = [
  {
    name: 'active_users',
    schema: 'public',
    columns: [
      { name: 'id', type: 'uuid', nullable: false },
      { name: 'email', type: 'text', nullable: false },
      { name: 'name', type: 'text', nullable: true },
      { name: 'last_login', type: 'timestamptz', nullable: true },
      { name: 'post_count', type: 'bigint', nullable: true },
    ],
    definition: `SELECT
  u.id,
  u.email,
  u.name,
  u.last_login,
  COUNT(p.id) AS post_count
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
WHERE u.last_login > now() - interval '30 days'
GROUP BY u.id, u.email, u.name, u.last_login;`,
    dependencies: ['users', 'posts'],
    description: 'Users who have logged in within the last 30 days with their post counts',
  },
  {
    name: 'post_stats',
    schema: 'public',
    columns: [
      { name: 'post_id', type: 'uuid', nullable: false },
      { name: 'title', type: 'text', nullable: false },
      { name: 'author_email', type: 'text', nullable: false },
      { name: 'comment_count', type: 'bigint', nullable: true },
      { name: 'like_count', type: 'bigint', nullable: true },
      { name: 'created_at', type: 'timestamptz', nullable: false },
    ],
    definition: `SELECT
  p.id AS post_id,
  p.title,
  u.email AS author_email,
  COUNT(DISTINCT c.id) AS comment_count,
  COUNT(DISTINCT l.id) AS like_count,
  p.created_at
FROM posts p
INNER JOIN users u ON u.id = p.user_id
LEFT JOIN comments c ON c.post_id = p.id
LEFT JOIN likes l ON l.post_id = p.id
GROUP BY p.id, p.title, u.email, p.created_at;`,
    dependencies: ['posts', 'users', 'comments', 'likes'],
    description: 'Aggregated statistics for each post including comment and like counts',
  },
  {
    name: 'user_activity',
    schema: 'public',
    columns: [
      { name: 'user_id', type: 'uuid', nullable: false },
      { name: 'user_name', type: 'text', nullable: true },
      { name: 'total_posts', type: 'bigint', nullable: true },
      { name: 'total_comments', type: 'bigint', nullable: true },
      { name: 'total_likes', type: 'bigint', nullable: true },
      { name: 'last_activity', type: 'timestamptz', nullable: true },
    ],
    definition: `SELECT
  u.id AS user_id,
  u.name AS user_name,
  (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS total_posts,
  (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id) AS total_comments,
  (SELECT COUNT(*) FROM likes l WHERE l.user_id = u.id) AS total_likes,
  GREATEST(
    COALESCE((SELECT MAX(created_at) FROM posts WHERE user_id = u.id), '1970-01-01'),
    COALESCE((SELECT MAX(created_at) FROM comments WHERE user_id = u.id), '1970-01-01')
  ) AS last_activity
FROM users u;`,
    dependencies: ['users', 'posts', 'comments', 'likes'],
    description: 'Per-user activity summary with total posts, comments, likes and last activity timestamp',
  },
  {
    name: 'comment_details',
    schema: 'public',
    columns: [
      { name: 'comment_id', type: 'uuid', nullable: false },
      { name: 'content', type: 'text', nullable: false },
      { name: 'commenter_name', type: 'text', nullable: true },
      { name: 'post_title', type: 'text', nullable: false },
      { name: 'post_author', type: 'text', nullable: true },
      { name: 'created_at', type: 'timestamptz', nullable: false },
    ],
    definition: `SELECT
  c.id AS comment_id,
  c.content,
  u1.name AS commenter_name,
  p.title AS post_title,
  u2.name AS post_author,
  c.created_at
FROM comments c
INNER JOIN users u1 ON u1.id = c.user_id
INNER JOIN posts p ON p.id = c.post_id
INNER JOIN users u2 ON u2.id = p.user_id;`,
    dependencies: ['comments', 'users', 'posts'],
    description: 'Enriched comment view with commenter and post author names resolved',
  },
  {
    name: 'audit_summary',
    schema: 'public',
    columns: [
      { name: 'action', type: 'text', nullable: false },
      { name: 'table_name', type: 'text', nullable: false },
      { name: 'count', type: 'bigint', nullable: true },
      { name: 'last_occurrence', type: 'timestamptz', nullable: true },
      { name: 'distinct_users', type: 'bigint', nullable: true },
    ],
    definition: `SELECT
  action,
  table_name,
  COUNT(*) AS count,
  MAX(created_at) AS last_occurrence,
  COUNT(DISTINCT user_id) AS distinct_users
FROM audit_logs
GROUP BY action, table_name
ORDER BY count DESC;`,
    dependencies: ['audit_logs'],
    description: 'Summarized audit log counts grouped by action type and table with last occurrence',
  },
]

const DEMO_FUNCTIONS: DbFunction[] = [
  {
    name: 'get_user_stats',
    schema: 'public',
    returnType: 'TABLE(user_id uuid, total_posts bigint, total_comments bigint)',
    language: 'plpgsql',
    parameters: [
      { name: 'target_user_id', type: 'uuid', mode: 'IN', default: null },
    ],
    sourceCode: `BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id),
    (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id)
  FROM users u
  WHERE u.id = target_user_id;
END;`,
    volatility: 'STABLE',
    strict: true,
    description: 'Returns post and comment counts for a given user',
  },
  {
    name: 'calculate_score',
    schema: 'public',
    returnType: 'numeric',
    language: 'plpgsql',
    parameters: [
      { name: 'post_count', type: 'integer', mode: 'IN', default: null },
      { name: 'comment_count', type: 'integer', mode: 'IN', default: null },
      { name: 'like_weight', type: 'numeric', mode: 'IN', default: '0.5' },
    ],
    sourceCode: `DECLARE
  base_score numeric;
BEGIN
  base_score := (post_count * 3.0) + (comment_count * 1.5);
  RETURN base_score * (1.0 + like_weight);
END;`,
    volatility: 'IMMUTABLE',
    strict: false,
    description: 'Calculates a weighted activity score based on post and comment counts',
  },
  {
    name: 'format_timestamp',
    schema: 'public',
    returnType: 'text',
    language: 'plpgsql',
    parameters: [
      { name: 'ts', type: 'timestamptz', mode: 'IN', default: null },
      { name: 'format_style', type: 'text', mode: 'IN', default: "'relative'" },
    ],
    sourceCode: `BEGIN
  IF format_style = 'relative' THEN
    IF ts > now() - interval '1 hour' THEN
      RETURN concat(extract(epoch from (now() - ts))::int / 60, ' minutes ago');
    ELSIF ts > now() - interval '24 hours' THEN
      RETURN concat(extract(epoch from (now() - ts))::int / 3600, ' hours ago');
    ELSIF ts > now() - interval '7 days' THEN
      RETURN concat(extract(day from (now() - ts)), ' days ago');
    ELSE
      RETURN to_char(ts, 'YYYY-MM-DD');
    END IF;
  ELSIF format_style = 'iso' THEN
    RETURN to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  ELSE
    RETURN to_char(ts, 'Mon DD, YYYY HH12:MI AM');
  END IF;
END;`,
    volatility: 'STABLE',
    strict: false,
    description: 'Formats a timestamp in relative, ISO, or human-readable style',
  },
  {
    name: 'check_permission',
    schema: 'public',
    returnType: 'boolean',
    language: 'plpgsql',
    parameters: [
      { name: 'user_id', type: 'uuid', mode: 'IN', default: null },
      { name: 'resource', type: 'text', mode: 'IN', default: null },
      { name: 'action', type: 'text', mode: 'IN', default: "'read'" },
    ],
    sourceCode: `DECLARE
  has_role text;
BEGIN
  SELECT role INTO has_role
  FROM user_roles
  WHERE user_roles.user_id = check_permission.user_id
  LIMIT 1;

  IF has_role = 'admin' THEN
    RETURN true;
  END IF;

  IF action = 'read' AND resource IN ('posts', 'comments', 'categories') THEN
    RETURN true;
  END IF;

  IF action IN ('create', 'update') AND has_role = 'authenticated' THEN
    RETURN resource IN ('posts', 'comments');
  END IF;

  RETURN false;
END;`,
    volatility: 'STABLE',
    strict: true,
    description: 'Checks whether a user has permission to perform an action on a resource',
  },
  {
    name: 'generate_slug',
    schema: 'public',
    returnType: 'text',
    language: 'sql',
    parameters: [
      { name: 'input_text', type: 'text', mode: 'IN', default: null },
    ],
    sourceCode: `SELECT lower(regexp_replace(
  regexp_replace(trim(input_text), '[^a-zA-Z0-9\s-]', '', 'g'),
  '[\s-]+', '-', 'g'
))`,
    volatility: 'IMMUTABLE',
    strict: true,
    description: 'Generates a URL-friendly slug from input text by removing special characters and replacing spaces with hyphens',
  },
]

// ─── Helpers ───

function getTypeBadgeColor(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('uuid')) return 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800'
  if (t.includes('text') || t.includes('char') || t.includes('varchar')) return 'bg-primary/15 text-primary border-primary/30 dark:bg-primary/40 dark:text-primary dark:border-primary/30'
  if (t.includes('int') || t.includes('serial') || t.includes('bigint')) return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800'
  if (t.includes('timestamp') || t.includes('date') || t.includes('time')) return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
  if (t.includes('bool')) return 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-400 dark:border-pink-800'
  if (t.includes('numeric') || t.includes('decimal') || t.includes('float') || t.includes('double') || t.includes('real')) return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800'
  if (t.includes('json')) return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
  return 'bg-muted text-muted-foreground'
}

function getVolatilityBadge(volatility: FunctionVolatility): string {
  switch (volatility) {
    case 'IMMUTABLE':
      return 'bg-primary/15 text-primary border-primary/30 dark:bg-primary/40 dark:text-primary dark:border-primary/30'
    case 'STABLE':
      return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800'
    case 'VOLATILE':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function getLanguageBadge(lang: FunctionLanguage): string {
  switch (lang) {
    case 'plpgsql':
      return 'bg-primary/15 text-primary border-primary/30 dark:bg-primary/40 dark:text-primary dark:border-primary/30'
    case 'sql':
      return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800'
    case 'c':
      return 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800'
    case 'internal':
      return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

// ─── API Data Mappers ───

function extractDependencies(definition: string): string[] {
  const deps = new Set<string>()
  // Match table names after FROM or JOIN keywords
  const fromRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
  let match: RegExpExecArray | null
  while ((match = fromRegex.exec(definition)) !== null) {
    const tableName = match[1].toLowerCase()
    // Skip common SQL keywords that might be captured
    if (!['select', 'where', 'and', 'or', 'on', 'as', 'set', 'into', 'values', 'update', 'delete', 'insert', 'create', 'alter', 'drop', 'table', 'index', 'view'].includes(tableName)) {
      deps.add(tableName)
    }
  }
  return [...deps]
}

function decodePostgresString(str: string): string {
  // PostgreSQL returns escaped strings with doubled single quotes
  // and sometimes \\n for newlines in view definitions
  try {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/''/g, "'")
  } catch {
    return str
  }
}

function mapApiViews(apiViews: ApiView[], apiColumns: ApiViewColumn[]): DbView[] {
  return apiViews.map((v) => {
    const definition = decodePostgresString(v.definition || '')
    const viewColumns = apiColumns
      .filter((c) => c.view_name === v.name)
      .map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable === 'YES',
      }))

    // Generate description from name
    const words = v.name.replace(/_/g, ' ').split(' ')
    const description = words.length > 0
      ? `${words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} view`
      : `Database view ${v.name}`

    return {
      name: v.name,
      schema: 'public',
      columns: viewColumns,
      definition,
      dependencies: extractDependencies(definition),
      description,
    }
  })
}

function mapVolatility(volatility: string): FunctionVolatility {
  switch (volatility) {
    case 'i': return 'IMMUTABLE'
    case 's': return 'STABLE'
    case 'v': return 'VOLATILE'
    default: return 'VOLATILE'
  }
}

function mapLanguage(lang: string): FunctionLanguage {
  if (lang === 'plpgsql' || lang === 'sql' || lang === 'c' || lang === 'internal') {
    return lang
  }
  return 'plpgsql'
}

function parseArguments(argsStr: string): FunctionParameter[] {
  if (!argsStr || argsStr.trim() === '') return []

  // Arguments from pg_get_function_arguments look like:
  // "target_user_id uuid" or "like_weight numeric DEFAULT 0.5"
  // or "IN target_user_id uuid"
  const params: FunctionParameter[] = []
  // Split by comma, but be careful with nested types like "TABLE(col1 type1, col2 type2)"
  // Simple approach: split on comma not inside parentheses
  const segments: string[] = []
  let depth = 0
  let current = ''
  for (const ch of argsStr) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      segments.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) segments.push(current.trim())

  for (const seg of segments) {
    // Try to match: [MODE] name type [DEFAULT value]
    const modeMatch = seg.match(/^(IN|OUT|INOUT|VARIADIC)\s+(.+)$/i)
    let mode: FunctionParameter['mode'] = 'IN'
    let rest = seg
    if (modeMatch) {
      mode = modeMatch[1].toUpperCase() as FunctionParameter['mode']
      rest = modeMatch[2]
    }

    // Try to extract DEFAULT value
    const defaultIdx = rest.toUpperCase().lastIndexOf(' DEFAULT ')
    let defaultVal: string | null = null
    let nameTypePart = rest
    if (defaultIdx !== -1) {
      defaultVal = rest.substring(defaultIdx + 9).trim()
      nameTypePart = rest.substring(0, defaultIdx).trim()
    }

    // Split name and type: first token is name, rest is type
    const parts = nameTypePart.split(/\s+/)
    if (parts.length >= 2) {
      params.push({
        name: parts[0],
        type: parts.slice(1).join(' '),
        mode,
        default: defaultVal,
      })
    } else if (parts.length === 1) {
      // Only a type, no name (positional)
      params.push({
        name: `arg${params.length + 1}`,
        type: parts[0],
        mode,
        default: defaultVal,
      })
    }
  }

  return params
}

function mapApiFunctions(apiFunctions: ApiFunction[]): DbFunction[] {
  return apiFunctions.map((f) => {
    const name = f.name
    const returnType = f.return_type || 'void'
    const lang = mapLanguage(f.language || 'plpgsql')

    // Generate description from name and return type
    const words = name.replace(/_/g, ' ').split(' ')
    const baseDesc = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    const description = `Function ${baseDesc} returning ${returnType}`

    return {
      name,
      schema: 'public',
      returnType,
      language: lang,
      parameters: parseArguments(f.arguments || ''),
      sourceCode: decodePostgresString(f.source_code || ''),
      volatility: mapVolatility(f.volatility || 'v'),
      strict: !!f.strict,
      description,
    }
  })
}

// ─── Component ───

export function DbViewsFunctions() {
  const { activeConnectionId, connections, addActivityLog } = useSupabaseStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null
  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID

  // Data state
  const [views, setViews] = useState<DbView[]>(isDemoMode ? DEMO_VIEWS : [])
  const [functions, setFunctions] = useState<DbFunction[]>(isDemoMode ? DEMO_FUNCTIONS : [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limitedMeta, setLimitedMeta] = useState<ApiResponseMeta | null>(null)

  // Tab state
  const [activeSubTab, setActiveSubTab] = useState<string>('views')

  // Views filter state
  const [viewSearch, setViewSearch] = useState('')
  const [expandedViews, setExpandedViews] = useState<Set<string>>(new Set())

  // Functions filter state
  const [funcSearch, setFuncSearch] = useState('')
  const [funcLangFilter, setFuncLangFilter] = useState<string>('all')
  const [expandedFuncs, setExpandedFuncs] = useState<Set<string>>(new Set())

  // Fetch real data from API
  const fetchViewsFunctions = useCallback(async () => {
    if (!activeConnectionId || isDemoMode) return

    setLoading(true)
    setError(null)
    setLimitedMeta(null)

    try {
      const res = await apiFetch('/api/database/views-functions', activeConnection)

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || `Request failed with status ${res.status}`)
      }

      const data: ApiResponse = await res.json()

      if (data._meta?.limited) {
        setLimitedMeta(data._meta)
      }

      const mappedViews = mapApiViews(data.views || [], data.columns || [])
      const mappedFunctions = mapApiFunctions(data.functions || [])

      setViews(mappedViews)
      setFunctions(mappedFunctions)

      addActivityLog({
        type: 'schema',
        action: 'Views & functions loaded',
        details: `${mappedViews.length} views, ${mappedFunctions.length} functions`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch views and functions'
      setError(message)
      setViews([])
      setFunctions([])
    } finally {
      setLoading(false)
    }
  }, [activeConnectionId, isDemoMode, addActivityLog])

  // Fetch on mount and when connection changes
  useEffect(() => {
    if (isDemoMode) {
      setViews(DEMO_VIEWS)
      setFunctions(DEMO_FUNCTIONS)
      setError(null)
      setLimitedMeta(null)
    } else if (activeConnectionId) {
      fetchViewsFunctions()
    } else {
      setViews([])
      setFunctions([])
      setError(null)
      setLimitedMeta(null)
    }
  }, [activeConnectionId, isDemoMode, fetchViewsFunctions])

  // Filtered views
  const filteredViews = useMemo(() => {
    if (!viewSearch.trim()) return views
    const q = viewSearch.toLowerCase()
    return views.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.schema.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.dependencies.some((d) => d.toLowerCase().includes(q))
    )
  }, [views, viewSearch])

  // Filtered functions
  const filteredFunctions = useMemo(() => {
    let result = functions
    if (funcLangFilter !== 'all') {
      result = result.filter((f) => f.language === funcLangFilter)
    }
    if (funcSearch.trim()) {
      const q = funcSearch.toLowerCase()
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.returnType.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q)
      )
    }
    return result
  }, [functions, funcSearch, funcLangFilter])

  // Stats
  const totalViews = views.length
  const totalFunctions = functions.length
  const totalParams = functions.reduce((acc, f) => acc + f.parameters.length, 0)
  const uniqueLanguages = useMemo(() => [...new Set(functions.map((f) => f.language))], [functions])

  // Toggle expanded
  const toggleViewExpanded = (name: string) => {
    setExpandedViews((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
        addActivityLog({ type: 'schema', action: 'View inspected', details: name })
      }
      return next
    })
  }

  const toggleFuncExpanded = (name: string) => {
    setExpandedFuncs((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
        addActivityLog({ type: 'schema', action: 'Function inspected', details: name })
      }
      return next
    })
  }

  if (!activeConnectionId) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-center space-y-3">
            <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Layers className="size-8 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              Connect to a Supabase project to view database views and functions.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-center space-y-3">
            <Loader2 className="size-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              Loading database views and functions...
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              <CardTitle>Database Views & Functions</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchViewsFunctions}
              className="gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load data</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              <CardTitle>Database Views & Functions</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {isDemoMode && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
                  Demo Data
                </Badge>
              )}
              {!isDemoMode && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchViewsFunctions}
                  disabled={loading}
                  className="gap-1.5 h-7 text-xs"
                >
                  <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
                  Refresh
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            Inspect database views, stored functions, their definitions, parameters, and source code
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Limited data alert */}
      {limitedMeta && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <Info className="size-4" />
          <AlertTitle>Limited Data</AlertTitle>
          <AlertDescription>{limitedMeta.note}</AlertDescription>
        </Alert>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-primary to-primary" />
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Eye className="size-3.5 text-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Total Views</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">{totalViews}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-cyan-400 to-cyan-600" />
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="size-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <FunctionSquare className="size-3.5 text-cyan-500" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Total Functions</span>
            </div>
            <p className="text-2xl font-bold tracking-tight text-cyan-600 dark:text-cyan-400">{totalFunctions}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-600" />
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="size-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <FileCode2 className="size-3.5 text-amber-500" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Languages</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">{uniqueLanguages.length}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-violet-400 to-violet-600" />
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="size-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Braces className="size-3.5 text-violet-500" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Total Parameters</span>
            </div>
            <p className="text-2xl font-bold tracking-tight text-violet-600 dark:text-violet-400">{totalParams}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sub-tabs: Views / Functions */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid grid-cols-2 w-full sm:w-64">
          <TabsTrigger value="views" className="gap-1.5">
            <Eye className="size-3.5" />
            Views
          </TabsTrigger>
          <TabsTrigger value="functions" className="gap-1.5">
            <FunctionSquare className="size-3.5" />
            Functions
          </TabsTrigger>
        </TabsList>

        {/* ── Views Tab ── */}
        <TabsContent value="views" className="mt-4">
          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={viewSearch}
                onChange={(e) => setViewSearch(e.target.value)}
                placeholder="Search views by name, schema, or dependencies..."
                className="pl-9 h-9"
              />
            </div>
          </div>

          <ScrollArea className="max-h-[700px]">
            <div className="flex flex-col gap-3 pr-3">
              <AnimatePresence mode="popLayout">
                {filteredViews.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Card>
                      <CardContent className="py-12">
                        <div className="flex flex-col items-center justify-center text-center space-y-3">
                          <div className="size-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                            <AlertCircle className="size-7 text-muted-foreground/40" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {isDemoMode
                              ? 'No views found matching your search.'
                              : limitedMeta
                                ? 'No views available. Add a Management API token to view database views.'
                                : 'No views found matching your search.'}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ) : (
                  filteredViews.map((view) => {
                    const isExpanded = expandedViews.has(view.name)

                    return (
                      <motion.div
                        key={view.name}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Card
                          className={cn(
                            'border-l-4 border-l-primary transition-all duration-200 hover:shadow-md cursor-pointer'
                          )}
                          onClick={() => toggleViewExpanded(view.name)}
                        >
                          <CardContent className="p-4">
                            {/* Header row */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                  <h3 className="font-mono text-sm font-semibold truncate">
                                    {view.name}
                                  </h3>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono gap-1">
                                    <Database className="size-2.5" />
                                    {view.schema}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 text-primary border-primary/30 dark:text-primary dark:border-primary/30"
                                  >
                                    {view.columns.length} column{view.columns.length !== 1 ? 's' : ''}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {view.description}
                                </p>
                              </div>

                              {/* Expand/collapse icon */}
                              <div className="shrink-0 mt-0.5">
                                {isExpanded ? (
                                  <ChevronDown className="size-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="size-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>

                            {/* Column summary badges */}
                            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Columns:</span>
                              {view.columns.slice(0, 4).map((col) => (
                                <Badge
                                  key={col.name}
                                  variant="outline"
                                  className={cn('text-[10px] px-1.5 py-0 border font-mono', getTypeBadgeColor(col.type))}
                                >
                                  {col.name}:{col.type}
                                </Badge>
                              ))}
                              {view.columns.length > 4 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  +{view.columns.length - 4} more
                                </Badge>
                              )}
                              <Separator orientation="vertical" className="h-3.5 mx-1" />
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Depends on:</span>
                              {view.dependencies.map((dep) => (
                                <Badge key={dep} variant="outline" className="text-[10px] px-1.5 py-0 font-mono gap-0.5">
                                  {dep}
                                </Badge>
                              ))}
                            </div>

                            {/* Expandable details */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-4 space-y-3">
                                    {/* Column details */}
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <ArrowUpDown className="size-3.5 text-primary" />
                                        <span className="text-xs font-medium">Column Details</span>
                                      </div>
                                      <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 overflow-hidden">
                                        <table className="w-full text-[11px]">
                                          <thead>
                                            <tr className="border-b bg-muted/50 dark:bg-muted/20">
                                              <th className="text-left font-medium px-3 py-1.5">Name</th>
                                              <th className="text-left font-medium px-3 py-1.5">Type</th>
                                              <th className="text-left font-medium px-3 py-1.5">Nullable</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {view.columns.map((col) => (
                                              <tr key={col.name} className="border-b last:border-b-0">
                                                <td className="font-mono px-3 py-1.5 text-primary/80">{col.name}</td>
                                                <td className="px-3 py-1.5">
                                                  <Badge
                                                    variant="outline"
                                                    className={cn('text-[10px] px-1.5 py-0 border font-mono', getTypeBadgeColor(col.type))}
                                                  >
                                                    {col.type}
                                                  </Badge>
                                                </td>
                                                <td className="px-3 py-1.5">
                                                  {col.nullable ? (
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800">
                                                      NULLABLE
                                                    </Badge>
                                                  ) : (
                                                    <Badge className="text-[10px] px-1.5 py-0 bg-primary hover:bg-primary">
                                                      NOT NULL
                                                    </Badge>
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                    {/* View Definition SQL */}
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <Code2 className="size-3.5 text-primary" />
                                        <span className="text-xs font-medium">View Definition</span>
                                      </div>
                                      <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 p-3">
                                        <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto leading-relaxed">
                                          {view.definition}
                                        </pre>
                                      </div>
                                    </div>

                                    {/* Dependencies detail */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                      <div className="rounded-lg border p-2.5">
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Schema</span>
                                        <span className="text-xs font-mono font-semibold">{view.schema}</span>
                                      </div>
                                      <div className="rounded-lg border p-2.5">
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Columns</span>
                                        <span className="text-xs font-semibold">{view.columns.length}</span>
                                      </div>
                                      <div className="rounded-lg border p-2.5">
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Dependencies</span>
                                        <span className="text-xs font-semibold">{view.dependencies.length} table{view.dependencies.length !== 1 ? 's' : ''}</span>
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })
                )}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Functions Tab ── */}
        <TabsContent value="functions" className="mt-4">
          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={funcSearch}
                onChange={(e) => setFuncSearch(e.target.value)}
                placeholder="Search functions by name, return type, or description..."
                className="pl-9 h-9"
              />
            </div>
            <Select value={funcLangFilter} onValueChange={setFuncLangFilter}>
              <SelectTrigger className="w-full sm:w-[150px] h-9">
                <FileCode2 className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Languages</SelectItem>
                <SelectItem value="plpgsql">plpgsql</SelectItem>
                <SelectItem value="sql">sql</SelectItem>
                <SelectItem value="c">c</SelectItem>
                <SelectItem value="internal">internal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="max-h-[700px]">
            <div className="flex flex-col gap-3 pr-3">
              <AnimatePresence mode="popLayout">
                {filteredFunctions.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Card>
                      <CardContent className="py-12">
                        <div className="flex flex-col items-center justify-center text-center space-y-3">
                          <div className="size-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                            <AlertCircle className="size-7 text-muted-foreground/40" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {isDemoMode
                              ? 'No functions found matching your filters.'
                              : limitedMeta
                                ? 'No functions available. Add a Management API token to view database functions.'
                                : 'No functions found matching your filters.'}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ) : (
                  filteredFunctions.map((fn) => {
                    const isExpanded = expandedFuncs.has(fn.name)

                    return (
                      <motion.div
                        key={fn.name}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Card
                          className={cn(
                            'border-l-4 border-l-cyan-500 transition-all duration-200 hover:shadow-md cursor-pointer'
                          )}
                          onClick={() => toggleFuncExpanded(fn.name)}
                        >
                          <CardContent className="p-4">
                            {/* Header row */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                  <h3 className="font-mono text-sm font-semibold truncate">
                                    {fn.name}
                                  </h3>
                                  {/* Language badge */}
                                  <Badge
                                    variant="outline"
                                    className={cn('text-[10px] px-1.5 py-0 border font-mono', getLanguageBadge(fn.language))}
                                  >
                                    {fn.language}
                                  </Badge>
                                  {/* Volatility badge */}
                                  <Badge
                                    variant="outline"
                                    className={cn('text-[10px] px-1.5 py-0 border font-semibold', getVolatilityBadge(fn.volatility))}
                                  >
                                    {fn.volatility}
                                  </Badge>
                                  {/* Strictness badge */}
                                  {fn.strict && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800 gap-0.5"
                                    >
                                      <Shield className="size-2.5" />
                                      STRICT
                                    </Badge>
                                  )}
                                  {/* Arg count */}
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {fn.parameters.length} arg{fn.parameters.length !== 1 ? 's' : ''}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {fn.description}
                                </p>
                              </div>

                              {/* Expand/collapse icon */}
                              <div className="shrink-0 mt-0.5">
                                {isExpanded ? (
                                  <ChevronDown className="size-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="size-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>

                            {/* Return type badge */}
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Returns:</span>
                              <Badge
                                variant="outline"
                                className={cn('text-[10px] px-1.5 py-0 border font-mono', getTypeBadgeColor(fn.returnType))}
                              >
                                {fn.returnType}
                              </Badge>
                              {fn.parameters.length > 0 && (
                                <>
                                  <Separator orientation="vertical" className="h-3.5 mx-1" />
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Params:</span>
                                  {fn.parameters.map((param) => (
                                    <Badge
                                      key={param.name}
                                      variant="outline"
                                      className={cn('text-[10px] px-1.5 py-0 border font-mono', getTypeBadgeColor(param.type))}
                                    >
                                      {param.mode !== 'IN' && <span className="opacity-60">{param.mode.toLowerCase()} </span>}
                                      {param.name}:{param.type}
                                    </Badge>
                                  ))}
                                </>
                              )}
                            </div>

                            {/* Expandable details */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-4 space-y-3">
                                    {/* Parameters detail table */}
                                    {fn.parameters.length > 0 && (
                                      <div>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                          <Braces className="size-3.5 text-primary" />
                                          <span className="text-xs font-medium">Parameters</span>
                                        </div>
                                        <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 overflow-hidden">
                                          <table className="w-full text-[11px]">
                                            <thead>
                                              <tr className="border-b bg-muted/50 dark:bg-muted/20">
                                                <th className="text-left font-medium px-3 py-1.5">Name</th>
                                                <th className="text-left font-medium px-3 py-1.5">Type</th>
                                                <th className="text-left font-medium px-3 py-1.5">Mode</th>
                                                <th className="text-left font-medium px-3 py-1.5">Default</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {fn.parameters.map((param) => (
                                                <tr key={param.name} className="border-b last:border-b-0">
                                                  <td className="font-mono px-3 py-1.5 text-primary/80">{param.name}</td>
                                                  <td className="px-3 py-1.5">
                                                    <Badge
                                                      variant="outline"
                                                      className={cn('text-[10px] px-1.5 py-0 border font-mono', getTypeBadgeColor(param.type))}
                                                    >
                                                      {param.type}
                                                    </Badge>
                                                  </td>
                                                  <td className="px-3 py-1.5">
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                      {param.mode}
                                                    </Badge>
                                                  </td>
                                                  <td className="px-3 py-1.5 font-mono text-muted-foreground">
                                                    {param.default ?? <span className="opacity-40">&mdash;</span>}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}

                                    {/* Source code */}
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <Code2 className="size-3.5 text-primary" />
                                        <span className="text-xs font-medium">Source Code</span>
                                      </div>
                                      <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 p-3">
                                        <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto leading-relaxed">
                                          {fn.sourceCode}
                                        </pre>
                                      </div>
                                    </div>

                                    {/* Metadata summary */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                      <div className="rounded-lg border p-2.5">
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Language</span>
                                        <Badge
                                          variant="outline"
                                          className={cn('text-[10px] px-1.5 py-0 border font-mono', getLanguageBadge(fn.language))}
                                        >
                                          {fn.language}
                                        </Badge>
                                      </div>
                                      <div className="rounded-lg border p-2.5">
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Volatility</span>
                                        <Badge
                                          variant="outline"
                                          className={cn('text-[10px] px-1.5 py-0 border font-semibold', getVolatilityBadge(fn.volatility))}
                                        >
                                          {fn.volatility}
                                        </Badge>
                                      </div>
                                      <div className="rounded-lg border p-2.5">
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Strict</span>
                                        <span className={cn(
                                          'text-xs font-semibold',
                                          fn.strict ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                                        )}>
                                          {fn.strict ? 'Yes (RETURNS NULL ON NULL INPUT)' : 'No (CALLED ON NULL INPUT)'}
                                        </span>
                                      </div>
                                      <div className="rounded-lg border p-2.5">
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">Schema</span>
                                        <span className="text-xs font-mono font-semibold">{fn.schema}</span>
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })
                )}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
