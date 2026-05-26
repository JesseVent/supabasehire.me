// Mock OpenTelemetry-style traces & spans for the demo.
// Replace by piping real OTLP JSON through @evilmartians/agent-prism-data.

const traces = [
  {
    id: "t-001",
    name: "research_agent run",
    spansCount: 14,
    durationMs: 4286,
    agentDescription: "Multi-step research agent → web search → summarize",
    badges: [
      { label: "anthropic", category: "llm_call" },
      { label: "tools" },
    ],
    status: "ok",
    startedAt: "2 min ago",
  },
  {
    id: "t-002",
    name: "rag_qa pipeline",
    spansCount: 9,
    durationMs: 1820,
    agentDescription: "Retrieval-augmented Q&A over docs corpus",
    badges: [
      { label: "openai", category: "llm_call" },
      { label: "pgvector", category: "retrieval" },
    ],
    status: "ok",
    startedAt: "12 min ago",
  },
  {
    id: "t-003",
    name: "code_writer.fix_bug",
    spansCount: 22,
    durationMs: 12_904,
    agentDescription: "Triages a GitHub issue, opens a PR with fix + tests",
    badges: [
      { label: "anthropic", category: "llm_call" },
      { label: "shell", category: "tool_execution" },
      { label: "guard", category: "guardrail" },
    ],
    status: "err",
    startedAt: "1 h ago",
  },
  {
    id: "t-004",
    name: "support_router classify",
    spansCount: 6,
    durationMs: 712,
    agentDescription: "Classify inbound ticket → escalate or autoresolve",
    badges: [
      { label: "openai", category: "llm_call" },
    ],
    status: "ok",
    startedAt: "3 h ago",
  },
  {
    id: "t-005",
    name: "embed_corpus.batch",
    spansCount: 41,
    durationMs: 38_204,
    agentDescription: "Nightly embedding refresh, 14k docs",
    badges: [
      { label: "openai", category: "embedding" },
      { label: "pgvector", category: "retrieval" },
    ],
    status: "pending",
    startedAt: "running",
  },
];

// One span tree for the selected trace.
// minStart=0, maxEnd=durationMs implied — the row computes left/width as percentages.
const spans = [
  {
    id: "s-root",
    title: "research_agent.invoke",
    category: "agent_invocation",
    brand: null,
    status: "ok",
    startMs: 0, durationMs: 4286,
    cost: 0.042, tokens: 6120,
    children: [
      {
        id: "s-1", title: "plan.next_step", category: "chain_operation", brand: null,
        status: "ok", startMs: 12, durationMs: 184, tokens: 420,
      },
      {
        id: "s-2", title: "anthropic.messages.create", category: "llm_call", brand: "anthropic",
        status: "ok", startMs: 220, durationMs: 1262, tokens: 1840, cost: 0.014,
        children: [
          { id: "s-2a", title: "tokenize.input",  category: "span", brand: null,
            status: "ok", startMs: 224, durationMs: 24 },
          { id: "s-2b", title: "stream.delta",    category: "event", brand: null,
            status: "ok", startMs: 250, durationMs: 1200 },
        ]
      },
      {
        id: "s-3", title: "tools.web_search", category: "tool_execution", brand: null,
        status: "ok", startMs: 1488, durationMs: 540,
        children: [
          { id: "s-3a", title: "https://duckduckgo.com/?q=…", category: "span", brand: null,
            status: "ok", startMs: 1490, durationMs: 482 },
        ]
      },
      {
        id: "s-4", title: "retrieve.relevant_docs", category: "retrieval", brand: null,
        status: "ok", startMs: 2040, durationMs: 96,
      },
      {
        id: "s-5", title: "guardrail.toxicity", category: "guardrail", brand: null,
        status: "ok", startMs: 2140, durationMs: 48,
      },
      {
        id: "s-6", title: "anthropic.messages.create  (final)", category: "llm_call", brand: "anthropic",
        status: "ok", startMs: 2200, durationMs: 2010, tokens: 3120, cost: 0.024,
      },
      {
        id: "s-7", title: "save.transcript", category: "span", brand: null,
        status: "ok", startMs: 4220, durationMs: 60,
      },
    ]
  }
];

// Sample attribute dump for the selected span
const sampleAttributes = [
  { key: "gen_ai.system",          val: "anthropic",                  type: "str" },
  { key: "gen_ai.request.model",   val: "claude-haiku-4-5",            type: "str" },
  { key: "gen_ai.usage.input_tokens",  val: 1284,                      type: "num" },
  { key: "gen_ai.usage.output_tokens", val:  556,                      type: "num" },
  { key: "gen_ai.usage.cost",      val: 0.014,                         type: "num" },
  { key: "http.status_code",       val: 200,                           type: "num" },
  { key: "duration_ms",            val: 1262,                          type: "num" },
  { key: "trace.id",               val: "t-001",                       type: "str" },
  { key: "span.id",                val: "s-2",                         type: "str" },
];

const sampleInput = {
  model: "claude-haiku-4-5",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Summarize the latest changes to the OKLCH spec in 3 bullets." }
  ]
};

const sampleOutput = {
  id: "msg_018h3…",
  type: "message",
  role: "assistant",
  content: [
    { type: "text", text: "• Working-draft now lists OKLCH as a stable CSS color function.\n• Browsers (Chrome 111+, Firefox 113+, Safari 16.4+) ship OKLCH.\n• Tooling: tailwindcss v4 emits OKLCH by default; @evilmartians/harmony ships P3 fallbacks." }
  ],
  stop_reason: "end_turn"
};

Object.assign(window, {
  AGL_TRACES: traces,
  AGL_SPANS: spans,
  AGL_ATTRIBUTES: sampleAttributes,
  AGL_INPUT: sampleInput,
  AGL_OUTPUT: sampleOutput,
});
