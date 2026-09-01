'use client'

import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileJson,
  FileText,
  History,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MigrationRunner } from '@/components/migration-runner'
import { QueryAnalyzer } from '@/components/query-analyzer'
import { QueryChart } from '@/components/query-chart'
import { SqlSchemaBrowser } from '@/components/sql-schema-browser'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { track } from '@/lib/analytics'
import { apiFetch } from '@/lib/api-auth'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import type { SQLQueryResult } from '@/lib/supabase-types'
import { cn } from '@/lib/utils'
import { useSupabaseStore } from '@/store/supabase-store'

// ─── Demo SQL Results ───

const DEMO_SQL_RESULTS: Record<string, Array<Record<string, unknown>>> = {
  'information_schema.tables': [
    { table_name: 'users', table_type: 'BASE TABLE' },
    { table_name: 'posts', table_type: 'BASE TABLE' },
    { table_name: 'comments', table_type: 'BASE TABLE' },
    { table_name: 'likes', table_type: 'BASE TABLE' },
    { table_name: 'categories', table_type: 'BASE TABLE' },
    { table_name: 'post_categories', table_type: 'BASE TABLE' },
    { table_name: 'audit_logs', table_type: 'BASE TABLE' },
    { table_name: 'notifications', table_type: 'BASE TABLE' },
  ],
  pg_policies: [
    {
      schemaname: 'public',
      tablename: 'users',
      policyname: 'Users can view own profile',
      permissive: 'PERMISSIVE',
      roles: '{authenticated}',
      cmd: 'SELECT',
      qual: '(auth.uid() = id)',
      with_check: null,
    },
    {
      schemaname: 'public',
      tablename: 'users',
      policyname: 'Users can update own profile',
      permissive: 'PERMISSIVE',
      roles: '{authenticated}',
      cmd: 'UPDATE',
      qual: '(auth.uid() = id)',
      with_check: '(auth.uid() = id)',
    },
    {
      schemaname: 'public',
      tablename: 'posts',
      policyname: 'Anyone can view posts',
      permissive: 'PERMISSIVE',
      roles: '{authenticated,anon}',
      cmd: 'SELECT',
      qual: 'true',
      with_check: null,
    },
    {
      schemaname: 'public',
      tablename: 'comments',
      policyname: 'Authenticated users can view comments',
      permissive: 'PERMISSIVE',
      roles: '{authenticated}',
      cmd: 'SELECT',
      qual: 'true',
      with_check: null,
    },
    {
      schemaname: 'public',
      tablename: 'likes',
      policyname: 'Authenticated users can view likes',
      permissive: 'PERMISSIVE',
      roles: '{authenticated}',
      cmd: 'SELECT',
      qual: 'true',
      with_check: null,
    },
  ],
  pg_stat_user_tables: [
    { schemaname: 'public', relname: 'users', n_live_tup: 1247 },
    { schemaname: 'public', relname: 'posts', n_live_tup: 8432 },
    { schemaname: 'public', relname: 'comments', n_live_tup: 23456 },
    { schemaname: 'public', relname: 'likes', n_live_tup: 45678 },
    { schemaname: 'public', relname: 'categories', n_live_tup: 15 },
    { schemaname: 'public', relname: 'post_categories', n_live_tup: 3456 },
    { schemaname: 'public', relname: 'audit_logs', n_live_tup: 89234 },
    { schemaname: 'public', relname: 'notifications', n_live_tup: 5678 },
  ],
  table_sizes: [
    {
      table_name: 'audit_logs',
      total_size: '8192 kB',
      table_size: '7168 kB',
      index_size: '1024 kB',
    },
    { table_name: 'likes', total_size: '4096 kB', table_size: '3584 kB', index_size: '512 kB' },
    { table_name: 'comments', total_size: '2048 kB', table_size: '1792 kB', index_size: '256 kB' },
    { table_name: 'posts', total_size: '1024 kB', table_size: '896 kB', index_size: '128 kB' },
    {
      table_name: 'notifications',
      total_size: '512 kB',
      table_size: '448 kB',
      index_size: '64 kB',
    },
    { table_name: 'users', total_size: '256 kB', table_size: '224 kB', index_size: '32 kB' },
    {
      table_name: 'post_categories',
      total_size: '128 kB',
      table_size: '112 kB',
      index_size: '16 kB',
    },
    { table_name: 'categories', total_size: '32 kB', table_size: '24 kB', index_size: '8 kB' },
  ],
  index_usage: [
    {
      schemaname: 'public',
      table_name: 'users',
      index_name: 'users_pkey',
      index_scans: 45231,
      tuples_read: 45231,
      tuples_fetched: 45231,
    },
    {
      schemaname: 'public',
      table_name: 'posts',
      index_name: 'posts_pkey',
      index_scans: 23890,
      tuples_read: 23890,
      tuples_fetched: 23890,
    },
    {
      schemaname: 'public',
      table_name: 'posts',
      index_name: 'posts_user_id_idx',
      index_scans: 18432,
      tuples_read: 82340,
      tuples_fetched: 18432,
    },
    {
      schemaname: 'public',
      table_name: 'comments',
      index_name: 'comments_pkey',
      index_scans: 12045,
      tuples_read: 12045,
      tuples_fetched: 12045,
    },
    {
      schemaname: 'public',
      table_name: 'comments',
      index_name: 'comments_post_id_idx',
      index_scans: 9823,
      tuples_read: 45123,
      tuples_fetched: 9823,
    },
    {
      schemaname: 'public',
      table_name: 'likes',
      index_name: 'likes_pkey',
      index_scans: 8901,
      tuples_read: 8901,
      tuples_fetched: 8901,
    },
    {
      schemaname: 'public',
      table_name: 'notifications',
      index_name: 'notifications_user_id_idx',
      index_scans: 3456,
      tuples_read: 15234,
      tuples_fetched: 3456,
    },
    {
      schemaname: 'public',
      table_name: 'audit_logs',
      index_name: 'audit_logs_pkey',
      index_scans: 1234,
      tuples_read: 1234,
      tuples_fetched: 1234,
    },
  ],
  foreign_keys: [
    {
      table_name: 'posts',
      column_name: 'user_id',
      foreign_table_name: 'users',
      foreign_column_name: 'id',
    },
    {
      table_name: 'comments',
      column_name: 'post_id',
      foreign_table_name: 'posts',
      foreign_column_name: 'id',
    },
    {
      table_name: 'comments',
      column_name: 'user_id',
      foreign_table_name: 'users',
      foreign_column_name: 'id',
    },
    {
      table_name: 'likes',
      column_name: 'post_id',
      foreign_table_name: 'posts',
      foreign_column_name: 'id',
    },
    {
      table_name: 'likes',
      column_name: 'user_id',
      foreign_table_name: 'users',
      foreign_column_name: 'id',
    },
    {
      table_name: 'post_categories',
      column_name: 'post_id',
      foreign_table_name: 'posts',
      foreign_column_name: 'id',
    },
    {
      table_name: 'post_categories',
      column_name: 'category_id',
      foreign_table_name: 'categories',
      foreign_column_name: 'id',
    },
    {
      table_name: 'audit_logs',
      column_name: 'user_id',
      foreign_table_name: 'users',
      foreign_column_name: 'id',
    },
    {
      table_name: 'notifications',
      column_name: 'user_id',
      foreign_table_name: 'users',
      foreign_column_name: 'id',
    },
  ],
  active_connections: [
    {
      pid: 12345,
      usename: 'supabase_admin',
      application_name: 'psql',
      client_addr: '10.0.0.1',
      state: 'active',
      query: 'SELECT * FROM users WHERE id = $1',
      query_start: new Date(Date.now() - 120000).toISOString(),
    },
    {
      pid: 12346,
      usename: 'authenticated',
      application_name: 'PostgREST',
      client_addr: '10.0.0.2',
      state: 'active',
      query: 'SELECT posts.* FROM posts ORDER BY created_at DESC LIMIT 10',
      query_start: new Date(Date.now() - 45000).toISOString(),
    },
  ],
}

