-- ai_sql--1.0.0.sql
--
-- Self-deploying AI inference extension for Supabase / dbdev.
--
-- ─── Quick start ──────────────────────────────────────────────────────────────
--
--   1. Install from dbdev
--        select dbdev.install('supabase/ai-sql');
--        create extension "supabase/ai-sql";
--
--   2. Store your Supabase personal access token in Vault (one time)
--        select vault.create_secret('sbp_xxxx', 'ai_access_token');
--
--   3. Bootstrap — deploys the edge function, wires up the config
--        select ai.deploy('your-project-ref');
--
--        To set OPENAI_API_KEY, use the Supabase CLI or dashboard BEFORE deploying
--        (keeps the key out of SQL logs entirely):
--          supabase secrets set OPENAI_API_KEY=sk-...
--        Or via the dashboard: Settings → Edge Functions → Secrets
--
--   4. Use from any SQL query
--        select ai_complete2('Write a Postgres haiku.');
--        select id, ai_sentiment(body) from posts;
--        select category, ai_summarize_agg(description)
--          from products group by category;
--
-- ─── How it works ─────────────────────────────────────────────────────────────
--
--   ai.deploy() reads your sbp_ token from Vault, then calls the Supabase
--   Management API to:
--     1. Fetch your project's anon key automatically
--     2. Deploy the self-contained edge function source embedded in this file
--        (zero imports — uses raw fetch to the OpenAI REST API)
--     3. Save project_ref + anon_key to ai._config
--
--   Every public.ai_* function routes through public._ai_call(), which reads
--   the config at runtime and POSTs to /functions/v1/ai on your project.
--
-- ─── Security model ───────────────────────────────────────────────────────────
--
--   sbp_ token        — Vault only; never a SQL parameter
--   OpenAI key        — set via CLI/dashboard; never stored in DB or passed via SQL
--   Anon key          — stored in ai._config; already a public credential
--   AI functions      — SECURITY DEFINER; REVOKED from public, granted to authenticated only
--
-- ─── Providers ────────────────────────────────────────────────────────────────
--
--   provider => 'openai'   (default) — gpt-5.4-mini + text-embedding-3-small
--                                      Points to OPENAI_BASE_URL (default: https://api.openai.com/v1)
--                                      Compatible with Groq, Together, Azure OpenAI, Ollama, etc.
--                                      supabase secrets set OPENAI_BASE_URL=https://api.groq.com/openai/v1
--   provider => 'supabase' — Supabase built-in inference (Mistral, no extra cost)
--                             No API key needed; runs in Edge Function runtime

\echo Use "CREATE EXTENSION \"supabase/ai-sql\"" to load this file. \quit

-- ─── Dependencies ─────────────────────────────────────────────────────────────

create extension if not exists http          with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- ─── Schema ───────────────────────────────────────────────────────────────────

create schema if not exists ai;

-- ─── Config table ─────────────────────────────────────────────────────────────

create table if not exists ai._config (
  key   text primary key,
  value text not null
);

revoke all on ai._config from public;

-- ─── Embedded edge function source ────────────────────────────────────────────

create or replace function ai._edge_function_source()
returns text language sql immutable
as $WRAPPER$
select $EFSOURCE$
// Self-contained edge function: zero imports, zero npm specifiers.
// Uses raw fetch so it can be deployed via the Supabase Management API
// body field from inside Postgres. OPENAI_BASE_URL controls the endpoint.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
}

const TEXT_ACTIONS = ['complete','summary','summarize_agg','classify','sentiment','extract','translate','redact'] as const
const VALID_ACTIONS = new Set<string>([...TEXT_ACTIONS, 'embed'])

