-- WP-7 / NEW-24 + NOTI-08 — 채팅 푸시에도 durable handoff 복구 적용.
--
-- 기존(SR-1 P2): notification_events 의 push_handoff_* 컬럼 + claim RPC 는 commerce
-- (order_status/delivery_status) 전용이었다. 채팅(이미지·파일·음성·부재중) 푸시는 route
-- after() 안에서 재시도 없이 void 로 던져, 함수가 죽으면 영구 미발송이었다(NEW-24).
--
-- 최소 변경(새 테이블/큐 없음): 기존 컬럼·인덱스·상태enum 을 그대로 쓰고, claim RPC 만
-- 타입 인자를 받도록 일반화한다. commerce 전용 RPC 는 그대로 둔다(무변경).

CREATE OR REPLACE FUNCTION public.claim_notification_push_handoff(
  p_types text[],
  p_limit integer DEFAULT 20,
  p_claim_token text DEFAULT NULL,
  p_stale_claim_seconds integer DEFAULT 120
)
RETURNS SETOF public.notification_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := nullif(btrim(coalesce(p_claim_token, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_stale interval := make_interval(secs => greatest(30, coalesce(p_stale_claim_seconds, 120)));
  v_types text[] := coalesce(p_types, ARRAY[]::text[]);
BEGIN
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'claim_token_required';
  END IF;
  IF array_length(v_types, 1) IS NULL THEN
    RAISE EXCEPTION 'types_required';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT e.id
    FROM public.notification_events e
    WHERE e.push_handoff_status IN ('pending', 'retryable')
      AND e.push_handoff_next_at IS NOT NULL
      AND e.push_handoff_next_at <= now()
      AND (
        e.push_handoff_claimed_at IS NULL
        OR e.push_handoff_claimed_at < now() - v_stale
      )
      AND e.type = ANY (v_types)
    ORDER BY e.push_handoff_next_at ASC, e.created_at ASC
    FOR UPDATE OF e SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.notification_events e
    SET
      push_handoff_claimed_at = now(),
      push_handoff_claim_token = v_token,
      push_handoff_attempts = e.push_handoff_attempts + 1
    FROM due
    WHERE e.id = due.id
    RETURNING e.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_push_handoff(text[], integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_push_handoff(text[], integer, text, integer) TO service_role;

COMMENT ON FUNCTION public.claim_notification_push_handoff(text[], integer, text, integer) IS
  'WP-7 NEW-24: atomically claim due notification_events of the given types for recoverable push handoff (generalized from commerce-only).';