function getDemoSQLResult(query: string): SQLQueryResult {
  const q = query.toLowerCase()
  if (q.includes('pg_policies') || (q.includes('rls') && q.includes('policy'))) {
    return { success: true, data: DEMO_SQL_RESULTS['pg_policies'] }
  }
  if (
    q.includes('pg_statio_user_tables') ||
    (q.includes('total_size') && q.includes('table_size'))
  ) {
    return { success: true, data: DEMO_SQL_RESULTS['table_sizes'] }
  }
  if (q.includes('pg_stat_user_indexes') || q.includes('index_scans') || q.includes('idx_scan')) {
    return { success: true, data: DEMO_SQL_RESULTS['index_usage'] }
  }
  if (q.includes('pg_stat_activity') || q.includes('active connections')) {
    return { success: true, data: DEMO_SQL_RESULTS['active_connections'] }
  }
  if (q.includes('pg_stat_user_tables') || q.includes('n_live_tup')) {
    return { success: true, data: DEMO_SQL_RESULTS['pg_stat_user_tables'] }
  }
  if (
    q.includes('information_schema.table_constraints') ||
    q.includes('foreign_table_name') ||
    (q.includes('constraint_type') && q.includes('foreign key'))
  ) {
    return { success: true, data: DEMO_SQL_RESULTS['foreign_keys'] }
  }
  if (
    q.includes('information_schema.tables') ||
    (q.includes('table_name') && q.includes('table_type'))
  ) {
    return { success: true, data: DEMO_SQL_RESULTS['information_schema.tables'] }
  }
  return {
    success: true,
    data: [
      { id: 1, name: 'Demo Result 1', value: 42, created_at: new Date().toISOString() },
      { id: 2, name: 'Demo Result 2', value: 87, created_at: new Date().toISOString() },
      { id: 3, name: 'Demo Result 3', value: 156, created_at: new Date().toISOString() },
    ],
  }
}

const QUICK_TEMPLATES: Record<string, string> = {
  'List all tables': `SELECT table_name, table_type \nFROM information_schema.tables \nWHERE table_schema = 'public' \nORDER BY table_name;`,
  'Check RLS policies': `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check \nFROM pg_policies \nWHERE schemaname = 'public';`,
  'List foreign keys': `SELECT \n  tc.table_name, \n  kcu.column_name, \n  ccu.table_name AS foreign_table_name, \n  ccu.column_name AS foreign_column_name \nFROM information_schema.table_constraints AS tc \nJOIN information_schema.key_column_usage AS kcu \n  ON tc.constraint_name = kcu.constraint_name \nJOIN information_schema.constraint_column_usage AS ccu \n  ON ccu.constraint_name = tc.constraint_name \nWHERE tc.constraint_type = 'FOREIGN KEY' \n  AND tc.table_schema = 'public';`,
  'Table row count': `SELECT \n  schemaname,\n  relname AS table_name,\n  n_live_tup AS row_count\nFROM pg_stat_user_tables\nORDER BY n_live_tup DESC;`,
  'Index usage': `SELECT\n  schemaname,\n  relname AS table_name,\n  indexrelname AS index_name,\n  idx_scan AS index_scans,\n  idx_tup_read AS tuples_read,\n  idx_tup_fetch AS tuples_fetched\nFROM pg_stat_user_indexes\nORDER BY idx_scan DESC;`,
  'Table sizes': `SELECT\n  relname AS table_name,\n  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,\n  pg_size_pretty(pg_relation_size(relid)) AS table_size,\n  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size\nFROM pg_statio_user_tables\nORDER BY pg_total_relation_size(relid) DESC;`,
  'Active connections': `SELECT\n  pid,\n  usename,\n  application_name,\n  client_addr,\n  state,\n  query,\n  query_start\nFROM pg_stat_activity\nWHERE state != 'idle'\nORDER BY query_start DESC;`,
}

