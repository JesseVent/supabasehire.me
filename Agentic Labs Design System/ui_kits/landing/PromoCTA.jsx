function PromoCTA() {
  return (
    <section className="promo-cta">
      <div className="heading centered">
        <h2 className="h-section">Start debugging agents today</h2>
        <p style={{ color: "rgba(255,255,255,0.85)", maxWidth: 480, marginTop: 8 }}>
          Free for individuals, open source, self-hostable.
        </p>
        <div className="button-group margin-paragraph centered">
          <a href="#" className="button primary">Sign Up</a>
          <a href="#" className="button tertiary">Request a Demo</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-menu">
        <div>
          <p className="paragraph s secondary">
            © 2026 Agentic Labs<br/>
            Open source observability for AI agents<br/>
            Built with <a href="https://launchkit.evilmartians.io">LaunchKit</a> by <a href="https://evilmartians.com">Evil Martians</a>
          </p>
        </div>
        <div>
          <div className="link-list">
            <a href="#" className="paragraph s">Pricing</a>
            <a href="#" className="paragraph s">Licenses</a>
            <a href="#" className="paragraph s">Docs ↗</a>
            <a href="#" className="paragraph s">Blog ↗</a>
            <a href="#" className="paragraph s">Careers ↗</a>
          </div>
        </div>
        <div>
          <div className="link-list">
            <a href="#" className="icon-link paragraph s"><i className="fa-brands fa-github icon-fa"></i> GitHub</a>
            <a href="#" className="icon-link paragraph s"><i className="fa-brands fa-linkedin icon-fa"></i> LinkedIn</a>
            <a href="#" className="icon-link paragraph s"><i className="fa-brands fa-x-twitter icon-fa"></i> X.com</a>
          </div>
        </div>
      </div>
      <div className="link-list-horizontal">
        <a href="#" className="paragraph s tertiary">Privacy Policy</a>
        <a href="#" className="paragraph s tertiary">Terms of Service</a>
        <a href="#" className="paragraph s tertiary">Cookie Policy</a>
      </div>
    </footer>
  );
}

Object.assign(window, { PromoCTA, Footer });
