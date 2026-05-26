// Left pane — list of traces, selectable, collapsible.

function TraceList({ traces, selectedId, onSelect, expanded, onToggleExpand }) {
  return (
    <div className="pane">
      <div className="trace-list-header">
        <span>Traces · {traces.length}</span>
        <IconButton onClick={() => onToggleExpand(!expanded)} aria-label={expanded ? "Collapse" : "Expand"}>
          <Icon.ArrowLeft />
        </IconButton>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {traces.map((t) => (
          <TraceItem
            key={t.id}
            trace={t}
            selected={selectedId === t.id}
            onClick={() => onSelect(t)}
          />
        ))}
      </div>
    </div>
  );
}

function TraceItem({ trace, selected, onClick }) {
  return (
    <div className={"trace-item" + (selected ? " is-selected" : "")} onClick={onClick}>
      <div className="trace-item-title">{trace.name}</div>
      <div className="trace-item-meta">
        <span>{formatDur(trace.durationMs)}</span>
        <span>·</span>
        <span>{trace.spansCount} spans</span>
        <span>·</span>
        <span>{trace.startedAt}</span>
      </div>
      <div className="trace-item-badges">
        {trace.badges?.map((b, i) => (
          <Badge key={i} category={b.category}>{b.label}</Badge>
        ))}
        {trace.status === "err"     && <Badge tone="error">err</Badge>}
        {trace.status === "pending" && <Badge tone="accent">live</Badge>}
      </div>
    </div>
  );
}

function formatDur(ms) {
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return (ms / 1000).toFixed(2) + " s";
  return (ms / 60000).toFixed(1) + " m";
}

Object.assign(window, { TraceList, formatDur });
