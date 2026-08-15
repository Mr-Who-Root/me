# me

A terminal-styled interactive portfolio, inspired by the Claude Code CLI. Type `/` to see
available commands (`/about`, `/experience`, `/skills`, `/projects`, `/contact`, ...),
autocomplete with `Tab`, browse history with `↑`/`↓`.

## How it works

Pure static site — `index.html` + `style.css` + `app.js`, no build step, no framework.
`app.js` fetches `data.json` at runtime and renders every command's output from it, so
**editing `data.json` and pushing is enough to update the live site** — no rebuild required.

Sections are driven by `data.json`'s existing shape:
- `personalInfo` → `/about`, `/contact`, `/socials`, `/whoami`
- `experience`, `education`, `skills`, `projects` → matching commands
- `customSections` (e.g. Certifications) → auto-registers a command per section, slugified
  from its `title`

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly via `file://` won't work — browsers block `fetch()` of local
files. Any static server works.)

## Deploy to GitHub Pages

1. Push this repo to GitHub (root already contains `index.html` and `.nojekyll`, so no build
   step or workflow is needed).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Branch: `main`, folder: `/ (root)`. Save.
5. Your site will be live at `https://<username>.github.io/<repo>/` within a minute or two.

To update content later, just edit `data.json` and push — GitHub Pages serves the updated
file immediately, no redeploy step needed.
