#!/usr/bin/env bash
# One-shot deploy to Fly.io.
#
# Prereqs (one-time):
#   1. Install flyctl:   curl -L https://fly.io/install.sh | sh
#   2. Sign in:          fly auth signup     (or:  fly auth login)
#   3. Copy .env.deploy.example to .env.deploy and fill in every value.
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

: "${APP_NAME:?APP_NAME not set in .env.deploy}"
: "${FLY_REGION:?FLY_REGION not set}"
: "${DATABASE_URL:?DATABASE_URL not set}"
: "${SESSION_SECRET:?SESSION_SECRET not set}"
: "${GOOGLE_CLIENT_ID:?GOOGLE_CLIENT_ID not set}"
: "${GOOGLE_CLIENT_SECRET:?GOOGLE_CLIENT_SECRET not set}"
: "${ALLOWED_EMAILS:?ALLOWED_EMAILS not set}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL not set}"
: "${PUSH_TOKEN:?PUSH_TOKEN not set}"
DEFAULT_HOURLY_RATE_CENTS="${DEFAULT_HOURLY_RATE_CENTS:-2500}"

if ! command -v fly >/dev/null 2>&1; then
  echo "flyctl is not installed. Install with:"
  echo "  curl -L https://fly.io/install.sh | sh"
  exit 1
fi

URL="https://${APP_NAME}.fly.dev"
echo "── Deploying ${APP_NAME} → ${URL}"

# Write a per-deploy fly.toml with the chosen app name.
cat > fly.generated.toml <<EOF
app = "${APP_NAME}"
primary_region = "${FLY_REGION}"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
EOF

# Create the app if it doesn't exist yet (idempotent).
if ! fly apps list --json 2>/dev/null | grep -q "\"Name\":\"${APP_NAME}\""; then
  echo "── Creating Fly app ${APP_NAME}"
  fly apps create "${APP_NAME}" --org personal
fi

echo "── Setting secrets"
fly secrets set --app "${APP_NAME}" --stage \
  DATABASE_URL="${DATABASE_URL}" \
  SESSION_SECRET="${SESSION_SECRET}" \
  GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID}" \
  GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET}" \
  OAUTH_REDIRECT_URI="${URL}/auth/google/callback" \
  ALLOWED_EMAILS="${ALLOWED_EMAILS}" \
  ADMIN_EMAIL="${ADMIN_EMAIL}" \
  FRONTEND_URL="${URL}" \
  PUSH_TOKEN="${PUSH_TOKEN}" \
  DEFAULT_HOURLY_RATE_CENTS="${DEFAULT_HOURLY_RATE_CENTS}" \
  >/dev/null

echo "── Deploying image"
fly deploy --app "${APP_NAME}" --config fly.generated.toml --remote-only --ha=false

echo
echo "✔ Done."
echo
echo "Your app: ${URL}"
echo
echo "Two things to verify in Google Cloud Console:"
echo "  Authorized redirect URI: ${URL}/auth/google/callback"
echo "  Authorized JS origin:    ${URL}"
echo
echo "Then visit ${URL} and sign in with one of: ${ALLOWED_EMAILS}"
echo
echo "To wire the leblanc loop, add to leblanc/.env:"
echo "  ANNOTOOL_URL=${URL}"
echo "  ANNOTOOL_TOKEN=${PUSH_TOKEN}"
