-- AI helper functions backed by the `ai` edge function.
--
-- Two providers are supported via the `provider` parameter on the scalar
-- functions:
--   'openai'   — OpenAI chat completions + embeddings (requires OPENAI_API_KEY)
--   'supabase' — Supabase built-in inference (no key needed; mistral by default)
--
-- This migration is ADDITIVE: it does NOT redefine the pre-existing, already-
-- working public.ai_complete and public.ai_summary. The expanded suite uses new
-- names (ai_complete2, ai_classify, …) so the originals are never clobbered.
--
-- ─── Pre-existing (untouched — created by an earlier migration) ────────────────
--   public.ai_complete (input, system, model, provider) -> text
--   public.ai_summary  (input, system, model, provider) -> text
--
-- ─── Added by this migration — scalar (one model call per row) ─────────────────
--   public.ai_complete2 (input, system, model, provider)          -> text
--   public.ai_classify  (input, categories, model, provider)      -> text
--   public.ai_sentiment (input, model, provider)                  -> text
--   public.ai_extract   (input, schema_hint, model, provider)     -> jsonb
--   public.ai_embed     (input, model, provider)                  -> real[]
--   public.ai_translate (input, target_language, model, provider) -> text
--   public.ai_redact    (input, entity_types, model, provider)    -> text
--
-- ─── Added by this migration — aggregate (one model call per GROUP BY group) ───
--   public.ai_summarize_agg(input text) -> text   collapse + summarize a group
--   public.ai_extract_agg(input text)   -> jsonb  extract entities across a group
--
-- Usage (expanded suite):
--   select public.ai_complete2('Write a tagline', provider => 'supabase');
--   select id, public.ai_sentiment(body) from posts;
--   select public.ai_translate(title, target_language => 'French') from posts limit 1;
--   select public.ai_redact(message, entity_types => array['email','phone']) from logs;
--   select id, public.ai_embed(content) from documents limit 5;
--
--   -- TRUE aggregates usable in GROUP BY — one model call per group
--   select category, public.ai_summarize_agg(description)
--   from products group by category;
--
--   select user_id, public.ai_extract_agg(message)
--   from events group by user_id;
--
-- Limitation: the aggregate functions use the OpenAI default provider/model.
-- Passing provider/model into an aggregate would require WITHIN GROUP (ordered-set)
-- syntax, which is intentionally avoided to keep the call site clean. Use the
-- scalar wrappers when you need provider/model control per call.
--
-- Safety caps: aggregates never walk an unbounded result set. Each group is
-- capped at ai_agg.max_items rows (default 100) and ai_agg.max_chars of joined
-- text (default 12000) before the single LLM call. Tune per session, e.g.:
--   set ai_agg.max_items = 50;
--   set ai_agg.max_chars = 8000;
--
-- Why placeholders? This file is a portable template / repo artifact. The real
-- project ref and a service/anon key are secrets that differ per project and
-- must never be committed to git, so they are left as fill-in placeholders —
-- exactly as the original ai_complete/ai_summary migration was. Fill the two
-- placeholders in public._ai_call before applying:
--   YOUR_PROJECT_REF         — e.g. abcdefghijklmnop
--   YOUR_ANON_OR_SERVICE_KEY — anon or service_role key from your project settings

-- ─── Enable http extension ────────────────────────────────────────────────────

create extension if not exists http with schema extensions;

-- ─── Shared HTTP caller ───────────────────────────────────────────────────────
-- Every scalar wrapper and aggregate final function routes through this so the
-- endpoint + auth headers live in exactly one place.

