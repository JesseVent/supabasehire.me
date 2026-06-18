# Supabase DevTool

A web-based inspector and debugger for Supabase projects. Built as a portfolio project to demonstrate deep familiarity with the Supabase platform — schema introspection, RLS, edge functions, storage, and the Management API.

Try it instantly with **Demo Mode** — no Supabase connection required.

---

## What It Does

A dev tool for Supabase projects. Surfaces everything the platform exposes — Management API, PostgREST, Storage, Edge Functions, Realtime — in one place, without switching tabs.

- **Security** — Security Score dashboard shows every table with RLS disabled or policies missing before it becomes a problem
- **Debugging** — run SQL, browse live rows, invoke edge functions via an auto-generated test harness, and watch Realtime events, all in one place
- **Schema understanding** — auto-layout ER diagrams (dagre) make foreign key relationships readable at a glance, even on large schemas
- **AI SQL** — `ai_complete2`, `ai_classify`, `ai_sentiment`, `ai_extract`, `ai_embed`, `ai_translate`, `ai_redact`, and aggregate variants — callable directly in SQL, no app code required
- **Data Catalog** — profiles every table automatically: row counts, null %, distinct counts, min/max per column. Generates AI descriptions for tables and columns so devs can understand an unfamiliar schema without reading migrations or asking someone
- **Parquet / Iceberg** — the Analytics tab connects to an Iceberg REST Catalog, profiles tables via DuckDB WASM in-browser, and lets you run SQL against `.parquet` files with zero server infrastructure
- **Observability** — Realtime-backed live trace feed of agent and edge function activity, plus an evaluation harness for tracking skill/AI quality over time

> **Run this locally.** Credentials are stored in your browser's `localStorage` via Zustand — they never leave your machine. Don't enter real service role keys into any hosted or web-based deployment of this tool.

---

## Security

### Credentials are stored in `localStorage`

All Supabase connection credentials — URL, anon key, service role key, and access token — are persisted in your browser's `localStorage` via Zustand's `persist` middleware. **This means they are readable from the browser DevTools console and any extension with access to the page's storage.** This is an intentional trade-off for a local dev tool: no server-side session, no database, no cookies. But you should understand the implications:

- **Do not use this tool on a shared or public machine** without clearing storage afterwards
- **Do not enter production service role keys** — prefer a personal access token (`sbp_...`) for schema inspection, or use the anon key for read-only operations
- **Do not deploy this app to a public URL** without adding server-side session management and removing `localStorage` persistence

### Credentials are sent in request headers (not body)

Connection credentials are passed to API routes via `X-Supabase-*` request headers, not in the request body. This keeps credentials out of request body logs and payloads. The server-side `getConnectionFromHeaders()` helper extracts them from headers only. See `src/lib/api-auth.ts` for the implementation.

### LLM API keys never reach the browser

The AI agent feature routes all LLM calls through a server-side proxy (`/api/agent/chat`) that injects the API key from an environment variable. The client never sees the key. Provider base URLs are resolved from a hardcoded allowlist to prevent SSRF.

---

## AI Agent

The devtool includes an AI agent that can autonomously query schemas, run SQL, inspect RLS policies, and more. It's powered by [PageAgent](https://github.com/page-agent) and supports OpenAI, Anthropic, and Google models.

### Agent Tools

The agent has 10 custom tools that call the same API routes as the UI, bypassing DOM interactions for structured data:

| Tool | Description |
|------|-------------|
| `execute_sql` | Execute any SQL query (SELECT, INSERT, UPDATE, DELETE, DDL) |
| `explain_query` | Run `EXPLAIN (ANALYZE, BUFFERS)` and return execution time, buffer hit ratio, and detected issues (sequential scans, disk-spilling sorts, nested loop N+1s) with fix suggestions |
| `get_schema` | Inspect database tables, columns, types, foreign keys, and defaults |
| `get_rls_policies` | Check Row Level Security status and policies for all tables |
| `list_storage` | Browse storage buckets and files |
| `list_edge_functions` | List deployed edge functions |
| `get_project_info` | Get project metadata (region, size, status) |
| `get_indexes` | Get database index usage statistics |
| `get_triggers` | List all database triggers |
| `get_views_functions` | List all views and stored functions |

### How it works

