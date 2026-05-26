# Agentic Labs — Design System

A design system for **Agentic Labs**, built in the spirit of [Evil Martians'](https://evilmartians.com) devtool design DNA: APCA-aware color, Martian typography, tight whitespace, and zero SaaS gradient slop. The output is small, fast, and editorial — the kind of UI Evil Martians ships for developer tools.

> **Who this is for.** Agentic Labs is a developer-tool studio. Everything in this system assumes the audience is technical: engineers, infra people, SREs, prompt-engineers, agent-builders. Copy is direct, dense, and confident.

## Sources

Nothing in here is invented from scratch. Every choice traces back to one of:

| Source | Used for |
| --- | --- |
| **[evilmartians/harmony](https://github.com/evilmartians/harmony)** | OKLCH + APCA color scales (Tailwind-compatible, equal contrast within levels, mirrored pairs around 500). |
| **[evilmartians/agent-prism](https://github.com/evilmartians/agent-prism)** | Semantic token names (`agentprism-*` → `agl-*`), component vocabulary (SpanCard, TraceList, Avatar, Badge), trace-category colors. |
| **[evilmartians/devtool-template](https://github.com/evilmartians/devtool-template)** ("LaunchKit") | Marketing-site structure: nav with sticky blur, feature grids, eyebrow pills, accordion FAQ, code-card layout. |
| **[imgproxy/imgproxy-docs](https://github.com/imgproxy/imgproxy-docs)** | Reference for documentation tone (read but not vendored). |
| **Harmony Figma file** (mounted) | "Harmony: Accessible UI Color Palette" — palette overview, usage examples, contrast cells, thumbnail card. |
| **MartianGrotesk-VFVF** (user upload) | Display typeface. |

Reader: open these repos, you'll get more context than fits in this README. They're the canonical reference for "what does an Evil-Martians-flavored devtool look like."

---

## Index — what's in this folder

```
.
├── README.md                  # this file
├── SKILL.md                   # claude-code-compatible skill manifest
├── colors_and_type.css        # all CSS vars: tokens, fonts, semantic colors
├── fonts/                     # MartianGrotesk, Inter, JetBrainsMono
├── assets/                    # logos, favicons, placeholders, illustrations
├── preview/                   # design-system tab preview cards (per-token)
├── ui_kits/
│   ├── agent-prism/           # devtool product UI — trace viewer
│   │   ├── README.md
│   │   ├── index.html
│   │   └── *.jsx
│   ├── docs/                  # documentation site — sidebar, article, on-this-page
│   │   ├── README.md
│   │   ├── index.html
│   │   └── *.jsx
│   └── landing/               # marketing site — hero, features, FAQ, footer
│       ├── README.md
│       ├── index.html
│       └── *.jsx
└── packages/                  # raw imported source from evilmartians/agent-prism (reference)
```

---

## CONTENT FUNDAMENTALS

The voice is **Evil-Martians-direct**: short, declarative, dev-to-dev. Never enterprise, never breathless. Read the harmony, agent-prism and launchkit READMEs for the canonical examples — anything we write should pass for one of them.

### Tone & register

- **Second person, present tense.** "Plug in OpenTelemetry data and see your agent's process unfold." Not "users can leverage…"
- **Confident but specific.** State what the thing does, not how amazing it is. `AgentPrism is an open source library of React components for visualizing traces from AI agents.` — that's it, no adjectives.
- **Acknowledge state honestly.** Alpha is alpha: `⚠️ Alpha Release: This library is under active development. APIs may change.`
- **Imperatives in CTAs.** "Sign Up", "Request a Demo", "Try the demo", "Read the post". Never "Get started today!" or "Unlock your potential."
- **Show, then explain.** Hero shot before headline, code snippet before paragraph, screenshot of the actual product instead of an abstract.

### Casing

- **Sentence case** for headings, buttons, nav links: `Use Harmony in Tailwind`, `Sign Up`, `Request a Demo`. Title Case only for proper nouns / product names: `Tailwind`, `OKLCH`, `AgentPrism`.
- **Code-style for technical strings**: file paths, packages, env vars, CSS vars — always in monospace with backticks: `@evilmartians/harmony`, `--color-accent`, `index.css`.
- **Numerals over words**: `3 sliders`, `4.5KB`, `1 page`. Never spell them out.

### Pronouns & POV

- **"You" addresses the reader-engineer**: `You can host it on any static hosting service`.
- **"We" only for stating opinion or guidance**: `We recommend starting with TraceViewer`.
- **No "I"**, no anthropomorphizing the product (`Harmony helps you…` ✗ → `Harmony elevates contrast control` ✓).

### Emoji / iconography

- **Emoji are used sparingly and only as semantic punctuation.** `⚠️` for warnings, `👮` for "stop and read this", `↗` next to external links in nav. **Never** emoji as bullet markers, never on marketing pages, never `🚀`, `✨`, `🎉`.
- **Unicode arrows are common**: `↗` (external link), `→` (in-flow), `←` (back). Cheap, dependency-free, render in any font.
- **Icons are Font Awesome 6** (free set) on the marketing site, **Lucide React** in the product UI — this matches the source repos.

### Examples (copy verbatim style, swap nouns)

| ✗ Avoid | ✓ Use |
| --- | --- |
| "Unlock powerful AI observability." | "Visualize and debug your own agent traces." |
| "Built with love by our team." | "Made in Evil Martians, product consulting for developer tools." |
| "Get started in seconds!" | "`npm install @evilmartians/harmony`" |
| "Revolutionary agent platform." | "Open source library of React components for visualizing traces from AI agents." |
| "Choose Agentic Labs for your team's success." | "Plug in OpenTelemetry data and see your agent's process unfold." |

---

## VISUAL FOUNDATIONS

### Typography

Three families. Each has a single job; don't substitute.

| Role | Family | Notes |
| --- | --- | --- |
| **Display** | Martian Grotesk (variable) | Wide & narrow axes. Use the **narrow** width (~75-90% font-stretch) for headings, **ultra-narrow** for hero numerals. Letter-spacing dialed slightly negative (`-0.01em` → `-0.02em`). |
| **Body / UI** | Inter Variable | All paragraphs, controls, labels. 13.75 / 16.5 / 22px scale. |
| **Mono** | JetBrains Mono Variable | Code, eyebrows (uppercased), inline `code`, numerals in tables and badges. *(Substitute — see below.)* |

- **Scale**: `11 / 12 / 13.75 / 16.5 / 22 / 44 / 66 / 96px`. Anything between is wrong.
- **Hero treatment**: stack a small uppercased mono eyebrow over a tight-tracked display headline. Body copy directly below, no extra ornament.
- **Line-height collapses on display sizes**: hero numerals run at `100%` line-height (`leading-tight`), body runs at `1.45`.

### Color

The whole system rides on **Harmony** (`@evilmartians/harmony`). Three rules:

1. **Use OKLCH values**, not hex. Every shade in `colors_and_type.css` is OKLCH — gives you P3 reach on modern displays and predictable lightness math.
2. **Stay within column-level for contrast pairs.** If you swap `blue-600` for `red-600` the contrast against `blue-50` / `red-50` stays the same. Use this when riffing the accent.
3. **One accent at a time.** `--agl-accent` defaults to `blue-600`. The trace-category palette (LLM = purple, Tool = orange, etc.) is the only place multiple hues coexist; everywhere else, one accent + neutrals.

Imagery is **cool-toned and crisp** — slate neutrals, blue accent, no warm sepia, no film grain, no AI-generated stock. Screenshots of real product UI are the primary "imagery."

### Backgrounds

- **Default**: solid `--agl-bg` (warm stone-50 in light, stone-950 in dark). 99% of the time.
- **Hero band**: a single soft gradient — accent at 8% opacity at the top, fading to transparent by 60% vh. That's it. Defined as `--agl-bg-gradient`.
- **No** mesh gradients, blob shapes, animated noise, or hand-drawn doodles. The Evil Martians thumbnail uses a single isometric photo of "Mars" rotated 30° — if you need ornament, use a single high-quality image, not procedural fluff.
- **Surfaces** are differentiated by **lightness alone**, not borders. The stack — `bg → surface → surface-2 → inverse` — is warm stone neutrals (stone-50 → 150 → 200 → 900) so each step is clearly distinct without needing a hairline to separate them. Reserve borders for **inputs and tables**, never cards.

### Borders, shadows, corners

- **Hairlines beat shadows.** First reach: `1px solid var(--agl-border)`, or `inset 0 0 0 1px` if you can't add a border. Shadows are quiet ambient blurs, never drop-shadow drama.
- **Corner radii** follow a small geometric scale: `4 / 8 / 12 / 16 / 24 / 36 / 9999`. Inputs and small buttons → 8 (`--radius-sm`). Cards and large buttons → 12 (`--radius-md`). Hero feature cards → 16 (`--radius-lg`). Marketing CTA panels and Harmony cards → 36 (`--radius-2xl`). Pills, avatars → `9999`.
- **Cards** = `--agl-surface` background, `1px --agl-border`, `--radius-md`, no shadow. If a card needs to "lift" (modal, dropdown), add `--shadow-md`. Never `--shadow-lg` except top-level dialogs.

### Blur & transparency

- **The nav bar uses backdrop-blur(40px)** + `--agl-overlay` (white-at-78% or dark-at-82%). This is the canonical "sticky pill" pattern from LaunchKit — copy it exactly, don't reinvent.
- Token backgrounds (`--agl-accent-soft`, `--agl-success-muted`) use `color-mix(... transparent)` so they sit cleanly over either light or dark surfaces.

### Animation & states

- **All transitions**: `var(--dur-base) var(--ease-out)` = `200ms cubic-bezier(0.22,1,0.36,1)`. Faster (`120ms`) for hover-color swaps, slower (`360ms`) for full panel open/close.
- **Hover**: drop opacity to `0.7` on solid buttons (matches `agent-prism/Button`), darken accent by one step on filled chrome, swap to `--agl-accent-soft-hover` on subtle chrome. **Never** scale-up on hover.
- **Press / active**: shrink isn't used; instead, drop opacity slightly further or saturate the border. Form controls show an accent ring (`--shadow-glow`) on focus.
- **Easing**: outward easing, not bouncy. No spring. No "fun" wiggles. This is a tool, not a toy.

### Layout

- **Marketing**: 1008px max container, centered, with everything stacking vertically. Generous `--space-8` (60px) between sections. No multi-column above the fold.
- **Product**: three-pane (TraceList | TreeView | DetailsView) on desktop, stacked on mobile. Panels are resizable; divider is a 1px line, not a fat handle.
- **Fixed elements**: the marketing nav (sticky-top with 24px inset and blur), the product header (full-width, hairline border-bottom). Nothing else is fixed.

### Visual motifs (the things that make it feel like an Evil Martians devtool)

- **Isometric stacked rhombuses** — the LaunchKit logo, the AGL mark, the Harmony tagline graphic.
- **Capsule eyebrows** above heroes: a tiny rounded-full pill with mono uppercased text.
- **Dense, hairlined data tables** — Harmony palette grid is the canonical example. 1px border, 20px rows, no zebra striping.
- **Inline numerical badges** — `42K`, `v2.0`, token counts. Always mono.
- **Wide-image bleed** — hero screenshots overshoot the container by ~8% on each side (`margin: 0 -8%; width: 116%`).
- **Themed tile cards** — blog/listing pages use the "per-card token" pattern lifted from `evilmartians.com/chronicles`. Each tile sets six CSS vars inline (`--card-bg`, `--card-title`, `--card-text`, `--card-pill`, `--card-pill-fg`, `--card-date`); the markup is identical and only the tokens change. Pick a saturated background hue, then a complementary or paler hue for title/text — both expressed in `oklch()` so contrast survives. See `preview/component-cards.html` for four extracted-from-EM themes (`lime`, `violet`, `paper`, `navy`).

---

## ICONOGRAPHY

We use **two icon sets**, picked per surface:

### Marketing surface → Font Awesome 6 (free set)

Loaded via the bundled stylesheet from `vendor/font-awesome-6.7.2/css/all.min.css` in `devtool-template`. In this design system we **link from the CDN** (`https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css`) inside `ui_kits/landing/index.html`.

Used as **class names on inline elements**, exactly like LaunchKit:
```html
<div class="fa-brands fa-github icon l"></div>
<span class="fa-solid fa-chevron-down accordion-chevron"></span>
```

Common picks: `fa-brands fa-github`, `fa-brands fa-x-twitter`, `fa-brands fa-linkedin`, `fa-solid fa-bars` (hamburger), `fa-solid fa-chevron-down`, `fa-regular fa-gem`, `fa-solid fa-heart`, `fa-regular fa-star`.

### Product surface → Lucide React (CDN ES module or inline SVG)

Matches `agent-prism` exactly. Sizes always render as `size-3` (12px) / `size-4` (16px) / `size-5` (20px) — they pair with Tailwind size classes.

Examples in this kit:
- `ArrowLeft` (collapse/expand)
- `Search` (in search inputs)
- `ChevronRight` / `ChevronDown` (tree-view toggles)
- `User` (avatar fallback)
- `Copy` (copy button)
- `MoreHorizontal` (overflow menus)
- `X` (close)

Brand logos (OpenAI, Anthropic, Google, Meta, Mistral, Perplexity) are baked into `packages/ui/src/components/BrandLogo.tsx`. Copy them inline as SVGs if you need them in a static HTML mock — they are open-source brand-mark recreations and live in the repo.

### Unicode & emoji

- `↗` external link (used in nav: `Docs ↗`, `Blog ↗`).
- `→ ← ↑ ↓` flow arrows in diagrams and step lists.
- `⚠️` README warnings only.
- **No other emoji.** Replace anything tempting (🚀 / ✨ / 🎉 / 💡 / 🔥) with words or arrows.

### Asset inventory (`assets/`)

| File | What |
| --- | --- |
| `agentic-labs-logo.svg` | Wordmark + isometric cube mark, 180×32. Uses `currentColor` + `var(--agl-accent)` overlay so it themes correctly. |
| `agentic-labs-mark.svg` | Standalone cube mark, 32×32 — for favicons, square avatars, nav-collapsed states. |
| `launchkit-logo.svg` | Original LaunchKit wordmark from devtool-template, kept as design reference for the cube motif. |
| `favicon.svg` | Small icon variant. |
| `harmony-cover.png` | Cover art from `@evilmartians/harmony` — diamonds-on-black hero, useful for marketing references and case-study tiles. |
| `evil-martians-logo-original.png` | Lurkers Evil Martians lockup (PNG). Reference only — not Agentic Labs brand. |
| `github-icon.svg` | The GitHub-octocat SVG from the Harmony Figma "For frontend engineers" frame. |
| `placeholder-main-ui.png` | Wide product-screenshot placeholder (2356×1404). Use for hero. |
| `placeholder-feature-16-9.png` | 16:9 feature card image. |
| `placeholder-feature-4-3.png` | 4:3 feature card image. |
| `placeholder-feature.png` | Square-ish feature image. |
| `logo-client-1/2/3.png` | Generic client logos for "trusted by" rows. |

---

## SUBSTITUTIONS & CAVEATS

> **Read this before iterating.**

- **Martian Mono → JetBrains Mono.** The user supplied **Martian Grotesk** (variable, in `fonts/`) but did **not** supply Martian Mono. The Harmony Figma sets ~80% of its body type in *Martian Mono sWd Md*. We've substituted **JetBrains Mono Variable** (imported from `devtool-template/fonts/`) as the closest CDN-safe replacement. It is geometrically similar (mechanical, square-cornered, dev-tool-flavored) but tracks slightly tighter and has a different `g`. **→ Please drop a `MartianMono-VFVF.woff2` into `fonts/` if you have one, and update `--font-mono` in `colors_and_type.css`.**
- **No Agentic Labs brand assets** (real logo, color, copy) were provided — the cube mark and wordmark in `assets/agentic-labs-logo.svg` are derivative of the LaunchKit cube. **→ Please provide a real logo + brand voice doc and we'll rebrand.**
- **No real product screenshots.** The `placeholder-*.png` images are LaunchKit placeholders. **→ Drop in screenshots of the actual product and we'll wire them into the landing page.**
- **APCA contrast values are baked into Harmony**, but we don't validate them at runtime here. If you tweak `--agl-accent` to a hue with very different lightness, recheck contrast manually.
- **agent-prism trace data** is reproduced in the UI kit as static mocks. The real product accepts OpenTelemetry / Langfuse JSON via adapters from `@evilmartians/agent-prism-data`.
