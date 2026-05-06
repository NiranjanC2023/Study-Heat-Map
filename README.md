# Study Heatmap

Chrome extension (Manifest V3) that tracks time on **productive** vs **distraction** sites, records **study sessions**, and shows **focus trends**, **productivity charts**, and **weekly reports**.

## Install (development)

1. Clone this repo.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the project folder.

## Usage

- **Popup**: today’s stats, focus ratio, start/stop study session, link to the dashboard.
- **Options** (Site lists): one hostname per line for productive and distraction sites.
- **Dashboard**: full-page heatmap, weekly mix chart, 30-day focus trend, ISO week summary.

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
