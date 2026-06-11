'use client'

import { useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// ─── Data ────────────────────────────────────────────────────────────────────

const COLS = [
  'fb',
  'fts',
  'jsonb',
  'cit',
  'clim',
  'pool',
  'cps',
  'batch',
  'n+1',
  'page',
  'ups',
  'adv',
  'dead',
  'stx',
  'skip',
  'expl',
  'pgss',
  'vac',
  'comp',
  'cov',
  'ityp',
  'midx',
  'pidx',
  'con',
  'dt',
  'fk',
  'low',
  'part',
  'pk',
  'priv',
  'rls',
  'rlsp',
]

const PROMPTS = [
  {
    p: 'I want to create a supabase table',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I create a users table',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0,
      0,
    ],
  },
  {
    p: 'add a new table for blog posts',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0,
      0,
    ],
  },
  {
    p: 'UUID or serial for primary key?',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
      0,
    ],
  },
  {
    p: 'I need to store user profiles',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1,
      0,
    ],
  },
  {
    p: 'how do I add a foreign key relationship',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'what column type for JSON data',
    c: 'schema',
    h: [
      0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'best data type for timestamps',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'prevent duplicate email addresses',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'my table is growing huge',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'add a column that references another table',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'column names: lowercase or uppercase?',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'many-to-many relationship between tables',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'partition a really large table',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'add a constraint to validate column values',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I make a column not null',
    c: 'schema',
    h: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'store user settings as key-value pairs',
    c: 'schema',
    h: [
      0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'auto-incrementing ID column',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
      0,
    ],
  },
  {
    p: 'model a tree hierarchy in postgres',
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: "what's wrong with using TEXT for everything",
    c: 'schema',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'users should only see their own data',
    c: 'security',
    h: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I set up row level security',
    c: 'security',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      1,
    ],
  },
  {
    p: 'restrict table access based on logged-in user',
    c: 'security',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      0,
    ],
  },
  {
    p: "I'm building a multi-tenant app",
    c: 'security',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1,
      1,
    ],
  },
  {
    p: 'give read-only access to an analytics role',
    c: 'security',
    h: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'RLS is making my queries really slow',
    c: 'security',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1,
    ],
  },
  {
    p: 'how do I write an RLS policy',
    c: 'security',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      1,
    ],
  },
  {
    p: 'apply least privilege to database roles',
    c: 'security',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0,
      0,
    ],
  },
  {
    p: 'enable RLS on an existing table',
    c: 'security',
    h: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      1,
    ],
  },
  {
    p: 'how do I isolate data between tenants',
    c: 'security',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      1,
    ],
  },
  {
    p: 'grant minimal permissions to a service account',
    c: 'security',
    h: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: "my RLS policies aren't working",
    c: 'security',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      1,
    ],
  },
  {
    p: 'I accidentally gave too many permissions',
    c: 'security',
    h: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'my queries are slow',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I speed up this query',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'what index should I add',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: "I'm getting N+1 queries",
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'pagination is really slow on large tables',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'I need full text search',
    c: 'performance',
    h: [
      0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'query JSONB columns efficiently',
    c: 'performance',
    h: [
      0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'composite vs multiple separate indexes',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'when should I use a partial index',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'SELECT * is probably bad right',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'my count query takes forever',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'index on a low-cardinality column',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I avoid sequential scans',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'filter and sort by multiple columns',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'GIN vs GiST vs BRIN indexes',
    c: 'performance',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'search across multiple text columns',
    c: 'performance',
    h: [
      0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'I keep getting too many connections error',
    c: 'connections',
    h: [
      0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I set up connection pooling',
    c: 'connections',
    h: [
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'what is pgbouncer',
    c: 'connections',
    h: [
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how many database connections to allow',
    c: 'connections',
    h: [
      0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: "I'm getting connection timeout errors",
    c: 'connections',
    h: [
      0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'prepared statements not working with pooler',
    c: 'connections',
    h: [
      0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'idle connections piling up',
    c: 'connections',
    h: [
      0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'supabase connection limits',
    c: 'connections',
    h: [
      0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'transaction mode vs session mode pooling',
    c: 'connections',
    h: [
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'running out of connections in production',
    c: 'connections',
    h: [
      0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'connection pool from my app',
    c: 'connections',
    h: [
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I insert many rows at once',
    c: 'data-ops',
    h: [
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'I need to upsert records',
    c: 'data-ops',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I avoid duplicate inserts',
    c: 'data-ops',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'bulk import a CSV into postgres',
    c: 'data-ops',
    h: [
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'insert or update in a single query',
    c: 'data-ops',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'paginate through millions of rows',
    c: 'data-ops',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'cursor-based vs offset pagination',
    c: 'data-ops',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'process records in batches',
    c: 'data-ops',
    h: [
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'efficiently migrate data between tables',
    c: 'data-ops',
    h: [
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I handle concurrent upserts',
    c: 'data-ops',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'my queries are blocking each other',
    c: 'locking',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I avoid deadlocks',
    c: 'locking',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'long running transactions blocking other queries',
    c: 'locking',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'I need to process a job queue concurrently',
    c: 'locking',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'I need distributed application-level locking',
    c: 'locking',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'transactions timing out waiting for locks',
    c: 'locking',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do SKIP LOCKED queues work',
    c: 'locking',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'lock contention is killing performance',
    c: 'locking',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'safely run migrations without downtime',
    c: 'locking',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I find slow queries',
    c: 'monitoring',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'explain this query with EXPLAIN ANALYZE',
    c: 'monitoring',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'postgres query statistics and logging',
    c: 'monitoring',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'table bloat and when to vacuum',
    c: 'monitoring',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I monitor database performance',
    c: 'monitoring',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'autovacuum is not keeping up',
    c: 'monitoring',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'track which queries run most often',
    c: 'monitoring',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I read a query plan',
    c: 'monitoring',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: "I'm building a new app with Supabase",
    c: 'general',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'my Supabase database is running slow',
    c: 'general',
    h: [
      0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'best practices for a Supabase project',
    c: 'general',
    h: [
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1,
      0,
    ],
  },
  {
    p: "I'm new to Supabase, where do I start",
    c: 'general',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'how do I structure my database schema',
    c: 'general',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0,
      0,
    ],
  },
  {
    p: 'migrating from Firebase to Supabase',
    c: 'general',
    h: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'set up Supabase for a SaaS app',
    c: 'general',
    h: [
      0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1,
      0,
    ],
  },
  {
    p: 'how do I use Supabase auth with my tables',
    c: 'general',
    h: [
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'I need to optimize my Supabase database',
    c: 'general',
    h: [
      0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0,
      0,
    ],
  },
  {
    p: 'what are the Supabase database limits',
    c: 'general',
    h: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ],
  },
]

const REFS = [
  { id: 'fb', name: 'schema-feedback', hits: 8 },
  { id: 'fts', name: 'full-text-search', hits: 2 },
  { id: 'jsonb', name: 'jsonb-indexing', hits: 3 },
  { id: 'cit', name: 'conn-idle-timeout', hits: 4 },
  { id: 'clim', name: 'conn-limits', hits: 6 },
  { id: 'pool', name: 'conn-pooling', hits: 13 },
  { id: 'cps', name: 'conn-prepared-stmts', hits: 1 },
  { id: 'batch', name: 'data-batch-inserts', hits: 4 },
  { id: 'n+1', name: 'data-n-plus-one', hits: 6 },
  { id: 'page', name: 'data-pagination', hits: 5 },
  { id: 'ups', name: 'data-upsert', hits: 4 },
  { id: 'adv', name: 'lock-advisory', hits: 8 },
  { id: 'dead', name: 'lock-deadlock', hits: 8 },
  { id: 'stx', name: 'lock-short-txns', hits: 13 },
  { id: 'skip', name: 'lock-skip-locked', hits: 6 },
  { id: 'expl', name: 'monitor-explain', hits: 21 },
  { id: 'pgss', name: 'monitor-pg-stat-stmts', hits: 14 },
  { id: 'vac', name: 'monitor-vacuum', hits: 7 },
  { id: 'comp', name: 'query-composite-idx', hits: 8 },
  { id: 'cov', name: 'query-covering-idx', hits: 2 },
  { id: 'ityp', name: 'query-index-types', hits: 4 },
  { id: 'midx', name: 'query-missing-idx', hits: 11 },
  { id: 'pidx', name: 'query-partial-idx', hits: 3 },
  { id: 'con', name: 'schema-constraints', hits: 10 },
  { id: 'dt', name: 'schema-data-types', hits: 12 },
  { id: 'fk', name: 'schema-foreign-keys', hits: 8 },
  { id: 'low', name: 'schema-lowercase', hits: 2 },
  { id: 'part', name: 'schema-partitioning', hits: 4 },
  { id: 'pk', name: 'schema-primary-keys', hits: 10 },
  { id: 'priv', name: 'security-privileges', hits: 3 },
  { id: 'rls', name: 'security-rls-basics', hits: 10 },
  { id: 'rlsp', name: 'security-rls-perf', hits: 7 },
]

type Category =
  | 'schema'
  | 'security'
  | 'performance'
  | 'connections'
  | 'data-ops'
  | 'locking'
  | 'monitoring'
  | 'general'

const CAT_STYLES: Record<string, string> = {
  schema: 'bg-[#EEEDFE] text-[#3C3489] dark:bg-[#26215C] dark:text-[#CECBF6]',
  security: 'bg-[#FAECE7] text-[#993C1D] dark:bg-[#4A1B0C] dark:text-[#F5C4B3]',
  performance: 'bg-[#E6F1FB] text-[#0C447C] dark:bg-[#042C53] dark:text-[#B5D4F4]',
  connections: 'bg-[#EAF3DE] text-[#3B6D11] dark:bg-[#173404] dark:text-[#C0DD97]',
  'data-ops': 'bg-[#FAEEDA] text-[#854F0B] dark:bg-[#412402] dark:text-[#FAC775]',
  locking: 'bg-[#FBEAF0] text-[#993556] dark:bg-[#4B1528] dark:text-[#F4C0D1]',
  monitoring: 'bg-[#E1F5EE] text-[#0F6E56] dark:bg-[#04342C] dark:text-[#9FE1CB]',
  general: 'bg-[#F1EFE8] text-[#5F5E5A] dark:bg-[#2C2C2A] dark:text-[#D3D1C7]',
}

const CAT_CHART_COLORS = [
  '#7F77DD',
  '#D85A30',
  '#378ADD',
  '#639922',
  '#EF9F27',
  '#D4537E',
  '#1D9E75',
  '#888780',
]
const CATEGORIES = [
  'schema',
  'security',
  'performance',
  'connections',
  'data-ops',
  'locking',
  'monitoring',
  'general',
] as const

// ─── Derived stats ────────────────────────────────────────────────────────────

function getCatChartData() {
  return CATEGORIES.map((cat) => {
    const rows = PROMPTS.filter((p) => p.c === cat)
    const avg = rows.reduce((sum, p) => sum + p.h.reduce((a, b) => a + b, 0), 0) / rows.length
    return { name: cat, avg: parseFloat(avg.toFixed(2)) }
  })
}

const TOP_HIT_RATE = Math.max(...REFS.map((r) => r.hits)) / PROMPTS.length

// ─── Component ───────────────────────────────────────────────────────────────

export function SkillCoverageMatrix() {
  const [view, setView] = useState<'matrix' | 'hitrates' | 'bycat'>('matrix')
  const [catFilter, setCatFilter] = useState<Category | 'all'>('all')

  const visiblePrompts = catFilter === 'all' ? PROMPTS : PROMPTS.filter((p) => p.c === catFilter)
  const sortedRefs = [...REFS].sort((a, b) => b.hits - a.hits)
  const maxHits = sortedRefs[0].hits
  const catChartData = getCatChartData()

  return (
    <div className="space-y-5 text-sm">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { val: '97', lbl: 'Total prompts' },
          { val: '32', lbl: 'References tracked' },
          { val: '8', lbl: 'Categories' },
          { val: `${Math.round(TOP_HIT_RATE * 100)}%`, lbl: 'Top hit rate' },
        ].map(({ val, lbl }) => (
          <div key={lbl} className="rounded-lg border bg-card p-3">
            <div className="text-2xl font-medium">{val}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{lbl}</div>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['matrix', 'hitrates', 'bycat'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
              view === v
                ? 'bg-muted text-foreground border-border'
                : 'text-muted-foreground border-border/50 hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {{ matrix: 'Coverage matrix', hitrates: 'Hit rates', bycat: 'By category' }[v]}
          </button>
        ))}
      </div>

      {/* Coverage matrix */}
      {view === 'matrix' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Filter
            </span>
            {(['all', ...CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors border ${
                  catFilter === cat
                    ? 'bg-primary text-primary-foreground border-primary'
                    : cat === 'all'
                      ? 'border-border text-muted-foreground hover:text-foreground'
                      : `${CAT_STYLES[cat]} border-transparent`
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-[3px] bg-primary" />
              cited
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-[3px] bg-muted border border-border" />
              not cited
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="text-[11px] border-collapse w-full">
              <thead>
                <tr>
                  <th className="text-left font-medium text-muted-foreground p-2 min-w-[200px] sticky left-0 bg-card z-10 border-r border-border">
                    Prompt
                  </th>
                  <th className="text-left font-medium text-muted-foreground p-2 min-w-[80px]">
                    Category
                  </th>
                  {COLS.map((c) => (
                    <th
                      key={c}
                      title={REFS.find((r) => r.id === c)?.name}
                      className="font-medium text-muted-foreground p-0"
                      style={{ height: 80, verticalAlign: 'bottom' }}
                    >
                      <div
                        style={{
                          writingMode: 'vertical-rl',
                          transform: 'rotate(180deg)',
                          paddingBottom: 4,
                          textAlign: 'left',
                          fontSize: 10,
                        }}
                      >
                        {c}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiblePrompts.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/40 transition-colors">
                    <td
                      className="p-1.5 pr-3 max-w-[260px] truncate text-foreground sticky left-0 bg-card border-r border-border"
                      title={row.p}
                    >
                      {row.p}
                    </td>
                    <td className="p-1.5 pr-3 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${CAT_STYLES[row.c] ?? ''}`}
                      >
                        {row.c}
                      </span>
                    </td>
                    {row.h.map((v, j) => (
                      <td key={j} className="p-0.5" style={{ width: 18 }}>
                        <div
                          className={`w-3.5 h-3.5 rounded-[3px] mx-auto ${v ? 'bg-primary' : 'bg-muted border border-border/50'}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hit rates */}
      {view === 'hitrates' && (
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            References ranked by citation frequency ({PROMPTS.length} prompts)
          </p>
          <div className="space-y-1.5">
            {sortedRefs.map((r) => {
              const pct = Math.round((r.hits / PROMPTS.length) * 100)
              const w = Math.round((r.hits / maxHits) * 100)
              return (
                <div key={r.id} className="flex items-center gap-3 text-[11px]">
                  <div className="w-44 shrink-0 text-right text-muted-foreground truncate">
                    {r.name}
                  </div>
                  <div className="flex-1 h-3.5 bg-muted rounded-sm overflow-hidden">
                    <div className="h-full bg-primary rounded-sm" style={{ width: `${w}%` }} />
                  </div>
                  <div className="w-8 shrink-0 text-right text-muted-foreground">{pct}%</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* By category */}
      {view === 'bycat' && (
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            Average references cited per prompt, by category
          </p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%" debounce={100}>
              <BarChart data={catChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  formatter={(v: number) => [v, 'avg refs']}
                />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                  {catChartData.map((_, i) => (
                    <Cell key={i} fill={CAT_CHART_COLORS[i % CAT_CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
