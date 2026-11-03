-- 금융 P0 DB-1·DB-2 격리 검증 (로컬 임시 DB · 합성 데이터)
\set QUIET on
CREATE OR REPLACE FUNCTION pg_temp.check(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.svc() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.role', 'service_role', false) $$;

-- 합성 회원·매장
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'), ('00000000-0000-0000-0000-0000000000a9');
INSERT INTO public.profiles (id) SELECT id FROM auth.users;
SELECT pg_temp.svc();
INSERT INTO public.point_ledger (user_id, entry_type, amount, balance_after, related_type, related_id)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'admin_credit', 100, 100, 'admin_manual', 'seed-a1'),
       ('00000000-0000-0000-0000-0000000000a3', 'reverse', -38, -38, 'community_reclaim', 'seed-a3');
SELECT public.project_user_point_balance_from_ledger(id) FROM auth.users;

-- ===== DB-1 =====
DO $$ DECLARE r jsonb; n int; BEGIN
  PERFORM pg_temp.svc();
  r := public.spend_user_points('00000000-0000-0000-0000-0000000000a1', 30, 'ad_hold', 'feed_ad_request', 'hold:A', 'test', 'user');
  PERFORM pg_temp.check(r->>'ok' = 'true' AND (r->>'balance_after')::int = 70 AND r->>'duplicate' = 'false', 'DB1-01 차감 성공 100→70');
  PERFORM pg_temp.check((SELECT points FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') = 70, 'DB1-02 profiles.points 재투영 70');
  PERFORM pg_temp.check((SELECT balance_after FROM public.point_ledger WHERE related_id = 'hold:A') = 70, 'DB1-03 원장 balance_after 70');

  r := public.spend_user_points('00000000-0000-0000-0000-0000000000a1', 30, 'ad_hold', 'feed_ad_request', 'hold:A', 'retry', 'user');
  SELECT count(*) INTO n FROM public.point_ledger WHERE related_id = 'hold:A';
  PERFORM pg_temp.check(r->>'duplicate' = 'true' AND n = 1 AND (r->>'balance_after')::int = 70, 'DB1-04 같은 출처 재시도 = 중복, 추가 차감 없음');

  r := public.spend_user_points('00000000-0000-0000-0000-0000000000a1', 71, 'ad_hold', 'feed_ad_request', 'hold:B', 'over', 'user');
  PERFORM pg_temp.check(r->>'error' = 'insufficient_balance' AND (r->>'balance')::int = 70, 'DB1-05 잔액 부족 거절');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.point_ledger WHERE related_id = 'hold:B'), 'DB1-06 거절 시 원장 없음');

  r := public.spend_user_points('00000000-0000-0000-0000-0000000000a2', 1, 'ad_hold', 'feed_ad_request', 'hold:Z', 'zero', 'user');
  PERFORM pg_temp.check(r->>'error' = 'insufficient_balance', 'DB1-07 잔액 0 회원 차감 거절');

  r := public.spend_user_points('00000000-0000-0000-0000-0000000000a3', 1, 'ad_hold', 'feed_ad_request', 'hold:N', 'neg', 'user');
  PERFORM pg_temp.check(r->>'error' = 'insufficient_balance' AND (r->>'balance')::int = -38, 'DB1-08 음수 잔액 회원 차감 거절');

  r := public.spend_user_points('00000000-0000-0000-0000-0000000000a1', 1, 'reward', 'community_reward', 'x', 'bad', 'user');
  PERFORM pg_temp.check(r->>'error' = 'invalid_entry_type', 'DB1-09 허용 외 entry_type 거절 (보상 우회 금지)');
  r := public.spend_user_points('00000000-0000-0000-0000-0000000000a1', 0, 'ad_hold', 'feed_ad_request', 'hold:0', 'zero', 'user');
  PERFORM pg_temp.check(r->>'error' = 'invalid_input', 'DB1-10 금액 0 거절');
  r := public.spend_user_points('00000000-0000-0000-0000-0000000000ff', 1, 'ad_hold', 'feed_ad_request', 'hold:U', 'nouser', 'user');
  PERFORM pg_temp.check(r->>'error' = 'user_not_found', 'DB1-11 없는 회원 거절');

  r := public.credit_user_points('00000000-0000-0000-0000-0000000000a1', 30, 'ad_hold_release', 'feed_ad_request', 'release:A', 'rel', 'system');
  PERFORM pg_temp.check(r->>'ok' = 'true' AND (r->>'balance_after')::int = 100, 'DB1-12 환원 지급 70→100');
  r := public.credit_user_points('00000000-0000-0000-0000-0000000000a1', 30, 'ad_hold_release', 'feed_ad_request', 'release:A', 'rel', 'system');
  SELECT count(*) INTO n FROM public.point_ledger WHERE related_id = 'release:A';
  PERFORM pg_temp.check(r->>'duplicate' = 'true' AND n = 1 AND (r->>'balance_after')::int = 100, 'DB1-13 중복 환원 차단');
  r := public.credit_user_points('00000000-0000-0000-0000-0000000000a1', 5, 'admin_credit', 'admin_manual', 'x', 'bad', 'admin');
  PERFORM pg_temp.check(r->>'error' = 'invalid_entry_type', 'DB1-14 지급 RPC 로 관리자 지급 우회 금지');
  r := public.credit_user_points('00000000-0000-0000-0000-0000000000a3', 10, 'ad_refund', 'ad_application', 'refund:N', 'refund', 'system');
  PERFORM pg_temp.check(r->>'ok' = 'true' AND (r->>'balance_after')::int = -28, 'DB1-15 음수 회원 환급은 그대로 반영 (-38→-28)');
