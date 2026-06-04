// supabase/functions/ai/index.ts
//
// @description General-purpose AI helper supporting two providers:
//   - "openai"   — OpenAI chat completions (requires OPENAI_API_KEY secret)
//   - "supabase" — Supabase built-in inference (no key needed; model: mistral)
//
//   Supports two actions:
//     - "complete" — free-form chat completion (temp 0.7, max 500 tokens)
//     - "summary"  — summarization preset (temp 0.2, max 200 tokens)
//
//   Called synchronously by public.ai_complete() / public.ai_summary() via
//   the Postgres http extension.
//
// @param provider    "openai" (default) | "supabase"
// @param action      "complete" | "summary"
// @param input       User text to process
// @param system      Optional system prompt override
// @param model       Model name (openai: gpt-4o-mini; supabase: mistral)
// @param max_tokens  Max tokens (openai only)
// @param temperature Sampling temperature (openai only)
//
// Deploy: supabase functions deploy ai
// Secret: supabase secrets set OPENAI_API_KEY=sk-... (only needed for openai provider)

import OpenAI from 'https://deno.land/x/openai@v4.24.0/mod.ts'

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function runOpenAI(
  action: string,
  input: string,
  system: string | undefined,
  model: string | undefined,
  max_tokens: number | undefined,
  temperature: number | undefined,
): Promise<string> {
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! })

  if (action === 'complete') {
    const result = await openai.chat.completions.create({
      model: model ?? 'gpt-4o-mini',
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        { role: 'user' as const, content: input },
      ],
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 500,
      stream: false,
    })
    return result.choices[0]?.message?.content ?? ''
  }

  // action === 'summary'
  const result = await openai.chat.completions.create({
    model: model ?? 'gpt-4o-mini',
    messages: [
      {
        role: 'system' as const,
        content: system ?? 'Summarize the input clearly and briefly in 1–3 sentences.',
      },
      { role: 'user' as const, content: input },
    ],
    temperature: temperature ?? 0.2,
    max_tokens: max_tokens ?? 200,
    stream: false,
  })
  return result.choices[0]?.message?.content ?? ''
}

async function runSupabaseAI(
  action: string,
  input: string,
  system: string | undefined,
  model: string | undefined,
): Promise<string> {
  const effectiveModel = model ?? 'mistral'
  const session = new Supabase.ai.Session(effectiveModel)

  const defaultSystem =
    action === 'summary'
      ? 'Summarize the input clearly and briefly in 1–3 sentences.'
      : undefined

  const systemPrompt = system ?? defaultSystem
  const prompt = systemPrompt ? `${systemPrompt}\n\n${input}` : input

  const output = await session.run(prompt, { stream: false })
  return typeof output === 'string' ? output : (output?.text ?? '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const { provider, action, input, system, model, max_tokens, temperature } = await req.json()

    if (!action || !input) {
      return json({ error: 'Missing required fields: action, input' }, 400)
    }

    if (action !== 'complete' && action !== 'summary') {
      return json({ error: `Unknown action "${action}". Valid values: complete, summary` }, 400)
    }

    const useProvider = provider === 'supabase' ? 'supabase' : 'openai'

    const text =
      useProvider === 'supabase'
        ? await runSupabaseAI(action, input, system, model)
        : await runOpenAI(action, input, system, model, max_tokens, temperature)

    return json({ text, provider: useProvider })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
