-- Owner 승인 O-9 · V3-06 (P-17): 포인트 소멸 실행을 한 트랜잭션으로 처리한다.
-- 이전 구현(lib/points/point-expire-db.ts runPointExpireDb)은 회원마다 실행 기록 → 원장 차감 →
-- 적립분 만료 표시 → 소멸 로그 → 포인트 처리 로그를 별도 요청으로 썼다. 중간 실패·중단 시
-- 「차감됐지만 적립분 미표시(다음 실행에서 이중 소멸)」 또는 「기록만 남고 차감 없음」 이 생길 수 있었다.
--
-- 호출: app/api/admin/point-expire/run (POST, super_admin) — service_role 전용.
-- 의미는 기존 TS 와 동일하게 유지한다:
--   정책   = is_active 정책 중 updated_at 최신 1건 (없으면 처리 없음)
--   후보   = point_ledger amount > 0 · expires_at 있음 · expired_amount IS NULL,
--            created_at 오름차순 최대 5000건 (미리보기 simulatePointExpireDb 와 같은 범위),
--            정책 exclude_entry_types 제외, expires_at <= 기준일 00:00 UTC (기존 new Date(asOfDate) 와 동일)
--   회원별 = 차감액 min(후보 합계, 원장 합계 잔액); 1 미만이면 건너뜀(적립분 표시도 하지 않음)
--   기록   = point_expire_executions 1행 → point_ledger expire 차감 1행(related_id = 실행 id)
--            → 후보 적립분 expired_amount = amount → profiles.points 재투영
--            → point_expire_logs 적립분별 1행 → point_action_logs 1행
-- 재실행(같은 기준일 포함) 멱등: 처리된 적립분은 expired_amount 로 표시되어 다시 후보가 되지 않는다.
-- 동시 실행은 트랜잭션 advisory lock 으로 직렬화하고, 회원 행은 profiles FOR UPDATE 로 잠근 뒤 잔액을 읽는다.
-- 실패하면 어떤 회원의 기록도 남지 않는다(전체 롤백).
-- **운영 DB 적용은 Owner 배포 승인 후**.

