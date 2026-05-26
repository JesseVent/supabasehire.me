// Middle pane — recursive tree of span rows + a search/expand toolbar above.

function TreeView({ spans, selectedSpan, onSelect }) {
  const [search, setSearch] = React.useState("");
  const [expandedIds, setExpandedIds] = React.useState(() => allSpanIds(spans));
  const root = spans[0];
  const totalDur = root?.durationMs || 1;

  const allIds = React.useMemo(() => allSpanIds(spans), [spans]);
  const handleExpandAll   = () => setExpandedIds(allIds);
  const handleCollapseAll = () => setExpandedIds([root.id]);

  return (
    <div className="pane">
      <div className="tree-toolbar">
        <div className="header-search" style={{ flex: 1, maxWidth: 320, height: 30 }}>
          <Icon.Search />
          <input
            placeholder="Filter spans by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <IconButton onClick={handleExpandAll}   aria-label="Expand all"><Icon.Plus /></IconButton>
        <IconButton onClick={handleCollapseAll} aria-label="Collapse all"><Icon.Minus /></IconButton>
        <div style={{ flex: 1 }} />
        <Badge>{root?.children?.length ?? 0} top-level</Badge>
        <Badge>{formatDur(totalDur)}</Badge>
      </div>
      <div className="tree-body">
        {spans.map((s, i) => (
          <SpanRow
            key={s.id}
            span={s}
            level={0}
            isLast={i === spans.length - 1}
            connectors={[]}
            search={search}
            selected={selectedSpan?.id === s.id}
            selectedId={selectedSpan?.id}
            onSelect={onSelect}
            expandedIds={expandedIds}
            setExpandedIds={setExpandedIds}
            traceStart={root.startMs}
            traceEnd={(root.startMs + root.durationMs)}
          />
        ))}
      </div>
    </div>
  );
}

function SpanRow({
  span, level, isLast, connectors,
  search, selectedId, onSelect, expandedIds, setExpandedIds,
  traceStart, traceEnd,
}) {
  const hasChildren = span.children?.length > 0;
  const expanded = expandedIds.includes(span.id);
  const selected = selectedId === span.id;

  const hidden = search && !span.title.toLowerCase().includes(search.toLowerCase());
  const total = Math.max(1, traceEnd - traceStart);
  const left = ((span.startMs - traceStart) / total) * 100;
  const width = Math.max(1, (span.durationMs / total) * 100);

  const toggle = (e) => {
    e.stopPropagation();
    setExpandedIds((ids) => ids.includes(span.id) ? ids.filter((i) => i !== span.id) : [...ids, span.id]);
  };

  // Build child connector layout
  const childConnectors = connectors.concat(isLast ? "empty" : "vertical");

  return (
    <>
      {!hidden && (
        <div className={"span-row" + (selected ? " is-selected" : "")} onClick={() => onSelect(span)}>
          <div className="span-title">
            {connectors.map((c, i) => (
              <span key={i} className={"indent " + (c === "vertical" ? "dashed" : "")}></span>
            ))}
            {level > 0 && <span className={"indent " + (isLast ? "corner" : "corner")}></span>}
            {hasChildren ? (
              <button className="toggle" onClick={toggle} aria-label={expanded ? "Collapse" : "Expand"}>
                {expanded ? <Icon.ChevronDown /> : <Icon.ChevronRight />}
              </button>
            ) : (
              <span className="toggle"></span>
            )}
            <Avatar category={span.category} />
            <span className="name" title={span.title}>{span.title}</span>
            {span.brand && (
              <span style={{ display: "inline-flex", color: "var(--agl-fg-subtle)" }}>
                <Brand.anthropic size={11} />
              </span>
            )}
            {span.tokens   && <Badge>{(span.tokens / 1000).toFixed(1)}k tok</Badge>}
            {span.cost != null && <Badge tone="accent">${span.cost.toFixed(3)}</Badge>}
          </div>

          <div className="span-bar-cell">
            <div className="span-bar">
              <div className="fill" style={{
                left: left + "%",
                width: width + "%",
                background: CATEGORY_COLOR[span.category] || CATEGORY_COLOR.unknown,
              }} />
            </div>
          </div>

          <div className="span-dur">{formatDur(span.durationMs)}</div>

          <div className={"span-status " + (span.status === "err" ? "err" : span.status === "pending" ? "pending" : "ok")}>
            {span.status === "err" ? <Icon.X /> : span.status === "pending" ? "…" : <Icon.Check />}
          </div>
        </div>
      )}
      {hasChildren && expanded && span.children.map((c, i) => (
        <SpanRow
          key={c.id}
          span={c}
          level={level + 1}
          isLast={i === span.children.length - 1}
          connectors={childConnectors}
          search={search}
          selectedId={selectedId}
          onSelect={onSelect}
          expandedIds={expandedIds}
          setExpandedIds={setExpandedIds}
          traceStart={traceStart}
          traceEnd={traceEnd}
        />
      ))}
    </>
  );
}

function allSpanIds(spans) {
  const ids = [];
  const walk = (s) => { ids.push(s.id); (s.children || []).forEach(walk); };
  spans.forEach(walk);
  return ids;
}

Object.assign(window, { TreeView, SpanRow });
