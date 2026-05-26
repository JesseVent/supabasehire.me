// Sample article body, written in the editorial register the system asks for.
function Article() {
  // Helper to build the rich JSX content for each code tab.
  const npmCode = (
    <>
      <span className="c-c"># Install the SDK + the React UI components</span>{"\n"}
      <span className="c-k">npm</span> install @agentic/prism @agentic/prism-data{"\n"}
      {"\n"}
      <span className="c-c"># Or with pnpm</span>{"\n"}
      <span className="c-k">pnpm</span> add @agentic/prism @agentic/prism-data{"\n"}
    </>
  );
  const npmPlain = `# Install the SDK + the React UI components
npm install @agentic/prism @agentic/prism-data

# Or with pnpm
pnpm add @agentic/prism @agentic/prism-data`;

  const yarnCode = (
    <>
      <span className="c-c"># Install with Yarn (4+)</span>{"\n"}
      <span className="c-k">yarn</span> add @agentic/prism @agentic/prism-data{"\n"}
    </>
  );
  const yarnPlain = `yarn add @agentic/prism @agentic/prism-data`;

  const usageCode = (
    <>
      <span className="c-k">import</span> {"{"} TraceViewer {"}"} <span className="c-k">from</span> <span className="c-s">"@agentic/prism"</span>;{"\n"}
      <span className="c-k">import</span> {"{"} adapter {"}"} <span className="c-k">from</span> <span className="c-s">"@agentic/prism-data"</span>;{"\n"}
      {"\n"}
      <span className="c-k">const</span> spans = adapter.convertOTLP(otlpJSON);{"\n"}
      {"\n"}
      <span className="c-k">export default function</span> App() {"{"}{"\n"}
      {"  "}<span className="c-k">return</span> &lt;TraceViewer spans={"{"}<span className="c-s">spans</span>{"}"} /&gt;;{"\n"}
      {"}"}{"\n"}
    </>
  );
  const usagePlain = `import { TraceViewer } from "@agentic/prism";
import { adapter } from "@agentic/prism-data";

const spans = adapter.convertOTLP(otlpJSON);

export default function App() {
  return <TraceViewer spans={spans} />;
}`;

  return (
    <article className="article">
      <span className="article-eyebrow">Get started</span>
      <h1>Quickstart</h1>
      <p className="lede">
        Render your first trace in three minutes. By the end of this page you'll
        have <code>@agentic/prism</code> wired to your existing OpenTelemetry
        pipeline and a working <code>&lt;TraceViewer&gt;</code> in your dev
        environment.
      </p>

      <h2 id="install">Install</h2>
      <p>
        Agent Prism ships as two npm packages: a framework-agnostic data layer
        and a React UI kit. Both are MIT-licensed and weigh under 40&nbsp;KB
        gzipped combined.
      </p>

      <CodeBlock
        tabs={[
          { label: "npm", code: npmCode, plain: npmPlain },
          { label: "yarn", code: yarnCode, plain: yarnPlain },
        ]}
      />

      <Callout kind="note" title="Peer dependencies">
        Agent Prism expects React 18+ and Tailwind 3 (or v4) in your project. If
        you don't use Tailwind, import the prebuilt stylesheet from
        <code> @agentic/prism/dist/index.css</code> instead.
      </Callout>

      <h2 id="quickstart">Wire it up</h2>
      <p>
        The fastest path: take whatever you already feed your OTel collector,
        pipe it through the <code>convertOTLP</code> adapter, and pass the
        resulting span tree to <code>&lt;TraceViewer&gt;</code>.
      </p>

      <CodeBlock tabs={[{ label: "App.tsx", code: usageCode, plain: usagePlain }]} />

      <Callout kind="tip">
        Already running Langfuse? Swap <code>convertOTLP</code> for{" "}
        <code>convertLangfuse</code> — the rest of the code is identical.
      </Callout>

      <h2 id="concepts">Core concepts</h2>
      <p>
        Three concepts you'll see throughout the docs:
      </p>

      <table>
        <thead>
          <tr><th>Term</th><th>What it is</th></tr>
        </thead>
        <tbody>
          <tr><td><code>TraceRecord</code></td><td>One run of one agent — id, name, total duration, status.</td></tr>
          <tr><td><code>TraceSpan</code></td><td>One step inside a trace — an LLM call, tool execution, retrieval, etc.</td></tr>
          <tr><td><code>Adapter</code></td><td>A function that normalizes raw provider output (OTLP, Langfuse, …) into <code>TraceSpan[]</code>.</td></tr>
        </tbody>
      </table>

      <h3 id="span-categories">Span categories</h3>
      <p>
        Each <code>TraceSpan</code> carries a <code>category</code>: one of{" "}
        <code>llm_call</code>, <code>tool_execution</code>,{" "}
        <code>agent_invocation</code>, <code>chain_operation</code>,{" "}
        <code>retrieval</code>, <code>embedding</code>,{" "}
        <code>guardrail</code>. The UI colors each category with a hue at{" "}
        <code>oklch(60% C H)</code> so all categories carry equal visual
        weight in a tree.
      </p>

      <Callout kind="warning" title="Heads up">
        Categories are inferred from your span attributes. If you set{" "}
        <code>gen_ai.system</code> on every span, you get accurate inference
        out of the box. Otherwise everything lands as <code>unknown</code>.
      </Callout>

      <h2 id="architecture">Architecture</h2>
      <p>
        Adapters run in the browser, not your backend. That means no data
        leaves the user's machine — useful for compliance scenarios where
        traces contain PII or regulated content. If you want to ship traces
        to a server for sharing or replay, hook into <code>onSpanSelect</code>
        and POST from there.
      </p>

      <Callout kind="danger" title="Do not log raw prompts to public sinks">
        Spans contain the full prompt and response text by default. Use the{" "}
        <code>redact()</code> hook on the adapter before passing data to any
        external service.
      </Callout>

      <div className="article-next">
        <a className="next-card" href="#concepts">
          <span className="label">← Previous</span>
          <span className="title">Installation</span>
        </a>
        <a className="next-card right" href="#otlp">
          <span className="label">Next →</span>
          <span className="title">OpenTelemetry (OTLP)</span>
        </a>
      </div>

      <div className="article-footer">
        <span>Last edited 2 days ago</span>
        <a href="https://github.com">Edit on GitHub →</a>
      </div>
    </article>
  );
}

Object.assign(window, { Article });
