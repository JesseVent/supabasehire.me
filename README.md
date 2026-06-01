# Supabase DevTool

A web-based inspector and debugger for Supabase projects. Built as a portfolio project to demonstrate deep familiarity with the Supabase platform — schema introspection, RLS, edge functions, storage, and the Management API.

Try it instantly with **Demo Mode** — no Supabase connection required.

---

## What It Does

A dev tool for Supabase projects. Surfaces everything the platform exposes — Management API, PostgREST, Storage, Edge Functions, Realtime — in one place, without switching tabs.

- **Security** — Security Score dashboard shows every table with RLS disabled or policies missing before it becomes a problem
- **Debugging** — run SQL, browse live rows, invoke edge functions with custom payloads, and watch Realtime events, all in one place
- **Schema understanding** — auto-layout ER diagrams (dagre) make foreign key relationships readable at a glance, even on large schemas
- **Data Catalog** — profiles every table automatically: row counts, null %, distinct counts, min/max per column. Generates AI descriptions for tables and columns so devs can understand an unfamiliar schema without reading migrations or asking someone
- **Parquet / Iceberg** — the Analytics tab connects to an Iceberg REST Catalog, profiles tables via DuckDB WASM in-browser, and lets you run SQL against `.parquet` files with zero server infrastructure

> **Run this locally.** Credentials are stored in your browser's `localStorage` via Zustand — they never leave your machine. Don't enter real service role keys into any hosted or web-based deployment of this tool.

---

## Features