// ─── AI Demo Buttons ───

interface QueryTab {
  id: string
  name: string
  sql: string
}

type AiProvider = 'openai' | 'supabase'
type AiDemoButton = { label: string; description: string; sql: string }

function getAiDemoButtons(provider: AiProvider): AiDemoButton[] {
  // provider arg is only emitted when non-default (openai is the SQL default)
  const p = provider === 'supabase' ? `, provider => 'supabase'` : ''
  const pInline = provider === 'supabase' ? `, null, null, 'supabase'` : ''

  return [
    {
      label: 'AI: Tagline',
      description: 'Generate a tagline with ai_complete()',
      sql: `select public.ai_complete(
  'Write a compelling one-sentence pitch for why Supabase should hire Jesse Davies, ' ||
  'a full-stack developer from Adelaide who built a complete Supabase developer tool ' ||
  'featuring SQL runner, schema diagrams, RLS inspector, edge function explorer, ' ||
  'AI agent, and AgentPrism trace visualization — all to apply for this job.'${p}
) as pitch;`,
    },
    {
      label: 'AI: Summarize text',
      description: 'Summarize a paragraph with ai_summary()',
      sql: `select public.ai_summary(
  'Jesse Davies is a full-stack developer based in Adelaide, Australia. ' ||
  'He built this Supabase DevTool from scratch using Next.js, TypeScript, Tailwind, ' ||
  'and shadcn/ui as a live job application to Supabase. The tool connects to real ' ||
  'Supabase projects and surfaces schema, RLS policies, edge functions, SQL history, ' ||
  'storage, and more. He added an AI agent with multi-step tool use, an OpenTelemetry ' ||
  'trace viewer called AgentPrism, and now Postgres functions that call LLMs inline ' ||
  'from a SELECT statement — demonstrating end-to-end platform depth.'${pInline}
) as summary;`,
    },
    {
      label: 'AI: Summarize rows',
      description: 'Summarize rows with ai_summary(), one model call per row',
      sql: `with reasons (id, content) as (
  values
    (1, 'Jesse Davies built an entire Supabase developer tool as his job application. Not a cover letter. Not a portfolio link. A fully functional devtool. With dark mode. Who does that?'),
    (2, 'His app has a SQL runner, schema diagrams, RLS inspector, edge function explorer, AI agent, OTel trace viewer, AND now Postgres functions that call LLMs mid-SELECT. He did not know when to stop. Supabase should reward this behaviour.'),
    (3, 'Jesse is from Adelaide, which means he will never complain about timezone meetings because anything beats 3am Sydney standups. True remote-first energy. Hire accordingly.'),
    (4, 'He hit undocumented Supabase API edge cases — new key formats, opaque JWT exchange flows, Management API quirks — debugged them without filing a single angry GitHub issue, and shipped anyway. Saint-level patience.'),
    (5, 'Jesse built the tool he wished existed. Then he used the tool to apply for the job that would let him build more tools. This is either the most unhinged thing anyone has done or exactly the kind of person Supabase needs. Probably both.')
)
select id, public.ai_summary(content${pInline}) as why_hire_jesse
from reasons
order by id;`,
    },
    {
      label: 'AI: Classify',
      description: 'Classify each row into a category with ai_classify()',
      sql: `with feedback (id, body) as (
  values
    (1, 'This devtool is incredible — it made debugging RLS policies trivial.'),
    (2, 'The schema diagrams keep crashing on large projects. Really frustrating.'),
    (3, 'It works, I guess. Took a while to connect.')
)
select
  public.ai_classify(
    body,
    categories => array['praise', 'complaint', 'neutral']${p}
  ) as category
from feedback
order by id;`,
    },
    {
      label: 'AI: Sentiment',
      description: 'Get a sentiment label with ai_sentiment()',
      sql: `select public.ai_sentiment(
  'I cannot believe how polished this Supabase devtool is — schema introspection, ' ||
  'an RLS inspector, an AI agent, and now inline LLM calls straight from SQL. ' ||
  'This is the kind of platform depth that makes you want to build everything on Supabase.'${p}
) as sentiment;`,
    },
    {
      label: 'AI: Extract',
      description: 'Pull structured fields out of text as JSON with ai_extract()',
      sql: `select public.ai_extract(
  'Hi, I''m Jesse Davies (jesse@example.com) calling from Adelaide on +61 400 000 000. ' ||
  'I applied for the DX Engineer role at Supabase last week.',
  schema_hint => 'name, email, location, phone, company, role'${p}
) as extracted;`,
    },
    {
      label: 'AI: Embed',
      description: 'Generate an embedding vector with ai_embed() (returns real[])',
      sql: `select array_length(
  public.ai_embed(
    'Hire Jesse Davies — he built a full Supabase developer tool as his job application.'${p}
  ),
  1
) as dimensions;`,
    },
    {
      label: 'AI: Translate',
      description: 'Translate text with ai_translate()',
      sql: `select public.ai_translate(
  'Jesse built a complete Supabase developer tool — schema, RLS, edge functions, an AI agent, ' ||
  'and inline LLM calls from SQL — just to apply for this job.',
  target_language => 'French'${p}
) as translation;`,
    },
    {
      label: 'AI: Redact',
      description: 'Strip PII from text with ai_redact()',
      sql: `select public.ai_redact(
  'Logged in as jesse@example.com from +61 400 000 000. SSN 123-45-6789 verified identity.',
  entity_types => array['email', 'phone', 'ssn']${p}
) as redacted;`,
    },
    {
      label: 'AI: Summarize agg',
      description: 'GROUP BY → one ai_summarize_agg() call per group',
      sql: `with pitches (audience, content) as (
  values
    ('hiring',  'Jesse built a full Supabase devtool as his job application.'),
    ('hiring',  'It ships a SQL runner, RLS inspector, AI agent, and OTel traces.'),
    ('hiring',  'He debugged undocumented Supabase API edge cases and shipped anyway.'),
    ('product', 'The inline ai_* SQL functions let you call LLMs from a SELECT.'),
    ('product', 'ai_summarize_agg collapses a whole GROUP BY into one model call.'),
    ('product', 'AgentPrism visualizes the agent loop with OpenTelemetry spans.')
)
select
  audience,
  public.ai_summarize_agg(content) as collective_summary
from pitches
group by audience
order by audience;`,
    },
    {
      label: 'AI: Extract agg',
      description: 'GROUP BY → extract entities across each group with ai_extract_agg()',
      sql: `with threads (channel, message) as (
  values
    ('sales',   'Hi, I''m Dana (dana@acme.co) from Acme, +1 555 0100. Quote for 50 seats.'),
    ('sales',   'Marco at Globex here — marco@globex.io. We need enterprise pricing.'),
    ('support', 'Logged in as pat@example.com, phone +1 555 0142. Cannot reset password.'),
    ('support', 'User kim@other.io reporting 500s since the deploy.')
)
select
  channel,
  public.ai_extract_agg(message) as entities
from threads
group by channel
order by channel;`,
    },
  ]
}

