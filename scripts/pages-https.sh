#!/bin/sh
# Keep the GitHub Pages certificate for the custom domain issued and HTTPS
# enforced (wiremark/ops#23). Run by .github/workflows/pages.yml after every
# deploy, on workflow_dispatch and on a schedule, so a lost or failed
# certificate heals without anyone clicking in the GitHub UI.
#
#   1. Reads GET /repos/{repo}/pages and /pages/health and prints the state.
#   2. When https_certificate is missing or in a failed state, clears and
#      re-sets the custom domain (PUT /pages cname), GitHub's documented way to
#      restart certificate issuance. build_type stays "workflow".
#   3. When the certificate is approved and https_enforced is false, sets it.
#
# Idempotent: with an approved certificate and HTTPS enforced it only reads.
# A certificate that is still being issued is left alone, because re-setting
# the domain would restart issuance.
#
# Needs gh, jq and GH_TOKEN (GITHUB_TOKEN with pages: write). Never prints the
# token. Usage: sh scripts/pages-https.sh [owner/repo]   (default: GITHUB_REPOSITORY)
set -eu

repo="${1:-${GITHUB_REPOSITORY:-}}"
[ -n "$repo" ] || { echo "pages-https: no repository (pass owner/repo or set GITHUB_REPOSITORY)" >&2; exit 2; }
[ -n "${GH_TOKEN:-}" ] || { echo "pages-https: GH_TOKEN is not set" >&2; exit 2; }

cd "$(dirname "$0")/.."
domain="$(tr -d ' \r\n' < CNAME)"
[ -n "$domain" ] || { echo "pages-https: CNAME file is empty" >&2; exit 2; }

api() { gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$@"; }

read_pages() {
  if ! pages="$(api "repos/$repo/pages")"; then
    echo "pages-https: GET repos/$repo/pages failed" >&2
    exit 1
  fi
}

show() {
  printf '%s\n' "$pages" | jq -r --arg label "$1" '
    "\($label): cname=\(.cname // "none") build_type=\(.build_type // "none")" +
    " https_enforced=\(.https_enforced) certificate=\(.https_certificate.state // "none")" +
    " domains=\((.https_certificate.domains // []) | join(",")) expires=\(.https_certificate.expires_at // "n/a")"'
}

put_pages() { # $1: JSON body
  if ! printf '%s' "$1" | api -X PUT "repos/$repo/pages" --input - >/dev/null; then
    echo "pages-https: PUT repos/$repo/pages $1 failed" >&2
    exit 1
  fi
}

read_pages
show "before"

# DNS health is advisory: GitHub answers 202 with an empty body while it is
# still computing, and the check can fail for reasons that do not block HTTPS.
if health="$(api "repos/$repo/pages/health" 2>/dev/null)"; then
  printf '%s\n' "$health" | jq -r '
    if (.domain // null) == null then "health: not computed yet"
    else "health: domain valid=\(.domain.is_valid) https_eligible=\(.domain.is_https_eligible) dns_resolves=\(.domain.dns_resolves) caa_error=\(.domain.caa_error // "none")" +
         (if .alt_domain then " | alt_domain=\(.alt_domain.host) valid=\(.alt_domain.is_valid) https_eligible=\(.alt_domain.is_https_eligible)" else "" end)
    end'
else
  echo "health: unavailable"
fi

cname="$(printf '%s\n' "$pages" | jq -r '.cname // ""')"
state="$(printf '%s\n' "$pages" | jq -r '.https_certificate.state // "none"')"
enforced="$(printf '%s\n' "$pages" | jq -r '.https_enforced')"
build_type="$(printf '%s\n' "$pages" | jq -r '.build_type // "workflow"')"
if [ "$build_type" != "workflow" ]; then
  echo "pages-https: build_type is $build_type, expected workflow; setting it back"
fi

case "$state" in
  none|errored|bad_authz|authorization_revoked|destroy_pending|dns_changed) restart=yes ;;
  *) restart=no ;;
esac
[ "$cname" = "$domain" ] || restart=yes

if [ "$restart" = yes ]; then
  echo "action: restarting certificate issuance (cname=$cname state=$state): clear and re-set custom domain $domain"
  put_pages '{"cname":null,"build_type":"workflow"}'
  put_pages "$(jq -cn --arg d "$domain" '{cname:$d,build_type:"workflow"}')"
elif [ "$state" = approved ] && [ "$enforced" != true ]; then
  echo "action: certificate approved, enforcing HTTPS"
  put_pages '{"https_enforced":true,"build_type":"workflow"}'
elif [ "$build_type" != workflow ]; then
  put_pages '{"build_type":"workflow"}'
else
  case "$state" in
    approved) echo "action: none (certificate approved, HTTPS enforced)" ;;
    *) echo "action: none (certificate issuance in progress: $state; the schedule re-checks)" ;;
  esac
fi

read_pages
show "after"
summary="$(show "GitHub Pages $repo")"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$summary" >> "$GITHUB_STEP_SUMMARY"; fi
