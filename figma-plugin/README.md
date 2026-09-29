# Chennai Rice — Website to Figma

A one-shot Figma plugin that rebuilds the site's pages as **editable Figma
layers** — real auto-layout frames, real text nodes, real image fills. Nothing
it produces is a screenshot.

It runs inside your own Figma app, so it is not subject to the Figma MCP
tool-call limit that blocks building these pages remotely on a Starter plan.

## Install (once)

You need the **Figma desktop app** — development plugins cannot be imported
from the browser.

1. Open the Figma desktop app.
2. Open the file you want to build into, or create a new design file.
3. Menu → **Plugins → Development → Import plugin from manifest…**
4. Select `figma-plugin/manifest.json` from this repo.

## Run

**Plugins → Development → Chennai Rice — Website to Figma**

A small window fetches the artwork from `chennairiceindustries.com`, then
builds the pages. It takes a few seconds — most of it is downloading the pack
shots. When it finishes it reports what it made.

Running it again is safe: it reuses the existing variables and text styles and
replaces the generated pages rather than stacking up duplicates.

## What it creates

**Variables** — an 18-colour `Chennai Rice` collection grouped as `Maroon/`,
`Band/`, `Cream/`, `Gold/` and `Ink/`, with the exact values from
`frontend/src/styles/global.css`.

**Text styles** — a 14-step ramp matching the real CSS: `Display/Hero`
(DM Serif Display 105 / 106% / −2%), `Heading/Section` (Playfair Display
SemiBold 44), the Poppins body and label sizes with their real tracking, the
shop's Marcellus + Karla pair, and the Mrs Saint Delafield signature.

**Components page** — `Navbar`, `Product Card` and `Footer` as real Figma
components. The screens place instances, so editing the component updates
every page.

**Pages page** — two 1440px screens:

| Screen | Sections |
| --- | --- |
| Home | Navbar · Hero with ESTD badge · Stats strip · 3 product showcase slots · Feature strip · Testimonials · Footer |
| Products | Navbar · Hero · Filter pills · 12-pack grid (3 rows of 4) · Footer |

## Adding more pages

`code.js` is organised so a new screen is one function. Copy `buildProducts`,
change the sections, and append it in `run()` next to the others. Content
lives in the `DATA` object at the top — it is a snapshot of
`frontend/src/data/content.js` and the shop catalogue taken when this was
written, so re-sync it there if the site's copy changes.

## Known limits

- **The hero video is a flat dark panel.** The real hero plays `hero.mp4`;
  Figma has no video fill, so the frame carries the same warm-dark ground the
  CSS falls back to.
- **Icons are omitted** in the feature strip and elsewhere — the site draws
  them as inline SVG paths in JSX, and they are not worth transcribing by hand.
  The labels and layout are all there.
- **Desktop only (1440px).** The site's mobile layouts are driven by CSS media
  queries with no separate markup, so a phone frame would be a second build.
- **Gradients are approximated as flat fills** where the CSS uses multi-stop
  radial or layered backgrounds (the navbar band, the hero scrim).
- If an image cannot be fetched, that frame keeps its flat tint and is renamed
  `… (image unavailable)` rather than failing the whole run.
