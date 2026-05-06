# Study Heatmap

Chrome extension (Manifest V3) that tracks time on **productive** vs **distraction** sites (including **path rules**), **pause** windows, **daily goals & streaks**, **Pomodoro** study sessions with optional notifications, **exports**, and dashboards (**week-over-week**, **top distractions**, heatmaps, charts). **Data stays local** — see `PRIVACY.md`.

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

- **Popup**: goal & streak, pause tracking, Pomodoro presets, session start/stop (optional note), dashboard link.
- **Options**: productive/distraction rules (`host` or `host/path`), daily goal (minutes), Pomodoro notifications toggle.
- **Dashboard**: heatmap, charts, week-over-week summary, top distraction hosts (7d), JSON/CSV export, weekly report.
- **Onboarding**: opens once on install; reopen from the popup (“How it works”).

## Development

```bash
npm test        # vitest unit tests (classification, streak, prune)
npm run check   # TypeScript noEmit
```

## Permissions

`storage`, `tabs`, `alarms`, `idle`, and broad `host_permissions` are used to read the active tab URL, bucket time by day, respect idle/focus, and run periodic heartbeats.

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
