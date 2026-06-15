// supabase/functions/ai/index.ts
//
// @description General-purpose AI helper backing the public.ai_* SQL functions.
//   Two providers are supported:
//     - "openai"   — OpenAI chat completions + embeddings (requires OPENAI_API_KEY secret)
//     - "supabase" — Supabase built-in inference (no key needed; default model: mistral)
//
//   Nine actions (the `action` body field selects the behavior):
//     - "complete"       — free-form chat completion
//     - "summary"        — summarize a single text (1–3 sentences)
//     - "summarize_agg"  — collectively summarize several texts (used by the
//                          ai_summarize_agg SQL aggregate's final function)
//     - "classify"       — classify into one of `categories`
//     - "sentiment"      — positive | negative | neutral
//     - "extract"        — extract fields as JSON (keys from `schema_hint`)
//     - "embed"          — embeddings vector (openai only; returns number[])
//     - "translate"      — translate into `target_language`
//     - "redact"         — redact PII types (`entity_types`)
//
//   Called synchronously by the public.ai_* Postgres functions via the http
//   extension. Response envelope: { text?, result?, embedding?, provider }.
//
// @param provider         "openai" (default) | "supabase"
// @param action           one of the nine actions above
// @param input            text to process (or, for summarize_agg, the already-joined group text)
// @param system           optional system-prompt override (text actions only)
// @param model            model name (openai: gpt-4o-mini / text-embedding-3-small; supabase: mistral)
// @param max_tokens       override max tokens (openai text actions)
// @param temperature      override sampling temperature (openai text actions)
// @param categories       string[] — labels for `classify`
// @param target_language  string — target language for `translate`
// @param schema_hint      string — comma-separated keys for `extract`
// @param entity_types     string[] — PII types for `redact`
//
// Deploy: supabase functions deploy ai
// Secret: supabase secrets set OPENAI_API_KEY=sk-... (only needed for the openai provider)

import OpenAI from 'https://deno.land/x/openai@v4.24.0/mod.ts'
import { withSupabase } from 'npm:@supabase/server'

// Supabase.ai is a global injected by the Supabase Edge Runtime.
// Declared here for TypeScript — not imported from a module.
declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run(prompt: string, opts: { stream: false }): Promise<string | { text?: string }>
    }
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
}

const TEXT_ACTIONS = [
  'complete',
  'summary',
  'summarize_agg',
  'classify',
  'sentiment',
  'extract',
  'translate',
  'redact',
] as const

const VALID_ACTIONS = new Set<string>([...TEXT_ACTIONS, 'embed'])

interface AiRequest {
  provider?: 'openai' | 'supabase'
  action: string
  input: string
  system?: string
  model?: string
  max_tokens?: number
  temperature?: number
  categories?: string[]
  target_language?: string
  schema_hint?: string
  entity_types?: string[]
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Prompt + sampling defaults per action ────────────────────────────────────

function systemPromptFor(action: string, req: AiRequest): string | undefined {
  switch (action) {
    case 'complete':
      return req.system // free-form; caller may pass their own
    case 'summary':
      return req.system ?? 'Summarize the input clearly and briefly in 1–3 sentences.'
    case 'summarize_agg':
      return (
        req.system ??
        'You are summarizing a group of items at once. Read all of them, then write 1–3 concise sentences that capture the key themes shared across the whole group. Do not list items individually.'
      )
    case 'classify': {
      const cats = (req.categories ?? ['positive', 'negative', 'neutral']).join(', ')
      return `You are a text classifier. Classify the input into exactly one of these categories: ${cats}. Respond with ONLY the category label and nothing else — no punctuation, no explanation.`
    }
    case 'sentiment':
      return 'You are a sentiment analyzer. Respond with EXACTLY one lowercase word: positive, negative, or neutral. Nothing else.'
    case 'extract':
      return `Extract information from the input. Return ONLY a valid JSON object (no markdown fences, no surrounding prose) using these keys: ${
        req.schema_hint ?? 'name, email, company, date, amount'
      }. Use null for any field that is not present.`
    case 'translate':
      return `Translate the following text into ${req.target_language ?? 'Spanish'}. Return ONLY the translation — no explanations, no quotation marks.`
    case 'redact': {
      const types = (req.entity_types ?? ['email', 'phone', 'ssn', 'name']).join(', ')
      return `Redact the following PII types from the input: ${types}. Replace every occurrence of each with the token [REDACTED]. Preserve all non-PII text exactly as written. Return ONLY the redacted text.`
    }
    default:
      return undefined
  }
}

function samplingDefaultsFor(action: string): { temperature: number; max_tokens: number } {
  switch (action) {
    case 'complete':
      return { temperature: 0.7, max_tokens: 500 }
    case 'summary':
      return { temperature: 0.2, max_tokens: 200 }
    case 'summarize_agg':
      return { temperature: 0.2, max_tokens: 800 }
    case 'classify':
      return { temperature: 0, max_tokens: 40 }
    case 'sentiment':
      return { temperature: 0, max_tokens: 10 }
    case 'extract':
      return { temperature: 0, max_tokens: 500 }
    case 'translate':
      return { temperature: 0.2, max_tokens: 1000 }
    case 'redact':
      return { temperature: 0, max_tokens: 1000 }
    default:
      return { temperature: 0.7, max_tokens: 500 }
  }
}

// ─── Extract JSON helper ──────────────────────────────────────────────────────

function parseExtractJson(text: string): unknown {
  if (!text) return null
  let candidate = text.trim()

  // strip ```json ... ``` fences if present
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidate = fence[1].trim()

  // isolate the outermost {...} block if the model added prose
  const first = candidate.indexOf('{')
  const last = candidate.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    candidate = candidate.slice(first, last + 1)
  }

