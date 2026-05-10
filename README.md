# Study Heatmap

Chrome extension (Manifest V3) that tracks time on **productive** vs **distraction** sites (including **path rules** and **SPA navigations**), **Focus Mode** (redirect distractions to **Stay Focused** with optional cooldown override), **Deep Focus** (no override), **tab lock** (pin + on-page banner), **pause** windows, **daily & weekly goals**, **streaks**, a **toolbar badge**, **quick-add** for the current site, **Pomodoro** (optional notifications), **exports**, and dashboards (heatmap, **top hosts**, **session timeline**, week-over-week). **Data stays local** — see `PRIVACY.md`.

## Install (development)

1. Clone this repo.
2. Install dependencies and compile TypeScript (required after you change `src/`):
   ```bash
   npm install
   npm run build
   ```
3. Open `chrome://extensions`, enable **Developer mode**.
4. Click **Load unpacked** and select the project folder (repo root). The checked-in `*.js` bundles are updated whenever you run `npm run build`.

## Usage

- **Popup**: Focus / Deep Focus toggles, tab lock, daily & weekly goals, streak, quick-add host, pause, Pomodoro, sessions, live totals, dashboard link.
- **Options**: rules (`host` or `host/path`), daily & weekly productive goals (minutes), optional Pomodoro notifications (permission prompt on save).
- **Dashboard**: heatmap, charts, week-over-week, top productive & distraction hosts (7d), recent sessions, JSON/CSV export, weekly report.
- **Onboarding**: opens once on install; reopen from the popup (“How it works”).

## Development

```bash
npm test        # vitest unit tests (classification, streak, prune, weekly math)
npm run check   # TypeScript noEmit
```

CI runs on pushes/PRs via [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (`npm ci`, test, build, typecheck).

## Permissions (store / review summary)

| Permission / access | Why |
|---------------------|-----|
| `storage` | Persist settings and per-day time buckets locally. |
| `tabs` | Read the **active tab URL** for classification; open dashboard/onboarding. |
| `alarms` | Heartbeat + Pomodoro phase scheduling while the service worker sleeps. |
| `idle` | Pause attribution when the user/system is idle. |
| `webNavigation` | Detect **SPA** URL changes and drive Focus Mode redirects reliably. |
| `scripting`     | Inject the tab-lock banner on locked tabs. |
| `notifications` (**optional**) | Pomodoro alerts only if the user enables them and approves the permission. |
| `host_permissions` `<all_urls>` | In MV3, reliable access to tab URLs for classification across sites. Narrowing this often breaks time-tracking extensions; data is still stored **only locally**. |

## Publish to GitHub

From the project root:

```bash
chmod +x scripts/git-init.sh   # once
./scripts/git-init.sh
```

Then use **Git in the browser** (no `gh` needed):

1. On [github.com/new](https://github.com/new), create a repository (e.g. `study-heatmap`). Do **not** add a README, `.gitignore`, or license (keep it empty so your first push works).
2. Copy the repo URL GitHub shows (HTTPS or SSH).
3. In your project folder:

```bash
git remote add origin https://github.com/YOUR_USERNAME/study-heatmap.git
git push -u origin main
```

(Use your real username and repo name. For SSH: `git@github.com:YOUR_USERNAME/study-heatmap.git`.)

**Optional — GitHub CLI:** the `gh` command is not installed by default. To use it: `brew install gh`, then `gh auth login`, then e.g. `gh repo create study-heatmap --public --source=. --remote=origin --push`.

## License

MIT
