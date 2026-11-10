#!/usr/bin/env bash
# 연락처 동기화 1a 격리 시험 — 로컬 일회용 PostgreSQL 16 (Supabase 프로젝트·테스트 DB 아님).
# 사용: run.sh <data_dir> [port]   — data_dir 에 임시 클러스터를 만들고 끝나면 지운다.
#   SCALE=1 이면 20_scale.sql (규모 측정)도 실행.
set -euo pipefail
export LC_ALL=C LANG=C
D="$1"; PORT="${2:-55481}"
BIN="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../../../migrations/20271111090000_messenger_contacts_sync_1a.sql"
rm -rf "$D"; mkdir -p "$D"
"$BIN/initdb" -A trust -U postgres -D "$D/data" >/dev/null
"$BIN/pg_ctl" -D "$D/data" -l "$D/log" -w -o "-p $PORT -k '' -c listen_addresses=127.0.0.1" start >/dev/null
trap '"$BIN/pg_ctl" -D "$D/data" -m fast stop >/dev/null; rm -rf "$D"' EXIT
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"$BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres iso_contacts
clean() { sed -u -E 's/^psql:[^ ]+ (NOTICE|ERROR|WARNING):  /\1: /; s/^NOTICE: //; s/^ERROR: (FAIL .*)/\1/'; }
load() { "${PSQL[@]}" -d iso_contacts -f "$1" 2>&1 | clean; return "${PIPESTATUS[0]}"; }
load "$HERE/00_fixture.sql"
load "$MIG"
echo "== migration applied"
load "$HERE/10_contacts.test.sql"
if [ "${SCALE:-0}" = "1" ]; then load "$HERE/20_scale.sql"; fi
# 감사 수정 F1 — 새 DB 에 1a + F1 적용 후 기존 시험(회귀) + F1 시험
F1="$HERE/../../../migrations/20271111120000_messenger_contacts_sync_audit_f1.sql"
"$BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres iso_contacts_f1
loadf() { "${PSQL[@]}" -d iso_contacts_f1 -f "$1" 2>&1 | clean; return "${PIPESTATUS[0]}"; }
F2="$HERE/../../../migrations/20271111130000_messenger_contacts_sync_rejected_exclusion.sql"
loadf "$HERE/00_fixture.sql"; loadf "$MIG"; loadf "$F1"; loadf "$F2"
echo "== F1·§5-5 applied (1a + F1 + 20271111130000)"
loadf "$HERE/10_contacts.test.sql"
loadf "$HERE/30_audit_f1.test.sql"
loadf "$HERE/40_rejected.test.sql"