- **Schema Inspector** — browse tables, columns, foreign keys, and constraints with a visual ER diagram (dagre auto-layout, force-directed, and LR modes)
- **RLS Panel** — 3-state policy status (enabled / disabled / no policy), policy editor, inline policy generator, and RLS simulator (test queries as anon/authenticated roles)
- **Table Browser** — paginated row data via PostgREST with column filtering
- **SQL Runner** — execute queries with persistent history and result charting
- **Query Analyzer** — EXPLAIN ANALYZE with cost estimates and suggestions
- **Database Health** — latency tracking, index viewer, trigger viewer, views and stored functions
- **Edge Functions** — list deployed functions and invoke them with custom payloads
- **Storage Explorer** — browse buckets and folders; preview Parquet files with schema, data, and SQL tabs (DuckDB WASM, fully in-browser)
- **Data Catalog** — auto-profile tables (row counts, null %, distinct, min/max) with AI-generated descriptions per table and column
- **Analytics** — in-browser SQL over Parquet/Iceberg via DuckDB WASM; benchmark Postgres vs Iceberg query performance
- **Agent Traces** — OpenTelemetry trace visualizer powered by [AgentPrism](https://github.com/evilmartians/agent-prism); includes a live example edge function instrumented with OTLP spans
- **Security Score** — dashboard summarising RLS coverage, policy gaps, and risk scoring
- **Realtime Monitor** — subscribe to and inspect realtime events
- **Migration Runner** — execute and track SQL migrations with pass/fail history
- **Schema Snapshots** — save, diff, and restore schema states
- **Export** — export schema snapshots and security reports as JSON or Markdown
- **AI Agent** — agentic assistant (OpenAI / Anthropic / Google) that can autonomously query schemas, run SQL, inspect RLS, and debug across multiple steps
- **Multi-project** — store and switch between multiple Supabase connections; credentials stay in `localStorage`
- **Demo Mode** — works entirely with mock data, no credentials needed

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (Bun runtime) |
| Language | TypeScript 5 + React 19 |
| Styling | Tailwind CSS 4 (Evil Martians design tokens, OKLCH color space) |
| State | Zustand 5 with `localStorage` persistence |
| Parquet / SQL | DuckDB WASM (in-browser, zero server-side processing) |
| ER Diagrams | Dagre + D3-Force + XYFlow |
| Charts | Recharts |
| AI Agent | PageAgent + OpenAI / Anthropic / Google SDKs |
| Trace Visualization | AgentPrism (Evil Martians) + OpenTelemetry OTLP |
| Supabase APIs | Management API + PostgREST + Storage API + Realtime |

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/supabase-devtool.git
cd supabase-devtool
bun install

# Start the dev server
bun dev
```

Open [http://localhost:3000](http://localhost:3000). Click **Try Demo Mode** to explore without a Supabase connection.

To connect a real project you'll need:
- **Supabase URL** and **Service Role Key** — for PostgREST row access
- **Access Token** (`sbp_...`) — for Management API (schema introspection, SQL execution)

No environment variables are required to run the app. See `.env.example` for optional configuration (AI agent keys, S3/Iceberg pre-fill).

---

## Architecture

The app is a single-page shell (`src/app/page.tsx`) that manages navigation, connection state, and panel rendering. Feature panels are lazily loaded via `next/dynamic`, keeping the initial bundle small.

All backend logic lives in API routes (`src/app/api/`) — each route reads connection credentials from the request body and proxies calls to the appropriate Supabase API. There is no server-side database; all state (connections, SQL history, schema snapshots, latency records) is persisted client-side via Zustand's `localStorage` middleware.

There are two Supabase auth paths:
- **Management API** (`api.supabase.com/v1/projects/{ref}/...`) — requires `accessToken` (`sbp_...`). Used for schema introspection, SQL execution, RLS queries, and data catalog profiling.
- **PostgREST** (`{project-url}/rest/v1/...`) — requires `serviceRoleKey` or `anonKey`. Used for row data and Realtime. New opaque key formats (`sb_secret_`, `sb_publishable_`) are exchanged for JWTs via `/auth/v1/token` before use.

The AI Agent feature uses a server-side proxy (`/api/agent/chat`) to keep LLM API keys off the client. Provider, model, and max steps are configurable per-session and persisted in a separate Zustand store (`agent-store.ts`).

### Agent Traces / OpenTelemetry

The **Traces** panel demonstrates end-to-end OpenTelemetry instrumentation inside a Supabase edge function. The `agent-query` edge function runs three chained SQL queries (discover tables → inspect columns → count rows), wraps each in an OTLP span built manually (no external collector required), and returns the full trace as JSON in the response body. The panel converts the raw OTLP document with `openTelemetrySpanAdapter` from AgentPrism, then renders it using the `<TraceViewer>` component — giving you a live interactive timeline showing exactly where time is spent across agent steps.

To deploy the edge function:
```bash
supabase functions deploy agent-query --no-verify-jwt
```

The function requires `SUPABASE_DB_URL` (auto-injected in Supabase cloud) for direct PostgreSQL access. Demo Mode works without it using a hardcoded trace fixture.

---

## Project Structure

```
src/
  app/
    page.tsx              # Main shell and navigation
    api/
      agent/chat/         # LLM proxy (OpenAI / Anthropic / Google)
      catalog/            # Data catalog: setup, profile, load, commit
      connections/        # Connection CRUD + health check
      database/           # Indexes, triggers, views-functions
      edge-functions/     # List + invoke (also used by Traces panel to call agent-query)
      project/            # Project metadata
      realtime-token/     # Realtime auth token
      rls/                # RLS policies
      schema/             # Table / column / FK introspection
      sql/                # Raw SQL execution
      storage/            # Bucket browser + file download
      tables/rows/        # Paginated row data
  agent/
    supabase-tools.ts     # Agent tool definitions (schema, SQL, RLS, storage…)
    use-devtool-agent.ts  # React hook managing PageAgent lifecycle
  components/
    agent-prism/          # AgentPrism UI components (copied from evilmartians/agent-prism)
    trace-panel.tsx       # Traces panel — invokes edge function, renders OTLP trace
    ...                   # Feature panels (lazy-loaded)
  lib/
    supabase-helpers.ts   # Server-side Supabase API calls
    supabase-types.ts     # Shared TypeScript interfaces
    demo-data.ts          # Mock data for Demo Mode
  store/
    supabase-store.ts     # Main Zustand store (connections, SQL history, snapshots…)
    agent-store.ts        # Agent Zustand store (LLM config, messages)
supabase/
  functions/
    agent-query/          # Edge function: 3-step DB introspection with OTLP spans
    catalog-generator/    # Edge function: AI-generated table/column descriptions
    _shared/auth.ts       # Shared API key validation for edge functions
```

---

## License

MIT
