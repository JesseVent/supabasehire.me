function CodeSection() {
  return (
    <section>
      <div className="grid columns-1-2-1 gap-xl">
        <div className="heading">
          <h2 className="h-section no-top-margin">Three lines from JSON to insight</h2>
          <p className="paragraph m secondary">
            React-friendly UI primitives, framework-agnostic data adapters.
            If you can <code className="inline-code">npm install</code>, you can ship Agent Prism.
          </p>
        </div>
        <div className="card-code-block">
          <pre>
<span className="c-c"># 1. install</span>{"\n"}
<span className="c-k">npm</span> install @agentic/prism @agentic/prism-data{"\n"}
{"\n"}
<span className="c-c"># 2. use</span>{"\n"}
<span className="c-k">import</span> {"{"} TraceViewer {"}"} <span className="c-k">from</span> <span className="c-s">"@agentic/prism"</span>;{"\n"}
<span className="c-k">import</span> {"{"} adapter {"}"} <span className="c-k">from</span> <span className="c-s">"@agentic/prism-data"</span>;{"\n"}
{"\n"}
<span className="c-k">const</span> spans = adapter.convert(otlpJSON);{"\n"}
&lt;TraceViewer spans={"{"}<span className="c-s">spans</span>{"}"} /&gt;
          </pre>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { CodeSection });
