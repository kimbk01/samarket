-- Community D-Point financial writer.
-- Atomic reward/reclaim, source UNIQUE, policy snapshot, topic override columns,
-- system reversal may go negative. No new ledger table.
-- DO NOT mix Business Credit. Comment report writer remains HOLD.

BEGIN;

-- ---------------------------------------------------------------------------
-- Duplicate gate (fail loud — do not DISTINCT-away financial history)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_reward_dup integer;
  v_reclaim_dup integer;
BEGIN
  SELECT COUNT(*) INTO v_reward_dup
    FROM (
      SELECT user_id, related_id
        FROM public.point_ledger
       WHERE related_type = 'community_reward'
       GROUP BY user_id, related_id
      HAVING COUNT(*) > 1
    ) d;
  IF v_reward_dup > 0 THEN
    RAISE EXCEPTION 'community_reward duplicate ledger rows: %', v_reward_dup;
  END IF;

  SELECT COUNT(*) INTO v_reclaim_dup
    FROM (
      SELECT user_id, related_id
        FROM public.point_ledger
       WHERE related_type = 'community_reclaim'
       GROUP BY user_id, related_id
      HAVING COUNT(*) > 1
    ) d;
  IF v_reclaim_dup > 0 THEN
    RAISE EXCEPTION 'community_reclaim duplicate ledger rows: %', v_reclaim_dup;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- board_point_policies — global / qna / topic override
-- ---------------------------------------------------------------------------
ALTER TABLE public.board_point_policies
  ADD COLUMN IF NOT EXISTS inherit_global boolean NOT NULL DEFAULT false;
ALTER TABLE public.board_point_policies
  ADD COLUMN IF NOT EXISTS policy_layer text NOT NULL DEFAULT 'topic';
ALTER TABLE public.board_point_policies
  ADD COLUMN IF NOT EXISTS daily_reward_post_cap integer NOT NULL DEFAULT 10;
ALTER TABLE public.board_point_policies
  ADD COLUMN IF NOT EXISTS daily_reward_comment_cap integer NOT NULL DEFAULT 30;
ALTER TABLE public.board_point_policies
  ADD COLUMN IF NOT EXISTS min_reward_post_chars integer NOT NULL DEFAULT 10;
ALTER TABLE public.board_point_policies
  ADD COLUMN IF NOT EXISTS min_reward_comment_chars integer NOT NULL DEFAULT 8;
ALTER TABLE public.board_point_policies
  ADD COLUMN IF NOT EXISTS policy_version integer NOT NULL DEFAULT 1;

UPDATE public.board_point_policies
   SET policy_layer = 'global', inherit_global = false
 WHERE board_key = 'general';
UPDATE public.board_point_policies
   SET policy_layer = 'qna', inherit_global = false
 WHERE board_key = 'qna';

-- ---------------------------------------------------------------------------
-- executions snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE public.point_reward_executions
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.point_reward_executions
  ADD COLUMN IF NOT EXISTS related_ledger_id uuid NULL;

-- ---------------------------------------------------------------------------
-- Partial UNIQUE — community reward/reclaim only
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_point_ledger_community_reward_source
  ON public.point_ledger (user_id, related_type, related_id)
  WHERE related_type = 'community_reward';

CREATE UNIQUE INDEX IF NOT EXISTS uq_point_ledger_community_reclaim_source
  ON public.point_ledger (user_id, related_type, related_id)
  WHERE related_type = 'community_reclaim';