END $$;

-- 권한: service_role 이 아니면 거절, 클라이언트 역할은 실행 권한 없음
SELECT set_config('request.jwt.claim.role', '', false);
DO $$ DECLARE r jsonb; BEGIN
  r := public.spend_user_points('00000000-0000-0000-0000-0000000000a1', 1, 'ad_hold', 'feed_ad_request', 'hold:F', 'x', 'user');
  PERFORM pg_temp.check(r->>'error' = 'forbidden', 'DB1-16 service_role 아니면 forbidden');
END $$;
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.spend_user_points('00000000-0000-0000-0000-0000000000a1', 1, 'ad_hold', 'feed_ad_request', 'hold:G', 'x', 'user');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  RESET ROLE;
  PERFORM pg_temp.check(ok, 'DB1-17 authenticated 역할 EXECUTE 권한 없음');
END $$;
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.preview_store_coin_conversion('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', 1);
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  RESET ROLE;
  PERFORM pg_temp.check(ok, 'DB2-00 anon 역할 미리보기 EXECUTE 권한 없음');
END $$;
SELECT pg_temp.svc();

-- 고유 인덱스: 직접 INSERT 로도 같은 출처 차감 2회 불가
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    INSERT INTO public.point_ledger (user_id, entry_type, amount, balance_after, related_type, related_id)
    VALUES ('00000000-0000-0000-0000-0000000000a1', 'ad_hold', -30, 40, 'feed_ad_request', 'hold:A');
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  PERFORM pg_temp.check(ok, 'DB1-18 point_ledger_debit_once_uidx 가 중복 차감 행 차단');
END $$;

