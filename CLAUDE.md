# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Supabase developer tool built with Next.js 16 App Router. Connect to multiple Supabase projects and inspect schema, RLS policies, edge functions, run SQL, view indexes/triggers, profile tables, and more. Has a Demo Mode that works without a real connection.

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
```

No environment variables are required to run the app. There is no local database — no Prisma, no SQLite. See `.env.example` for optional config (LLM API keys, S3/Iceberg pre-fill).

## Architecture

**Single-page shell + dynamic panels.** `src/app/page.tsx` is the main shell — it manages navigation, connection selection, and renders the active panel. All feature panels (`src/components/*.tsx`) are dynamically imported with `next/dynamic` for lazy loading.

**API routes** (`src/app/api/`) are the backend. Each route reads connection credentials directly from the request body and proxies calls to Supabase. There is no server-side database — credentials come from the client on each request.

**API route map:**
- `agent/chat/` — server proxy for LLM calls (OpenAI / Anthropic / Google); injects API key server-side
- `catalog/setup` — creates `catalog_tables` + `catalog_columns` tables in the connected project
- `catalog/profile` — runs data profiling queries (row counts, null %, distinct, min/max)
- `catalog/load` — retrieves stored catalog metadata
- `catalog/commit` — saves AI-generated descriptions back to catalog
- `connections/` — CRUD for stored connections (credentials validated client-side)
- `connections/[id]/health` — four-point health check (URL, anon key, access token, service role key)
- `schema/` — introspects tables, columns, foreign keys (Management API SQL → PostgREST OpenAPI → REST discovery)
- `rls/` — RLS enable status + policies
- `sql/` — execute arbitrary SQL via Management API
- `tables/rows/` — fetch paginated row data via PostgREST (prefers `serviceRoleKey` to bypass RLS)
- `edge-functions/` + `invoke/` — list and call edge functions
- `database/indexes/`, `triggers/`, `views-functions/` — Management API SQL introspection
- `project/` — project metadata
- `realtime-token/` — generate a Realtime WebSocket auth token
- `storage/` — bucket/folder browsing via Supabase Storage API
- `storage/download/` — proxy for file download

**State** is managed by two Zustand stores, both with `persist` middleware to `localStorage`:
- `src/store/supabase-store.ts` (key: `supabase-debug-storage`) — connections, activeConnectionId, activePanel, SQL history, schema snapshots, migration history, latency records. Transient state (loaded tables, RLS statuses, loading/error flags) is not persisted.
- `src/store/agent-store.ts` — LLM provider config (provider, model, baseURL, apiKey), maxSteps. Transient: messages, currentTask, agentStatus.

**Two Supabase auth paths:**
- Management API (`https://api.supabase.com/v1/projects/{ref}/...`) — requires `accessToken` (`sbp_...`). Used for schema introspection, SQL execution, RLS queries, data catalog profiling.
- PostgREST (`{supabaseUrl}/rest/v1/...`) — requires `serviceRoleKey` or `anonKey`. New opaque key formats (`sb_secret_`, `sb_publishable_`) are exchanged for JWTs via `/auth/v1/token?grant_type=anonymous` before use. See `getValidApiKey()` in `supabase-helpers.ts`.

**AI Agent** (`src/agent/`) — a PageAgent that autonomously queries schemas, runs SQL, inspects RLS, and debugs across multiple steps. Tools are defined in `supabase-tools.ts`. LLM calls are proxied through `/api/agent/chat` so API keys never reach the browser.

**Types** are centralized in `src/lib/supabase-types.ts`. Import all shared interfaces from there.

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main shell, nav, connection management UI |
| `src/store/supabase-store.ts` | Main Zustand store (connections, SQL history, snapshots, latency) |
| `src/store/agent-store.ts` | Agent Zustand store (LLM config, messages) |
| `src/lib/supabase-types.ts` | All shared TypeScript interfaces |
| `src/lib/supabase-helpers.ts` | Server-side functions calling Supabase APIs |
| `src/lib/supabase-client.ts` | Client-side `createClient` factory |
| `src/lib/demo-data.ts` | Mock data for Demo Mode |
| `src/agent/supabase-tools.ts` | Agent tool definitions |
| `src/agent/use-devtool-agent.ts` | React hook managing PageAgent lifecycle |

## Notes

- `next.config.ts` has `typescript: { ignoreBuildErrors: true }` — TypeScript errors won't fail the build, but type correctness still matters for maintainability.
- ESLint is configured very permissively (most rules disabled) — don't rely on lint to catch issues.
- `reactStrictMode: false` — effects run once in dev.
- The `examples/` directory contains development task prompts/worklog artifacts, not source code.
- There is no Prisma, no SQLite, no `db/` directory. All persistence is `localStorage` only.
