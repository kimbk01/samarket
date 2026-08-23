#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required" >&2
  exit 1
fi

LIMIT="${1:-100}"
MAX_ROUNDS="${2:-30}"

run_bucket() {
  local bucket="$1"
  local round=1
  while (( round <= MAX_ROUNDS )); do
    echo "[full-backfill] ${bucket} round ${round}/${MAX_ROUNDS}" >&2
    local out
    out="$(npx tsx scripts/backfill-canonical-image-derivatives.ts --bucket "$bucket" --limit "$LIMIT")"
    echo "$out"
    local processed failures
    processed="$(echo "$out" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.processed)})")"
    failures="$(echo "$out" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.failures)})")"
    if [[ "$processed" == "0" ]]; then
      echo "[full-backfill] ${bucket} done (processed=0)" >&2
      break
    fi
    if [[ "$failures" != "0" ]]; then
      echo "[full-backfill] ${bucket} failures=${failures}" >&2
      exit 1
    fi
    round=$((round + 1))
  done
}

run_bucket post-images
run_bucket store-product-images

echo "[full-backfill] reconcile" >&2
npx tsx scripts/reconcile-canonical-image-derivatives.ts
