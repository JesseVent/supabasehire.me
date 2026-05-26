function DocsHeader() {
  return (
    <header className="docs-header">
      <a className="docs-brand" href="#">
        <img src="../../assets/agentic-labs-mark.svg" alt="" />
        <span className="docs-brand-text">AGENTIC LABS</span>
        <span className="docs-brand-section">docs</span>
      </a>

      <div className="docs-search" role="searchbox" aria-label="Search docs">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <span className="grow">Search docs, API references, errors…</span>
        <span className="kbd">⌘K</span>
      </div>

      <div className="docs-header-actions">
        <button className="docs-version">
          <span>v2.4.1</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <a className="docs-github" href="https://github.com">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.67 1.24 3.33.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.27-5.23-5.66 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.4-2.69 5.37-5.25 5.65.41.36.78 1.05.78 2.12v3.14c0 .31.21.66.79.55C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
          <span>4.2K</span>
        </a>
      </div>
    </header>
  );
}

Object.assign(window, { DocsHeader });
