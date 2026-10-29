-- 배달 광고 처리 대기 큐에서 종료된 광고 제외 (감사 UX-08 · Owner 권장안 J-10 승인 2026-10-30)
--
-- 원인: admin_delivery_ad_action_queue_rows 가 운영 Case 상태(WAITING_ADMIN)만 보고 캠페인이 끝났는지는 보지 않았다.
--       운영 DB 2026-10-30 확인: 처리 대기 3건 모두 lifecycle_status = ENDED (종료 시각도 지남).
-- 수정: 캠페인 lifecycle 이 종료 계열이면 큐에서 제외. 판정은 목록 버킷 'ended' 와 같은 4개 상태.
-- 범위: 이 함수 하나 (시그니처·반환형·권한 동일). 운영 Case 행·캠페인 행은 바꾸지 않는다.
-- 롤백: 20270601100100_r7_admin_delivery_ad_campaigns_page.sql 의 같은 함수 정의로 CREATE OR REPLACE.
-- 운영 적용: Owner 별도 승인 후 (개발 프로세스 2번).

CREATE OR REPLACE FUNCTION public.admin_delivery_ad_action_queue_rows(p_pending_asset text)
RETURNS TABLE (
  case_id uuid,
  product_kind text,
  campaign_id uuid,
  owner_user_id uuid,
  updated_at timestamptz,
  funding_status text,
  bucket text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cases AS (
    SELECT oc.id AS case_id, oc.product_kind,
           CASE WHEN oc.product_kind = 'store_sponsored' THEN oc.store_sponsored_campaign_id
                ELSE oc.banner_campaign_id END AS campaign_id,
           oc.owner_user_id, oc.updated_at
      FROM public.delivery_ad_operations_cases oc
     WHERE oc.status = 'WAITING_ADMIN'
       AND oc.product_kind IN ('store_sponsored', 'banner')
  ),
  joined AS (
    SELECT c.*,
           coalesce(sp.lifecycle_status, bn.lifecycle_status) AS lifecycle_status,
           coalesce(sp.review_notes, bn.review_notes) AS review_notes,
           coalesce(sp.campaign_source, bn.campaign_source) AS campaign_source,
           bn.image_url AS banner_image_url,
           CASE f.status WHEN 'SECURED' THEN 'FUNDED' WHEN 'REFUNDED' THEN 'REFUNDED' ELSE 'UNFUNDED' END AS funding_status
      FROM cases c
      LEFT JOIN public.store_paid_ad_campaigns sp
        ON c.product_kind = 'store_sponsored' AND sp.id = c.campaign_id
      LEFT JOIN public.store_banner_ad_campaigns bn
        ON c.product_kind = 'banner' AND bn.id = c.campaign_id
      LEFT JOIN public.delivery_ad_canonical_bc_fundings f
        ON f.product_kind = c.product_kind AND f.application_id = c.campaign_id
     WHERE c.campaign_id IS NOT NULL
  )
  SELECT j.case_id, j.product_kind, j.campaign_id, j.owner_user_id, j.updated_at, j.funding_status,
         CASE
           WHEN j.product_kind = 'banner'
                AND (nullif(btrim(coalesce(j.banner_image_url, '')), '') IS NULL
                     OR btrim(j.banner_image_url) = p_pending_asset) THEN 'needs_creative'
           WHEN btrim(coalesce(j.lifecycle_status, '')) = 'SUBMITTED'
                AND btrim(coalesce(j.review_notes, '')) <> '' THEN 'resubmit'
           WHEN btrim(coalesce(j.lifecycle_status, '')) = 'SUBMITTED' THEN 'new_application'
           ELSE 'awaiting_review'
         END AS bucket
    FROM joined j
   -- 결제 확인: 디바이 직접 등록은 항상 · 광고주 유료는 FUNDED 만 (`isDeliveryAdFundingReadyForGoLive`)
   WHERE (btrim(coalesce(j.campaign_source, 'OWNER_PAID')) = 'DIBAY_FIRST_PARTY'
          OR j.funding_status = 'FUNDED')
     -- 감사 UX-08 (Owner J-10): 이미 끝난 광고는 처리 대기에서 뺀다 — 목록 버킷 'ended' 와 같은 판정
     AND btrim(coalesce(j.lifecycle_status, '')) NOT IN ('ENDED', 'TERMINATED', 'ARCHIVED', 'EXHAUSTED');
$$;

REVOKE ALL ON FUNCTION public.admin_delivery_ad_action_queue_rows(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivery_ad_action_queue_rows(text) TO service_role;
