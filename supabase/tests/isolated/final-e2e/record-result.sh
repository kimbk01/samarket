#!/usr/bin/env bash
# Runs the suite once on the local throwaway cluster and writes RESULT.txt next to this script.
# Usage: record-result.sh <pg_host_or_socket_dir> <pg_port>
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HOST="$1"; PORT="$2"
{
  echo "# Final ND-3 isolated-DB WRITE regression - local PostgreSQL $(psql -h "$HOST" -p "$PORT" -U postgres -XAt -c 'show server_version') ($HOST:$PORT), run $(TZ=Asia/Manila date '+%Y-%m-%d %H:%M PHT')"
  echo "# prod md5 source: project ckdosyydvgzqwpbwuhon pg_proc.prosrc (read-only catalog SELECT, 2026-10-21) -> prod_md5.txt"
  bash "$HERE/run.sh" "$HOST" "$PORT"
  rc=$?
  echo "== summary: PASS=$(grep -c '^PASS' "$HERE/RESULT.txt.tmp" 2>/dev/null || true)"
  echo "exit=$rc"
} > "$HERE/RESULT.txt.tmp" 2>&1
rc=$(tail -n 1 "$HERE/RESULT.txt.tmp" | sed 's/exit=//')
P=$(grep -c '^PASS' "$HERE/RESULT.txt.tmp"); F=$(grep -c '^FAIL' "$HERE/RESULT.txt.tmp"); N=$(grep -c '^NOT_PROVEN' "$HERE/RESULT.txt.tmp")
sed -i '/^== summary: PASS=/d' "$HERE/RESULT.txt.tmp"
sed -i "\$i == summary: PASS=$P FAIL=$F NOT_PROVEN=$N" "$HERE/RESULT.txt.tmp"
mv "$HERE/RESULT.txt.tmp" "$HERE/RESULT.txt"
echo "PASS=$P FAIL=$F NOT_PROVEN=$N exit=$rc"
