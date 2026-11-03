#!/usr/bin/env bash
# 동시성: 같은 회원 동시 차감 · 같은 매장 동시 전환 (두 세션 병렬)
set -euo pipefail
PSQL="$1"; DB="$2"
U=00000000-0000-0000-0000-0000000000c1
$PSQL -d "$DB" <<SQL
SELECT set_config('request.jwt.claim.role','service_role',false);
INSERT INTO auth.users VALUES ('$U'); INSERT INTO public.profiles (id) VALUES ('$U');
INSERT INTO public.point_ledger (user_id, entry_type, amount, balance_after, related_type, related_id)
VALUES ('$U', 'admin_credit', 100, 100, 'admin_manual', 'seed-c1');
SELECT public.project_user_point_balance_from_ledger('$U');
SQL

# (1) 구 TS 경로 재현 — 잠금 없이 「합계 읽기 → INSERT」 두 세션 → 이중 차감으로 음수
old_path() {
  $PSQL -d "$DB" -tA <<SQL
SELECT set_config('request.jwt.claim.role','service_role',false);
BEGIN;
SELECT CASE WHEN public.sum_user_point_ledger('$U') >= 100 THEN pg_sleep(1) END;
INSERT INTO public.point_ledger (user_id, entry_type, amount, balance_after, related_type, related_id)
SELECT '$U', 'ad_purchase', -100, 0, 'ad_application', 'old-$1' WHERE public.sum_user_point_ledger('$U') >= 0;
COMMIT;
SQL
}
old_path x & old_path y & wait
OLD=$($PSQL -d "$DB" -tA -c "SELECT sum(amount) FROM public.point_ledger WHERE user_id='$U'")
echo "구 경로(잠금 없음) 동시 2건 후 원장 합계 = $OLD"
[ "$OLD" = "-100" ] && echo "PASS: CONC-00 구 경로 결함 재현 (100P 로 100P×2 차감 → -100)" || { echo "FAIL: CONC-00 재현 실패 ($OLD)"; exit 1; }

# 원상 복구용 회원 새로 준비
U2=00000000-0000-0000-0000-0000000000c2
$PSQL -d "$DB" <<SQL
SELECT set_config('request.jwt.claim.role','service_role',false);
INSERT INTO auth.users VALUES ('$U2'); INSERT INTO public.profiles (id) VALUES ('$U2');
INSERT INTO public.point_ledger (user_id, entry_type, amount, balance_after, related_type, related_id)
VALUES ('$U2', 'admin_credit', 100, 100, 'admin_manual', 'seed-c2');
SELECT public.project_user_point_balance_from_ledger('$U2');
SQL

# (2) 새 RPC — 서로 다른 출처 100P 차감 2건 동시 → 1건만 성공
new_path() {
  $PSQL -d "$DB" -tA <<SQL
SELECT set_config('request.jwt.claim.role','service_role',false);
BEGIN;
SELECT public.spend_user_points('$U2', 100, 'ad_hold', 'feed_ad_request', 'hold:$1', 'conc', 'user')->>'ok';
SELECT pg_sleep(1);
COMMIT;
SQL
}
R=$( (new_path p & new_path q & wait) | grep -E '^(true|false)$' | sort | tr '\n' ' ')
NEW=$($PSQL -d "$DB" -tA -c "SELECT sum(amount) FROM public.point_ledger WHERE user_id='$U2'")
PTS=$($PSQL -d "$DB" -tA -c "SELECT points FROM public.profiles WHERE id='$U2'")
echo "새 RPC 동시 2건 결과 = [$R] 원장 합계 = $NEW 캐시 = $PTS"
[ "$R" = "false true " ] && [ "$NEW" = "0" ] && [ "$PTS" = "0" ] && echo "PASS: CONC-01 동시 차감 1건만 성공, 음수 없음, 캐시=원장" || { echo "FAIL: CONC-01"; exit 1; }

# (3) 같은 출처 동시 재시도 (더블 클릭) → 1행
U3=00000000-0000-0000-0000-0000000000c3
$PSQL -d "$DB" <<SQL
SELECT set_config('request.jwt.claim.role','service_role',false);
INSERT INTO auth.users VALUES ('$U3'); INSERT INTO public.profiles (id) VALUES ('$U3');
INSERT INTO public.point_ledger (user_id, entry_type, amount, balance_after, related_type, related_id)
VALUES ('$U3', 'admin_credit', 500, 500, 'admin_manual', 'seed-c3');
SQL
dup() {
  $PSQL -d "$DB" -tA <<SQL
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.spend_user_points('$U3', 100, 'ad_hold', 'feed_ad_request', 'hold:same', 'dbl', 'user')->>'ok';
SQL
}
dup & dup & dup & wait
N=$($PSQL -d "$DB" -tA -c "SELECT count(*) FROM public.point_ledger WHERE user_id='$U3' AND related_id='hold:same'")
[ "$N" = "1" ] && echo "PASS: CONC-02 같은 출처 동시 3회 → 원장 1행" || { echo "FAIL: CONC-02 ($N)"; exit 1; }

# (4) 같은 매장 동시 전환 (Coin 50, 각 40) → 1건만 성공, Coin 음수 없음
$PSQL -d "$DB" <<SQL
UPDATE public.business_cash_conversion_rate_policies SET minimum_interval_hours=NULL, maximum_conversions_per_day=NULL;
UPDATE public.store_economic_point_accounts SET balance=50 WHERE store_id='00000000-0000-0000-0000-0000000000b1';
SQL
conv() {
  $PSQL -d "$DB" -tA <<SQL
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT coalesce(public.convert_store_economic_points_to_business_cash('00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000b1',40,5,'conc-$1')->>'error','ok');
SQL
}
C=$( (conv a & conv b & wait) | grep -vE '^$|service_role' | sort | tr '\n' ' ')
COIN=$($PSQL -d "$DB" -tA -c "SELECT balance FROM public.store_economic_point_accounts WHERE store_id='00000000-0000-0000-0000-0000000000b1'")
echo "동시 전환 결과 = [$C] Coin = $COIN"
[ "$C" = "insufficient_store_points ok " ] && [ "$COIN" = "10" ] && echo "PASS: CONC-03 동시 전환 1건만 성공, Coin 50→10" || { echo "FAIL: CONC-03"; exit 1; }
