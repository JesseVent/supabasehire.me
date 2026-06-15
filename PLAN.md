# PLAN — supa-agent / supabasehire.me Remediation Backlog

Source: production-readiness review of `~/Dev/supa-agent` + `~/Dev/supabasehire.me`, 2026-06-10.
Each open item is self-contained and allocatable: it names the repo, files, the change, and acceptance criteria.
Severity: C=Critical, H=High, M=Medium, L=Low. Effort: S (<1h), M (half day), L (1+ day).

---

## ✅ Completed 2026-06-10 (uncommitted — needs commit in both repos)

| ID | Item | Repo |
|----|------|------|
| F-01 | Remove `OPENAI_API_KEY` from client payload (`layout.tsx` prop → script URL) | supabasehire.me |
| F-02 | Fix `COLUMNS_SQL` pg_class namespace join (664→494 rows verified; kills ~1,300 dup React keys + `security_invoker` false-negatives) — `src/app/api/schema/route.ts` | supabasehire.me |
| F-03 | Port MCP tools / server proxy / skill router / grounded system prompt into floating `SupaAgentPanel` (IIFE `autoInit=false`, zero-dep, `enableMask:false`); new `src/agent/supa-agent-config.ts` | supabasehire.me |
| F-04 | Delete dead path: `use-devtool-agent.ts`, `agent-chat-panel.tsx`, sparkles toggle, orphaned `public/supa-agent.js` | supabasehire.me |
| F-05 | Core: remove LLM listeners in `dispose()` + concurrent `execute()` guard + 3 tests (`packages/core/src/SupaAgentCore.ts`, suite 44/44) | supa-agent |
| F-06 | Rebuild IIFE with core fixes → `public/supa-agent.iife.js` | both |

---

## 🔴 Now (do before/with next deploy)

### T-01 · Rotate the leaked OpenAI API key — **C / S** · *manual, not code*
Until F-01, the server `OPENAI_API_KEY` was serialized into every visitor's page on supabasehire.me. Treat as compromised.
**Do:** Revoke at platform.openai.com → new key → update Vercel env (`OPENAI_API_KEY`/`LLM_API_KEY`) → redeploy.
**Accept:** old key returns 401; view-source of prod page contains no `sk-` key material.

### T-02 · Commit + deploy the session's fixes — **C / S**
**Repos:** supabasehire.me (`feat/view-security-invoker`), supa-agent.
**Accept:** both working trees clean; prod build green; deployed site loads schema without dup-key console warnings.

### T-03 · Sanitize MCP tool outputs in the extension — **H / S**
**Repo:** supa-agent · `packages/extension/src/agent/mcpToolAdapter.ts:199-215`.
SQL/MCP results are concatenated into LLM context raw — prompt-injection vector (core path is sanitized at prompt assembly; extension path is not).
**Do:** wrap returns in `sanitizeUntrusted()` (exported from `@supa-agent/core`) and an `<mcp_result tool="…">` delimiter.
**Accept:** unit test: a response containing `</browser_state>` / "ignore your instructions" arrives tag-broken (ZWSP-inserted) in the adapted tool output.

---

## 🟠 This week

### T-04 · Harden `export-vault-secrets` edge function — **H / M**
**Repo:** supa-agent · `supabase/functions/export-vault-secrets/index.ts`, `_shared/auth.ts`.
Returns plaintext decrypted vault secrets gated only on a service-role string compare; no audit trail, no rate limit.
**Do:** service-role-only (reject publishable keys), audit-log table (`who, when, count`), rate limit (e.g. 1/min), or disable if unused.
**Accept:** publishable-key call → 403; each successful call writes an audit row.

### T-05 · Authenticate `/api/agent/chat` proxy — **M / M**
**Repo:** supabasehire.me · `src/app/api/agent/chat/route.ts`.
Unauthenticated: anyone can burn the server LLM key. (Previously accepted as dev-tool tradeoff — revisit now that the panel ships by default.)
**Do:** minimal shared-secret header or session check + per-IP rate limit.
**Accept:** request without credential → 401; panel still works end-to-end.

