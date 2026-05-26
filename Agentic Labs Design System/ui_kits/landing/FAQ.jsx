function FAQ() {
  const items = [
    { q: "What data formats does Agent Prism accept?", a: "OpenTelemetry (OTLP JSON or protobuf), Langfuse observations, and a plain `TraceSpan[]` shape if you already have your own normalization." },
    { q: "Is it open source?", a: "Yes. MIT-licensed. The components live in the agent-prism monorepo; install via npm or copy them straight in with degit." },
    { q: "Can I self-host the SaaS?", a: "Yes. The full SaaS app is in `packages/saas` — a Next.js app you can deploy on Vercel, Fly, or your own infra." },
    { q: "What about non-React frameworks?", a: "The data layer is plain TypeScript. The UI is React 19 today; Vue/Solid ports are on the roadmap — open an issue if you need one." },
    { q: "How do you handle PII in traces?", a: "Bring your own redactor. We expose hooks before render; nothing leaves the browser unless you configure an export sink." },
  ];
  return (
    <section>
      <div className="heading centered">
        <h2 className="h-section no-top-margin">FAQ</h2>
        <p className="paragraph m secondary">
          Open an issue on GitHub if you can't find your question here.
        </p>
      </div>
      <div className="accordion-container">
        {items.map((it, i) => (
          <details className="accordion-item" name="faq" key={it.q} open={i === 0}>
            <summary>
              {it.q}
              <span className="accordion-chevron"><i className="fa-solid fa-chevron-down"></i></span>
            </summary>
            <div className="accordion-content">
              <p>{it.a}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

Object.assign(window, { FAQ });
