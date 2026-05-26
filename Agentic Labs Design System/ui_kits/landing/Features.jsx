function TrustedBy() {
  return (
    <section>
      <p className="paragraph l bold text-centered">
        Trusted by fast-growing teams building agents
      </p>
      <div className="clients-container">
        <img src="../../assets/logo-client-1.png" alt="Client" />
        <img src="../../assets/logo-client-3.png" alt="Client" />
        <img src="../../assets/logo-client-2.png" alt="Client" />
        <img src="../../assets/logo-client-3.png" alt="Client" />
        <img src="../../assets/logo-client-1.png" alt="Client" />
        <img src="../../assets/logo-client-2.png" alt="Client" />
        <img src="../../assets/logo-client-3.png" alt="Client" />
      </div>
    </section>
  );
}

function Features() {
  return (
    <section>
      <div className="heading">
        <h2 className="h-section no-top-margin">A flight recorder for your agents</h2>
        <p className="paragraph m secondary">
          Agent Prism normalizes traces from OpenTelemetry, Langfuse and OTLP
          into a single tree of spans. Search, expand, inspect — without leaving
          your editor.
        </p>
      </div>

      <div className="grid gap-l">
        <div className="feature-card">
          <div className="feature-heading">
            <h3 className="h-card color-accent no-top-margin" style={{ marginBottom: 8 }}>One viewer, every trace format</h3>
            <p className="paragraph m secondary">
              Drop in OTLP, Langfuse observations, or raw JSON. Adapters
              normalize everything into the same hierarchical view, so you can
              switch backends without rewriting your debugging workflow.
            </p>
          </div>
          <img src="../../assets/placeholder-feature-16-9.png" alt="Trace viewer" />
        </div>
      </div>

      <div className="grid columns-2 gap-l">
        <div className="feature-card">
          <div className="feature-heading">
            <h3 className="h-card color-accent no-top-margin" style={{ marginBottom: 8 }}>Cost &amp; tokens, per span</h3>
            <p className="paragraph s secondary">
              See exactly where the bill went. Token counts, durations and dollar
              costs render in-line on every span, with totals rolled up to the
              trace.
            </p>
          </div>
          <img src="../../assets/placeholder-feature-16-9.png" alt="" />
        </div>
        <div className="feature-card">
          <div className="feature-heading">
            <h3 className="h-card color-accent no-top-margin" style={{ marginBottom: 8 }}>Replay any trace locally</h3>
            <p className="paragraph s secondary">
              Export a trace as a runnable script, tweak the prompt, replay.
              No more "works on prod, broken locally."
            </p>
          </div>
          <img src="../../assets/placeholder-feature-4-3.png" alt="" />
        </div>
      </div>

      <div className="grid columns-3 gap-l">
        <div className="feature-card">
          <div className="feature-heading">
            <h3 className="h-card color-accent no-top-margin" style={{ marginBottom: 8 }}>OTel native</h3>
            <p className="paragraph s secondary">
              Reads <code className="inline-code">gen_ai.*</code>, <code className="inline-code">llm.*</code>, <code className="inline-code">retrieval.*</code> — the standard semantic conventions.
            </p>
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-heading">
            <h3 className="h-card color-accent no-top-margin" style={{ marginBottom: 8 }}>BYO model</h3>
            <p className="paragraph s secondary">
              Anthropic, OpenAI, Mistral, your own. Color-coded badges per
              provider so the eye finds the right call instantly.
            </p>
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-heading">
            <h3 className="h-card color-accent no-top-margin" style={{ marginBottom: 8 }}>Open source</h3>
            <p className="paragraph s secondary">
              MIT-licensed. <a href="#">Read the source</a>. Or self-host the
              SaaS — both work.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { TrustedBy, Features });
