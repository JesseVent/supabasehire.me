function Callout({ kind = "note", title, children }) {
  const labels = { note: "Note", tip: "Tip", warning: "Warning", danger: "Danger" };
  const glyphs = { note: "i", tip: "✓", warning: "!", danger: "!" };
  return (
    <aside className={"callout " + kind}>
      <div className="callout-icon">{glyphs[kind]}</div>
      <div className="callout-body">
        <strong>{title || labels[kind]}</strong>
        <p>{children}</p>
      </div>
    </aside>
  );
}

Object.assign(window, { Callout });
