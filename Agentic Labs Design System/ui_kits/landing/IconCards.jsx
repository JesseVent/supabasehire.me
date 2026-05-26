function IconCards() {
  const items = [
    { icon: "fa-regular fa-gem",       title: "Built by devtool people",        body: "Stewarded by Evil Martians alumni. Every interaction was sharpened against real consultancy work." },
    { icon: "fa-solid fa-bolt",        title: "Fast by default",                body: "100k-span traces render under 200ms. Resizable panels, no virtual scroller hacks." },
    { icon: "fa-solid fa-shield-halved", title: "Self-host or cloud",           body: "Same UI either way. No vendor lock-in, no data leaves your VPC if you don't want it to." },
  ];
  return (
    <section>
      <div className="heading centered">
        <h2 className="h-section no-top-margin">Why teams ship faster with Prism</h2>
        <p className="paragraph m secondary balanced">
          Three things we obsess about: speed, openness, and not getting in
          your way.
        </p>
      </div>
      <div className="cards-with-icons-container">
        {items.map((it) => (
          <div className="card-with-icon" key={it.title}>
            <div className="icon-bubble"><i className={it.icon}></i></div>
            <p className="paragraph m bold">{it.title}</p>
            <p className="paragraph s secondary" style={{ marginTop: -4 }}>{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

Object.assign(window, { IconCards });
