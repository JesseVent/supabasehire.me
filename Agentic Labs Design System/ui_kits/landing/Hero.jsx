function Hero() {
  return (
    <section>
      <div className="heading hero centered">
        <a href="#changelog" className="eyebrow">v2.0 · trace replay shipped</a>
        <h1 className="h-hero balanced">
          Debug AI agents fast.
        </h1>
        <p className="paragraph m secondary balanced" style={{ maxWidth: 520 }}>
          Plug in OpenTelemetry data and watch your agent's process unfold —
          every LLM call, tool execution, and retry in a hierarchical timeline.
        </p>
        <div className="button-group margin-paragraph centered">
          <a href="#" className="button primary">Sign Up</a>
          <a href="#" className="button tertiary">Request a Demo</a>
        </div>
      </div>
      <div className="image-wide">
        <img src="../../assets/placeholder-main-ui.png" alt="Agent Prism trace viewer" />
      </div>
    </section>
  );
}

Object.assign(window, { Hero });
