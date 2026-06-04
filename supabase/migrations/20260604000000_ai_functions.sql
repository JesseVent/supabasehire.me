-- AI helper functions backed by the `ai` edge function.
--
-- Two providers are supported via the `provider` parameter:
--   'openai'   — OpenAI chat completions (requires OPENAI_API_KEY secret set on the function)
--   'supabase' — Supabase built-in inference (no key needed; uses mistral by default)
--
-- Usage:
--   -- OpenAI (default)
--   select public.ai_complete('Write a tagline for an AI note-taking app');
--
--   -- Supabase built-in inference (no API key needed)
--   select public.ai_complete('Write a tagline for an AI note-taking app', provider => 'supabase');
--
--   -- Per-row summarization
--   select id, public.ai_summary(content) from documents limit 5;
--   select id, public.ai_summary(content, provider => 'supabase') from documents limit 5;
--
-- Before running, replace the two placeholders:
--   YOUR_PROJECT_REF         — e.g. abcdefghijklmnop
--   YOUR_ANON_OR_SERVICE_KEY — anon or service_role key from your project settings

-- ─── Enable http extension ────────────────────────────────────────────────────

create extension if not exists http with schema extensions;

-- ─── ai_complete ─────────────────────────────────────────────────────────────

create or replace function public.ai_complete(
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
    jsonb_build_object(
      'provider', provider,
      'action',   'complete',
      'input',    input_text,
      'system',   system_text,
      'model',    model_name
    )::text
  )::extensions.http_request);

  body := res.content::jsonb;

  if res.status >= 400 then
    raise exception 'ai_complete failed (HTTP %): %', res.status, body::text;
  end if;

  return body->>'text';
end;
$$;

comment on function public.ai_complete(text, text, text, text) is
  'Free-form chat completion. provider: ''openai'' (default) or ''supabase'' (built-in, no key needed).';

-- ─── ai_summary ──────────────────────────────────────────────────────────────

create or replace function public.ai_summary(
  input_text  text,
  system_text text    default 'Summarize this text in 1–3 concise sentences.',
  model_name  text    default null,
  provider    text    default 'openai'
)
returns text
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
    jsonb_build_object(
      'provider', provider,
      'action',   'summary',
      'input',    input_text,
      'system',   system_text,
      'model',    model_name
    )::text
  )::extensions.http_request);

  body := res.content::jsonb;

  if res.status >= 400 then
    raise exception 'ai_summary failed (HTTP %): %', res.status, body::text;
  end if;

  return body->>'text';
end;
$$;

comment on function public.ai_summary(text, text, text, text) is
  'Summarize text. provider: ''openai'' (default) or ''supabase'' (built-in, no key needed). Cap with LIMIT for bulk use.';
