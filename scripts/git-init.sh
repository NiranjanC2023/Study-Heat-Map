#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -d .git ]]; then
  echo "Already a git repo (.git exists). Nothing to do."
  exit 0
fi
git init -b main
git add -A
git commit -m "Initial commit: Study Heatmap Chrome extension"
echo ""
echo "Next — create the GitHub repo and push:"
echo "  gh repo create study-heatmap --public --source=. --remote=origin --push"
echo "Or create an empty repo on github.com, then:"
echo "  git remote add origin git@github.com:YOUR_USER/study-heatmap.git"
echo "  git push -u origin main"
