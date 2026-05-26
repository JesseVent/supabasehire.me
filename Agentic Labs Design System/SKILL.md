---
name: agentic-labs-design
description: Use this skill to generate well-branded interfaces and assets for Agentic Labs, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping. Built in the spirit of Evil Martians' devtool design DNA (Harmony palette, agent-prism components, LaunchKit landing template).
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

Key entry points:
- `README.md` — content fundamentals, visual foundations, iconography, substitutions
- `colors_and_type.css` — drop-in stylesheet with all tokens, fonts, semantic colors (light + dark)
- `assets/` — logos, marks, placeholders, favicon
- `fonts/` — Martian Grotesk, Inter Variable, JetBrains Mono
- `preview/` — per-token visual cards for tokens, type, components
- `ui_kits/agent-prism/` — devtool product UI kit (trace viewer)
- `ui_kits/landing/` — marketing-site UI kit
- `packages/` — source files imported from evilmartians/agent-prism (reference only)

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. `<link rel="stylesheet" href="colors_and_type.css">` and use the CSS variables for everything — never hardcode colors or font names.

If working on production code, copy assets and the CSS variables, and read the rules here to become an expert in designing with this brand. The two relevant source repos to install via npm are `@evilmartians/harmony` (color palette) and `@evilmartians/agent-prism-data` + companion packages (trace UI components). Both are MIT-licensed.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need. Default tone: Evil-Martians-direct — short, declarative, dev-to-dev, no SaaS slop.
