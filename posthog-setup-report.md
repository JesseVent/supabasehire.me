<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into supabasehire.me. The existing partial integration (posthog-js already installed, some events already tracked) was upgraded to the Next.js 15.3+ `instrumentation-client.ts` pattern, a reverse-proxy rewrite was wired into `next.config.ts`, five new events were added to `page.tsx` to cover the connection lifecycle, and environment variables were written to `.env.local`. The `PostHogInit` component and `analytics.ts` were updated to remove duplicate initialization code that would have conflicted with `instrumentation-client.ts`.

## Events

| Event | Description | File |
|---|---|---|
| `connection_created` | User adds a new Supabase connection manually via the form | `src/app/page.tsx` |
| `connection_deleted` | User deletes an existing connection | `src/app/page.tsx` |
| `oauth_connection_started` | User initiates the Supabase OAuth flow | `src/app/page.tsx` |
| `oauth_connection_completed` | A Supabase project is successfully linked via OAuth | `src/app/page.tsx` |
| `demo_mode_started` | User activates demo mode | `src/app/page.tsx` |
| `feature_viewed` | _(existing)_ User switches between tool panels | `src/app/page.tsx` |
| `sql_executed` | _(existing)_ SQL query run in the SQL panel | `src/components/sql-panel.tsx` |
| `rls_policy_copied` | _(existing)_ RLS policy definition copied | `src/components/rls-panel.tsx` |
| `auth_simulation_run` | _(existing)_ RLS auth simulator run | `src/components/auth-simulator.tsx` |
| `catalog_ai_generated` | _(existing)_ AI generates catalog descriptions | `src/components/data-catalog-panel.tsx` |
| `catalog_committed` | _(existing)_ Catalog descriptions committed to the project | `src/components/data-catalog-panel.tsx` |
| `schema_snapshot_taken` | _(existing)_ Schema snapshot taken | `src/components/schema-snapshot.tsx` |
| `storage_url_copied` | _(existing)_ Storage file URL copied | `src/components/storage-browser.tsx` |
| `edge_function_invoked` | _(existing)_ Edge function invoked | `src/components/edge-functions-panel.tsx` |

## Infrastructure changes

| File | Change |
|---|---|
| `instrumentation-client.ts` | New — initializes PostHog (Next.js 15.3+ pattern) with `/ingest` proxy, `capture_exceptions: true`, and `defaults: '2026-01-30'` |
| `next.config.ts` | Added `/ingest/static/*`, `/ingest/array/*`, `/ingest/*` rewrites + `skipTrailingSlashRedirect: true` |
| `src/lib/analytics.ts` | Removed duplicate `initAnalytics()` / `posthog.init()` — init now lives in `instrumentation-client.ts` |
| `src/components/PostHogInit.tsx` | Made no-op (init moved to `instrumentation-client.ts`) |
| `.env.local` | `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` written |

## Next steps

We've built some insights and a dashboard to keep an eye on user behavior:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/474936/dashboard/1726489)
- [New connections over time](https://us.posthog.com/project/474936/insights/VkdT6bYy)
- [Feature panel usage](https://us.posthog.com/project/474936/insights/XoxjtTUt)
- [SQL queries executed](https://us.posthog.com/project/474936/insights/tfMSBHih)
- [Demo mode vs real connections](https://us.posthog.com/project/474936/insights/z9Bh67nW)
- [AI catalog adoption](https://us.posthog.com/project/474936/insights/qHEFQfBD)

## Verify before merging

- [ ] Run a full production build (`bun run build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any CI/bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
