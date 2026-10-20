-- Owner 승인 O-9 · V3-02 (P-3): 피드 광고 신청 거절을 한 트랜잭션으로 처리한다.
-- 이전 구현(app/api/admin/feed-ad-requests/[id] PATCH reject)은
--   (1) releaseHeldPointsForFeedAdRequest — 보류 포인트 환급 원장 INSERT + hold released
--   (2) feed_ad_requests status → rejected
-- 를 별도 요청으로 실행해, (2) 실패·경합 시 "포인트는 환급됐는데 신청은 pending_review" 로 남아
-- 이후 승인(capture) 경로와 충돌할 수 있었다.
--
-- 이 함수는 신청 행 잠금(FOR UPDATE) 아래에서:
--   없음 → not_found / pending_review 아님 → not_pending
--   feed_ad_point_holds(status='held') 행마다 ad_hold_release 원장 INSERT + hold released
--     (TS 헬퍼와 동일: related_type 'feed_ad_request', related_id 'release:<hold_id>', 동일 설명 문구,
--      이미 같은 release 원장이 있으면 원장은 건너뛰고 hold 만 released — point_ledger_refund_release_once_uidx 와 동일 1회 보장)
--   profiles.points 는 project_user_point_balance_from_ledger 로만 투영
--   신청 status rejected + review_reason / reviewed_by / reviewed_at
-- 를 한 트랜잭션으로 수행한다. 실패하면 환급도 상태 변경도 남지 않는다.
-- 호출: service_role 전용 (관리자 API). **운영 DB 적용은 Owner 배포 승인 후.**

CREATE OR REPLACE FUNCTION public.admin_reject_feed_ad_request(
  p_request_id uuid,
  p_reason text,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.feed_ad_requests%ROWTYPE;
  v_hold record;
  v_released integer := 0;
  v_now timestamptz := now();
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT * INTO v_req
    FROM public.feed_ad_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.status IS DISTINCT FROM 'pending_review' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_req.status);
  END IF;

  FOR v_hold IN
    SELECT *
      FROM public.feed_ad_point_holds
     WHERE request_id = p_request_id
       AND status = 'held'
     ORDER BY created_at, id
     FOR UPDATE
  LOOP
    IF v_hold.user_id IS NOT NULL AND coalesce(v_hold.amount, 0) > 0 THEN
      PERFORM 1 FROM public.profiles WHERE id = v_hold.user_id FOR UPDATE;
      IF NOT EXISTS (
        SELECT 1
          FROM public.point_ledger
         WHERE user_id = v_hold.user_id
           AND entry_type = 'ad_hold_release'
           AND related_type = 'feed_ad_request'
           AND related_id = 'release:' || v_hold.id::text
      ) THEN
        INSERT INTO public.point_ledger
          (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
        VALUES
          (v_hold.user_id, 'ad_hold_release', v_hold.amount,
           public.sum_user_point_ledger(v_hold.user_id) + v_hold.amount,
           'feed_ad_request', 'release:' || v_hold.id::text,
           '피드 광고 거절/취소 — 보류 해제', 'system', p_actor);
        v_released := v_released + v_hold.amount;
      END IF;
      PERFORM public.project_user_point_balance_from_ledger(v_hold.user_id);
    END IF;

    UPDATE public.feed_ad_point_holds
       SET status = 'released', updated_at = v_now
     WHERE id = v_hold.id;
  END LOOP;

  UPDATE public.feed_ad_requests
     SET status = 'rejected',
         review_reason = left(btrim(p_reason), 500),
         reviewed_by = p_actor,
         reviewed_at = v_now,
         updated_at = v_now
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'rejected',
    'previous_status', v_req.status,
    'released_points', v_released
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_feed_ad_request(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_feed_ad_request(uuid, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_feed_ad_request(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_reject_feed_ad_request(uuid, text, uuid) IS
  'O-9/V3-02: 피드 광고 신청 거절 — 보류 포인트 환급 + 상태 rejected 단일 트랜잭션 (service_role 전용).';