1. The agent runs in the browser via `page-agent`, which manages the execution loop (plan → act → observe → repeat)
2. Custom Supabase tools are registered alongside standard DOM tools (click, type, scroll)
3. LLM calls are proxied through `/api/agent/chat` to keep API keys server-side
4. An optional **Skill Router** (Supabase Edge Function) provides RAG-based reference loading for domain-specific guidance

### Configuration

The agent is configured per-session via the Agent panel (sidebar). Settings persist in `localStorage`:

- **Provider** — OpenAI, Anthropic, or Google
- **Model** — e.g. `gpt-5.4`, `claude-sonnet-4-6`, `gemini-2.5-flash`
- **Max Steps** — maximum agentic loop iterations (default: 40)
- **Skill Router** — optional Supabase Edge Function URL for reference routing

---

## Skill Router

The Skill Router is an optional Supabase Edge Function that gives the agent RAG-based access to domain-specific reference docs. Before each reasoning step, the agent queries the router with its current task; the router retrieves the most relevant skill chunks from a vector store and injects them into context. This means the agent has up-to-date, task-specific guidance without bloating the base system prompt.

### How it works

1. **User submits a task** — the agent loop starts
2. **Route** — `SkillRouterClient.route({ prompt, skill_name, top_k })` calls the `skill-router` edge function, which does a vector similarity search over the indexed skill references and returns the top `k` chunks
3. **Inject** — the returned chunks (each with `title`, `content`, `tags`, `impact`, and a `relevance_reason`) are injected into the agent's context for the current step
4. **Feedback** — after the task completes, `skill-router-client.feedback({ request_id, outcome })` posts a success/failure signal to the `skill-feedback` edge function, allowing the router to learn over time

### Returned chunks

Each chunk the router returns looks like:

```ts
interface RoutedChunk {
  id: string
  title: string
  content: string      // the reference text injected into context
  tags: string[]
  impact: string       // e.g. "HIGH" — how important this reference is
  score: number        // cosine similarity score
  rank: number         // position in result set
  relevance_reason: string  // LLM-generated explanation of why this chunk matched
}
```

### Configuration

The router is configured in the Agent panel under **Skill Router**. All three fields are required to enable it:

| Field | Description |
|-------|-------------|
| **URL** | Supabase project URL hosting the `skill-router` edge function |
| **Anon Key** | Anon key for that project (used as `Authorization: Bearer`) |
| **Skill Name** | Which skill to query — e.g. `supabase` or `supabase-postgres-best-practices` |

Settings persist in `localStorage` via the agent store. If any field is missing, the agent runs without skill augmentation.

### Client implementation

`src/agent/skill-router-client.ts` is an inlined copy of `@page-agent/skill-router` — pure `fetch`, no runtime dependencies. It wraps the two edge function calls (`skill-router` and `skill-feedback`) and exposes an `asAdapter(skill_name)` method that returns the `SkillRouterAdapter` interface expected by `PageAgentCore`.

---

## Skill Coverage Eval

