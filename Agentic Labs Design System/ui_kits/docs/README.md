# Docs UI Kit

A documentation site shell for Agentic Labs. Three-column layout: section sidebar · article · on-this-page TOC. Tabbed code blocks, copy buttons, status callouts that reuse the harmonized OKLCH status tokens, and the same warm-stone surface stack as the rest of the system.

## Surface

```
┌─────────────────────────────────────────────────────────────────────┐
│ Docs header: brand · search (⌘K) · version · star · GitHub          │
├─────────┬─────────────────────────────────────────────┬─────────────┤
│         │                                             │             │
│ Section │ Article — h1, h2, prose, code, callouts,    │ On this     │
│ sidebar │ tabs, tables                                │ page TOC    │
│         │                                             │             │
└─────────┴─────────────────────────────────────────────┴─────────────┘
```

## Files

| File | What |
| --- | --- |
| `index.html` | Demo page: "Getting Started" for Agentic Labs Prism SDK. |
| `docs.css` | Local style bridge — uses `colors_and_type.css` tokens. |
| `DocsHeader.jsx` | Full-width header — brand, search, version, GitHub star, theme toggle. |
| `Sidebar.jsx` | Section list with collapsible groups + active-link highlight. |
| `OnThisPage.jsx` | Right-rail anchor TOC, sticky. |
| `Article.jsx` | Prose styles for the article: `h1`-`h4`, paragraphs, lists, tables, blockquotes, inline code. |
| `CodeBlock.jsx` | Tabbed multi-language code block with copy button. |
| `Callout.jsx` | Note / Tip / Warning / Danger variants — uses `--agl-success/-warning/-error/-pending` tokens. |
| `mockContent.jsx` | The sample doc page content. |

## Editorial principles

- **One column of prose.** Article maxes at ~720px. Long-form reads first.
- **Sidebar groups labeled in mono uppercased eyebrows**, items in body weight.
- **Callouts use the harmonized status tokens** — same APCA contrast across all four variants.
- **Code blocks own the dark theme**, even in light mode — code is the figure, prose is the caption.
- **No fluff icons.** A single colored dot in callouts and an inline `i` for the type. No `💡` `⚠️` emoji.
