# ai_sql

AI inference SQL functions for Supabase. Self-deploys its own edge function — no CLI required.

## Installation

```sql
-- Install from dbdev
select dbdev.install('supabase/ai-sql');
create extension "supabase/ai-sql";
```

## Setup

### 1. Store your personal access token in Vault

Get your token from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).

```sql
select vault.create_secret('sbp_xxxxxxxxxxxx', 'ai_access_token');
```

This is the only secret that touches the database. It is encrypted at rest and only readable by `postgres`/service role inside `ai.deploy()`.

### 2. Set your OpenAI-compatible API key

Use the CLI — never pass the key as a SQL parameter, as it would appear in `pg_stat_activity` logs:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
```

Or via the dashboard: **Settings → Edge Functions → Secrets**.

To use any OpenAI-compatible provider (Groq, Together AI, Azure OpenAI, Ollama, etc.), also set `OPENAI_BASE_URL`:

```bash
# Groq
supabase secrets set OPENAI_BASE_URL=https://api.groq.com/openai/v1
# Together AI
supabase secrets set OPENAI_BASE_URL=https://api.together.xyz/v1
# Local Ollama
supabase secrets set OPENAI_BASE_URL=http://localhost:11434/v1
```

Omit `OPENAI_BASE_URL` to use the default (`https://api.openai.com/v1`).

### 3. Deploy

```sql
select ai.deploy('your-project-ref');
```

`ai.deploy()` automatically:
- Fetches your project's anon key via the Management API
- Deploys the self-contained edge function source to `/functions/v1/ai`
- Writes `project_ref` + `anon_key` to `ai._config`

(The edge function source has zero imports so it can be deployed directly from SQL.)

### 3. Check status

```sql
select ai.status();
-- { "version": "1.0.0", "configured": true, "project_ref": "...", "vault_token": true }
```

## Functions

### Scalar (one LLM call per row)

| Function | Returns | Description |
|---|---|---|
| `ai_complete2(input, system?, model?, provider?)` | `text` | Free-form completion |
| `ai_sentiment(input, model?, provider?)` | `text` | `positive`, `negative`, or `neutral` |
| `ai_classify(input, categories?, model?, provider?)` | `text` | One of the supplied labels |
| `ai_extract(input, schema_hint?, model?, provider?)` | `jsonb` | Structured fields as JSON |
| `ai_translate(input, target_language?, model?, provider?)` | `text` | Translated text |
| `ai_redact(input, entity_types?, model?, provider?)` | `text` | PII replaced with `[REDACTED]` |
| `ai_embed(input, model?, provider?)` | `real[]` | Embedding vector (OpenAI only, 1536 dims) |

### Aggregates (one LLM call per GROUP BY group)

| Aggregate | Returns | Description |
|---|---|---|
| `ai_summarize_agg(text)` | `text` | Summarize all rows in a group |
| `ai_extract_agg(text)` | `jsonb` | Extract entities across all rows in a group |

## Usage examples

```sql
-- Completion
select ai_complete2('Write a tagline for a Postgres extension.');

-- Sentiment on every row
select id, body, ai_sentiment(body) as sentiment from posts;

-- Classify with custom labels
select ai_classify(
  'The login button is broken',
  array['bug', 'feature', 'question']
);

-- Extract structured data
select ai_extract(
  'Jesse Vent, jesse@example.com, Supabase, joined 2024-01-15',
  'name, email, company, date'
);
-- { "name": "Jesse Vent", "email": "jesse@example.com", ... }

-- Translate
select ai_translate('Good morning', 'Japanese');
-- おはようございます

-- Redact PII
select ai_redact('Call me at 555-123-4567 or email bob@example.com');
-- Call me at [REDACTED] or email [REDACTED]

-- Embeddings (cast to vector if pgvector installed)
select ai_embed('hello world')::vector;

-- True GROUP BY aggregate — one LLM call per category
select category, ai_summarize_agg(description)
from products
group by category;

-- Extract entities across a group
select user_id, ai_extract_agg(message)
from events
group by user_id;
```

## Providers

### OpenAI (default)

Points to `OPENAI_BASE_URL` (default: `https://api.openai.com/v1`). Any OpenAI-compatible API works — Groq, Together AI, Azure OpenAI, Ollama, etc. Set `OPENAI_BASE_URL` to switch; keep `OPENAI_API_KEY` as the credential regardless of provider.

```sql
-- Default (api.openai.com)
select ai_complete2('Write a tagline for Postgres.');

-- Using a custom model (e.g. Groq's llama-3)
select ai_complete2('Summarize this', model_name => 'llama-3.1-70b-versatile');
```

### Supabase built-in (free)

Pass `provider => 'supabase'` to use Supabase built-in inference (Mistral) at no extra cost — no extra API key needed:

```sql
select ai_complete2('Hello', provider => 'supabase');
select ai_sentiment('Great product!', provider => 'supabase');
```

Note: `ai_embed` requires `provider => 'openai'` — Supabase built-in inference does not expose an embeddings endpoint.

## Aggregate safety caps

Aggregates cap input size to avoid runaway token costs. Override per session:

```sql
set ai_agg.max_items = 50;   -- max rows per group (default 100)
set ai_agg.max_chars = 8000; -- max joined chars per group (default 12000)
```

## Security model

| Credential | Where it lives | Who can read it |
|---|---|---|
| `sbp_` personal access token | Vault (encrypted) | `postgres` / service role only, inside `ai.deploy()` |
| OpenAI API key | Supabase project secrets (set via CLI) | Never stored in the database, never a SQL parameter |
| Anon key | `ai._config` | Already a public credential — same key shipped to browsers |

All user-facing `ai_*` functions are `REVOKE`d from `public` and `GRANT`ed to `authenticated` only. Anonymous callers cannot trigger AI calls.

## Re-deploying

To update the edge function after extension upgrade:

```sql
select ai.deploy('your-project-ref');
```

The embedded source is always current with the installed extension version.
