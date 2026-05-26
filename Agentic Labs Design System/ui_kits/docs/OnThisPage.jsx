function OnThisPage({ items }) {
  return (
    <aside className="on-this-page" aria-label="On this page">
      <div className="on-this-page-label">On this page</div>
      {items.map((it) => (
        <a key={it.href} href={it.href} className={(it.level === 3 ? "h3 " : "") + (it.active ? "is-active" : "")}>
          {it.title}
        </a>
      ))}
    </aside>
  );
}

Object.assign(window, { OnThisPage });
