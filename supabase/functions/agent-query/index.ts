// Demonstrates OpenTelemetry instrumentation in a Supabase edge function.
// Runs 3 chained SQL queries (simulating agentic steps), wraps each in an
// OTLP span, and returns the trace alongside the query results in the response.
//
// Deploy: supabase functions deploy agent-query --no-verify-jwt

import { isAuthorized } from '../_shared/auth.ts'
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts'

// ─── OTLP helpers ────────────────────────────────────────────────────────────

function hex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

interface OTLPAttr {
  key: string
  value: { stringValue: string }
}

interface OTLPSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: 'SPAN_KIND_INTERNAL'
  startTimeUnixNano: string
  endTimeUnixNano: string
  attributes: OTLPAttr[]
  status: { code: 'STATUS_CODE_OK' }
  flags: number
}

function makeSpan(
  traceId: string,
  spanId: string,
  parentSpanId: string | undefined,
  name: string,
  startMs: number,
  endMs: number,
  attrs: Record<string, string>,
): OTLPSpan {
  return {
    traceId,
    spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    name,
    kind: 'SPAN_KIND_INTERNAL',
    startTimeUnixNano: String(BigInt(startMs) * 1_000_000n),
    endTimeUnixNano: String(BigInt(endMs) * 1_000_000n),
    attributes: Object.entries(attrs).map(([key, value]) => ({ key, value: { stringValue: value } })),
    status: { code: 'STATUS_CODE_OK' },
    flags: 1,
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
      },
    })
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: 'SUPABASE_DB_URL not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const client = new Client(dbUrl)
  await client.connect()

  const traceId = hex(16)
  const rootId = hex(8)
  const otlpSpans: OTLPSpan[] = []
  const steps: { name: string; durationMs: number; result: unknown }[] = []

  const rootStart = Date.now()

  try {
    // ── Step 1: discover_tables ───────────────────────────────────────────────
    const s1Id = hex(8)
    const s1Start = Date.now()
    const tablesResult = await client.queryObject<{ table_name: string; size: string }>(`
      SELECT
        table_name,
        pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC
      LIMIT 5
    `)
    const tables = tablesResult.rows
    const s1End = Date.now()
    otlpSpans.push(makeSpan(traceId, s1Id, rootId, 'discover_tables', s1Start, s1End, {
      'db.system': 'postgresql',
      'db.statement': "SELECT table_name, size FROM information_schema.tables WHERE table_schema='public' LIMIT 5",
      'gen_ai.agent.step': '1',
      'result.count': String(tables.length),
    }))
    steps.push({ name: 'discover_tables', durationMs: s1End - s1Start, result: tables })

    // ── Step 2: inspect_columns ───────────────────────────────────────────────
    const targetTable = tables[0]?.table_name ?? 'pg_stat_user_tables'
    const s2Id = hex(8)
    const s2Start = Date.now()
    const columnsResult = await client.queryObject<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [targetTable],
    )
    const columns = columnsResult.rows
    const s2End = Date.now()
    otlpSpans.push(makeSpan(traceId, s2Id, rootId, 'inspect_columns', s2Start, s2End, {
      'db.system': 'postgresql',
      'db.statement': `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='${targetTable}'`,
      'gen_ai.agent.step': '2',
      'db.table': targetTable,
      'result.count': String(columns.length),
    }))
    steps.push({ name: 'inspect_columns', durationMs: s2End - s2Start, result: { table: targetTable, columns } })

    // ── Step 3: count_rows ────────────────────────────────────────────────────
    const s3Id = hex(8)
    const s3Start = Date.now()
    const countResult = await client.queryObject<{ count: string }>(`SELECT COUNT(*) AS count FROM "${targetTable}"`)
    const rowCount = Number(countResult.rows[0]?.count ?? 0)
    const s3End = Date.now()
    otlpSpans.push(makeSpan(traceId, s3Id, rootId, 'count_rows', s3Start, s3End, {
      'db.system': 'postgresql',
      'db.statement': `SELECT COUNT(*) FROM ${targetTable}`,
      'gen_ai.agent.step': '3',
      'db.table': targetTable,
      'result.row_count': String(rowCount),
    }))
    steps.push({ name: 'count_rows', durationMs: s3End - s3Start, result: { table: targetTable, rowCount } })

  } finally {
    await client.end()
  }

  const rootEnd = Date.now()

  // Root span wraps all child spans — listed first so AgentPrism treats it as the trace root
  const rootSpan = makeSpan(traceId, rootId, undefined, 'agent_query', rootStart, rootEnd, {
    'service.name': 'supabase-edge-agent',
    'gen_ai.agent.name': 'schema-inspector',
  })

  const otlpTrace = {
    resourceSpans: [{
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: 'supabase-edge-agent' } }],
      },
      scopeSpans: [{
        scope: { name: 'agent-query', version: '1.0.0' },
        spans: [rootSpan, ...otlpSpans],
      }],
    }],
  }

  return new Response(JSON.stringify({ steps, otlpTrace }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