create or replace function public._ai_call(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res  record;
  body jsonb;
begin
  select *
  into res
  from extensions.http((
    'POST',
    'https://YOUR_PROJECT_REF.supabase.co/functions/v1/ai',
    array[
      extensions.http_header('Authorization', 'Bearer YOUR_ANON_OR_SERVICE_KEY'),
      extensions.http_header('Content-Type',  'application/json')
    ],
    'application/json',
    payload::text
  )::extensions.http_request);

  begin
    body := res.content::jsonb;
  exception when others then
    raise exception 'AI function call returned non-JSON body (HTTP %)', res.status;
  end;

  if body is null then
    raise exception 'AI function call returned no body (HTTP %)', res.status;
  end if;

  if res.status >= 400 then
    raise exception 'AI function call failed (HTTP %): %', res.status, body::text;
  end if;

  return body;
end;
$$;

comment on function public._ai_call(jsonb) is
  'Internal: POST a JSON payload to the /functions/v1/ai edge function and return the parsed body.';

-- ─── ai_complete2 (expanded v2; the original ai_complete is left untouched) ───

create or replace function public.ai_complete2(
  input_text  text,
  system_text text    default null,
  model_name  text    default null,
  provider    text    default 'openai'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare body jsonb;
begin
  body := public._ai_call(jsonb_build_object(
    'provider', provider,
    'action',   'complete',
    'input',    input_text,
    'system',   system_text,
    'model',    model_name
  ));
  return body->>'text';
end;
$$;

comment on function public.ai_complete2(text, text, text, text) is
  'Expanded-suite free-form completion (v2). The original public.ai_complete is preserved untouched.';

-- NOTE: public.ai_summary is NOT redefined here — the pre-existing, working
-- version is left in place. For whole-group summarization use ai_summarize_agg.

-- ─── ai_classify ──────────────────────────────────────────────────────────────

create or replace function public.ai_classify(
  input_text text,
  categories text[] default array['positive', 'negative', 'neutral'],
  model_name text   default null,
  provider   text   default 'openai'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare body jsonb;
begin
  body := public._ai_call(jsonb_build_object(
    'provider',  provider,
    'action',    'classify',
    'input',     input_text,
    'categories', categories,
    'model',     model_name
  ));
  return body->>'text';
end;
$$;

comment on function public.ai_classify(text, text[], text, text) is
  'Classify text into exactly one of the supplied categories (default positive/negative/neutral). Returns the label.';

-- ─── ai_sentiment ─────────────────────────────────────────────────────────────

create or replace function public.ai_sentiment(
  input_text text,
  model_name text default null,
  provider   text default 'openai'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare body jsonb;
begin
  body := public._ai_call(jsonb_build_object(
    'provider', provider,
    'action',   'sentiment',
    'input',    input_text,
    'model',    model_name
  ));
  return body->>'text';
end;
$$;

comment on function public.ai_sentiment(text, text, text) is
  'Return a single sentiment label: positive, negative, or neutral.';

-- ─── ai_extract ───────────────────────────────────────────────────────────────

create or replace function public.ai_extract(
  input_text  text,
  schema_hint text default null,
  model_name  text default null,
  provider    text default 'openai'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare body jsonb;
begin
  body := public._ai_call(jsonb_build_object(
    'provider',    provider,
    'action',      'extract',
    'input',       input_text,
    'schema_hint', schema_hint,
    'model',       model_name
  ));
  return coalesce(body->'result', '{}'::jsonb);
end;
$$;

comment on function public.ai_extract(text, text, text, text) is
  'Extract structured fields as JSON. schema_hint is a comma-separated list of keys (e.g. ''name, email, company'').';

-- ─── ai_embed ─────────────────────────────────────────────────────────────────

create or replace function public.ai_embed(
  input_text text,
  model_name text default 'text-embedding-3-small',
  provider   text default 'openai'
)
returns real[]
language plpgsql
security definer
set search_path = public
as $$
declare body jsonb;
begin
  body := public._ai_call(jsonb_build_object(
    'provider', provider,
    'action',   'embed',
    'input',    input_text,
    'model',    model_name
  ));
  -- "embedding" is a JSON array of numbers; expand and cast to a real[].
  return array(select jsonb_array_elements_text(body->'embedding')::real);
end;
$$;

comment on function public.ai_embed(text, text, text) is
  'Generate an embedding (real[]). OpenAI only — Supabase built-in inference has no embeddings via this API. Cast to vector if pgvector is installed.';

-- ─── ai_translate ─────────────────────────────────────────────────────────────

create or replace function public.ai_translate(
  input_text      text,
  target_language text default 'Spanish',
  model_name      text default null,
  provider        text default 'openai'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare body jsonb;
begin
  body := public._ai_call(jsonb_build_object(
    'provider',         provider,
    'action',           'translate',
    'input',            input_text,
    'target_language',  target_language,
    'model',            model_name
  ));
  return body->>'text';
end;
$$;

comment on function public.ai_translate(text, text, text, text) is
  'Translate text into target_language (default Spanish). Returns only the translation.';

-- ─── ai_redact ────────────────────────────────────────────────────────────────

create or replace function public.ai_redact(
  input_text  text,
  entity_types text[] default array['email', 'phone', 'ssn', 'name'],
  model_name  text   default null,
  provider    text   default 'openai'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare body jsonb;
begin
  body := public._ai_call(jsonb_build_object(
    'provider',     provider,
    'action',       'redact',
    'input',        input_text,
    'entity_types', entity_types,
    'model',        model_name
  ));
  return body->>'text';
end;
$$;

comment on function public.ai_redact(text, text[], text, text) is
  'Redact PII entity_types (default email/phone/ssn/name) from text, replacing each with [REDACTED].';

-- ─── Aggregates: shared transition ────────────────────────────────────────────
-- Accumulates non-null text values across a group into a text[] state. The
-- final functions then make a single LLM call over the joined collection.
--
-- BUILT-IN SAFETY CAPS (so an aggregate can never walk a whole table):
--   ai_agg.max_items  — max rows accumulated per group before further rows are
--                       dropped (default 100). Bounds the number of items sent
--                       to the model. Override per session: set ai_agg.max_items = 50;
--   ai_agg.max_chars  — max characters of the joined text sent per group
--                       (default 12000). Bounds the token cost even with a few
--                       large rows. Override per session: set ai_agg.max_chars = 8000;

create or replace function public._ai_text_accum(state text[], val text)
returns text[]
language plpgsql
as $$
declare
  max_items int := coalesce(nullif(current_setting('ai_agg.max_items', true), '')::int, 100);
begin
  if val is null then
    return state;
  end if;
  -- first non-null value seeds the array (initcond '{}' is an empty array)
  if state is null or array_length(state, 1) is null then
    return array[val];
  end if;
  -- cap reached: ignore the rest of this group's rows
  if array_length(state, 1) >= max_items then
    return state;
  end if;
  return state || val;
end;
$$;

-- ─── ai_summarize_agg (aggregate) ─────────────────────────────────────────────

create or replace function public._ai_summarize_agg_ffunc(state text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  body      jsonb;
  joined    text;
  max_chars int := coalesce(nullif(current_setting('ai_agg.max_chars', true), '')::int, 12000);
begin
  if state is null or array_length(state, 1) is null then
    return null;
  end if;

  joined := left(array_to_string(state, E'\n---\n'), max_chars);
  body := public._ai_call(jsonb_build_object(
    'action', 'summarize_agg',
    'input',  joined
  ));
  return body->>'text';
end;
$$;

drop aggregate if exists public.ai_summarize_agg(text);
create aggregate public.ai_summarize_agg(text) (
  sfunc     = public._ai_text_accum,
  stype     = text[],
  finalfunc = public._ai_summarize_agg_ffunc,
  initcond  = '{}'
);

comment on aggregate public.ai_summarize_agg(text) is
  'TRUE aggregate: summarize every row in a GROUP BY group in a single LLM call. Capped at ai_agg.max_items rows (default 100) and ai_agg.max_chars (default 12000) per group. Uses the OpenAI default provider.';

-- ─── ai_extract_agg (aggregate) ───────────────────────────────────────────────

create or replace function public._ai_extract_agg_ffunc(state text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  body      jsonb;
  joined    text;
  max_chars int := coalesce(nullif(current_setting('ai_agg.max_chars', true), '')::int, 12000);
begin
  if state is null or array_length(state, 1) is null then
    return null;
  end if;

  joined := left(array_to_string(state, E'\n---\n'), max_chars);
  body := public._ai_call(jsonb_build_object(
    'action', 'extract',
    'input',  joined
  ));
  return coalesce(body->'result', '{}'::jsonb);
end;
$$;

drop aggregate if exists public.ai_extract_agg(text);
create aggregate public.ai_extract_agg(text) (
  sfunc     = public._ai_text_accum,
  stype     = text[],
  finalfunc = public._ai_extract_agg_ffunc,
  initcond  = '{}'
);

comment on aggregate public.ai_extract_agg(text) is
  'TRUE aggregate: extract entities across every row in a GROUP BY group in a single LLM call. Returns jsonb. Capped at ai_agg.max_items rows (default 100) and ai_agg.max_chars (default 12000) per group. Uses the OpenAI default provider.';