  try {
    return JSON.parse(candidate)
  } catch {
    return { value: text.trim() }
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

async function runOpenAI(req: AiRequest): Promise<Record<string, unknown>> {
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! })

  if (req.action === 'embed') {
    const result = await openai.embeddings.create({
      model: req.model ?? 'text-embedding-3-small',
      input: req.input,
    })
    const embedding = result.data[0]?.embedding ?? []
    return { embedding, provider: 'openai' }
  }

  const model = req.model ?? 'gpt-4o-mini'
  const { temperature, max_tokens } = samplingDefaultsFor(req.action)
  const system = systemPromptFor(req.action, req)
  const messages = [
    ...(system ? [{ role: 'system' as const, content: system }] : []),
    { role: 'user' as const, content: req.input },
  ]

  const completion = await openai.chat.completions.create({
    model,
    messages,
    temperature: req.temperature ?? temperature,
    max_tokens: req.max_tokens ?? max_tokens,
    stream: false,
  })

  const text = completion.choices[0]?.message?.content ?? ''
  if (req.action === 'extract') {
    return { result: parseExtractJson(text), provider: 'openai' }
  }
  return { text, provider: 'openai' }
}

async function runSupabaseAI(req: AiRequest): Promise<Record<string, unknown>> {
  if (req.action === 'embed') {
    throw new Error(
      'embed action requires provider=openai (Supabase built-in inference does not expose embeddings via this API)'
    )
  }
  const effectiveModel = req.model ?? 'mistral'
  const session = new Supabase.ai.Session(effectiveModel)
  const system = systemPromptFor(req.action, req) ?? ''
  const prompt = system ? `${system}\n\n${req.input}` : req.input

  const output = await session.run(prompt, { stream: false })
  const text = typeof output === 'string' ? output : (output?.text ?? '')

  if (req.action === 'extract') {
    return { result: parseExtractJson(text), provider: 'supabase' }
  }
  return { text, provider: 'supabase' }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default {
  fetch: withSupabase({ auth: 'none' }, async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }

    try {
      const reqBody: AiRequest = await req.json()
      const { action, input } = reqBody

      if (!action || !input) {
        return json({ error: 'Missing required fields: action, input' }, 400)
      }
      if (!VALID_ACTIONS.has(action)) {
        return json(
          { error: `Unknown action "${action}". Valid values: ${[...VALID_ACTIONS].sort().join(', ')}` },
          400
        )
      }

      const useProvider = reqBody.provider === 'supabase' ? 'supabase' : 'openai'
      const result =
        useProvider === 'supabase' ? await runSupabaseAI(reqBody) : await runOpenAI(reqBody)

      return json(result)
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
    }
  }),
}
