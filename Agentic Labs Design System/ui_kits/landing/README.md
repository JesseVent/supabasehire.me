# Landing UI Kit

Recreation of the **LaunchKit** marketing template ([`evilmartians/devtool-template`](https://github.com/evilmartians/devtool-template)), branded as the Agentic Labs marketing site.

Source files for reference (full original HTML/CSS) live in… well, the repo. Here we rebuild it as small JSX components so each block is reusable when you want to remix the marketing page.

## Surface

A single static landing page, top-down:

1. **Nav** — sticky pill, blur backdrop, GitHub star count, sign-in/up.
2. **Hero** — eyebrow pill + display headline + sub + primary CTA + screenshot bleed.
3. **Trusted by** — client logo row (placeholders).
4. **Feature grid** — three layouts: 1-up wide, 2-up, 3-up.
5. **Cards with icons** — icon + heading + body.
6. **Code-block section** — description left, monaco-style code card right.
7. **FAQ accordion** — `<details>` with hairline borders.
8. **Promo CTA** — gradient panel + buttons.
9. **Footer** — multi-column links, social icons.

## Files

| File | What |
| --- | --- |
| `index.html` | The full page, loads React + Babel. |
| `landing.css` | Local-only styles bridging tokens → BEM-ish classes (`button`, `feature-card`, `nav-container`, etc.). |
| `Nav.jsx` | Top sticky nav with logo, links, sign up/in. |
| `Hero.jsx` | Eyebrow + headline + sub + CTAs + screenshot. |
| `Features.jsx` | All three feature-card layouts in one component. |
| `IconCards.jsx` | "Cards with icons" row. |
| `CodeSection.jsx` | Heading + dark code panel. |
| `FAQ.jsx` | Accordion list. |
| `PromoCTA.jsx` | Gradient panel with sign-up + demo. |
| `Footer.jsx` | Footer menu + socials. |

## Conventions

- Class names follow LaunchKit so existing dev-tool-template CSS knowledge transfers: `button primary`, `feature-card`, `nav-container`, `paragraph m secondary`, `eyebrow`.
- Color comes from `--agl-*` tokens (which mirror LaunchKit's `--color-*` names just with our `agl` prefix).
- Font Awesome 6 is loaded from CDN for icons — matches LaunchKit exactly.
