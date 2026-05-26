# Agent Prism UI Kit

A high-fidelity recreation of **AgentPrism** — the Evil Martians open-source trace viewer for AI agents — branded as the Agentic Labs flagship product.

Source: [`evilmartians/agent-prism`](https://github.com/evilmartians/agent-prism). The full real components (with OpenTelemetry / Langfuse adapters) live in `../../packages/ui/src/components/` for reference; what's here is a cosmetic prototype that uses static mock data and bakes the visual language into static React/JSX you can lift into mocks.

## Surface

A three-pane desktop layout:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Header: logo · search · toolbar                                         │
├──────┬───────────────────────────────────────┬──────────────────────────┤
│      │                                       │                          │
│Trace │ Tree view of spans, with collapse,    │ Details for selected     │
│ list │ a timeline bar per span, and badges   │ span — tabs for          │
│      │ for category / cost / tokens          │ Attributes / I/O / Raw   │
│      │                                       │                          │
└──────┴───────────────────────────────────────┴──────────────────────────┘
```

## Files

| File | What |
| --- | --- |
| `index.html` | Demo shell. Loads React + Babel, wires up the app. Use as a starting point. |
| `components.jsx` | Primitives: `Button`, `Badge`, `Avatar`, `Eyebrow`, `Spinner`. Also exports the category color map. |
| `Header.jsx` | Top app bar — logo, command search, switch-mode, share, profile. |
| `TraceList.jsx` | Left sidebar — collapsible list of traces with category badges + agent description. |
| `TreeView.jsx` | Middle pane — search input + expand/collapse buttons + recursive `<SpanRow>` tree. |
| `DetailsView.jsx` | Right pane — span header, status, three tabs (Attributes / Input + Output / Raw), JSON viewer. |
| `mockData.jsx` | Fake traces + spans used to drive the demo. Replace with real OTLP via `@evilmartians/agent-prism-data`. |

## What's faked vs. real

| Fake | Real |
| --- | --- |
| Trace data is a static array; no upload, no streaming. | Visual treatment of every cell, spacing, color, font weight — matches the Tailwind classes in the real components. |
| Interactivity: clicking a span/trace updates the selected one and that's it. | Collapse/expand state, tab switching, focus rings, hover styles. |
| The timeline bar widths are based on percentage offsets we baked in. | The bar treatment + categorical fills are pulled straight from `getTimelineData()`. |

## Conventions used

- `font-family: var(--font-sans)` everywhere except code blocks and badges (mono).
- Buttons follow the agent-prism `Button` component: `bg-agentprism-primary` → `--agl-fg`; on-hover, drop opacity to `0.7`.
- Status colors use `--agl-success` / `--agl-error` / `--agl-pending`.
- All colors come from `colors_and_type.css` — no hex values appear inline.
