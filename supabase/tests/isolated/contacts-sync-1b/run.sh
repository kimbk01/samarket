#!/usr/bin/env bash
# 연락처 동기화 1b (친구 삭제 트리거) 격리 시험 — 로컬 일회용 PostgreSQL 16 (Supabase 프로젝트·테스트 DB 아님).
# 사용: run.sh <data_dir> [port]   T1~T4·T6~T9 = 10_trigger.test.sql, T5 동시성·T10 성능 = pgbench (트리거 없음 기준선 vs 있음)
set -euo pipefail
export LC_ALL=C LANG=C
D="$1"; PORT="${2:-55482}"
BIN="${PG16_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../../../migrations"
rm -rf "$D"; mkdir -p "$D"
"$BIN/initdb" -A trust -U postgres -D "$D/data" >/dev/null
"$BIN/pg_ctl" -D "$D/data" -l "$D/log" -w -o "-p $PORT -k '' -c listen_addresses=127.0.0.1 -c deadlock_timeout=50ms" start >/dev/null
trap '"$BIN/pg_ctl" -D "$D/data" -m fast stop >/dev/null; rm -rf "$D"' EXIT
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
clean() { sed -u -E 's/^psql:[^ ]+ (NOTICE|ERROR|WARNING):  /\1: /; s/^NOTICE: //; s/^ERROR: (FAIL .*)/\1/'; }
setup() {
  "$BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$1"
  for f in "$HERE/../contacts-sync-1a/00_fixture.sql" "$HERE/05_prod_constraints.sql" "$MIG/20271111090000_messenger_contacts_sync_1a.sql"; do
    "${PSQL[@]}" -d "$1" -f "$f" 2>&1 | clean
  done
  if [ "${2:-with}" = "with" ]; then "${PSQL[@]}" -d "$1" -f "$MIG/20271111100000_messenger_contacts_sync_1b_friend_delete_trigger.sql" 2>&1 | clean; fi
}
setup iso_1b with
echo "== T1~T4·T6~T9"
"${PSQL[@]}" -d iso_1b -f "$HERE/10_trigger.test.sql" 2>&1 | clean | tee "$D/t.out"
grep -q "contact_suppress_failed sqlstate=23514 rows=2" "$D/t.out" && echo "PASS T2w 실패 시 WARNING 로그 (sqlstate·건수)" || { echo "FAIL T2w WARNING 없음"; exit 1; }

bench() { # $1 db, $2 label
  "${PSQL[@]}" -d "$1" -c "INSERT INTO profiles (id) VALUES ('20000000-0000-0000-0000-000000000001'), ('20000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;"
  "$BIN/pgbench" -h 127.0.0.1 -p "$PORT" -U postgres -n -c 8 -j 4 -T 15 --max-tries=1 --failures-detailed \
    -f "$HERE/bench/del.sql@2" -f "$HERE/bench/add.sql@2" -f "$HERE/bench/block.sql@1" "$1" > "$D/$2.bench" 2>&1 || true
  echo "== T5/T10 $2: $(grep -E '^number of transactions actually processed' "$D/$2.bench") · $(grep -E '^number of failed transactions' "$D/$2.bench") · $(grep -E 'deadlock failures' "$D/$2.bench" | head -1) · $(grep -E '^latency average' "$D/$2.bench")"
  grep -qE "aborted|ERROR" "$D/$2.bench" && { echo "-- $2 bench errors (기존 차단 트리거·동시 경합, 기준선에도 같은 오류면 1b 무관):"; grep -E "aborted|ERROR" "$D/$2.bench" | sort | uniq -c | head -3; } || true
  # T10 단독 성능: 1명이 친구 삭제·추가만 반복 (경합 없음)
  "$BIN/pgbench" -h 127.0.0.1 -p "$PORT" -U postgres -n -c 1 -T 10 -f "$HERE/bench/del.sql@1" -f "$HERE/bench/add.sql@1" "$1" > "$D/$2.solo" 2>&1 || true
  echo "== T10 $2 단독: $(grep -E '^number of transactions actually processed' "$D/$2.solo") · $(grep -E '^latency average' "$D/$2.solo")"
}
setup iso_base without
bench iso_base baseline
"${PSQL[@]}" -d iso_1b -c "TRUNCATE contact_suppressions, contact_suppression_failures; DELETE FROM user_social_relations;"
bench iso_1b with_trigger
echo "== T5 기록 일관성: 친구 삭제 문장 수만큼 기록 누락 없음 (제한 행 = 쌍 2행 이하로 유지, 실패 행 0)"
"${PSQL[@]}" -d iso_1b -At -c "SELECT 'suppressions=' || (SELECT count(*) FROM contact_suppressions) || ' failures=' || (SELECT count(*) FROM contact_suppression_failures)"
