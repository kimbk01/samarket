-- DIBAY 내정보 v2.1 PR-2c · M4 — 보낸 가격 제안 철회
--
-- ① 정합: 저장소 파일(20260430235900)은 status 에 'expired' 를 포함하지만 운영 제약은 3종
--    (pending·accepted·rejected) 이고 'expired' 행은 0건이다. 운영 기준으로 맞춘다.
-- ② 'withdrawn'(구매자 철회) 추가 + 철회 함수: 구매자 본인·대기(pending) 건만, 행 잠금 후 변경.
--    철회 후에는 같은 상품에 새 제안을 다시 보낼 수 있다(기존 중복 검사는 pending·accepted 만 본다).
-- 기존 행 변경 0건. 롤백: DROP FUNCTION public.withdraw_price_offer(uuid, uuid);
--   CHECK 를 (pending, accepted, rejected) 로 되돌림(withdrawn 행이 있으면 먼저 처리).

BEGIN;

ALTER TABLE public.price_offers DROP CONSTRAINT IF EXISTS price_offers_status_check;
ALTER TABLE public.price_offers
  ADD CONSTRAINT price_offers_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text]));

CREATE OR REPLACE FUNCTION public.withdraw_price_offer(
  p_offer_id uuid,
  p_buyer_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_buyer uuid;
  v_status text;
BEGIN
  SELECT buyer_id, status INTO v_buyer, v_status
  FROM public.price_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_buyer IS DISTINCT FROM p_buyer_id THEN
    RETURN 'forbidden';
  END IF;
  IF v_status <> 'pending' THEN
    RETURN 'invalid_state';
  END IF;

  UPDATE public.price_offers
  SET status = 'withdrawn'
  WHERE id = p_offer_id;

  RETURN 'withdrawn';
END;
$$;

COMMENT ON FUNCTION public.withdraw_price_offer(uuid, uuid) IS
  'M4 — 구매자 본인 대기 제안 철회(행 잠금). 결과: withdrawn | not_found | forbidden | invalid_state. service_role 전용.';

REVOKE ALL ON FUNCTION public.withdraw_price_offer(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_price_offer(uuid, uuid) TO service_role;

COMMIT;
