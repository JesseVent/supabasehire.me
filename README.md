# Supabase DevTool

A web-based inspector and debugger for Supabase projects. Built as a portfolio project to demonstrate deep familiarity with the Supabase platform — schema introspection, RLS, edge functions, storage, and the Management API.

Try it instantly with **Demo Mode** — no Supabase connection required.

---

## Features

- **Schema Inspector** — browse tables, columns, foreign keys, and constraints with a visual ER diagram (dagre auto-layout)
- **RLS Policy Viewer** — 3-state policy status (enabled / disabled / no policy), policy details, and an inline policy generator
- **Table Browser** — paginated row data via PostgREST
- **SQL Runner** — execute queries with persistent history
- **Database Health** — latency tracking, index viewer, triggers, views, and stored functions
- **Edge Functions** — list deployed functions and invoke them with custom payloads
- **Storage Explorer** — browse buckets and folders; preview Parquet files with schema, data, and SQL tabs (DuckDB WASM, fully in-browser)
- **Security Score** — dashboard summarizing RLS coverage and policy gaps
- **Realtime Monitor** — subscribe to and inspect realtime events
- **Multi-project** — store and switch between multiple Supabase connections; credentials stay local
- **Demo Mode** — works entirely with mock data, no credentials needed

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (Bun runtime) |
| Language | TypeScript + React |
| Styling | Tailwind CSS (Evil Martians design tokens, OKLCH color space) |
| State | Zustand with `localStorage` persistence |
| Local DB | SQLite via Prisma (stores connection configs) |
| Parquet | DuckDB WASM (in-browser, zero server-side processing) |
| ER Diagrams | Dagre (auto-layout) |
| Supabase APIs | Management API + PostgREST |

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/supabase-devtool.git
cd supabase-devtool
bun install

# Set up environment
cp .env.example .env
# Edit .env and set:
# DATABASE_URL="file:./db/custom.db"

# Initialize the local database
bun run db:push

# Start the dev server
bun dev
```

Open [http://localhost:3000](http://localhost:3000). Click **Try Demo Mode** to explore without a Supabase connection.

To connect a real project, you'll need:
- **Supabase URL** and **Service Role Key** — for PostgREST row access
- **Access Token** (`sbp_...`) — for Management API (schema introspection, SQL execution)

---

## Architecture

The app is a single-page shell (`src/app/page.tsx`) that manages navigation, connection state, and panel rendering. Feature panels are lazily loaded via `next/dynamic`, keeping the initial bundle small. All backend logic lives in API routes (`src/app/api/`) — each route reads a `connectionId`, retrieves credentials from the local SQLite DB via Prisma, and proxies requests to the appropriate Supabase API. There are two auth paths: the Management API (`api.supabase.com/v1/...`) for schema and SQL operations, and PostgREST (`{project-url}/rest/v1/...`) for row data. All application state is managed by a single Zustand store with selective `localStorage` persistence.

---

## Project Structure

```
src/
  app/
    page.tsx              # Main shell and navigation
    api/                  # API routes (connections, schema, rls, sql, ...)
  components/             # Feature panels (lazy-loaded)
  lib/
    supabase-helpers.ts   # Server-side Supabase API calls
    supabase-types.ts     # Shared TypeScript interfaces
    db.ts                 # Prisma client singleton
    demo-data.ts          # Mock data for Demo Mode
  store/
    supabase-store.ts     # Zustand store
prisma/
  schema.prisma           # SQLite schema (SupabaseConnection model)
```

---

## License

MIT
