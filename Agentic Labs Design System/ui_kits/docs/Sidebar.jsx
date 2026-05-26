function Sidebar({ active }) {
  const groups = [
    {
      label: "Get started",
      items: [
        { href: "#install",     title: "Installation" },
        { href: "#quickstart",  title: "Quickstart", active: true },
        { href: "#concepts",    title: "Core concepts" },
        { href: "#architecture",title: "Architecture" },
      ],
    },
    {
      label: "Trace ingestion",
      items: [
        { href: "#otlp",        title: "OpenTelemetry (OTLP)" },
        { href: "#langfuse",    title: "Langfuse adapter" },
        { href: "#custom",      title: "Custom adapters" },
        { href: "#redaction",   title: "PII redaction" },
      ],
    },
    {
      label: "UI components",
      items: [
        { href: "#trace-viewer",title: "<TraceViewer>" },
        { href: "#tree-view",   title: "<TreeView>" },
        { href: "#span-card",   title: "<SpanCard>" },
        { href: "#details-view",title: "<DetailsView>" },
        { href: "#theming",     title: "Theming" },
      ],
    },
    {
      label: "Reference",
      items: [
        { href: "#api",         title: "API reference" },
        { href: "#cli",         title: "CLI" },
        { href: "#errors",      title: "Error codes" },
        { href: "#changelog",   title: "Changelog" },
      ],
    },
  ];

  return (
    <aside className="sidebar" aria-label="Documentation">
      {groups.map((g) => (
        <div className="sidebar-group" key={g.label}>
          <div className="sidebar-group-label">{g.label}</div>
          {g.items.map((it) => (
            <a
              key={it.href}
              href={it.href}
              className={"sidebar-item" + (it.active ? " is-active" : "")}
            >
              {it.title}
            </a>
          ))}
        </div>
      ))}
    </aside>
  );
}

Object.assign(window, { Sidebar });
