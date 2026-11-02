#!/usr/bin/env bash
# Weekly update: fetch new talks/episodes, commit the catalog, publish the site.
# Used by the local scheduler (launchd); the GitHub Action does the same thing.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
echo "=== $(date) ==="
git pull -q --rebase origin main
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade -r pipeline/requirements.txt
.venv/bin/python pipeline/ingest.py
git add site/data site/img pipeline/data
git commit -q -m "Weekly catalog update $(date -u +%Y-%m-%d)" || echo "no catalog changes"
git push -q origin main
scripts/publish.sh