### T-06 · Backoff for schema/RLS pollers — **M / M**
**Repo:** supabasehire.me · callers of `/api/schema`, `/api/rls` (latency monitor / RLS status fetch).
Observed: ~144 rapid `/api/rls` calls retrying without backoff → self-inflicted Supabase MCP `ThrottlerException` that starves the valid token for minutes; stale connections amplify it.
**Do:** exponential backoff + stop retrying on 429/throttle; dedupe identical in-flight requests; skip connections whose last N calls failed auth.
**Accept:** with one bad connection saved, dev.log shows bounded retries (not continuous 500s); diagram loads on a valid connection.

### T-07 · Fix `'*'` postMessage targetOrigins — **M / S**
**Repo:** supa-agent · `packages/extension/src/entrypoints/main-world.ts` (lines 89-182), `content.ts` (131-189).
**Do:** nonce/HMAC per message pair (main-world ↔ content), validate on receipt.
**Accept:** message without valid nonce is dropped; existing extension flows still pass.

### T-08 · Auth token for MCP hub-bridge WebSocket — **M / S**
**Repo:** supa-agent · `packages/mcp/src/hub-bridge.js:105-109` (also resolves `TODO: Add version checking`, line 102).
**Do:** random token on startup, required as `?token=` on connect; version field in `ready` handshake.
**Accept:** connection without token → closed 4001; version mismatch → error + close.

### T-09 · Tests for MCP op classification + destructive gating — **M / M**
**Repo:** supa-agent · `packages/extension/src/agent/mcpToolAdapter.test.ts`.
Current tests only cover `jsonSchemaToZod`; `classifyMcpOp` and the confirmation gate are untested.
**Accept:** tests for DELETE/DROP/INSERT/TRUNCATE classification; `allowWrites=false` blocks writes; destructive op without confirmation fails, with "yes" succeeds.

---

## 🟡 This month

### T-10 · Agent-loop integration test suite — **M / L**
**Repo:** supa-agent · `packages/core`. Mock LLM + pageController; cover: multi-step success → `done`, max-steps termination, abort mid-LLM-call, abort mid-tool, tool-error → re-plan (no retry of side-effecting tool).

### T-11 · Prompt-injection escape evals — **M / M**
**Repo:** supa-agent. Eval set: malicious page content / SQL results attempting tag breakout (`</browser_state>`, fake `<user_request>`, "ignore instructions"). Assert sanitizer breaks tags and agent flags rather than complies.

### T-12 · `autoFixer` detection-logic rewrite — **M / M**
**Repo:** supa-agent · `packages/core/src/utils/autoFixer.ts` (self-acknowledged `todo: needs better detection logic`, line 64). Primitive coercion can silently mis-wrap multi-field tool args. Add tests for 2-level nesting, double-stringified JSON, multi-field coercion.

### T-13 · Structured step logging — **L / M**
**Repo:** supa-agent · core. Replace console-only logging with structured step records (taskId, stepIndex, tool, outcome, duration) emitted via the existing event system; redaction beyond the JWT-only regex (`SupaAgentCore.ts` `#sanitizeError`).

### T-14 · Publish `supa-agent` to npm — **L / M**
Removes the hand-copy of `dist/iife/supa-agent.demo.js` → `public/supa-agent.iife.js` (current process, easy to forget after core changes) and unblocks consumers without the sibling-repo `file:` hack.

### T-15 · Extension token storage hardening — **L / M**
**Repo:** supa-agent · `entrypoints/background.ts` (93-107, 133-158). OAuth client secret + tokens plaintext in `chrome.storage.local`. Prefer public-client flow (`token_endpoint_auth_method: 'none'`) to drop the secret entirely; surface token-refresh events to the user.

### T-16 · Prune stale stored connections UX — **L / S**
**Repo:** supabasehire.me. 8+ saved connections incl. 4 duplicate "Prom Labs" with expired tokens hammer APIs on every load. Add a health badge + "remove broken connections" action.

---

## Verification reference (for any ticket touching the agent or schema path)
1. `bun run build` clean; `bun x biome check <touched files>` clean.
2. `bun dev` → schema tab on a valid OAuth connection: diagram renders, **zero** `Encountered two children with the same key` warnings.
3. Floating panel: initializes (`window.supaAgent` live), MCP tools logged, smoke task round-trips `/api/agent/chat`.
4. supa-agent: `npm run test` + `npm run typecheck` green.