interface AiRequest {
  provider?: 'openai' | 'supabase'
  action: string; input: string; system?: string; model?: string
  max_tokens?: number; temperature?: number; categories?: string[]
  target_language?: string; schema_hint?: string; entity_types?: string[]
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const MAX_SYSTEM=2000, MAX_LABEL=40, MAX_LABELS=20, MAX_LANG=40, MAX_SCHEMA=200

function oneLine(s: string|undefined|null, max: number): string {
  if (!s) return ''
  return s.replace(/[\t\r\n\f\v]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}
function sanitizeLabels(arr: string[]|undefined|null, fallback: string[]): string[] {
  if (!Array.isArray(arr) || arr.length === 0) return fallback
  const c = arr.map(x => typeof x === 'string' ? x.replace(/[^A-Za-z0-9 _-]/g,'').trim() : '')
               .filter(x => x.length > 0).slice(0, MAX_LABELS).map(x => x.slice(0, MAX_LABEL))
  return c.length > 0 ? c : fallback
}
function capPrompt(s: string|undefined|null, max: number): string { return s ? s.slice(0, max) : '' }

function systemPromptFor(action: string, req: AiRequest): string|undefined {
  switch (action) {
    case 'complete':      return capPrompt(req.system, MAX_SYSTEM) || undefined
    case 'summary':       return capPrompt(req.system, MAX_SYSTEM) || 'Summarize the input clearly and briefly in 1-3 sentences.'
    case 'summarize_agg': return capPrompt(req.system, MAX_SYSTEM) || 'Summarize this group of items in 1-3 concise sentences capturing key themes. Do not list items individually.'
    case 'classify':      return `Classify the input into exactly one of: ${sanitizeLabels(req.categories,['positive','negative','neutral']).join(', ')}. Respond with ONLY the label.`
    case 'sentiment':     return 'Respond with EXACTLY one word: positive, negative, or neutral.'
    case 'extract':       return `Extract info as JSON using keys: ${oneLine(req.schema_hint, MAX_SCHEMA) || 'name, email, company, date, amount'}. Return ONLY valid JSON, no prose. Use null for missing fields.`
    case 'translate':     return `Translate into ${oneLine(req.target_language, MAX_LANG) || 'Spanish'}. Return ONLY the translation.`
    case 'redact':        return `Redact these PII types: ${sanitizeLabels(req.entity_types,['email','phone','ssn','name']).join(', ')}. Replace each with [REDACTED]. Return ONLY the redacted text.`
    default:              return undefined
  }
}
function samplingFor(action: string) {
  const d: Record<string,{temperature:number;max_tokens:number}> = {
    complete:{temperature:0.7,max_tokens:500}, summary:{temperature:0.2,max_tokens:200},
    summarize_agg:{temperature:0.2,max_tokens:800}, classify:{temperature:0,max_tokens:40},
    sentiment:{temperature:0,max_tokens:10}, extract:{temperature:0,max_tokens:500},
    translate:{temperature:0.2,max_tokens:1000}, redact:{temperature:0,max_tokens:1000},
  }
  return d[action] ?? { temperature:0.7, max_tokens:500 }
}
function parseJson(text: string): unknown {
  if (!text) return null
  let c = text.trim()
  const fence = c.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) c = fence[1].trim()
  const f = c.indexOf('{'), l = c.lastIndexOf('}')
  if (f !== -1 && l > f) c = c.slice(f, l+1)
  try { return JSON.parse(c) } catch { return { value: text.trim() } }
}

async function callCompatAPI(endpoint: string, apiKey: string, payload: unknown): Promise<unknown> {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as any).error?.message || 'AI request failed (' + r.status + ')')
  return j
}

