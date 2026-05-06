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

From the project root (use your system Terminal or Cursor’s terminal if `git init` works there):

```bash
chmod +x scripts/git-init.sh   # once
./scripts/git-init.sh
```

Then either:

- **GitHub CLI**: `gh repo create study-heatmap --public --source=. --remote=origin --push`
- **Manual**: create an empty repo on GitHub, then `git remote add origin git@github.com:YOUR_USER/study-heatmap.git` and `git push -u origin main`

## License

MIT
