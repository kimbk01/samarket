#!/usr/bin/env bash
# Tee next dev (compare scripts) to benchmark-runs/*.log — no app code changes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUNDLER="${1:?usage: $0 webpack|turbo}"
OUT_DIR="${2:-benchmark-runs}"
mkdir -p "$OUT_DIR"

SHORT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
STAMP="$(date -u +"%Y%m%d-%H%M%S")"
LOG="$OUT_DIR/dev-${BUNDLER}-${STAMP}-${SHORT_SHA}.log"

FULL_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
BRANCH="$(git branch --show-current 2>/dev/null || true)"

{
  echo "BENCHMARK_PROTOCOL=dev-runtime-benchmark-protocol.md v1"
  echo "GIT_SHA_FULL=$FULL_SHA"
  echo "GIT_BRANCH=$BRANCH"
  echo "NPM_SCRIPT=dev:compare:$BUNDLER"
  echo "NODE_OPTIONS=${NODE_OPTIONS-}"
  echo "STARTED_UTC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "BROWSER_RULES=single-tab,hard-refresh-once"
  echo "---"
} >"$LOG"

echo "Logging to: $LOG"
echo "Run browser scenario from docs/dev-runtime-benchmark-protocol.md"
echo "Stop with Ctrl+C when done."
echo ""

if [[ "$BUNDLER" == "webpack" ]]; then
  npm run dev:compare:webpack 2>&1 | tee -a "$LOG"
else
  npm run dev:compare:turbo 2>&1 | tee -a "$LOG"
fi
