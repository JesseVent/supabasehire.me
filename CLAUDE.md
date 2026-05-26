# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Supabase developer tool built with Next.js 16 App Router. It lets you connect to multiple Supabase projects and inspect schema, RLS policies, edge functions, run SQL, view indexes/triggers, and more. Has a Demo Mode that works without a real connection.

## Commands

```bash
# Dev server (Bun, port 3000)
bun dev

# Build (outputs standalone bundle)
bun run build

# Production start
bun start

# Lint
bun run lint

# Prisma (SQLite database for storing connections)
bun run db:push        # push schema changes
bun run db:generate    # regenerate Prisma client
bun run db:migrate     # create and apply a migration
bun run db:reset       # wipe and re-seed
```

Requires `DATABASE_URL` env var pointing to `db/custom.db` (e.g. `DATABASE_URL="file:./db/custom.db"`).

## Architecture

**Single-page shell + dynamic panels.** `src/app/page.tsx` is the main shell — it manages navigation, connection selection, and renders the active panel. All feature panels (`src/components/*.tsx`) are dynamically imported with `next/dynamic` for lazy loading.

**API routes** (`src/app/api/`) are the backend. Each route:
1. Reads a `connectionId` from the request
2. Looks up the connection in SQLite via Prisma (`src/lib/db.ts`)
3. Calls helper functions from `src/lib/supabase-helpers.ts` that hit either the Supabase Management API (needs `accessToken`) or the Supabase REST API (needs `serviceRoleKey`)

**API route map:**
- `connections/` — CRUD for stored connections
- `connections/[id]/health` — ping/health check
- `schema/` — introspects tables, columns, foreign keys via `information_schema`
- `rls/` — RLS enable status + policies
- `sql/` — execute arbitrary SQL
- `tables/rows/` — fetch row data from a table
- `edge-functions/` — list functions; `invoke/` — call a function
- `database/indexes/`, `triggers/`, `views-functions/` — additional introspection
- `project/` — project metadata

**State** is managed by a single Zustand store (`src/store/supabase-store.ts`) with `persist` middleware (key: `supabase-debug-storage`). Connections, SQL history, schema snapshots, migration history, and latency records are persisted to `localStorage`. Transient state (loaded tables, test results, loading/error flags) is not persisted.

**Two Supabase auth paths:**
- Management API (`https://api.supabase.com/v1/projects/{ref}/...`) — requires `accessToken` (personal access token). Used for schema introspection and SQL execution.
- REST/PostgREST API (`{supabaseUrl}/rest/v1/...`) — requires `serviceRoleKey`. Used for row data and RLS simulation.

**Types** are centralized in `src/lib/supabase-types.ts`. Import all shared interfaces from there.

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main shell, nav, connection management UI |
| `src/store/supabase-store.ts` | All application state (Zustand + persist) |
| `src/lib/supabase-types.ts` | All shared TypeScript interfaces |
| `src/lib/supabase-helpers.ts` | Server-side functions calling Supabase APIs |
| `src/lib/supabase-client.ts` | Client-side `createClient` factory |
| `src/lib/db.ts` | Prisma client singleton |
| `src/lib/demo-data.ts` | Mock data for Demo Mode |
| `prisma/schema.prisma` | Single model: `SupabaseConnection` (SQLite) |

## Notes

- `next.config.ts` has `typescript: { ignoreBuildErrors: true }` — TypeScript errors won't fail the build, but type correctness still matters for maintainability.
- ESLint is configured very permissively (most rules disabled) — don't rely on lint to catch issues.
- `reactStrictMode: false` — effects run once in dev.
- The `examples/` directory contains development task prompts/worklog artifacts, not source code.