// Mock results returned in Demo Mode so the button works without a real connection
const AI_DEMO_MOCK: Record<string, Array<Record<string, unknown>>> = {
  'AI: Tagline': [
    {
      pitch:
        'Hire Jesse Davies — the developer who built a full Supabase dev tool from scratch, shipped AgentPrism trace visualization, and wired LLMs directly into Postgres, all just to apply for this job.',
    },
  ],
  'AI: Summarize text': [
    {
      summary:
        'Jesse Davies is an Adelaide-based full-stack developer who built a comprehensive Supabase DevTool as a live job application, showcasing deep platform expertise across schema introspection, RLS, edge functions, AI agents, and OpenTelemetry tracing. His latest addition — Postgres functions that call LLMs inline from a SELECT statement — demonstrates his ability to combine database primitives with modern AI capabilities end-to-end.',
    },
  ],
  'AI: Summarize rows': [
    {
      id: 1,
      why_hire_jesse:
        'Jesse submitted a fully functional devtool with dark mode as his job application. Not a cover letter — an app. Supabase should at minimum be curious.',
    },
    {
      id: 2,
      why_hire_jesse:
        'He built a SQL runner, AI agent, OTel trace viewer, AND inline LLM calls from Postgres. He did not know when to stop. This is a feature, not a bug.',
    },
    {
      id: 3,
      why_hire_jesse:
        'Adelaide-based, which means zero timezone excuses and maximum remote-work discipline. He ships while the rest of the world is asleep.',
    },
    {
      id: 4,
      why_hire_jesse:
        'He hit undocumented Supabase API edge cases, debugged them without a single angry GitHub issue, and shipped anyway. This man has the patience of a saint and the output of three interns.',
    },
    {
      id: 5,
      why_hire_jesse:
        'He built the tool he wished existed, then used it to apply for the job. This is either deranged or genius. Supabase, of all companies, should recognise the difference is small.',
    },
  ],
  'AI: Classify': [{ category: 'praise' }, { category: 'complaint' }, { category: 'neutral' }],
  'AI: Sentiment': [{ sentiment: 'positive' }],
  'AI: Extract': [
    {
      extracted: {
        name: 'Jesse Davies',
        email: 'jesse@example.com',
        location: 'Adelaide',
        phone: '+61 400 000 000',
        company: 'Supabase',
        role: 'DX Engineer',
      },
    },
  ],
  'AI: Embed': [{ dimensions: 1536 }],
  'AI: Translate': [
    {
      translation:
        'Jesse a construit un outil de développement Supabase complet — schéma, RLS, fonctions edge, un agent IA et des appels LLM en ligne depuis SQL — juste pour postuler à ce poste.',
    },
  ],
  'AI: Redact': [
    {
      redacted: 'Logged in as [REDACTED] from [REDACTED]. [REDACTED] verified identity.',
    },
  ],
  'AI: Summarize agg': [
    {
      audience: 'hiring',
      collective_summary:
        'Jesse submitted a fully-featured Supabase devtool as his job application — covering a SQL runner, RLS inspector, AI agent, and OTel traces — and shipped it despite hitting undocumented API edge cases.',
    },
    {
      audience: 'product',
      collective_summary:
        'The tool adds inline ai_* SQL functions (including a GROUP BY aggregate that collapses a whole group into one model call) and AgentPrism, which visualizes the agent loop with OpenTelemetry spans.',
    },
  ],
  'AI: Extract agg': [
    {
      channel: 'sales',
      entities: {
        contacts: [
          {
            name: 'Dana',
            email: 'dana@acme.co',
            phone: '+1 555 0100',
            company: 'Acme',
            note: 'quote for 50 seats',
          },
          {
            name: 'Marco',
            email: 'marco@globex.io',
            company: 'Globex',
            note: 'enterprise pricing',
          },
        ],
      },
    },
    {
      channel: 'support',
      entities: {
        contacts: [
          { email: 'pat@example.com', phone: '+1 555 0142', note: 'cannot reset password' },
          { email: 'kim@other.io', note: '500s since the deploy' },
        ],
      },
    },
  ],
}

// ─── Export Helpers ───

function exportToCSV(rows: Array<Record<string, unknown>>, filename: string) {
  if (rows.length === 0) return

  const columnKeys = Object.keys(rows[0])
  const csvHeader = columnKeys.map(escapeCSVValue).join(',')
  const csvRows = rows.map((row) =>
    columnKeys.map((key) => escapeCSVValue(String(row[key] ?? ''))).join(',')
  )
  const csvContent = [csvHeader, ...csvRows].join('\n')

  downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;')
}

function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function exportToJSON(rows: Array<Record<string, unknown>>, filename: string) {
  const jsonContent = JSON.stringify(rows, null, 2)
  downloadFile(jsonContent, `${filename}.json`, 'application/json;charset=utf-8;')
}

