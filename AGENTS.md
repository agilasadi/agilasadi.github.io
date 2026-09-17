# Agent Instructions

This folder is the source for Agil Asadi's personal site. GitHub Pages publishes `https://agilasadi.github.io` from `master`. Local work is often on another branch and uncommitted. Preview this working tree over HTTP. Do not review or debug against the live URL unless the user asks about production.

No bundler, framework, or tests. One static page, Tailwind CLI, native ES modules.

## Run

```bash
npm install
npm run watch
npm run preview
```

`watch` compiles `resources/style.css` → `dist/output.css`. `preview` serves the repo over HTTP.

- Mosaic scripts are `type="module"`. Opening `index.html` as `file://` will not load them.
- After CSS class or `resources/style.css` edits, rebuild `dist/output.css` (`watch` or `npm run build`) before checking the browser.
- Do not hand-edit `dist/output.css`. Commit the rebuilt file when the user asks to commit CSS work.

## Verify

For anything a visitor would see (layout, mosaic, shadows, copy, type, photo), serve locally and check in the browser. Confirm `lg` (≥1024px, two columns, sticky left rail, photo pinned with socials) and a narrow viewport (photo still visible, not `display: none`). `prefers-reduced-motion` and coarse/touch pointers disable the pointer ring and idle flock motion; the mosaic still paints.

## Layout

`.page-front` (`[data-mosaic-guide]`) is `max-w-5xl` (1024px) and centered. On a wide screen the extra space is mosaic gutter, not wider copy. Do not switch back to Tailwind `container` (1280/1536) unless asked. Do not collapse the two-column layout unless asked.

- Left (`lg:w-1/2`): name, intro, in-page nav, photo + socials. Sticky via `.lg:vh-100-128`. Photo stays visible at every breakpoint (no `hidden sm:block`).
- Right (`#experiences`, `[data-page-shadow-column]`): Experiences, I Speak (`#languages`).

Below `lg` the same blocks stack in that order.

Z-order: mosaic stage `z-index: 0` → `.page-front` `1` → `.page-shadow-top` / `.page-shadow-bottom` `2`.

## Files

| Path | Purpose |
|---|---|
| `index.html` | The page: markup, copy, Tailwind classes, script tags |
| `resources/style.css` | Source CSS: Tailwind layers, `:root` tokens, custom classes |
| `dist/output.css` | Generated. Do not edit by hand |
| `tailwind.config.js` | `content` is `./index.html` only. `gray-100`–`400` map to `--ui-ink-*` |
| `resources/js/pageShadows.js` | Pins the top/bottom fades to the scrolling column |
| `resources/js/mosaic/boot.js` | Wires the pointer ring to the canvas texture |
| `resources/js/mosaic/pointerRing.js` | Spring-followed pointer ring |
| `resources/js/mosaic/pointerTexture.js` | Canvas mosaic: layout, paint, gather / disperse / strike |
| `resources/js/mosaic/mosaicFlock.js` | Plate particles: home cells, Vogel disk around the pointer, idle wander |
| `resources/js/mosaic/leadMosaicAlign.js` | Grid origin and cell size from `[data-mosaic-guide]` |
| `picture.jpg` | Profile photo (`src` on the avatar) |
| `picture-100p.png` | Favicon |
| `picture.png` | Unused original. Leave it |

## Visual system

Tokens live on `:root` in `resources/style.css`: `--ui-bg`, `--ui-accent`, `--ui-ink-100`–`400`, `--ui-line`, `--ui-shadow`. Page background is charcoal `rgb(11 15 18)`. The name uses Sora; everything else is monospace via `* { font-family: monospace }`. Poppins is loaded in `index.html` but unused.

Reuse `gray-*` utilities and the existing custom classes (`.shadowed-box-border`, `.clickable-text-button`, `.page-front`, `.profile-image-*`). Do not add a new palette, hex one-offs, or a CSS framework.

Tailwind only scans `index.html`. A utility used only in JS will not be generated. Custom CSS belongs in `resources/style.css`.

## Mosaic

Ported from the o-scope marketing page. Hooks that this site actually uses:

- `[data-home-pointer-stage]`, `[data-home-pointer-texture]`, `[data-home-pointer-ring]`
- `[data-mosaic-guide]` — grid aligns to this box (`.page-front`)

These selectors are leftovers and unused here. Do not wire them up or delete them as cleanup unless asked: `[data-lead-mosaic-card]`, `[data-lead-mosaic-row]`, `[data-lead-mosaic-window]`, `.public-column`.

Behavior: plates sit on a grid sized from the guide. Pointer gather pulls a disk of plates into a flock (Vogel spiral). Leave sends them home. Click strikes a short glow. Idle wander relocates a few settled plates about once a second. Reduced motion: static mosaic, no ring, no wander.

Keep the named constants (cell size, spring omega/zeta, idle counts, RGB). Do not re-inline numbers that already have exports.

## Page shadows

`.page-shadow-top` and `.page-shadow-bottom` are fixed fades. JS sets their `left`/`width` and opacity:

- `lg`: only the right column (`[data-page-shadow-column]`)
- smaller: the whole `[data-mosaic-guide]`
- opacity 0 at that scroll end (no top fade at `scrollY === 0`; no bottom fade at the bottom)
- both hidden if the page does not scroll

Do not restore full-width fades over the mosaic.

## Content

Copy lives in `index.html`. First-person profile, not a product app.

- Keep visual edits conservative. Do not restyle the page while changing copy.
- Right-column sections are Experiences and I Speak. Do not bring back Approach, Tech Stack, Topics, or Practices.
- Do not add manifesto / “how I work” copy. The intro already covers that.
- Do not add a copyright / “all rights reserved” line.
- Do not invent jobs, dates, or skills. Past roles stay past tense.
- In-page nav (`#experiences`, `#languages`) must match those sections.

## Commits

Only commit when asked. Stage only files from this task. Never commit `node_modules`, `.idea`, or secrets. No Cursor trailers or `Co-authored-by`.

## Do not

- Collapse the `lg` two-column layout unless asked.
- Hide the profile photo at any breakpoint.
- Add a SPA, bundler, component library, or test harness.
- Treat the live GitHub Pages site as this working tree.
- Widen Tailwind `content` to the whole repo.
- Refactor the mosaic “back” to o-scope markup.
