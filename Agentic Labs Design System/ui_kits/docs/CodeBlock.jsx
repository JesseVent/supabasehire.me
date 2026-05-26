function CodeBlock({ tabs, defaultTab }) {
  const [active, setActive] = React.useState(defaultTab || tabs[0].label);
  const [copied, setCopied] = React.useState(false);

  const current = tabs.find((t) => t.label === active) || tabs[0];

  const onCopy = () => {
    // strip JSX-rendered syntax markup before copy
    const text = current.plain || (typeof current.code === "string" ? current.code : "");
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="codeblock">
      <div className="codeblock-tabs">
        {tabs.map((t) => (
          <button
            key={t.label}
            className={"codeblock-tab" + (t.label === active ? " is-active" : "")}
            onClick={() => setActive(t.label)}
          >
            {t.label}
          </button>
        ))}
        <div className="codeblock-actions">
          <button className="codeblock-copy" onClick={onCopy}>
            {copied ? (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Copied
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="codeblock-pre"><code>{current.code}</code></pre>
    </div>
  );
}

Object.assign(window, { CodeBlock });
