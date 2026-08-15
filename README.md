# me

A single-page "Cyber-Sentry" HUD portfolio — near-black background, neon cyan/crimson/yellow
accents, angular notched panels, scanline and grid overlays, a boot sequence, a custom
crosshair cursor, and scroll-triggered reveals.

Sections: Hero → About → Skills → Field Ops (projects) → Service Record (experience +
education) → Credentials (certifications) → Secure Channel (contact).

## How it works

Pure static site — `index.html` + `style.css` + `app.js`, no build step, no framework.
`app.js` fetches `data.json` at runtime and renders every section from it, so **editing
`data.json` and pushing is enough to update the live site** — no rebuild required.

Content mapping from `data.json`:

| `data.json`      | Where it appears                                            |
| ---------------- | ----------------------------------------------------------- |
| `personalInfo`   | hero name/chip/tagline, ID panel, About, Contact             |
| `experience`     | Service Record timeline (`// DEPLOYMENT`)                    |
| `education`      | Service Record timeline (`// TRAINING`), ID panel org badge  |
| `skills`         | Combat Skills tag groups                                     |
| `projects`       | Field Ops cards                                              |
| `customSections` | Credentials cards, and the hero ID badge (acronym + `VALID`) |

Set `personalInfo.photo` to an image URL and the ID panel uses it instead of your initials.

### Interaction details

- **Custom cursor** — a crosshair reticle that trails the pointer, expands on hover, and
  shows a readout label. Set per element with `data-cursor="LABEL"`. Automatically disabled
  for touch devices (`pointer: fine`) and for `prefers-reduced-motion`.
- **Accessibility** — `prefers-reduced-motion` skips the boot sequence, the name glitch, the
  scan sweep, and reveal animations. If `IntersectionObserver` is missing or JS fails, all
  content falls back to visible rather than staying blank.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(`file://` won't work — browsers block `fetch()` of local files. Any static server is fine.)

## Deploy to GitHub Pages

1. Push to GitHub — the root already has `index.html` and `.nojekyll`, so no build step.
2. **Settings → Pages → Build and deployment → Source → Deploy from a branch**.
3. Branch `main`, folder `/ (root)`. Save.

To update content later, edit `data.json` and push — Pages serves it immediately.
