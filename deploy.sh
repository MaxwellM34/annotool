#!/usr/bin/env bash
# One-shot deploy to Render (free tier).
#
# Prereqs (one-time):
#   1. Install the GitHub CLI:   https://cli.github.com   then:   gh auth login
#   2. Connect your GitHub to Render — go to https://dashboard.render.com once and
#      sign in with GitHub. Render uses that link to read repos.
#   3. Copy .env.deploy.example to .env.deploy and fill every value.
#
# Then:    bash deploy.sh
#
# What it does:
#   - Creates a GitHub repo (if missing) and pushes HEAD.
#   - Opens https://render.com/deploy?repo=… in your browser. Render reads render.yaml
#     and pre-fills the service. You'll be asked to paste the 7 secret env vars (the
#     script prints them, ready to copy). Click "Apply" — first build runs ~3 min.
#   - Prints what to add to leblanc/.env afterward.

set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env.deploy ]; then
  echo "Missing .env.deploy. Copy .env.deploy.example to .env.deploy and fill it in."
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env.deploy
set +a

: "${GITHUB_OWNER:?GITHUB_OWNER not set in .env.deploy}"
: "${GH_REPO_NAME:?GH_REPO_NAME not set}"
: "${RENDER_SERVICE_NAME:?RENDER_SERVICE_NAME not set}"
: "${DATABASE_URL:?DATABASE_URL not set}"
: "${SESSION_SECRET:?SESSION_SECRET not set}"
: "${GOOGLE_CLIENT_ID:?GOOGLE_CLIENT_ID not set}"
: "${GOOGLE_CLIENT_SECRET:?GOOGLE_CLIENT_SECRET not set}"
: "${ALLOWED_EMAILS:?ALLOWED_EMAILS not set}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL not set}"
: "${PUSH_TOKEN:?PUSH_TOKEN not set}"
DEFAULT_HOURLY_RATE_CENTS="${DEFAULT_HOURLY_RATE_CENTS:-2500}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI 'gh' not installed. Install: https://cli.github.com"
  exit 1
fi

URL="https://${RENDER_SERVICE_NAME}.onrender.com"
REPO="${GITHUB_OWNER}/${GH_REPO_NAME}"

# ── 1. GitHub repo ────────────────────────────────────────────────────
if gh repo view "${REPO}" >/dev/null 2>&1; then
  echo "── GitHub repo ${REPO} already exists"
else
  echo "── Creating GitHub repo ${REPO}"
  gh repo create "${REPO}" --private --source=. --remote=origin --push
fi

# Make sure the latest local commits are pushed.
if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  echo "── Pushing latest commits"
  git push origin HEAD
else
  branch=$(git rev-parse --abbrev-ref HEAD)
  echo "── Pushing ${branch} and setting upstream"
  git push -u origin "${branch}"
fi

# ── 2. Print the env vars to paste, then open Render ──────────────────
cat <<EOF

═══════════════════════════════════════════════════════════════════════
GitHub repo:  https://github.com/${REPO}
Render URL:   ${URL}

PASTE THESE 9 ENVIRONMENT VARIABLES INTO RENDER (one at a time, or use
"Bulk add" if Render shows that option):

  DATABASE_URL=${DATABASE_URL}
  SESSION_SECRET=${SESSION_SECRET}
  GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
  GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
  OAUTH_REDIRECT_URI=${URL}/auth/google/callback
  FRONTEND_URL=${URL}
  ALLOWED_EMAILS=${ALLOWED_EMAILS}
  ADMIN_EMAIL=${ADMIN_EMAIL}
  PUSH_TOKEN=${PUSH_TOKEN}

(DEFAULT_HOURLY_RATE_CENTS is hardcoded in render.yaml; change it in the
Render dashboard later if you want a different default.)

═══════════════════════════════════════════════════════════════════════

In the Render flow that opens next:
  1. Click "Connect" next to the ${REPO} repo (or pick it from the list).
  2. Confirm the service name is "${RENDER_SERVICE_NAME}".
     ⚠ If you typed something different in .env.deploy, Render uses the
       value in render.yaml — which is "annotool". Edit render.yaml
       beforehand if you need a different subdomain.
  3. Paste the env vars above. Click "Apply".
  4. First build takes ~3 minutes (the Docker image builds React + Python).

After Render shows "Live":
  • Visit ${URL} and sign in with one of: ${ALLOWED_EMAILS}
  • In Google Cloud Console, confirm the OAuth redirect URI is:
      ${URL}/auth/google/callback

To wire the leblanc loop, add to leblanc/.env:
  ANNOTOOL_URL=${URL}
  ANNOTOOL_TOKEN=${PUSH_TOKEN}

EOF

# ── 3. Open the Render deploy flow ────────────────────────────────────
RENDER_URL="https://render.com/deploy?repo=https://github.com/${REPO}"
echo "Opening Render: ${RENDER_URL}"

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${RENDER_URL}" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "${RENDER_URL}" >/dev/null 2>&1 &
else
  echo "(couldn't auto-open — paste the URL above into your browser)"
fi