The devtool includes a **Skill Coverage Matrix** (in the Traces panel) that shows which Supabase skill references are loaded for different user prompts. This is powered by an evaluation harness in the companion [`supabasehire.mes`](https://github.com/supabase/supabasehire.mes) repository.

### What it evaluates

The eval measures whether the agent loads the **right** skill references for a given user prompt — not too many (wasted tokens) and not too few (missing context). It tests 97 prompts across 8 categories:

| Category | Examples |
|----------|---------|
| Schema | "create a table", "foreign key", "partitioning" |
| Security | "RLS policies", "least privilege", "multi-tenant" |
| Performance | "slow query", "missing index", "N+1" |
| Connections | "connection pooling", "idle timeout" |
| Data Ops | "batch insert", "pagination", "upsert" |
| Locking | "deadlock prevention", "advisory locks" |
| Monitoring | "EXPLAIN ANALYZE", "pg_stat_statements" |
| General | "database health", "backup strategy" |

### How the eval works

1. **Discover** — scans all `SKILL.md` files and reference files from the skills repo
2. **Prompt** — sends each of the 97 prompts to an LLM (via OpenRouter) along with the full skill catalog
3. **Classify** — the LLM returns which skills trigger and which specific references it would load
4. **Report** — results are saved as a coverage matrix (`eval/results/matrix.json`)

The `--noisy` flag injects simulated prior-conversation context (~20K tokens of TypeScript refactoring, CI debugging, etc.) to test whether the skill router drifts when the context window is polluted.

### Running the eval

The eval harness lives in the `supabasehire.mes` repo (the skills repository, not this app):

```bash
# In supabasehire.mes/
pnpm eval                     # run all 97 prompts (clean context)
pnpm eval --noisy             # run with noisy prior context
pnpm eval --concurrency 15    # control parallelism
pnpm eval --model google/gemini-2.5-flash-lite  # use a specific model

pnpm eval:report              # render coverage matrix in terminal
pnpm eval:report --noisy      # noisy run matrix
pnpm eval:report --diff       # side-by-side clean vs noisy diff
pnpm eval:report --md         # also write results/matrix.md
pnpm eval:report --zero       # show only never-hit references
```

Requires `OPENROUTER_API_KEY` in `.env`.

### Skill Coverage Matrix in the UI

The `SkillCoverageMatrix` component (`src/components/skill-coverage-matrix.tsx`) renders the eval results as an interactive heatmap inside the Traces panel. Each row is a prompt, each column is a reference file, and cells show whether that reference was loaded (✓) or skipped (·). The sidebar shows hit-rate percentages per reference.

### Key files

| File | Purpose |
|------|---------|
| `src/components/skill-coverage-matrix.tsx` | Interactive eval heatmap component |
| `src/components/trace-panel.tsx` | Traces panel that hosts the matrix |
| `eval/run.ts` (devtools repo) | Eval runner — prompts → LLM → results |
| `eval/prompts.ts` (devtools repo) | 97 test prompts across 8 categories |
| `eval/contexts.ts` (devtools repo) | Simulated noisy conversation contexts |
| `eval/report.ts` (devtools repo) | Terminal coverage matrix renderer |

---

## Features

- **Schema Inspector** — browse tables, columns, foreign keys, and constraints with a visual ER diagram (dagre auto-layout, force-directed, and LR modes)
- **RLS Panel** — 3-state policy status (enabled / disabled / no policy), policy editor, inline policy generator, and RLS simulator (test queries as anon/authenticated roles)
- **Table Browser** — paginated row data via PostgREST with column filtering
- **SQL Runner** — execute queries with persistent history and result charting
- **Query Analyzer** — EXPLAIN ANALYZE with cost estimates and suggestions
- **Database Health** — latency tracking, index viewer, trigger viewer, views and stored functions
- **Edge Functions** — list deployed functions and invoke them via an auto-generated test harness: input forms are built from the function's schema, so you don't hand-write JSON payloads
- **AI SQL Functions** — `ai_complete2`, `ai_classify`, `ai_sentiment`, `ai_extract`, `ai_embed`, `ai_translate`, `ai_redact`, plus `ai_summarize_agg`/`ai_extract_agg` true aggregates — set-based scalar functions you can call directly in SQL, including inside `GROUP BY`
- **Storage Explorer** — browse buckets and folders; preview Parquet files with schema, data, and SQL tabs (DuckDB WASM, fully in-browser)
- **Data Catalog** — auto-profile tables (row counts, null %, distinct, min/max) with AI-generated descriptions per table and column
- **Analytics** — in-browser SQL over Parquet/Iceberg via DuckDB WASM; benchmark Postgres vs Iceberg query performance
- **Agent Traces** — OpenTelemetry trace visualizer powered by [AgentPrism](https://github.com/evilmartians/agent-prism); includes a live example edge function instrumented with OTLP spans. Live mode streams agent/edge-function activity over Supabase Realtime (`realtime-trace-source.ts`), and can also receive trace events from a companion browser extension via `agent-trace-bridge.ts`
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
git clone https://github.com/yourusername/supabasehire.me.git
cd supabasehire.me
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

All backend logic lives in API routes (`src/app/api/`) — each route reads connection credentials from `X-Supabase-*` request headers (via `getConnectionFromHeaders()` from `src/lib/api-auth.ts`) and proxies calls to the appropriate Supabase API. There is no server-side database; all state (connections, SQL history, schema snapshots, latency records) is persisted client-side via Zustand's `localStorage` middleware.

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
    api-auth.ts            # Header-based auth helpers (client + server)
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
