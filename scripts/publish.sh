#!/usr/bin/env bash
# Publish site/ to the gh-pages branch (GitHub Pages serves that branch).
# The branch is a single force-pushed commit, so it never grows.
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE="${PUBLISH_REMOTE:-$(git remote get-url origin)}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R site/. "$tmp"
git -C "$tmp" init -q -b gh-pages
git -C "$tmp" add -A
git -C "$tmp" -c user.name="edutube-bot" -c user.email="edutube-bot@users.noreply.github.com" \
  commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git -C "$tmp" push -q -f "$REMOTE" gh-pages
echo "published site/ to gh-pages"
