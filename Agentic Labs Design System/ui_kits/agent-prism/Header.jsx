// App header — brand, command search, toolbar.

function Header({ dark, onToggleTheme }) {
  return (
    <header className="header">
      <a className="header-brand" href="#">
        <img src="../../assets/agentic-labs-mark.svg" alt="" />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, fontStretch: "85%" }}>
          AGENTIC LABS
        </span>
        <span style={{ color: "var(--agl-fg-faint)", fontFamily: "var(--font-mono)", fontSize: 11 }}>/  prism</span>
      </a>

      <div className="header-search">
        <Icon.Search />
        <input placeholder="Search traces, spans, models…" defaultValue="" />
        <span className="kbd">⌘K</span>
      </div>

      <div className="header-actions">
        <Button variant="ghost"><Icon.Share /> Share</Button>
        <IconButton onClick={onToggleTheme} aria-label="Toggle theme">
          {dark ? <Icon.Sun /> : <Icon.Moon />}
        </IconButton>
        <IconButton aria-label="Settings"><Icon.Settings /></IconButton>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--agl-cat-llm), var(--agl-cat-tool))",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, marginLeft: 4,
        }}>JV</div>
      </div>
    </header>
  );
}

Object.assign(window, { Header });
