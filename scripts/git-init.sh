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
echo "Next — push to GitHub (no extra tools required):"
echo "  1. On github.com: New repository → name it (e.g. study-heatmap) → leave it EMPTY (no README)."
echo "  2. Then run (replace YOUR_USER and REPO):"
echo "       git remote add origin https://github.com/YOUR_USER/REPO.git"
echo "       git push -u origin main"
echo ""
echo "Optional — GitHub CLI (install first: brew install gh):"
echo "  gh repo create study-heatmap --public --source=. --remote=origin --push"