// ─── Editor: syntax highlighting & formatting ───

const SQL_KEYWORDS = new Set(
  `select from where group by order having limit offset join inner left right full outer cross on
   as and or not in is null true false case when then else end union all except intersect distinct
   insert into values update set delete create table view index unique primary key foreign references
   alter add drop column constraint default cascade returning with recursive using exists between
   like ilike asc desc grant revoke begin commit rollback policy enable row level security to`
    .split(/\s+/)
    .filter(Boolean)
)

// Clauses that start a new line when Format runs; longest first so "GROUP BY"
// wins over a bare "BY".
const FORMAT_CLAUSES = [
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'FULL JOIN',
  'CROSS JOIN',
  'GROUP BY',
  'ORDER BY',
  'UNION ALL',
  'SELECT',
  'FROM',
  'WHERE',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'JOIN',
  'UNION',
  'RETURNING',
]

const TOKEN_RE = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * SQL → HTML for the highlight layer behind the editor textarea.
 * Input is escaped first, so the only markup emitted is our own spans.
 */
export function highlightSql(sql: string, tableNames: Set<string>): string {
  return escapeHtml(sql).replace(
    TOKEN_RE,
    (match, comment, str, num, word, offset: number, whole: string) => {
      if (comment) return `<span class="cm">${match}</span>`
      if (str) return `<span class="str">${match}</span>`
      if (num) return `<span class="num">${match}</span>`
      if (!word) return match
      if (SQL_KEYWORDS.has(word.toLowerCase())) return `<span class="kw">${match}</span>`
      // A name followed by "(" is a call; otherwise a known table gets the table colour.
      if (/^\s*\(/.test(whole.slice(offset + word.length))) {
        return `<span class="fn">${match}</span>`
      }
      if (tableNames.has(word.toLowerCase())) return `<span class="tbl">${match}</span>`
      return match
    }
  )
}

function formatChunk(chunk: string): string {
  let out = chunk.replace(/\s+/g, ' ')
  out = out.replace(/\b([A-Za-z_]\w*)\b/g, (word) =>
    SQL_KEYWORDS.has(word.toLowerCase()) ? word.toUpperCase() : word
  )
  for (const clause of FORMAT_CLAUSES) {
    out = out.replace(new RegExp(`\\s*\\b${clause}\\b`, 'g'), `\n${clause}`)
  }
  // Continuation keywords hang under the clause they belong to.
  out = out.replace(/\s+\b(AND|OR|ON)\b/g, '\n  $1')
  return out
}

/**
 * Light reformat: uppercase keywords, one clause per line. String literals are
 * split out first so their contents are never rewritten.
 */
export function formatSql(sql: string): string {
  const parts = sql.split(/('(?:[^']|'')*')/)
  return parts
    .map((part, i) => (i % 2 === 1 ? part : formatChunk(part)))
    .join('')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function SQLPanel() {
  const {
    activeConnectionId,
    connections,
    tables,
    addSqlResult,
    sqlEditorContent,
    setSqlEditorContent,
    sqlHistory,
    addSqlToHistory,
    clearSqlHistory,
    addActivityLog,
  } = useSupabaseStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null

  // Open .sql buffers. Component state, like the single buffer it replaces —
  // the panel unmounts on nav change either way.
  const [tabs, setTabs] = useState<QueryTab[]>([{ id: 'tab-1', name: 'query.sql', sql: '' }])
  const [activeTabId, setActiveTabId] = useState('tab-1')
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const query = activeTab.sql

  const setQuery = useCallback(
    (sql: string) => {
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, sql } : t)))
    },
    [activeTabId]
  )

  const addTab = useCallback(() => {
    const id = `tab-${Date.now()}`
    setTabs((prev) => [...prev, { id, name: `untitled-${prev.length + 1}.sql`, sql: '' }])
    setActiveTabId(id)
  }, [])

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        if (prev.length === 1) return prev
        const next = prev.filter((t) => t.id !== id)
        if (id === activeTabId) setActiveTabId(next[next.length - 1].id)
        return next
      })
    },
    [activeTabId]
  )

  // Sync from store (e.g., when Policy Generator pushes SQL)
  useEffect(() => {
    if (sqlEditorContent) {
      setQuery(sqlEditorContent)
      setSqlEditorContent('') // Clear after consuming
    }
  }, [sqlEditorContent, setSqlEditorContent, setQuery])
  const [isExecuting, setIsExecuting] = useState(false)
  const [result, setResult] = useState<SQLQueryResult | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedResults, setCopiedResults] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showVisualization, setShowVisualization] = useState(false)
  const [aiProvider, setAiProvider] = useState<AiProvider>('openai')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

  // Line numbers for the SQL editor
  const lineCount = query ? query.split('\n').length : 1

  // Known table names colour differently in the highlight layer.
  const tableNames = useMemo(() => new Set(tables.map((t) => t.tableName.toLowerCase())), [tables])

  // The textarea owns the scroll; the highlight and gutter follow it.
  const syncScroll = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    if (highlightRef.current) {
      highlightRef.current.scrollTop = el.scrollTop
      highlightRef.current.scrollLeft = el.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.style.transform = `translateY(-${el.scrollTop}px)`
    }
  }, [])

  /** Insert text from the schema browser at the caret. */
  const insertAtCaret = useCallback(
    (text: string) => {
      const el = textareaRef.current
      if (!el) {
        setQuery(query + text)
        return
      }
      const start = el.selectionStart ?? query.length
      const end = el.selectionEnd ?? start
      setQuery(query.slice(0, start) + text + query.slice(end))
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(start + text.length, start + text.length)
      })
    },
    [query, setQuery]
  )

  const executeQuery = useCallback(async () => {
    if (!activeConnectionId || !query.trim()) return
    setIsExecuting(true)
    setResult(null)
    setElapsedMs(null)
    const startedAt = performance.now()

    // Demo mode: return simulated results
    if (activeConnectionId === DEMO_CONNECTION_ID) {
      // Simulate a small delay for realism
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 300))
      setElapsedMs(Math.round(performance.now() - startedAt))
      const demoResult = getDemoSQLResult(query)
      setResult(demoResult)
      addSqlResult(demoResult)
      addSqlToHistory(query.trim())
      addActivityLog({
        type: 'sql',
        action: 'SQL query executed (demo)',
        details: query.trim().substring(0, 80) + (query.trim().length > 80 ? '...' : ''),
      })
      if (demoResult.success) {
        const rowCount = demoResult.data
          ? Array.isArray(demoResult.data)
            ? demoResult.data.length
            : 1
          : 0
        toast.success('Query executed (demo)', { description: `${rowCount} rows returned` })
      }
      setIsExecuting(false)
      return
    }

    try {
      const res = await apiFetch('/api/sql', activeConnection, { query: query.trim() })

      const data = await res.json()
      setElapsedMs(Math.round(performance.now() - startedAt))
      const sqlResult: SQLQueryResult = data.error ? { success: false, error: data.error } : data
      setResult(sqlResult)
      addSqlResult(sqlResult)
      addSqlToHistory(query.trim())
      track('sql_executed', { success: !data.error, query_length: query.trim().length })
      addActivityLog({
        type: 'sql',
        action: 'SQL query executed',
        details: query.trim().substring(0, 80) + (query.trim().length > 80 ? '...' : ''),
      })
      if (sqlResult.success) {
        const rowCount = sqlResult.data
          ? Array.isArray(sqlResult.data)
            ? sqlResult.data.length
            : 1
          : 0
        toast.success('Query executed', { description: `${rowCount} rows returned` })
      } else {
        toast.error('Query failed', { description: sqlResult.error || 'Unknown error' })
      }
    } catch {
      const errResult: SQLQueryResult = {
        success: false,
        error: 'Network error occurred',
      }
      setResult(errResult)
      addSqlResult(errResult)
      addSqlToHistory(query.trim())
    } finally {
      setIsExecuting(false)
    }
  }, [activeConnectionId, query, addSqlResult, addSqlToHistory, addActivityLog])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        executeQuery()
      }
    },
    [executeQuery]
  )

  const applyTemplate = useCallback(
    (templateName: string) => {
      const template = QUICK_TEMPLATES[templateName]
      if (template) {
        setQuery(template)
      }
    },
    [setQuery]
  )

  const runAiDemo = useCallback(
    async (demo: AiDemoButton) => {
      // demo.sql is already rendered with the current provider by getAiDemoButtons()
      if (!activeConnectionId) return
      setQuery(demo.sql)
      setIsExecuting(true)
      setResult(null)
      setElapsedMs(null)
      const startedAt = performance.now()

      if (activeConnectionId === DEMO_CONNECTION_ID) {
        await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 400))
        setElapsedMs(Math.round(performance.now() - startedAt))
        const rows = AI_DEMO_MOCK[demo.label] ?? []
        const demoResult: SQLQueryResult = { success: true, data: rows }
        setResult(demoResult)
        addSqlResult(demoResult)
        addSqlToHistory(demo.sql.trim())
        toast.success(`${demo.label} (demo)`, {
          description: `${rows.length} row${rows.length !== 1 ? 's' : ''} returned`,
        })
        setIsExecuting(false)
        return
      }

      try {
        const res = await apiFetch('/api/sql', activeConnection, { query: demo.sql.trim() })
        const data = await res.json()
        setElapsedMs(Math.round(performance.now() - startedAt))
        const sqlResult: SQLQueryResult = data.error ? { success: false, error: data.error } : data
        setResult(sqlResult)
        addSqlResult(sqlResult)
        addSqlToHistory(demo.sql.trim())
        addActivityLog({
          type: 'sql',
          action: `AI demo: ${demo.label}`,
          details: demo.sql.trim().substring(0, 80),
        })
        if (sqlResult.success) {
          const rowCount = sqlResult.data
            ? Array.isArray(sqlResult.data)
              ? sqlResult.data.length
              : 1
            : 0
          toast.success(demo.label, {
            description: `${rowCount} row${rowCount !== 1 ? 's' : ''} returned`,
          })
        } else {
          toast.error(`${demo.label} failed`, { description: sqlResult.error || 'Unknown error' })
        }
      } catch {
        const errResult: SQLQueryResult = { success: false, error: 'Network error occurred' }
        setResult(errResult)
        addSqlResult(errResult)
      } finally {
        setIsExecuting(false)
      }
    },
    [activeConnectionId, activeConnection, addSqlResult, addSqlToHistory, addActivityLog, setQuery]
  )

  const copyToClipboard = useCallback((text: string, type: 'query' | 'results') => {
    navigator.clipboard.writeText(text)
    if (type === 'query') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setCopiedResults(true)
      setTimeout(() => setCopiedResults(false), 2000)
    }
  }, [])

  // Parse result data into rows for table display
  const parseResultRows = useCallback((data: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(data)) return data as Array<Record<string, unknown>>
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>
      if (Array.isArray(obj.rows)) return obj.rows as Array<Record<string, unknown>>
      if (Array.isArray(obj.data)) return obj.data as Array<Record<string, unknown>>
      if (Array.isArray(obj.result)) return obj.result as Array<Record<string, unknown>>
      // Try first array value
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) return value as Array<Record<string, unknown>>
      }
      // It's a single object, wrap in array
      return [obj]
    }
    return []
  }, [])

  const resultRows = result?.data ? parseResultRows(result.data) : []
  const columnKeys = resultRows.length > 0 ? Object.keys(resultRows[0]) : []

  const handleExportCSV = useCallback(() => {
    if (resultRows.length === 0) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    exportToCSV(resultRows, `query-result-${timestamp}`)
    toast.success('Exported CSV', { description: `${resultRows.length} rows exported` })
  }, [resultRows])

  const handleExportJSON = useCallback(() => {
    if (resultRows.length === 0) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    exportToJSON(resultRows, `query-result-${timestamp}`)
    toast.success('Exported JSON', { description: `${resultRows.length} rows exported` })
  }, [resultRows])

  if (!activeConnectionId) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Terminal className="mb-3 size-12 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No connection selected</p>
            <p className="text-xs text-muted-foreground">
              Connect to a Supabase project to run SQL queries
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isDemo = activeConnectionId === DEMO_CONNECTION_ID

  return (
    <Tabs
      defaultValue="query-runner"
      className="flex h-[calc(100vh-150px)] min-h-[560px] flex-col overflow-hidden rounded-lg border border-border"
    >
      {/* Module header */}
      <div className="flex items-center gap-4 border-b border-border bg-card px-5 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="size-3.5 text-primary" />
          <span className="text-sm font-medium tracking-tight">SQL</span>
        </div>
        <TabsList className="h-auto gap-0.5 rounded-md border border-border bg-secondary p-0.5">
          <TabsTrigger value="query-runner" className="h-auto rounded px-3 py-1 text-xs">
            Query runner
          </TabsTrigger>
          <TabsTrigger value="migrations" className="h-auto rounded px-3 py-1 text-xs">
            Migrations
          </TabsTrigger>
          <TabsTrigger value="analyzer" className="h-auto rounded px-3 py-1 text-xs">
            Analyzer
          </TabsTrigger>
        </TabsList>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-amber-500">
          <AlertTriangle className="size-3" />
          {isDemo
            ? 'Demo mode — results are simulated'
            : 'Management API access — use with caution'}
        </span>
      </div>

      {/* Query Runner */}
      <TabsContent
        value="query-runner"
        className="mt-0 flex min-h-0 flex-1 items-stretch data-[state=inactive]:hidden"
      >
        <SqlSchemaBrowser onInsert={insertAtCaret} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Editor tab strip + actions */}
          <div className="flex items-center border-b border-border bg-card">
            <div className="flex min-w-0 items-center overflow-x-auto">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTab.id
                return (
                  <div
                    key={tab.id}
                    className={cn(
                      'flex shrink-0 items-center gap-2 border-r border-border px-4 py-2.5',
                      isActive
                        ? 'border-t-2 border-t-primary bg-background'
                        : 'border-t-2 border-t-transparent'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveTabId(tab.id)}
                      className={cn(
                        'font-mono text-xs',
                        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab.name}
                    </button>
                    {isActive && tabs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => closeTab(tab.id)}
                        aria-label={`Close ${tab.name}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                )
              })}
              <button
                type="button"
                onClick={addTab}
                aria-label="New query tab"
                className="shrink-0 px-3 py-2.5 text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2 px-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-[26px] text-xs"
                onClick={() => setQuery(formatSql(query))}
                disabled={!query.trim()}
              >
                Format
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-[26px] w-[26px] p-0"
                onClick={() => copyToClipboard(query, 'query')}
                disabled={!query.trim()}
                aria-label="Copy query"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </Button>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger size="sm" className="h-[26px] w-[110px] text-xs">
                  <SelectValue placeholder="Templates" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(QUICK_TEMPLATES).map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-[26px] gap-1.5 text-xs">
                    <Sparkles className="size-3 text-primary" />
                    AI demos
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal">
                    <span className="text-xs text-muted-foreground">Provider</span>
                    <span className="flex items-center overflow-hidden rounded-md border border-border text-[10px] font-medium">
                      <button
                        type="button"
                        className={cn(
                          'px-2 py-0.5 transition-colors',
                          aiProvider === 'openai'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                        onClick={(e) => {
                          e.preventDefault()
                          setAiProvider('openai')
                        }}
                      >
                        OpenAI
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'px-2 py-0.5 transition-colors',
                          aiProvider === 'supabase'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                        onClick={(e) => {
                          e.preventDefault()
                          setAiProvider('supabase')
                        }}
                      >
                        Supabase AI
                      </button>
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {getAiDemoButtons(aiProvider).map((demo) => (
                    <DropdownMenuItem
                      key={demo.label}
                      disabled={isExecuting}
                      onSelect={() => runAiDemo(demo)}
                      className="flex-col items-start gap-0.5"
                    >
                      <span className="text-xs font-medium">{demo.label}</span>
                      <span className="text-[11px] text-muted-foreground">{demo.description}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                className="h-[26px] gap-1.5 text-xs"
                onClick={executeQuery}
                disabled={isExecuting || !query.trim()}
              >
                {isExecuting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Play className="size-3" />
                )}
                Run ⌘⏎
              </Button>
            </div>
          </div>

          {/* Editor — textarea owns the scroll, highlight and gutter follow it */}
          <div className="relative min-h-0 flex-1 font-mono text-[13px] leading-[1.75]">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-11 overflow-hidden border-r border-border bg-card">
              <div
                ref={gutterRef}
                className="select-none pt-3 pr-3 text-right text-muted-foreground/60"
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={`line-${i + 1}`}>{i + 1}</div>
                ))}
              </div>
            </div>
            <pre
              ref={highlightRef}
              aria-hidden="true"
              className="sql-hl pointer-events-none absolute inset-0 overflow-hidden whitespace-pre py-3 pr-4 pl-[56px] text-foreground/90"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: highlightSql escapes & < > before tokenising, so the only markup here is its own <span> tags.
              dangerouslySetInnerHTML={{ __html: `${highlightSql(query, tableNames)}\n` }}
            />
            <textarea
              ref={textareaRef}
              value={query}
              wrap="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onScroll={syncScroll}
              onKeyDown={handleKeyDown}
              placeholder="SELECT * FROM your_table LIMIT 10;"
              // The global :focus-visible outline would float outside the editor pane;
              // pull it inside so the focused editor reads as a framed region.
              className="absolute inset-0 size-full resize-none overflow-auto whitespace-pre bg-transparent py-3 pr-4 pl-[56px] text-transparent caret-foreground placeholder:text-muted-foreground/50 focus-visible:[border-radius:0] focus-visible:[outline-offset:-1px]"
            />
          </div>

          {/* Query history */}
          {showHistory && sqlHistory.length > 0 && (
            <div className="max-h-40 shrink-0 overflow-auto border-t border-border bg-card">
              {sqlHistory.map((histQuery, idx) => (
                <button
                  key={`${histQuery.slice(0, 20)}-${idx}`}
                  type="button"
                  className="flex w-full items-center gap-2 border-b border-border px-4 py-2 text-left last:border-0 hover:bg-secondary"
                  onClick={() => setQuery(histQuery)}
                >
                  <History className="size-3 shrink-0 text-muted-foreground" />
                  <code className="truncate font-mono text-xs text-foreground/80">
                    {histQuery.length > 100 ? `${histQuery.slice(0, 100)}…` : histQuery}
                  </code>
                </button>
              ))}
              <div className="px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSqlHistory}
                  className="h-6 w-full gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                  Clear history
                </Button>
              </div>
            </div>
          )}

          {/* Results dock */}
          <div className="shrink-0 border-t border-border bg-card">
            {result ? (
              <>
                <div className="flex items-center gap-3.5 border-b border-border px-4 py-2">
                  {result.success ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <XCircle className="size-3.5 shrink-0 text-red-500" />
                  )}
                  <span className="text-xs font-medium">
                    {result.success ? 'Query executed' : 'Query failed'}
                  </span>
                  {result.success && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {resultRows.length} row{resultRows.length !== 1 ? 's' : ''}
                      {elapsedMs !== null && ` · ${elapsedMs} ms`}
                    </span>
                  )}
                  {resultRows.length > 0 && (
                    <div className="ml-auto flex gap-1">
                      <Button
                        variant={showVisualization ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-[26px] text-xs"
                        onClick={() => setShowVisualization(!showVisualization)}
                      >
                        <BarChart3 className="mr-1 size-3" />
                        Visualize
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-[26px] text-xs"
                        onClick={() =>
                          copyToClipboard(JSON.stringify(resultRows, null, 2), 'results')
                        }
                      >
                        {copiedResults ? (
                          <Check className="mr-1 size-3" />
                        ) : (
                          <Copy className="mr-1 size-3" />
                        )}
                        Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-[26px] text-xs"
                        onClick={handleExportCSV}
                      >
                        <FileText className="mr-1 size-3" />
                        CSV
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-[26px] text-xs"
                        onClick={handleExportJSON}
                      >
                        <FileJson className="mr-1 size-3" />
                        JSON
                      </Button>
                    </div>
                  )}
                </div>

                {result.error && (
                  <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
                    <AlertDescription className="font-mono text-xs whitespace-pre-wrap">
                      {result.error}
                    </AlertDescription>
                  </Alert>
                )}

                {resultRows.length > 0 && columnKeys.length > 0 && (
                  <div className="max-h-[34vh] overflow-auto">
                    <div
                      className="grid min-w-max border-b border-border font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                      style={{
                        gridTemplateColumns: `repeat(${columnKeys.length}, minmax(110px, 1fr))`,
                      }}
                    >
                      {columnKeys.map((key) => (
                        <span
                          key={key}
                          className="truncate border-r border-border px-4 py-1.5 last:border-r-0"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                    {resultRows.slice(0, 50).map((row, rowIdx) => (
                      <div
                        key={`row-${rowIdx}`}
                        className="grid min-w-max border-b border-border/60 font-mono text-xs text-foreground/70 last:border-b-0 hover:bg-secondary/50"
                        style={{
                          gridTemplateColumns: `repeat(${columnKeys.length}, minmax(110px, 1fr))`,
                        }}
                      >
                        {columnKeys.map((key) => (
                          <span
                            key={key}
                            className="truncate border-r border-border/60 px-4 py-1.5 last:border-r-0"
                            title={row[key] === null ? 'NULL' : String(row[key])}
                          >
                            {row[key] === null ? (
                              <span className="italic text-muted-foreground">NULL</span>
                            ) : typeof row[key] === 'object' ? (
                              JSON.stringify(row[key])
                            ) : (
                              String(row[key])
                            )}
                          </span>
                        ))}
                      </div>
                    ))}
                    {resultRows.length > 50 && (
                      <p className="px-4 py-2 text-center text-xs text-muted-foreground">
                        Showing 50 of {resultRows.length} rows
                      </p>
                    )}
                  </div>
                )}

                {result.success && resultRows.length === 0 && !result.error && (
                  <p className="px-4 py-4 text-center text-xs text-muted-foreground">
                    Query executed successfully. No rows returned.
                  </p>
                )}

                {showVisualization && resultRows.length > 0 && (
                  <div className="border-t border-border p-4">
                    <QueryChart data={resultRows} />
                  </div>
                )}
              </>
            ) : (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                Run a query to see results here. ⌘⏎ executes.
              </p>
            )}

            <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                disabled={sqlHistory.length === 0}
                className="flex items-center gap-1.5 transition-colors hover:text-foreground disabled:hover:text-muted-foreground"
              >
                <History className="size-3" />
                Query history
                <span className="font-mono">{sqlHistory.length}</span>
                {sqlHistory.length > 0 &&
                  (showHistory ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronUp className="size-3" />
                  ))}
              </button>
              <span className="ml-auto">
                {isDemo ? 'Simulated · no database contacted' : 'Read-only role · Management API'}
              </span>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="migrations" className="mt-0 min-h-0 flex-1 overflow-auto p-3">
        <MigrationRunner />
      </TabsContent>

      <TabsContent value="analyzer" className="mt-0 min-h-0 flex-1 overflow-auto p-3">
        <QueryAnalyzer activeConnectionId={activeConnectionId} query={query} />
      </TabsContent>
    </Tabs>
  )
}
