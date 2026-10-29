-- v4 W5 · DB-03 데이터 정리 (1회 실행) — 기간 지난 「사용 가능」 쿠폰 만료 + 묶인 예약 금액 해제.
-- 전제: 마이그레이션 20270708150100_coupon_entitlement_lifecycle_reapply_db03 적용 후.
-- 방법: 직접 UPDATE 하지 않고 정식 함수 public.expire_stale_coupon_entitlements(500) 1회 호출
--       (entitlement status='expired' · 캠페인 reserved_spend_php 차감(0 하한) · coupon_audit_events 'expire').
-- 운영 READ ONLY 확인값(2026-10-29 PHT): 대상 21건 · reserved_php 합 ₱2,464.00 · 캠페인 21곳 ·
--   캠페인별 reserved_spend_php 가 그 캠페인의 만료 대상 reserved_php 합과 정확히 같음 → 실행 후 21곳 모두 0.00.
--   (revoked 캠페인 2곳 5114b45c·11e7b2d3 의 reserved_spend_php 100.00·30.00 은 활성 쿠폰이 없어 이 함수 대상 아님 — 무변경)
-- 실행: psql ... -v ON_ERROR_STOP=1 -f scripts/delivery-v4/db03-expire-stale-coupons.sql
-- 롤백: 만료는 되돌리지 않는다(기간이 지난 쿠폰). 필요 시 coupon_audit_events action='expire' 행(payload.reserved_released)으로
--       entitlement·캠페인 값을 수기 복원.

\set ON_ERROR_STOP on
BEGIN;

-- 실행 전
SELECT count(*) AS stale_available, coalesce(sum(reserved_php), 0) AS stale_reserved_php
  FROM public.coupon_user_entitlements
 WHERE status IN ('available', 'restored') AND expires_at <= now();

SELECT public.expire_stale_coupon_entitlements(500) AS result;

-- 실행 후 (stale_available = 0 기대)
SELECT count(*) AS stale_available_after
  FROM public.coupon_user_entitlements
 WHERE status IN ('available', 'restored') AND expires_at <= now();

-- 캠페인 예약 금액 = 활성(available/restored) 쿠폰 reserved_php 합 인지 대조 (mismatch 0 기대, revoked 2곳 제외)
SELECT c.id, c.lifecycle_state, c.reserved_spend_php,
       coalesce(sum(e.reserved_php) FILTER (WHERE e.status IN ('available', 'restored')), 0) AS active_reserved
  FROM public.store_coupon_campaigns c
  LEFT JOIN public.coupon_user_entitlements e ON e.campaign_id = c.id
 GROUP BY c.id, c.lifecycle_state, c.reserved_spend_php
HAVING c.reserved_spend_php <> coalesce(sum(e.reserved_php) FILTER (WHERE e.status IN ('available', 'restored')), 0);

COMMIT;