-- 롤백: 바깥 트랜잭션이 롤백되면 원장·캐시 모두 원래대로
BEGIN;
SELECT public.spend_user_points('00000000-0000-0000-0000-0000000000a1', 10, 'ad_charge', 'trade_post_ad', 'charge:R', 'rb', 'user');
ROLLBACK;
DO $$ BEGIN
  PERFORM pg_temp.svc();
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.point_ledger WHERE related_id = 'charge:R')
    AND (SELECT points FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000000a1') = 100, 'DB1-19 롤백 시 부분 거래 없음');
  PERFORM pg_temp.check((SELECT points FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000000a1')
    = public.sum_user_point_ledger('00000000-0000-0000-0000-0000000000a1'), 'DB1-20 캐시 = 원장 합계');
END $$;

-- ===== DB-2 =====
INSERT INTO public.stores VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a9');
INSERT INTO public.business_cash_conversion_rate_policies (id, rate_pesos_per_point, version) VALUES ('default', 1, 5);

DO $$ DECLARE r jsonb; BEGIN
  PERFORM pg_temp.svc();
  -- Coin 계정 없음(0) 에서 1 Coin
  r := public.preview_store_coin_conversion('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', 1);
  PERFORM pg_temp.check(r->>'can_convert' = 'false' AND r->'blockers' = '["insufficient_store_points"]'::jsonb
    AND r->'coin_after' = 'null'::jsonb AND (r->>'coin_before')::int = 0, 'DB2-01 Coin 0 에서 1 Coin → 확인 전 차단, 「0 → -1」 값 없음');
  r := public.preview_store_coin_conversion('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', 0);
  PERFORM pg_temp.check(r->'blockers' ? 'amount_required' AND (r->>'max_convertible')::int = 0, 'DB2-02 0 입력 = amount_required, 전환 가능 0');
  r := public.preview_store_coin_conversion('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 1);
  PERFORM pg_temp.check(r->>'error' = 'forbidden', 'DB2-03 다른 사장님 미리보기 거절');
END $$;

-- Coin 100, Cash 0, 미납 3800 → 50 Coin 전환 미리보기와 실제 실행 대조
INSERT INTO public.store_economic_point_accounts VALUES ('00000000-0000-0000-0000-0000000000b1', 100, now());
INSERT INTO public.store_economic_point_ledger (store_id, entry_kind, amount, balance_after, idempotency_key)
VALUES ('00000000-0000-0000-0000-0000000000b1', 'SALE_EARN', 100, 100, 'sale_coin:seed');
INSERT INTO public.store_sale_fee_obligations (store_id, order_id, fee_due_minor, fee_outstanding_minor)
VALUES ('00000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 3800, 3800);
DO $$ DECLARE p jsonb; c jsonb; cash bigint; BEGIN
  PERFORM pg_temp.svc();
  p := public.preview_store_coin_conversion('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', 50);
  PERFORM pg_temp.check(p->>'can_convert' = 'true' AND (p->>'coin_after')::int = 50 AND (p->>'cash_credit_minor')::int = 5000
    AND (p->>'fee_settle_minor')::int = 3800 AND (p->>'cash_after_minor')::int = 1200 AND (p->>'cash_net_increase_minor')::int = 1200
    AND (p->>'max_convertible')::int = 100, 'DB2-04 서버 계산: Coin 100→50, Cash +₱50, 미납 ₱38 정산, 실제 증가 ₱12');
  c := public.convert_store_economic_points_to_business_cash('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', 50, 5, 'k-1');
  SELECT balance_minor INTO cash FROM public.business_cash_accounts WHERE store_id = '00000000-0000-0000-0000-0000000000b1';
  PERFORM pg_temp.check(c->>'ok' = 'true' AND (c->>'sp_balance_after')::int = (p->>'coin_after')::int
    AND cash = (p->>'cash_after_minor')::bigint, 'DB2-05 실제 전환 결과 = 미리보기 (Coin 50, Cash ₱12.00)');
END $$;

-- 미리보기 이후 잔액 변경 → 실제 전환이 다시 검사해 거절
DO $$ DECLARE p jsonb; c jsonb; BEGIN
  PERFORM pg_temp.svc();
  p := public.preview_store_coin_conversion('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', 40);
  PERFORM pg_temp.check(p->>'can_convert' = 'true', 'DB2-06 미리보기 40 가능');
  UPDATE public.store_economic_point_accounts SET balance = 10 WHERE store_id = '00000000-0000-0000-0000-0000000000b1';
  c := public.convert_store_economic_points_to_business_cash('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', 40, 5, 'k-2');
  PERFORM pg_temp.check(c->>'error' = 'insufficient_store_points', 'DB2-07 미리보기 후 잔액 감소 → 실행 시 재검사로 거절 (미리보기 ≠ 보증)');
  c := public.convert_store_economic_points_to_business_cash('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', 5, 4, 'k-3');
  PERFORM pg_temp.check(c->>'error' = 'stale_rate', 'DB2-08 정책 버전 바뀌면 실행 거절');
  UPDATE public.store_economic_point_accounts SET balance = 50 WHERE store_id = '00000000-0000-0000-0000-0000000000b1';
END $$;

-- 정책별 동등성: 미리보기 첫 사유 = 실제 전환 오류 (각 시나리오는 롤백)
CREATE TEMP TABLE scen (label text, setup text, pts int);
INSERT INTO scen VALUES
  ('전환 중지', 'UPDATE business_cash_conversion_rate_policies SET conversion_enabled=false', 10),
  ('최소 미달', 'UPDATE business_cash_conversion_rate_policies SET minimum_coin_per_conversion=20', 10),
  ('단위 위반', 'UPDATE business_cash_conversion_rate_policies SET conversion_unit=5', 7),
  ('일 횟수', 'UPDATE business_cash_conversion_rate_policies SET maximum_conversions_per_day=1', 5),
  ('주 횟수', 'UPDATE business_cash_conversion_rate_policies SET maximum_conversions_per_week=1', 5),
  ('월 횟수', 'UPDATE business_cash_conversion_rate_policies SET maximum_conversions_per_month=1', 5),
  ('일 Coin 한도', 'UPDATE business_cash_conversion_rate_policies SET daily_limit_coin=60', 20),
  ('월 Coin 한도', 'UPDATE business_cash_conversion_rate_policies SET monthly_limit_coin=60', 20),
  ('간격', 'UPDATE business_cash_conversion_rate_policies SET minimum_interval_hours=1', 5),
  ('잔액 부족', 'SELECT 1', 51),
  ('0 Cash', 'UPDATE business_cash_conversion_rate_policies SET rate_pesos_per_point=0.001', 1),
  ('최소+단위 중복', 'UPDATE business_cash_conversion_rate_policies SET minimum_coin_per_conversion=20, conversion_unit=3', 10),
  ('정상', 'SELECT 1', 5);
DO $$ DECLARE s record; p jsonb; c jsonb; BEGIN
  PERFORM pg_temp.svc();
  FOR s IN SELECT * FROM scen LOOP
    BEGIN
      EXECUTE s.setup;
      p := public.preview_store_coin_conversion('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', s.pts);
      c := public.convert_store_economic_points_to_business_cash('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', s.pts, 5, 'eq-' || s.label);
      IF c->>'ok' = 'true' THEN
        PERFORM pg_temp.check(p->>'can_convert' = 'true' AND (c->>'sp_balance_after')::int = (p->>'coin_after')::int,
          'DB2-EQ ' || s.label || ': 미리보기 가능 = 실행 성공');
      ELSE
        PERFORM pg_temp.check(p->>'can_convert' = 'false' AND p->'blockers'->>0 = c->>'error',
          'DB2-EQ ' || s.label || ': 미리보기 첫 사유 ' || coalesce(p->'blockers'->>0, '-') || ' = 실행 오류 ' || coalesce(c->>'error', '-'));
      END IF;
      RAISE EXCEPTION 'rollback_scenario';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'rollback_scenario' THEN RAISE; END IF;
    END;
  END LOOP;
END $$;

-- 음수 Coin(환불 빚)
DO $$ DECLARE p jsonb; BEGIN
  PERFORM pg_temp.svc();
  UPDATE public.store_economic_point_accounts SET balance = -10 WHERE store_id = '00000000-0000-0000-0000-0000000000b1';
  p := public.preview_store_coin_conversion('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', 1);
  PERFORM pg_temp.check(p->'blockers' ? 'insufficient_store_points' AND (p->>'coin_before')::int = -10 AND (p->>'max_convertible')::int = 0,
    'DB2-09 음수 Coin 은 그대로(-10) 표시, 전환 가능 0');
END $$;

-- 미리보기는 쓰기 없음
DO $$ DECLARE before_n int; after_n int; BEGIN
  PERFORM pg_temp.svc();
  SELECT (SELECT count(*) FROM business_cash_ledger) + (SELECT count(*) FROM store_economic_point_ledger) INTO before_n;
  PERFORM public.preview_store_coin_conversion('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b1', 5);
  SELECT (SELECT count(*) FROM business_cash_ledger) + (SELECT count(*) FROM store_economic_point_ledger) INTO after_n;
  PERFORM pg_temp.check(before_n = after_n, 'DB2-10 미리보기는 원장을 쓰지 않음');
END $$;
