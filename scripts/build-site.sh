#!/bin/sh
# Assemble the published site into one directory from an explicit allow-list.
#
# GitHub Pages (.github/workflows/pages.yml), the GitLab Pages job and the
# public-surface gate (.gitlab-ci.yml) all use this script, so the gate checks
# exactly the files that wiremark.net serves. Before wiremark/ops#21 the whole
# repository root was uploaded, which published CLAUDE.md, orbital.yaml,
# .gitlab-ci.yml, .claude/ and the verify scripts. Add a path here only when the
# public site needs it.
#
# Usage: sh scripts/build-site.sh [output-dir]   (default: _site)
set -eu

cd "$(dirname "$0")/.."
out="${1:-_site}"

case "$out" in
  ""|"/"|"."|"..") echo "build-site: refusing output directory '$out'" >&2; exit 2 ;;
esac

rm -rf "$out"
mkdir -p "$out"

cp ./*.html "$out"/
cp -R assets "$out"/
cp CNAME robots.txt sitemap.xml .nojekyll "$out"/

# Source maps are for local debugging only.
find "$out" -name '*.map' -type f -delete

echo "build-site: $(find "$out" -type f | wc -l | tr -d ' ') files in $out"