CREATE OR REPLACE FUNCTION public.admin_run_point_expire(
  p_as_of_date date,
  p_actor_id uuid,
  p_actor_nickname text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy public.point_expire_policies%ROWTYPE;
  v_run_time timestamptz;
  v_actor_type text;
  v_actor_nick text;
  v_user record;
  v_balance integer;
  v_deduct integer;
  v_exec_id uuid;
  v_ledger_id uuid;
  v_exec_ids uuid[] := ARRAY[]::uuid[];
  v_total integer := 0;
  v_skipped integer := 0;
  v_ids uuid[];
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_as_of_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_as_of_date');
  END IF;
  -- 미래 기준일 소멸 금지 (Asia/Manila 오늘까지만 — 라우트 검사와 동일)
  IF p_as_of_date > (now() AT TIME ZONE 'Asia/Manila')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'as_of_date_in_future');
  END IF;

  v_actor_type := CASE WHEN p_actor_id IS NULL THEN 'system' ELSE 'admin' END;
  v_actor_nick := coalesce(nullif(btrim(p_actor_nickname), ''), '관리자');

  -- 소멸 실행은 한 번에 하나만 (두 실행이 같은 후보를 동시에 읽어 이중 차감하는 것 방지)
  PERFORM pg_advisory_xact_lock(hashtext('public.admin_run_point_expire'));

  SELECT * INTO v_policy
    FROM public.point_expire_policies
   WHERE is_active
   ORDER BY updated_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'executionIds', '[]'::jsonb, 'totalExpired', 0,
      'policyId', NULL, 'asOfDate', p_as_of_date, 'skippedUsers', 0);
  END IF;

  -- 기존 TS: new Date("YYYY-MM-DD") = 해당 날짜 00:00 UTC
  v_run_time := (p_as_of_date::timestamp AT TIME ZONE 'UTC');

  -- 후보 = 기존 TS 와 같은 창(created_at 오름차순 최대 5000건)에서 정책 제외 유형·기준 시각 필터 후의 적립분 id.
  -- 실행 도중 expired_amount 표시로 창이 바뀌지 않도록 시작 시점에 id 를 고정한다.
  v_ids := ARRAY(
    SELECT c.id
      FROM (
        SELECT l.id, l.created_at, l.entry_type, l.expires_at
          FROM public.point_ledger l
         WHERE l.amount > 0
           AND l.expires_at IS NOT NULL
           AND l.expired_amount IS NULL
         ORDER BY l.created_at ASC
         LIMIT 5000
      ) c
     WHERE NOT (c.entry_type = ANY (coalesce(v_policy.exclude_entry_types, '{}'::text[])))
       AND c.expires_at <= v_run_time
  );

  -- 회원 순서 = 첫 후보 적립분의 created_at 순 (기존 Map 삽입 순서와 동일)
  FOR v_user IN
    SELECT c.user_id,
           sum(c.amount)::integer AS user_total,
           coalesce((SELECT p.nickname FROM public.profiles p WHERE p.id = c.user_id), '') AS nickname
      FROM public.point_ledger c
     WHERE c.id = ANY (v_ids)
     GROUP BY c.user_id
     ORDER BY min(c.created_at), c.user_id
  LOOP
    PERFORM 1 FROM public.profiles WHERE id = v_user.user_id FOR UPDATE;

    v_balance := greatest(0, public.sum_user_point_ledger(v_user.user_id));
    v_deduct := least(v_user.user_total, v_balance);
    IF v_deduct < 1 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.point_expire_executions (
      execution_date, policy_id, target_user_id, target_user_nickname,
      total_candidate_point, expired_point, remaining_point, execution_status
    ) VALUES (
      p_as_of_date, v_policy.id, v_user.user_id, v_user.nickname,
      v_user.user_total, v_deduct, greatest(0, v_balance - v_deduct), 'success'
    )
    RETURNING id INTO v_exec_id;

    INSERT INTO public.point_ledger (
      user_id, entry_type, amount, balance_after, related_type, related_id,
      description, actor_type, actor_id
    ) VALUES (
      v_user.user_id, 'expire', -v_deduct, v_balance - v_deduct, 'admin_manual', v_exec_id::text,
      left('포인트 만료 (' || v_policy.policy_name || ')', 500), v_actor_type, p_actor_id
    )
    RETURNING id INTO v_ledger_id;

    UPDATE public.point_ledger l
       SET expired_amount = l.amount
     WHERE l.id = ANY (v_ids)
       AND l.user_id = v_user.user_id
       AND l.expired_amount IS NULL;

    PERFORM public.project_user_point_balance_from_ledger(v_user.user_id);

    INSERT INTO public.point_expire_logs (
      execution_id, ledger_entry_id, user_id, user_nickname, expired_point,
      expires_at, action_type, actor_type, note
    )
    SELECT v_exec_id, c.id, c.user_id, v_user.nickname, c.amount,
           c.expires_at, 'expire', v_actor_type, c.description
      FROM public.point_ledger c
     WHERE c.id = ANY (v_ids)
       AND c.user_id = v_user.user_id
     ORDER BY c.created_at, c.id;

    INSERT INTO public.point_action_logs (
      action_type, actor_type, actor_id, actor_nickname,
      target_user_id, target_user_nickname, related_id, note
    ) VALUES (
      'expire_points', v_actor_type, coalesce(p_actor_id::text, ''), v_actor_nick,
      v_user.user_id, v_user.nickname, v_ledger_id::text, '포인트 만료 -' || v_deduct || 'P'
    );

    v_exec_ids := v_exec_ids || v_exec_id;
    v_total := v_total + v_deduct;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'executionIds', to_jsonb(v_exec_ids),
    'totalExpired', v_total,
    'policyId', v_policy.id,
    'asOfDate', p_as_of_date,
    'skippedUsers', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_run_point_expire(date, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_run_point_expire(date, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_run_point_expire(date, uuid, text) TO service_role;

COMMENT ON FUNCTION public.admin_run_point_expire(date, uuid, text) IS
  'O-9/V3-06: 포인트 소멸 실행 — 실행 기록·원장 차감·적립분 만료 표시·로그를 단일 트랜잭션으로 (service_role 전용, 재실행 멱등).';
