#!/usr/bin/env bash
# One-shot deploy: backend on Render, frontend on Vercel.
#
# Prereqs (one-time):
#   1. Install gh:        https://cli.github.com    then:   gh auth login
#   2. Sign in to Render with GitHub once at https://dashboard.render.com
#   3. Sign in to Vercel  with GitHub once at https://vercel.com
#   4. Copy .env.deploy.example to .env.deploy and fill it in.
#
# Then:    bash deploy.sh

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
: "${VERCEL_PROJECT_NAME:?VERCEL_PROJECT_NAME not set}"
: "${DATABASE_URL:?DATABASE_URL not set}"
: "${SESSION_SECRET:?SESSION_SECRET not set}"
: "${GOOGLE_CLIENT_ID:?GOOGLE_CLIENT_ID not set}"
: "${GOOGLE_CLIENT_SECRET:?GOOGLE_CLIENT_SECRET not set}"
: "${ALLOWED_EMAILS:?ALLOWED_EMAILS not set}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL not set}"
: "${PUSH_TOKEN:?PUSH_TOKEN not set}"
DEFAULT_HOURLY_RATE_CENTS="${DEFAULT_HOURLY_RATE_CENTS:-1000}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI 'gh' not installed. Install: https://cli.github.com"
  exit 1
fi

REPO="${GITHUB_OWNER}/${GH_REPO_NAME}"
RENDER_URL="https://${RENDER_SERVICE_NAME}.onrender.com"
VERCEL_URL="https://${VERCEL_PROJECT_NAME}.vercel.app"

# ── 1. GitHub repo ────────────────────────────────────────────────────
if gh repo view "${REPO}" >/dev/null 2>&1; then
  echo "── GitHub repo ${REPO} already exists"
else
  echo "── Creating GitHub repo ${REPO}"
  gh repo create "${REPO}" --private --source=. --remote=origin --push
fi

if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  echo "── Pushing latest commits"
  git push origin HEAD
else
  branch=$(git rev-parse --abbrev-ref HEAD)
  echo "── Pushing ${branch}"
  git push -u origin "${branch}"
fi

# ── 2. Print the playbook ─────────────────────────────────────────────
cat <<EOF

═══════════════════════════════════════════════════════════════════════
GitHub repo:   https://github.com/${REPO}
Backend URL:   ${RENDER_URL}      (Render — API only)
Frontend URL:  ${VERCEL_URL}      (Vercel — user-facing)
═══════════════════════════════════════════════════════════════════════

STEP A — deploy the BACKEND to Render
─────────────────────────────────────
1. Open: https://render.com/deploy?repo=https://github.com/${REPO}
2. Click "Connect" / "Apply" — Render reads render.yaml automatically.
3. Paste these 9 env vars into Render (Service → Environment → Add):

  DATABASE_URL=${DATABASE_URL}
  SESSION_SECRET=${SESSION_SECRET}
  GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
  GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
  OAUTH_REDIRECT_URI=${VERCEL_URL}/auth/google/callback
  FRONTEND_URL=${VERCEL_URL}
  ALLOWED_EMAILS=${ALLOWED_EMAILS}
  ADMIN_EMAIL=${ADMIN_EMAIL}
  PUSH_TOKEN=${PUSH_TOKEN}

4. Wait ~3 min for the first build. Verify ${RENDER_URL}/healthz returns {"ok":true}.

STEP B — deploy the FRONTEND to Vercel
──────────────────────────────────────
1. Open: https://vercel.com/new
2. Pick repo ${REPO} from the list. Click "Import".
3. CRITICAL settings:
     • Project Name:     ${VERCEL_PROJECT_NAME}
     • Root Directory:   frontend
     • Framework:        Vite  (auto-detected)
     • Build Command:    npm run build  (default)
     • Output Directory: dist           (default)
4. No env vars needed on Vercel — the proxy is hard-coded in frontend/vercel.json.
5. Click "Deploy". First build ~90 s.

STEP C — fix the Google OAuth redirect URI
──────────────────────────────────────────
The redirect URI must match the FRONTEND (Vercel) URL, NOT the Render URL.

1. Open: https://console.cloud.google.com/apis/credentials
2. Click your "annotater" OAuth client.
3. Under "Authorized redirect URIs", add (and remove the old onrender.com one if present):
     ${VERCEL_URL}/auth/google/callback
4. Save.

STEP D — wire the leblanc loop (later, after deploy works)
──────────────────────────────────────────────────────────
Add to ${HOME}/workspace/leblanc/.env:

  ANNOTOOL_URL=${VERCEL_URL}
  ANNOTOOL_TOKEN=${PUSH_TOKEN}

Then:  cd ${HOME}/workspace/leblanc && bash scripts/push_to_annotool.sh home

EOF

# ── 3. Try to open the two deploy dashboards ──────────────────────────
opener=""
if command -v xdg-open >/dev/null 2>&1; then opener="xdg-open";
elif command -v open >/dev/null 2>&1; then opener="open";
fi

if [ -n "$opener" ]; then
  "$opener" "https://render.com/deploy?repo=https://github.com/${REPO}" >/dev/null 2>&1 &
  sleep 1
  "$opener" "https://vercel.com/new" >/dev/null 2>&1 &
else
  echo "(no browser opener found — paste the URLs above into your browser)"
fi
