// supabase/functions/catalog-generator/index.ts
//
// @description Generates AI-authored data-catalog descriptions for a single table.
//   Takes a column profile (types, null %, distinct counts, sample values), prompts
//   GPT-4o, and returns { tableDescription, columnDescriptions } as plain-English
//   business definitions. Requires the OPENAI_API_KEY secret; returns 502 on upstream
//   OpenAI failure, 401 unauthorized, 500 on misconfiguration or unexpected errors.
//
// @param tableName string required - Name of the target table (without schema prefix)
// @param schemaName string required - PostgreSQL schema containing the table (e.g. public)
// @param rowCount number required - Total row count for the table (used in the prompt for context)
// @param columns array required - Column profiles: { name, type, nullable, nullPct, distinctCount, sampleValues[] }

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from 'npm:@supabase/server'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface ColumnProfile {
  name: string;
  type: string;
  nullable: boolean;
  nullPct: number;
  distinctCount: number | null;
  sampleValues: unknown[];
}

interface RequestPayload {
  tableName: string;
  schemaName: string;
  rowCount: number;
  columns: ColumnProfile[];
}

export default {
  fetch: withSupabase({ auth: ['secret', 'publishable'] }, async (req) => {
    try {
      const openaiKey = Deno.env.get("OPENAI_API_KEY")
      if (!openaiKey) {
        return new Response(
          JSON.stringify({ error: "OPENAI_API_KEY not configured. Set it via: supabase secrets set OPENAI_API_KEY=sk-..." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const payload: RequestPayload = await req.json()
      const { tableName, schemaName, rowCount, columns } = payload

      const columnLines = columns.map((c) => {
        const samples = c.sampleValues.slice(0, 5).join(", ")
        const distinct = c.distinctCount !== null ? `~${c.distinctCount} distinct` : "unknown distinct"
        return `  - ${c.name} (${c.type}, ${c.nullPct.toFixed(1)}% null, ${distinct}${samples ? `, samples: ${samples}` : ""})`
      }).join("\n")

      const userPrompt = `Table: ${schemaName}.${tableName} (${rowCount.toLocaleString()} rows)
Columns:
${columnLines}

Return a JSON object with:
1. "tableDescription": 1-2 sentence plain English description of what this table stores and its business purpose.
2. "columnDescriptions": an object mapping each column name to a 1-sentence description of its purpose and content.

Focus on business meaning, not technical details. JSON only, no markdown.`

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a data catalog assistant. Generate concise, business-focused descriptions for database tables and columns. Always respond with valid JSON only.",
            },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      })

      if (!openaiRes.ok) {
        const errText = await openaiRes.text()
        return new Response(
          JSON.stringify({ error: `OpenAI error (${openaiRes.status}): ${errText}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const openaiData = await openaiRes.json()
      const content = openaiData.choices?.[0]?.message?.content

      if (!content) {
        return new Response(
          JSON.stringify({ error: "Empty response from OpenAI" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const parsed = JSON.parse(content)

      return new Response(
        JSON.stringify({
          tableDescription: parsed.tableDescription || null,
          columnDescriptions: parsed.columnDescriptions || {},
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }
  }),
}
