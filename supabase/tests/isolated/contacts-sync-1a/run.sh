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
F3="$HERE/../../../migrations/20271111140000_messenger_contacts_sync_f3_remaining.sql"
loadf "$F3"
echo "== F3 applied"
loadf "$HERE/50_f3.test.sql"
# 실기 결함 2 — 「최근 가입」 = 가입일 기준: 새 DB 에 전체 마이그레이션(+20271111150000) 적용 후 회귀(50, F3 기준) + 60 — 10 은 1a 시점 의미(철회 삭제 출처 재사용)라 F3 이후에는 돌리지 않음(기존 순서와 같음)
RJ="$HERE/../../../migrations/20271111150000_messenger_contacts_recently_joined_profile_created.sql"
"$BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres iso_contacts_rj
loadr() { "${PSQL[@]}" -d iso_contacts_rj -f "$1" 2>&1 | clean; return "${PIPESTATUS[0]}"; }
loadr "$HERE/00_fixture.sql"; loadr "$MIG"; loadr "$F1"; loadr "$F2"; loadr "$F3"; loadr "$RJ"
echo "== 20271111150000 applied (1a + F1 + §5-5 + F3 + RJ)"
loadr "$HERE/01_helpers.sql"
loadr "$HERE/50_f3.test.sql"
loadr "$HERE/60_recently_joined.test.sql"
