// Small UI primitives shared across the agent-prism kit.

const CATEGORY_COLOR = {
  llm_call:         "var(--agl-cat-llm)",
  agent_invocation: "var(--agl-cat-agent)",
  tool_execution:   "var(--agl-cat-tool)",
  chain_operation:  "var(--agl-cat-chain)",
  retrieval:        "var(--agl-cat-retrieval)",
  embedding:        "var(--agl-cat-embedding)",
  guardrail:        "var(--agl-cat-guardrail)",
  create_agent:     "var(--agl-cat-create-agent)",
  span:             "var(--agl-cat-unknown)",
  event:            "var(--agl-cat-embedding)",
  unknown:          "var(--agl-cat-unknown)",
};

const CATEGORY_LETTER = {
  llm_call: "A", agent_invocation: "G", tool_execution: "T",
  chain_operation: "C", retrieval: "R", embedding: "E",
  guardrail: "G", create_agent: "+", span: "·", event: "*", unknown: "?",
};

function Avatar({ category, letter, size = "sm" }) {
  return (
    <div
      className={"avatar " + (size === "lg" ? "lg" : "")}
      style={{ background: CATEGORY_COLOR[category] || CATEGORY_COLOR.unknown }}
    >
      {letter || CATEGORY_LETTER[category] || "·"}
    </div>
  );
}

function Badge({ children, category, tone }) {
  let style = {};
  if (category) {
    const c = CATEGORY_COLOR[category];
    style = { background: `color-mix(in oklch, ${c} 14%, transparent)`, color: c };
  } else if (tone === "success") {
    style = { background: "var(--agl-success-muted)", color: "var(--agl-success-strong)" };
  } else if (tone === "error") {
    style = { background: "var(--agl-error-muted)", color: "var(--agl-error-strong)" };
  } else if (tone === "accent") {
    style = { background: "var(--agl-accent-soft)", color: "var(--agl-accent)" };
  }
  return <span className="badge" style={style}>{children}</span>;
}

function Button({ variant = "ghost", iconStart, children, ...rest }) {
  return (
    <button className={"btn btn-" + variant} {...rest}>
      {iconStart}
      {children && <span>{children}</span>}
    </button>
  );
}

function IconButton({ children, active, ...rest }) {
  return (
    <button className={"icon-btn" + (active ? " is-active" : "")} {...rest}>
      {children}
    </button>
  );
}

function Eyebrow({ children }) {
  return <span className="eyebrow">{children}</span>;
}

// Inline SVG Lucide-style icons. Stroke-only, 16px viewBox, currentColor.
const Icon = {
  Search:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
  ArrowLeft: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>,
  ChevronRight: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>,
  ChevronDown: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>,
  Plus:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  Minus:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  Copy:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>,
  Check:   () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>,
  X:       () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
  More:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle></svg>,
  Sun:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>,
  Moon:    () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>,
  Share:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>,
  Settings:() => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.21.61.74 1.06 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
};

// Brand-mark inline SVGs lifted from packages/ui/src/components/BrandLogo.tsx (Evil Martians, MIT).
const Brand = {
  anthropic: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.5 2.694h5.97l-9.204 18.612h-5.97L15.5 2.694zm-7.112 0h5.515l-9.177 18.612H0L8.388 2.694z" />
    </svg>
  ),
  openai: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z"/>
    </svg>
  ),
};

Object.assign(window, {
  Avatar, Badge, Button, IconButton, Eyebrow, Icon, Brand,
  CATEGORY_COLOR, CATEGORY_LETTER,
});