-- ---------------------------------------------------------------------------
-- Reclaim policy seeds (admin_remove + comment report infrastructure)
-- comment report WRITER stays HOLD
-- ---------------------------------------------------------------------------
INSERT INTO public.point_reclaim_policies (
  id, target_type, trigger_type, reclaim_mode, reclaim_percent, is_active
) VALUES
  ('prp-4', 'post', 'admin_remove', 'full', 100, true),
  ('prp-5', 'comment', 'admin_remove', 'full', 100, true),
  ('prp-6', 'comment', 'report_confirmed', 'full', 100, true),
  ('prp-7', 'post', 'eligibility_lost', 'full', 100, true),
  ('prp-8', 'comment', 'eligibility_lost', 'full', 100, true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Projection: do not clamp negatives (system reversal debt)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_user_point_balance_from_ledger(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  v_sum := public.sum_user_point_ledger(p_user_id);

  UPDATE public.profiles
     SET points = v_sum
   WHERE id = p_user_id;

  RETURN v_sum;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_user_point_charge_request(
  p_request_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_sum integer;
  v_new_balance integer;
  v_cache integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req
    FROM public.point_charge_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.request_status NOT IN ('pending', 'waiting_confirm', 'on_hold') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = v_req.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_sum := public.sum_user_point_ledger(v_req.user_id);
  IF COALESCE(v_cache, 0) IS DISTINCT FROM v_sum THEN
    PERFORM public.project_user_point_balance_from_ledger(v_req.user_id);
    v_sum := public.sum_user_point_ledger(v_req.user_id);
  END IF;

  v_new_balance := v_sum + GREATEST(0, v_req.point_amount);

  UPDATE public.point_charge_requests
     SET request_status = 'approved',
         approved_at = now(),
         approved_by = p_admin_user_id,
         processed_at = now(),
         processed_by = p_admin_user_id,
         updated_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_req.user_id,
    'charge',
    v_req.point_amount,
    v_new_balance,
    'point_charge',
    p_request_id::text,
    '포인트 충전 승인',
    'admin'
  );

  v_new_balance := public.project_user_point_balance_from_ledger(v_req.user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'balance_after', v_new_balance,
    'user_id', v_req.user_id,
    'point_amount', v_req.point_amount
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic reward
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_community_point_reward(
  p_user_id uuid,
  p_execution_key text,
  p_board_key text,
  p_action_type text,
  p_target_id text,
  p_target_type text,
  p_user_nickname text,
  p_user_type text,
  p_reward_type text,
  p_base_point integer,
  p_multiplier numeric,
  p_final_point integer,
  p_status text,
  p_reason text,
  p_policy_snapshot jsonb,
  p_description text,
  p_capped boolean DEFAULT false,
  p_cooldown_blocked boolean DEFAULT false,
  p_duplicate_blocked boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_existing record;
  v_exec_id uuid;
  v_ledger_id uuid;
  v_sum integer;
  v_balance integer;
  v_status text;
  v_final integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_key := trim(coalesce(p_execution_key, ''));
  IF p_user_id IS NULL OR v_key = '' OR coalesce(trim(p_target_id), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT * INTO v_existing
    FROM public.point_reward_executions
   WHERE execution_key = v_key
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'execution_id', v_existing.id,
      'ledger_id', v_existing.related_ledger_id,
      'status', v_existing.status,
      'final_point', v_existing.final_point,
      'base_point', v_existing.base_point,
      'applied_multiplier', v_existing.applied_multiplier,
      'balance_after', public.sum_user_point_ledger(p_user_id)
    );
  END IF;

  v_status := CASE
    WHEN lower(coalesce(p_status, '')) = 'success' AND coalesce(p_final_point, 0) > 0 THEN 'success'
    ELSE 'blocked'
  END;
  v_final := CASE WHEN v_status = 'success' THEN p_final_point ELSE 0 END;

  INSERT INTO public.point_reward_executions (
    execution_key, board_key, action_type, target_id, target_type,
    user_id, user_nickname, user_type, reward_type,
    base_point, applied_multiplier, final_point,
    capped, cooldown_blocked, duplicate_blocked,
    status, reason, policy_snapshot
  ) VALUES (
    v_key,
    coalesce(nullif(trim(p_board_key), ''), 'general'),
    coalesce(nullif(trim(p_action_type), ''), 'write'),
    trim(p_target_id),
    coalesce(nullif(trim(p_target_type), ''), 'post'),
    p_user_id,
    coalesce(p_user_nickname, ''),
    coalesce(nullif(trim(p_user_type), ''), 'free'),
    coalesce(nullif(trim(p_reward_type), ''), 'fixed'),
    coalesce(p_base_point, 0),
    coalesce(p_multiplier, 1),
    v_final,
    coalesce(p_capped, false),
    coalesce(p_cooldown_blocked, false),
    coalesce(p_duplicate_blocked, false),
    v_status,
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(p_policy_snapshot, '{}'::jsonb)
  )
  RETURNING id INTO v_exec_id;

  IF v_status = 'success' THEN
    v_sum := public.sum_user_point_ledger(p_user_id);
    v_balance := v_sum + v_final;
    INSERT INTO public.point_ledger (
      user_id, entry_type, amount, balance_after,
      related_type, related_id, description, actor_type
    ) VALUES (
      p_user_id,
      'reward',
      v_final,
      v_balance,
      'community_reward',
      trim(p_target_id),
      left(coalesce(p_description, '커뮤니티 보상'), 500),
      'system'
    )
    RETURNING id INTO v_ledger_id;

    UPDATE public.point_reward_executions
       SET related_ledger_id = v_ledger_id
     WHERE id = v_exec_id;

    INSERT INTO public.point_reward_logs (
      execution_id, related_ledger_id, action_type, board_key,
      target_id, target_type, user_id, point_amount, balance_after, note
    ) VALUES (
      v_exec_id, v_ledger_id, 'reward',
      coalesce(nullif(trim(p_board_key), ''), 'general'),
      trim(p_target_id),
      coalesce(nullif(trim(p_target_type), ''), 'post'),
      p_user_id, v_final, v_balance,
      left(coalesce(p_description, '커뮤니티 보상'), 200)
    );

    PERFORM public.project_user_point_balance_from_ledger(p_user_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'execution_id', v_exec_id,
    'ledger_id', v_ledger_id,
    'status', v_status,
    'final_point', v_final,
    'base_point', coalesce(p_base_point, 0),
    'applied_multiplier', coalesce(p_multiplier, 1),
    'balance_after', public.sum_user_point_ledger(p_user_id)
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
      FROM public.point_reward_executions
     WHERE execution_key = v_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'execution_id', v_existing.id,
        'ledger_id', v_existing.related_ledger_id,
        'status', v_existing.status,
        'final_point', v_existing.final_point,
        'base_point', v_existing.base_point,
        'applied_multiplier', v_existing.applied_multiplier,
        'balance_after', public.sum_user_point_ledger(p_user_id)
      );
    END IF;
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic reclaim — negative balance allowed (system reversal only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_community_point_reclaim(
  p_target_id text,
  p_target_type text,
  p_trigger_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy record;
  v_exec record;
  v_amount integer;
  v_sum integer;
  v_balance integer;
  v_ledger_id uuid;
  v_existing_rev uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF coalesce(trim(p_target_id), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT * INTO v_policy
    FROM public.point_reclaim_policies
   WHERE target_type = p_target_type
     AND trigger_type = p_trigger_type
     AND is_active = true
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_policy');
  END IF;

  SELECT * INTO v_exec
    FROM public.point_reward_executions
   WHERE target_id = trim(p_target_id)
     AND target_type = p_target_type
     AND status IN ('success', 'reversed')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_success_execution');
  END IF;

  IF v_exec.status = 'reversed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'execution_id', v_exec.id,
      'status', 'reversed',
      'final_point', v_exec.final_point
    );
  END IF;

  IF coalesce(v_exec.final_point, 0) < 1 THEN
    UPDATE public.point_reward_executions
       SET status = 'reversed', reversed_at = now()
     WHERE id = v_exec.id;
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'zero_reward', 'execution_id', v_exec.id);
  END IF;

  v_amount := CASE
    WHEN v_policy.reclaim_mode = 'full' THEN v_exec.final_point
    ELSE GREATEST(1, round((v_exec.final_point * v_policy.reclaim_percent) / 100.0)::integer)
  END;

  SELECT id INTO v_existing_rev
    FROM public.point_ledger
   WHERE user_id = v_exec.user_id
     AND related_type = 'community_reclaim'
     AND related_id = v_exec.id::text
   LIMIT 1;
  IF v_existing_rev IS NOT NULL THEN
    UPDATE public.point_reward_executions
       SET status = 'reversed', reversed_at = coalesce(reversed_at, now())
     WHERE id = v_exec.id;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'execution_id', v_exec.id,
      'ledger_id', v_existing_rev,
      'status', 'reversed'
    );
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = v_exec.user_id FOR UPDATE;

  v_sum := public.sum_user_point_ledger(v_exec.user_id);
  v_balance := v_sum - v_amount;

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_exec.user_id,
    'reverse',
    -v_amount,
    v_balance,
    'community_reclaim',
    v_exec.id::text,
    left(
      CASE p_trigger_type
        WHEN 'admin_remove' THEN '커뮤니티 관리자 삭제 회수'
        WHEN 'report_confirmed' THEN '커뮤니티 신고 확정 회수'
        WHEN 'eligibility_lost' THEN '커뮤니티 보상 적격 상실 회수'
        ELSE '커뮤니티 게시글 삭제 회수'
      END,
      500
    ),
    'system'
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.point_reward_executions
     SET status = 'reversed', reversed_at = now()
   WHERE id = v_exec.id;

  INSERT INTO public.point_reward_logs (
    execution_id, related_ledger_id, action_type, board_key,
    target_id, target_type, user_id, point_amount, balance_after, note
  ) VALUES (
    v_exec.id, v_ledger_id, 'reclaim', v_exec.board_key,
    v_exec.target_id, v_exec.target_type, v_exec.user_id,
    -v_amount, v_balance, 'community reclaim'
  );

  PERFORM public.project_user_point_balance_from_ledger(v_exec.user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'execution_id', v_exec.id,
    'ledger_id', v_ledger_id,
    'reclaim_amount', v_amount,
    'balance_after', v_balance,
    'status', 'reversed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_community_point_reward(
  uuid, text, text, text, text, text, text, text, text,
  integer, numeric, integer, text, text, jsonb, text, boolean, boolean, boolean
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_community_point_reward(
  uuid, text, text, text, text, text, text, text, text,
  integer, numeric, integer, text, text, jsonb, text, boolean, boolean, boolean
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_community_point_reward(
  uuid, text, text, text, text, text, text, text, text,
  integer, numeric, integer, text, text, jsonb, text, boolean, boolean, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.apply_community_point_reclaim(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_community_point_reclaim(text, text, text)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_community_point_reclaim(text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.project_user_point_balance_from_ledger(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.project_user_point_balance_from_ledger(uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_user_point_balance_from_ledger(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.apply_community_point_reward IS
  'Community D-Point: one TX execution + ledger. Idempotent on execution_key.';
COMMENT ON FUNCTION public.apply_community_point_reclaim IS
  'Community D-Point reversal. Allows negative balance. One reversal per execution.';

COMMIT;
