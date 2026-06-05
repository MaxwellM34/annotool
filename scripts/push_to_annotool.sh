#!/usr/bin/env bash
# Push the latest side-by-side comparison image for a given slug to the annotool API.
# Copy this file into the leblanc repo's scripts/ directory (or keep it here and shim it).
#
# Usage:
#   bash scripts/push_to_annotool.sh <slug>
#
# Looks for:
#   loop/compare/<slug>-iter<N>-full.sxs.png
#   loop/all-pages/<slug>/compare/<slug>-iter<N>-full.sxs.png
#   loop/shots/option1@1920.iter<N>.sxs.png       (legacy home-page naming — slug=home)
#
# Picks the highest <N> across whichever path exists. POSTs as multipart/form-data.
#
# Requires env vars in .env (or the calling shell):
#   ANNOTOOL_URL    — e.g. https://annotool-backend.onrender.com
#   ANNOTOOL_TOKEN  — the PUSH_TOKEN value from annotool .env

set -euo pipefail

slug="${1:?usage: $0 <slug>}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${ANNOTOOL_URL:?ANNOTOOL_URL not set}"
: "${ANNOTOOL_TOKEN:?ANNOTOOL_TOKEN not set}"

# Find candidates and pick the one with the largest iter.
candidates=()
shopt -s nullglob
for f in \
  "loop/compare/${slug}-iter"*"-full.sxs.png" \
  "loop/all-pages/${slug}/compare/${slug}-iter"*"-full.sxs.png" ; do
  candidates+=("$f")
done
# legacy home naming
if [ "$slug" = "home" ]; then
  for f in "loop/shots/option1@1920.iter"*".sxs.png"; do
    candidates+=("$f")
  done
fi
shopt -u nullglob

if [ "${#candidates[@]}" -eq 0 ]; then
  echo "no candidate sxs.png found for slug=$slug" >&2
  exit 1
fi

# Extract iter (last contiguous digit run before '.sxs.png' or '-full.sxs.png') and pick max.
best=""
best_iter=-1
for f in "${candidates[@]}"; do
  # strip trailing variants
  base=$(basename "$f")
  iter=$(echo "$base" | grep -oE 'iter[0-9]+' | head -n1 | sed 's/iter//')
  if [ -z "$iter" ]; then continue; fi
  if [ "$iter" -gt "$best_iter" ]; then
    best_iter="$iter"
    best="$f"
  fi
done

if [ -z "$best" ]; then
  echo "couldn't parse iter number from candidates: ${candidates[*]}" >&2
  exit 1
fi

echo "Uploading $best (slug=$slug iter=$best_iter)"
curl --fail-with-body -X POST "$ANNOTOOL_URL/api/images/push" \
  -H "Authorization: Bearer $ANNOTOOL_TOKEN" \
  -F "slug=$slug" \
  -F "iter=$best_iter" \
  -F "file=@$best"
echo
