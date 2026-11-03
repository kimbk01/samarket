-- 금융 P1 DB 2건 격리 검증 (충전 신청 멱등 키 · 소멸 건너뜀 표시)
\set QUIET on
CREATE OR REPLACE FUNCTION pg_temp.check(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;
SELECT set_config('request.jwt.claim.role', 'service_role', false);

-- ===== 충전 신청 멱등 =====
INSERT INTO public.point_charge_requests (user_id, plan_name) VALUES ('00000000-0000-0000-0000-0000000000a1', 'legacy-no-key');
INSERT INTO public.point_charge_requests (user_id, plan_name) VALUES ('00000000-0000-0000-0000-0000000000a1', 'legacy-no-key-2');
DO $$ DECLARE ok boolean := false; BEGIN
  PERFORM pg_temp.check((SELECT count(*) FROM public.point_charge_requests WHERE idempotency_key IS NULL) = 2, 'P1-C1 기존(키 없는) 신청은 여러 건 그대로 허용');
  INSERT INTO public.point_charge_requests (user_id, plan_id, idempotency_key) VALUES ('00000000-0000-0000-0000-0000000000a1', 'p1', 'point_charge:k1');
  BEGIN
    INSERT INTO public.point_charge_requests (user_id, plan_id, idempotency_key) VALUES ('00000000-0000-0000-0000-0000000000a1', 'p1', 'point_charge:k1');
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  PERFORM pg_temp.check(ok, 'P1-C2 같은 회원·같은 키 두 번째 신청은 DB 가 거절 (중복 신청 0)');
  INSERT INTO public.point_charge_requests (user_id, plan_id, idempotency_key) VALUES ('00000000-0000-0000-0000-0000000000a2', 'p1', 'point_charge:k1');
  PERFORM pg_temp.check(true, 'P1-C3 다른 회원은 같은 키 문자열이어도 별개');
END $$;

-- ===== 소멸 건너뜀 표시 =====
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2');
INSERT INTO public.profiles (id) VALUES ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2');
INSERT INTO public.point_expire_policies (policy_name, expire_after_days) VALUES ('테스트 정책', 30);
-- e1: 만료 적립 100 + 사용 100 → 잔액 0 (건너뜀 대상)
INSERT INTO public.point_ledger (user_id, entry_type, amount, balance_after, related_type, related_id, expires_at, created_at)
VALUES ('00000000-0000-0000-0000-0000000000e1', 'reward', 100, 100, 'community_reward', 'r-e1', now() - interval '2 days', now() - interval '40 days'),
       ('00000000-0000-0000-0000-0000000000e1', 'spend', -100, 0, 'gift_certificate_purchase', 'g-e1', NULL, now() - interval '35 days');
-- e2: 만료 적립 50, 잔액 50 (정상 소멸 대상)
INSERT INTO public.point_ledger (user_id, entry_type, amount, balance_after, related_type, related_id, expires_at, created_at)
VALUES ('00000000-0000-0000-0000-0000000000e2', 'reward', 50, 50, 'community_reward', 'r-e2', now() - interval '2 days', now() - interval '39 days');

DO $$ DECLARE r jsonb; v int; BEGIN
  r := public.admin_run_point_expire((now() AT TIME ZONE 'Asia/Manila')::date, NULL, 'qa');
  PERFORM pg_temp.check(r->>'ok' = 'true' AND (r->>'totalExpired')::int = 50 AND (r->>'skippedUsers')::int = 1, 'P1-E1 정상 회원 50P 소멸, 잔액 0 회원 1명 건너뜀');
  PERFORM pg_temp.check((SELECT expired_amount FROM public.point_ledger WHERE related_id = 'r-e1') = 0, 'P1-E2 건너뛴 적립분 expired_amount = 0 (소멸 0) 표시');
  PERFORM pg_temp.check((SELECT expired_amount FROM public.point_ledger WHERE related_id = 'r-e2') = 50, 'P1-E3 소멸된 적립분은 기존처럼 금액 표시');
  PERFORM pg_temp.check(EXISTS (SELECT 1 FROM public.point_action_logs WHERE action_type = 'expire_points_skipped' AND target_user_id = '00000000-0000-0000-0000-0000000000e1'), 'P1-E4 건너뜀 감사 기록 1행');
  PERFORM pg_temp.check(public.sum_user_point_ledger('00000000-0000-0000-0000-0000000000e1') = 0, 'P1-E5 건너뛴 회원 원장 금액 변화 없음 (0)');

  -- 그 뒤 e1 이 1000P 충전 → 소멸 재실행해도 이미 표시된 적립분이라 충전분에서 빠지지 않음 (감사 P-03 재현 차단)
  INSERT INTO public.point_ledger (user_id, entry_type, amount, balance_after, related_type, related_id)
  VALUES ('00000000-0000-0000-0000-0000000000e1', 'charge', 1000, 1000, 'point_charge', 'c-e1');
  r := public.admin_run_point_expire((now() AT TIME ZONE 'Asia/Manila')::date, NULL, 'qa');
  SELECT public.sum_user_point_ledger('00000000-0000-0000-0000-0000000000e1') INTO v;
  PERFORM pg_temp.check(v = 1000 AND (r->>'totalExpired')::int = 0, 'P1-E6 충전 후 재실행 — 충전 1000P 그대로');
END $$;
