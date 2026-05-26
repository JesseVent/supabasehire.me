// Right pane — selected span details: header + tabs (Attributes / I/O / Raw).

function DetailsView({ span }) {
  const [tab, setTab] = React.useState("attrs");
  if (!span) {
    return (
      <div className="pane">
        <div className="empty">
          <div className="ico"></div>
          <div style={{ color: "var(--agl-fg-muted)", fontWeight: 500 }}>Select a span to inspect</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pane details">
      <div className="details-header">
        <div className="details-title">
          <Avatar category={span.category} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>{span.title}</h2>
            <div className="eyebrow" style={{ marginTop: 4 }}>{span.category.replace("_", " ")}</div>
          </div>
          <IconButton aria-label="Copy span id"><Icon.Copy /></IconButton>
          <IconButton aria-label="More"><Icon.More /></IconButton>
        </div>
        <div className="details-meta">
          <Badge>{formatDur(span.durationMs)}</Badge>
          {span.tokens && <Badge>{span.tokens.toLocaleString()} tok</Badge>}
          {span.cost != null && <Badge tone="accent">${span.cost.toFixed(3)}</Badge>}
          {span.status === "ok"      && <Badge tone="success">200 OK</Badge>}
          {span.status === "err"     && <Badge tone="error">Failed</Badge>}
          {span.status === "pending" && <Badge tone="accent">Pending</Badge>}
        </div>
      </div>

      <div className="details-tabs">
        <button className={"details-tab" + (tab === "attrs"  ? " is-active" : "")} onClick={() => setTab("attrs")}>Attributes</button>
        <button className={"details-tab" + (tab === "io"     ? " is-active" : "")} onClick={() => setTab("io")}>Input · Output</button>
        <button className={"details-tab" + (tab === "raw"    ? " is-active" : "")} onClick={() => setTab("raw")}>Raw</button>
      </div>

      <div className="details-body">
        {tab === "attrs" && <AttributesTab attrs={AGL_ATTRIBUTES} />}
        {tab === "io"    && <IOTab input={AGL_INPUT} output={AGL_OUTPUT} />}
        {tab === "raw"   && <RawTab span={span} />}
      </div>
    </div>
  );
}

function AttributesTab({ attrs }) {
  return (
    <div>
      {attrs.map((a) => (
        <div className="attr-row" key={a.key}>
          <span className="attr-key">{a.key}</span>
          <span className={"attr-val " + a.type}>
            {a.type === "num" ? a.val.toLocaleString() : a.val}
          </span>
        </div>
      ))}
    </div>
  );
}

function IOTab({ input, output }) {
  return (
    <div>
      <details className="collapsible-section" open>
        <summary>Input</summary>
        <pre className="json-block">{prettyJSON(input)}</pre>
      </details>
      <details className="collapsible-section" open>
        <summary>Output</summary>
        <pre className="json-block">{prettyJSON(output)}</pre>
      </details>
    </div>
  );
}

function RawTab({ span }) {
  return <pre className="json-block">{prettyJSON(stripChildren(span))}</pre>;
}

function stripChildren(s) {
  const { children, ...rest } = s;
  return rest;
}

function prettyJSON(obj) {
  // Crude syntax highlighting via spans-as-string with <span> classes.
  const str = JSON.stringify(obj, null, 2);
  return str
    .replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span class="k">$1</span>$2')
    .replace(/: ("(?:\\.|[^"\\])*")/g, ': <span class="s">$1</span>')
    .replace(/: (-?\d+(?:\.\d+)?)/g, ': <span class="n">$1</span>')
    .split("\n")
    .map((l) => <span key={Math.random()} dangerouslySetInnerHTML={{ __html: l + "\n" }} />);
}

Object.assign(window, { DetailsView });
