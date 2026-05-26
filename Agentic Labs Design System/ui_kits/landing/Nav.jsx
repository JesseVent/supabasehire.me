function Nav() {
  return (
    <header className="nav-container">
      <a href="#" className="nav-brand">
        <img src="../../assets/agentic-labs-mark.svg" alt="" />
        <span className="nav-brand-text">AGENTIC LABS</span>
      </a>
      <nav className="nav-menu">
        <a href="#pricing" className="nav-link">Pricing</a>
        <a href="#docs" className="nav-link">Docs ↗</a>
        <a href="#blog" className="nav-link">Blog ↗</a>
        <a href="#careers" className="nav-link">Careers ↗</a>
      </nav>
      <div className="button-group">
        <a href="https://github.com" className="button ghost compact" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i className="fa-brands fa-github"></i>
          <span className="tertiary" style={{ fontSize: 13 }}>4.2K</span>
        </a>
        <a href="#" className="button tertiary compact">Sign In</a>
        <a href="#" className="button primary compact">Sign Up</a>
      </div>
    </header>
  );
}

Object.assign(window, { Nav });