async function runOpenAI(req: AiRequest): Promise<Record<string,unknown>> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY secret is not set')
  const base = (Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '')

  if (req.action === 'embed') {
    const j = await callCompatAPI(
      base + '/embeddings',
      apiKey,
      { model: req.model ?? 'text-embedding-3-small', input: req.input }
    ) as any
    return { embedding: j.data?.[0]?.embedding ?? [], provider: 'openai' }
  }

  const { temperature, max_tokens } = samplingFor(req.action)
  const system = systemPromptFor(req.action, req)
  const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: req.input }]
  const j = await callCompatAPI(
    base + '/chat/completions',
    apiKey,
    {
      model: req.model ?? 'gpt-5.4-mini',
      messages,
      temperature: req.temperature ?? temperature,
      max_tokens: req.max_tokens ?? max_tokens,
    }
  ) as any
  const text = j.choices?.[0]?.message?.content ?? ''
  return req.action === 'extract' ? { result: parseJson(text), provider: 'openai' } : { text, provider: 'openai' }
}

async function runSupabase(req: AiRequest): Promise<Record<string,unknown>> {
  if (req.action === 'embed') throw new Error('Supabase built-in inference does not support embeddings. Use provider=openai.')
  const session = new (globalThis as any).Supabase.ai.Session(req.model ?? 'mistral')
  const system = systemPromptFor(req.action, req)
  const prompt = system ? `${system}\n\n${req.input}` : req.input
  const output = await session.run(prompt, { stream: false })
  const text = typeof output === 'string' ? output : (output as any)?.generated_text ?? ''
  return req.action === 'extract' ? { result: parseJson(text), provider: 'supabase' } : { text, provider: 'supabase' }
}

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
    try {
      const b: AiRequest = await req.json()
      if (!b.action || !b.input) return json({ error: 'Missing action or input' }, 400)
      if (!VALID_ACTIONS.has(b.action)) return json({ error: `Unknown action "${b.action}". Valid: ${[...VALID_ACTIONS].sort().join(', ')}` }, 400)
      const provider = b.provider ?? 'openai'
      if (provider === 'supabase') return json(await runSupabase(b))
      return json(await runOpenAI(b))
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
    }
  }
}
$EFSOURCE$;
$WRAPPER$;

-- ─── ai.deploy() ──────────────────────────────────────────────────────────────
--
-- Reads your sbp_ personal access token from Vault, then:
--   1. Fetches the project anon key from the Management API
--   2. Deploys (or updates) the embedded edge function source
--   3. Writes project_ref + anon_key to ai._config
--
-- Prerequisites:
--   select vault.create_secret('sbp_xxxx', 'ai_access_token');
--
--   Set OPENAI_API_KEY separately via CLI (never pass as SQL param — it logs):
--   $ supabase secrets set OPENAI_API_KEY=sk-...
--
-- Usage:
--   select ai.deploy('your-project-ref');

create or replace function ai.deploy(
  project_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ai, extensions, vault, public
as $$
declare
  access_token text;
  mgmt_base    text := 'https://api.supabase.com/v1/projects/' || project_ref;
  auth_hdr  extensions.http_header;
  json_hdr  extensions.http_header := extensions.http_header('Content-Type', 'application/json');
  anon_key  text;
  res       record;
begin
  -- Pull sbp_ from Vault — never passes through a SQL parameter or appears in logs
  select decrypted_secret into access_token
  from vault.decrypted_secrets
  where name = 'ai_access_token'
  limit 1;

  if access_token is null then
    raise exception
      E'No access token found in Vault.\n'
      'Run: select vault.create_secret(''sbp_...'', ''ai_access_token'');';
  end if;

  auth_hdr := extensions.http_header('Authorization', 'Bearer ' || access_token);

  -- 1. Fetch project anon key
  select * into res from extensions.http((
    'GET', mgmt_base || '/api-keys',
    array[auth_hdr], 'application/json', null
  )::extensions.http_request);

  if res.status >= 400 then
    raise exception 'Failed to fetch API keys (HTTP %): %', res.status, res.content;
  end if;

  select elem->>'api_key' into anon_key
  from jsonb_array_elements(res.content::jsonb) as elem
  where elem->>'name' = 'anon'
  limit 1;

  if anon_key is null then
    raise exception 'Could not find anon key for project %', project_ref;
  end if;

  -- 2. Deploy edge function (POST; PATCH if it already exists)
  select * into res from extensions.http((
    'POST', mgmt_base || '/functions',
    array[auth_hdr, json_hdr], 'application/json',
    jsonb_build_object(
      'slug', 'ai', 'name', 'ai',
      'body', ai._edge_function_source(),
      'verify_jwt', true
    )::text
  )::extensions.http_request);

  -- Supabase Management API may return 400 ("Duplicated function slug")
  -- or 409 for an existing slug. Fall back to PATCH in either case.
  if res.status >= 400 and res.content ilike '%duplicated function slug%' then
    select * into res from extensions.http((
      'PATCH', mgmt_base || '/functions/ai',
      array[auth_hdr, json_hdr], 'application/json',
      jsonb_build_object('body', ai._edge_function_source())::text
    )::extensions.http_request);
  end if;

  if res.status >= 400 then
    raise exception 'Failed to deploy edge function (HTTP %): %', res.status, res.content;
  end if;

  -- 3. Save config (anon key is already a public credential)
  insert into ai._config (key, value)
  values ('project_ref', project_ref), ('anon_key', anon_key)
  on conflict (key) do update set value = excluded.value;

  return jsonb_build_object(
    'status',       'ok',
    'deployed',     'functions/v1/ai',
    'project_ref',  project_ref
  );
end;
$$;

comment on function ai.deploy(text) is
  'Deploy the ai edge function into your Supabase project. Reads sbp_ token from '
  'Vault (name: ai_access_token). Set OPENAI_API_KEY separately via: '
  'supabase secrets set OPENAI_API_KEY=sk-... (keeps key out of SQL logs entirely).';

-- ─── ai.status() ──────────────────────────────────────────────────────────────

create or replace function ai.status()
returns jsonb
language sql
security definer
set search_path = ai, vault
as $$
  select jsonb_build_object(
    'version',        '1.0.0',
    'configured',     exists(select 1 from ai._config where key = 'project_ref'),
    'project_ref',    (select value from ai._config where key = 'project_ref'),
    'vault_token',    exists(select 1 from vault.secrets where name = 'ai_access_token')
  );
$$;

comment on function ai.status() is
  'Returns extension version, configuration state, and whether the Vault access token is present.';

-- ─── public._ai_call() ────────────────────────────────────────────────────────

create or replace function public._ai_call(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, ai, extensions
as $$
declare
  res         record;
  body        jsonb;
  project_ref text;
  anon_key    text;
begin
  select value into project_ref from ai._config where key = 'project_ref';
  select value into anon_key    from ai._config where key = 'anon_key';

  if project_ref is null then
    raise exception
      E'ai_sql extension not configured.\n'
      'Run: select ai.deploy(''your-project-ref'');';
  end if;

  select * into res from extensions.http((
    'POST',
    'https://' || project_ref || '.supabase.co/functions/v1/ai',
    array[
      extensions.http_header('Authorization', 'Bearer ' || anon_key),
      extensions.http_header('Content-Type',  'application/json')
    ],
    'application/json',
    payload::text
  )::extensions.http_request);

  begin
    body := res.content::jsonb;
  exception when others then
    raise exception 'AI function returned non-JSON (HTTP %): %', res.status, res.content;
  end;

  if body is null then
    raise exception 'AI function returned empty body (HTTP %)', res.status;
  end if;

  if res.status >= 400 then
    raise exception 'AI function call failed (HTTP %): %', res.status, body::text;
  end if;

  return body;
end;
$$;

comment on function public._ai_call(jsonb) is
  'Internal: POST payload to /functions/v1/ai. Reads endpoint config from ai._config.';

-- ─── Scalar functions ─────────────────────────────────────────────────────────
-- All user-facing functions are SECURITY DEFINER (run as owner) but REVOKED from
-- public so only the `authenticated` role can call them. This prevents anonymous
-- callers from triggering OpenAI calls and running up your bill.

create or replace function public.ai_complete2(
  input_text  text,
  system_text text default null,
  model_name  text default null,
  provider    text default 'openai'
) returns text language plpgsql security definer set search_path = public as $$
declare body jsonb; begin
  body := public._ai_call(jsonb_build_object('provider',provider,'action','complete','input',input_text,'system',system_text,'model',model_name));
  return body->>'text';
end; $$;

comment on function public.ai_complete2(text,text,text,text) is
  'Free-form LLM completion. provider: ''openai'' (default, gpt-4o-mini) via raw fetch to OpenAI API.';
revoke all     on function public.ai_complete2(text,text,text,text) from public;
grant  execute on function public.ai_complete2(text,text,text,text) to   authenticated;

create or replace function public.ai_classify(
  input_text text,
  categories text[] default array['positive','negative','neutral'],
  model_name text   default null,
  provider   text   default 'openai'
) returns text language plpgsql security definer set search_path = public as $$
declare body jsonb; begin
  body := public._ai_call(jsonb_build_object('provider',provider,'action','classify','input',input_text,'categories',categories,'model',model_name));
  return body->>'text';
end; $$;

comment on function public.ai_classify(text,text[],text,text) is
  'Classify text into one of the supplied categories. Returns the matching label.';
revoke all     on function public.ai_classify(text,text[],text,text) from public;
grant  execute on function public.ai_classify(text,text[],text,text) to   authenticated;

create or replace function public.ai_sentiment(
  input_text text,
  model_name text default null,
  provider   text default 'openai'
) returns text language plpgsql security definer set search_path = public as $$
declare body jsonb; begin
  body := public._ai_call(jsonb_build_object('provider',provider,'action','sentiment','input',input_text,'model',model_name));
  return body->>'text';
end; $$;

comment on function public.ai_sentiment(text,text,text) is
  'Returns positive, negative, or neutral.';
revoke all     on function public.ai_sentiment(text,text,text) from public;
grant  execute on function public.ai_sentiment(text,text,text) to   authenticated;

create or replace function public.ai_extract(
  input_text  text,
  schema_hint text default null,
  model_name  text default null,
  provider    text default 'openai'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare body jsonb; begin
  body := public._ai_call(jsonb_build_object('provider',provider,'action','extract','input',input_text,'schema_hint',schema_hint,'model',model_name));
  return coalesce(body->'result', '{}'::jsonb);
end; $$;

comment on function public.ai_extract(text,text,text,text) is
  'Extract structured fields as JSONB. schema_hint: comma-separated key names, e.g. ''name, email, company''.';
revoke all     on function public.ai_extract(text,text,text,text) from public;
grant  execute on function public.ai_extract(text,text,text,text) to   authenticated;

create or replace function public.ai_embed(
  input_text text,
  model_name text default 'text-embedding-3-small',
  provider   text default 'openai'
) returns real[] language plpgsql security definer set search_path = public as $$
declare body jsonb; begin
  body := public._ai_call(jsonb_build_object('provider',provider,'action','embed','input',input_text,'model',model_name));
  return array(select jsonb_array_elements_text(body->'embedding')::real);
end; $$;

comment on function public.ai_embed(text,text,text) is
  'Generate a real[] embedding vector (OpenAI only, 1536 dims). Cast to vector if pgvector is installed.';
revoke all     on function public.ai_embed(text,text,text) from public;
grant  execute on function public.ai_embed(text,text,text) to   authenticated;

create or replace function public.ai_translate(
  input_text      text,
  target_language text default 'Spanish',
  model_name      text default null,
  provider        text default 'openai'
) returns text language plpgsql security definer set search_path = public as $$
declare body jsonb; begin
  body := public._ai_call(jsonb_build_object('provider',provider,'action','translate','input',input_text,'target_language',target_language,'model',model_name));
  return body->>'text';
end; $$;

comment on function public.ai_translate(text,text,text,text) is
  'Translate text to target_language (default: Spanish).';
revoke all     on function public.ai_translate(text,text,text,text) from public;
grant  execute on function public.ai_translate(text,text,text,text) to   authenticated;

create or replace function public.ai_redact(
  input_text   text,
  entity_types text[] default array['email','phone','ssn','name'],
  model_name   text   default null,
  provider     text   default 'openai'
) returns text language plpgsql security definer set search_path = public as $$
declare body jsonb; begin
  body := public._ai_call(jsonb_build_object('provider',provider,'action','redact','input',input_text,'entity_types',entity_types,'model',model_name));
  return body->>'text';
end; $$;

comment on function public.ai_redact(text,text[],text,text) is
  'Replace PII entity_types with [REDACTED]. Defaults: email, phone, ssn, name.';
revoke all     on function public.ai_redact(text,text[],text,text) from public;
grant  execute on function public.ai_redact(text,text[],text,text) to   authenticated;

-- ─── Aggregate support ────────────────────────────────────────────────────────
--
-- Safety caps (per-session GUCs):
--   set ai_agg.max_items = 100;   -- max rows accumulated per group (default 100)
--   set ai_agg.max_chars = 12000; -- max joined chars sent per group (default 12000)

create or replace function public._ai_text_accum(state text[], val text)
returns text[] language plpgsql as $$
declare max_items int := coalesce(nullif(current_setting('ai_agg.max_items',true),'')::int, 100);
begin
  if val is null then return state; end if;
  if state is null or array_length(state,1) is null then return array[val]; end if;
  if array_length(state,1) >= max_items then return state; end if;
  return state || val;
end; $$;

create or replace function public._ai_summarize_agg_ffunc(state text[])
returns text language plpgsql security definer set search_path = public as $$
declare body jsonb; joined text;
  max_chars int := coalesce(nullif(current_setting('ai_agg.max_chars',true),'')::int, 12000);
begin
  if state is null or array_length(state,1) is null then return null; end if;
  joined := left(array_to_string(state, E'\n---\n'), max_chars);
  body := public._ai_call(jsonb_build_object('action','summarize_agg','input',joined));
  return body->>'text';
end; $$;

drop aggregate if exists public.ai_summarize_agg(text);
create aggregate public.ai_summarize_agg(text) (
  sfunc = public._ai_text_accum, stype = text[],
  finalfunc = public._ai_summarize_agg_ffunc, initcond = '{}'
);

comment on aggregate public.ai_summarize_agg(text) is
  'Summarize every row in a GROUP BY group with one LLM call. '
  'Cap with: set ai_agg.max_items=50; set ai_agg.max_chars=8000;';
revoke all     on function public.ai_summarize_agg(text) from public;
grant  execute on function public.ai_summarize_agg(text) to   authenticated;

create or replace function public._ai_extract_agg_ffunc(state text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare body jsonb; joined text;
  max_chars int := coalesce(nullif(current_setting('ai_agg.max_chars',true),'')::int, 12000);
begin
  if state is null or array_length(state,1) is null then return null; end if;
  joined := left(array_to_string(state, E'\n---\n'), max_chars);
  body := public._ai_call(jsonb_build_object('action','extract','input',joined));
  return coalesce(body->'result', '{}'::jsonb);
end; $$;

drop aggregate if exists public.ai_extract_agg(text);
create aggregate public.ai_extract_agg(text) (
  sfunc = public._ai_text_accum, stype = text[],
  finalfunc = public._ai_extract_agg_ffunc, initcond = '{}'
);

comment on aggregate public.ai_extract_agg(text) is
  'Extract entities across every row in a GROUP BY group with one LLM call. Returns jsonb. '
  'Cap with: set ai_agg.max_items=50; set ai_agg.max_chars=8000;';
revoke all     on function public.ai_extract_agg(text) from public;
grant  execute on function public.ai_extract_agg(text) to   authenticated;
