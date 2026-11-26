-- 광고 시험 데이터 삭제 (설계 docs/audit/ad-pricing-notice-design-2026-11-26.md §8 1단계)
-- Owner 11-26 「이전의 광고 구매 이력 및 신청 대기 등은 테스트 … 모두 삭제해도 상관없다」 · 실행은 Owner 승인 후.
-- 건수 기준: 2026-11-27 00:2x PHT 운영 읽기 전용 조회. 건수가 하나라도 다르면 처음 단계에서 멈추고 아무것도 지우지 않는다.
--
-- 지우지 않는 것: 포인트 원장(point_ledger) · 비즈 캐시 원장(business_cash_ledger) · 잔액 · 알림 · 감사 기록 ·
--   운영자 광고(피드 운영 캠페인 50 · 배달 1st-party 배너 40) · 옛 원장(delivery_ad_store_cash_spends 1)과 그것이 가리키는 요금 기록 1건.
-- 지금 노출 중·돈이 묶인 것 0건 확인: 보류는 전부 확정/해제 · 캠페인 전부 종료/초안/반려 · 파트너 「ACTIVE」 1건은 기간 10-05 종료.
-- 백업: 같은 트랜잭션에서 스키마 ad_test_backup_20261127 에 표마다 복사 (API 에 노출 안 됨). 되돌리기: 아래 맨 끝 주석 블록.
--
-- 실행 기록 (Owner 「삭제 승인」 2026-11-27):
--   1차 00:3x PHT — 마지막 확인 단계 실패(작업자 오류: 남는 요금 기록을 1건으로 적음 · 실제 사장님 1 + DIBAY 자체 배너 12)
--                   → 트랜잭션 전체 자동 취소, 삭제·백업 0건 (백업 스키마 없음·주문 30건 그대로 확인)
--   2차 00:3x PHT — 확인 조건만 고쳐 같은 범위로 실행 · 성공. 백업 표 25개 = 삭제 건수.
--   실행 전후 잔액: 포인트 합계 316,715 · 비즈 캐시 39,000 (센타보) · 포인트 원장 601행 · 비즈 캐시 원장 91행 — 변화 없음.
-- 백업 보관: 2026-12-27 까지(30일). 지우기 전 Owner 승인 → DROP SCHEMA ad_test_backup_20261127 CASCADE;

BEGIN;
SET LOCAL statement_timeout = '120s';

-- ── 0. 대상 id ─────────────────────────────────────────────────
CREATE TEMP TABLE t_promo ON COMMIT DROP AS SELECT id FROM public.point_promotion_orders;
CREATE TEMP TABLE t_freq ON COMMIT DROP AS SELECT id FROM public.feed_ad_requests;
CREATE TEMP TABLE t_fcamp ON COMMIT DROP AS SELECT id FROM public.feed_ad_campaigns WHERE source = 'MEMBER_REQUESTED';
CREATE TEMP TABLE t_sp ON COMMIT DROP AS
  SELECT id FROM public.store_paid_ad_campaigns WHERE coalesce(campaign_source, 'OWNER_PAID') = 'OWNER_PAID';
CREATE TEMP TABLE t_bn ON COMMIT DROP AS
  SELECT id FROM public.store_banner_ad_campaigns WHERE coalesce(campaign_source, 'OWNER_PAID') = 'OWNER_PAID';
CREATE TEMP TABLE t_snap ON COMMIT DROP AS
  SELECT s.id FROM public.delivery_ad_campaign_commercial_snapshots s
   WHERE ((s.product_kind = 'store_sponsored' AND s.campaign_id IN (SELECT id FROM t_sp))
       OR (s.product_kind = 'banner' AND s.campaign_id IN (SELECT id FROM t_bn)))
     -- 옛 원장 3표가 가리키는 기록은 남긴다 (원장 보존 · FK no action)
     AND NOT EXISTS (SELECT 1 FROM public.delivery_ad_campaign_fundings x WHERE x.commercial_snapshot_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.delivery_ad_business_cash_ledger x WHERE x.commercial_snapshot_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.delivery_ad_store_cash_spends x WHERE x.commercial_snapshot_id = s.id);
CREATE TEMP TABLE t_partner ON COMMIT DROP AS
  SELECT m.id FROM public.delivery_ad_partner_memberships m
   WHERE NOT EXISTS (SELECT 1 FROM public.delivery_ad_campaign_commercial_snapshots s
                      WHERE s.partner_membership_id = m.id AND s.id NOT IN (SELECT id FROM t_snap));
CREATE TEMP TABLE t_popreq ON COMMIT DROP AS SELECT id FROM public.platform_popup_owner_requests;
CREATE TEMP TABLE t_popcamp ON COMMIT DROP AS
  SELECT id FROM public.platform_popup_campaigns WHERE owner_request_id IN (SELECT id FROM t_popreq);
CREATE TEMP TABLE t_cases ON COMMIT DROP AS
  SELECT id FROM public.delivery_ad_operations_cases
   WHERE store_sponsored_campaign_id IN (SELECT id FROM t_sp) OR banner_campaign_id IN (SELECT id FROM t_bn);

-- ── 1. 건수 대조 (보고한 건수와 다르면 전체 취소) ─────────────────────
DO $$
DECLARE
  v text := '';
BEGIN
  IF (SELECT count(*) FROM t_promo) <> 30 THEN v := v || ' promo'; END IF;
  IF (SELECT count(*) FROM public.promotion_point_holds WHERE promotion_order_id IN (SELECT id FROM t_promo)) <> 4 THEN v := v || ' promo_holds'; END IF;
  IF (SELECT count(*) FROM t_freq) <> 61 THEN v := v || ' feed_req'; END IF;
  IF (SELECT count(*) FROM public.feed_ad_request_creatives WHERE request_id IN (SELECT id FROM t_freq)) <> 113 THEN v := v || ' feed_req_creatives'; END IF;
  IF (SELECT count(*) FROM public.feed_ad_point_holds WHERE request_id IN (SELECT id FROM t_freq)) <> 61 THEN v := v || ' feed_holds'; END IF;
  IF (SELECT count(*) FROM t_fcamp) <> 33 THEN v := v || ' feed_camp'; END IF;
  IF (SELECT count(*) FROM public.feed_ad_creatives WHERE campaign_id IN (SELECT id FROM t_fcamp)) <> 69 THEN v := v || ' feed_creatives'; END IF;
  IF (SELECT count(*) FROM public.feed_ad_events WHERE campaign_id IN (SELECT id FROM t_fcamp)) <> 1 THEN v := v || ' feed_events'; END IF;
  IF (SELECT count(*) FROM t_sp) <> 42 THEN v := v || ' sponsored'; END IF;
  IF (SELECT count(*) FROM t_bn) <> 3 THEN v := v || ' banner'; END IF;
  IF (SELECT count(*) FROM public.delivery_store_sponsored_campaign_inventories WHERE campaign_id IN (SELECT id FROM t_sp)) <> 37 THEN v := v || ' sp_inv'; END IF;
  IF (SELECT count(*) FROM public.delivery_banner_campaign_inventories WHERE campaign_id IN (SELECT id FROM t_bn)) <> 3 THEN v := v || ' bn_inv'; END IF;
  IF (SELECT count(*) FROM t_cases) <> 12 THEN v := v || ' cases'; END IF;
  IF (SELECT count(*) FROM public.delivery_ad_operations_threads WHERE case_id IN (SELECT id FROM t_cases)) <> 12 THEN v := v || ' threads'; END IF;
  IF (SELECT count(*) FROM t_snap) <> 13 THEN v := v || ' snapshots'; END IF;
  IF (SELECT count(*) FROM public.delivery_ad_canonical_bc_fundings) <> 24 THEN v := v || ' fundings'; END IF;
  IF (SELECT count(*) FROM t_partner) <> 4 THEN v := v || ' partner'; END IF;
  IF (SELECT count(*) FROM t_popreq) <> 4 THEN v := v || ' popup_req'; END IF;
  IF (SELECT count(*) FROM t_popcamp) <> 3 THEN v := v || ' popup_camp'; END IF;
  -- 지금 노출 중·돈이 묶인 것이 생겼으면 멈춘다
  IF EXISTS (SELECT 1 FROM public.promotion_point_holds WHERE status = 'held')
     OR EXISTS (SELECT 1 FROM public.feed_ad_point_holds WHERE status = 'held')
     OR EXISTS (SELECT 1 FROM public.point_promotion_orders WHERE order_status IN ('approved','scheduled','active','paused'))
     OR EXISTS (SELECT 1 FROM public.feed_ad_requests WHERE status IN ('pending_review','approved','active'))
     OR EXISTS (SELECT 1 FROM public.feed_ad_campaigns WHERE id IN (SELECT id FROM t_fcamp) AND status IN ('scheduled','active','paused'))
     OR EXISTS (SELECT 1 FROM public.store_paid_ad_campaigns WHERE id IN (SELECT id FROM t_sp)
                 AND lifecycle_status IN ('SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','SCHEDULED','ACTIVE','PAUSED_OWNER','PAUSED_ADMIN'))
     OR EXISTS (SELECT 1 FROM public.store_banner_ad_campaigns WHERE id IN (SELECT id FROM t_bn)
                 AND lifecycle_status IN ('SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','SCHEDULED','ACTIVE','PAUSED_OWNER','PAUSED_ADMIN'))
     OR EXISTS (SELECT 1 FROM public.delivery_ad_partner_memberships WHERE status IN ('PENDING_REVIEW','CANCEL_PENDING','PAST_DUE')
                 OR (status = 'ACTIVE' AND (period_end IS NULL OR period_end > now())))
     OR EXISTS (SELECT 1 FROM public.platform_popup_campaigns WHERE id IN (SELECT id FROM t_popcamp) AND status IN ('approved','scheduled','active','paused')) THEN
    v := v || ' live_or_held';
  END IF;
  IF v <> '' THEN
    RAISE EXCEPTION 'ad test data delete aborted — count changed:%', v;
  END IF;
END $$;

-- ── 2. 백업 (같은 트랜잭션 · 지우기 전) ─────────────────────────────
CREATE SCHEMA ad_test_backup_20261127;
REVOKE ALL ON SCHEMA ad_test_backup_20261127 FROM PUBLIC, anon, authenticated;
CREATE TABLE ad_test_backup_20261127.point_promotion_orders AS SELECT * FROM public.point_promotion_orders WHERE id IN (SELECT id FROM t_promo);
CREATE TABLE ad_test_backup_20261127.point_promotion_order_extensions AS SELECT * FROM public.point_promotion_order_extensions WHERE order_id IN (SELECT id FROM t_promo);
CREATE TABLE ad_test_backup_20261127.promotion_point_holds AS SELECT * FROM public.promotion_point_holds WHERE promotion_order_id IN (SELECT id FROM t_promo);
CREATE TABLE ad_test_backup_20261127.feed_ad_requests AS SELECT * FROM public.feed_ad_requests WHERE id IN (SELECT id FROM t_freq);
CREATE TABLE ad_test_backup_20261127.feed_ad_request_creatives AS SELECT * FROM public.feed_ad_request_creatives WHERE request_id IN (SELECT id FROM t_freq);
CREATE TABLE ad_test_backup_20261127.feed_ad_point_holds AS SELECT * FROM public.feed_ad_point_holds WHERE request_id IN (SELECT id FROM t_freq);
CREATE TABLE ad_test_backup_20261127.feed_ad_request_renewals AS SELECT * FROM public.feed_ad_request_renewals WHERE request_id IN (SELECT id FROM t_freq);
CREATE TABLE ad_test_backup_20261127.feed_ad_campaigns AS SELECT * FROM public.feed_ad_campaigns WHERE id IN (SELECT id FROM t_fcamp);
CREATE TABLE ad_test_backup_20261127.feed_ad_creatives AS SELECT * FROM public.feed_ad_creatives WHERE campaign_id IN (SELECT id FROM t_fcamp);
CREATE TABLE ad_test_backup_20261127.feed_ad_events AS SELECT * FROM public.feed_ad_events WHERE campaign_id IN (SELECT id FROM t_fcamp);
CREATE TABLE ad_test_backup_20261127.store_paid_ad_campaigns AS SELECT * FROM public.store_paid_ad_campaigns WHERE id IN (SELECT id FROM t_sp);
CREATE TABLE ad_test_backup_20261127.store_banner_ad_campaigns AS SELECT * FROM public.store_banner_ad_campaigns WHERE id IN (SELECT id FROM t_bn);
CREATE TABLE ad_test_backup_20261127.delivery_store_sponsored_campaign_inventories AS SELECT * FROM public.delivery_store_sponsored_campaign_inventories WHERE campaign_id IN (SELECT id FROM t_sp);
CREATE TABLE ad_test_backup_20261127.delivery_banner_campaign_inventories AS SELECT * FROM public.delivery_banner_campaign_inventories WHERE campaign_id IN (SELECT id FROM t_bn);
CREATE TABLE ad_test_backup_20261127.delivery_ad_operations_cases AS SELECT * FROM public.delivery_ad_operations_cases WHERE id IN (SELECT id FROM t_cases);
CREATE TABLE ad_test_backup_20261127.delivery_ad_operations_threads AS SELECT * FROM public.delivery_ad_operations_threads WHERE case_id IN (SELECT id FROM t_cases);
CREATE TABLE ad_test_backup_20261127.delivery_ad_campaign_commercial_snapshots AS SELECT * FROM public.delivery_ad_campaign_commercial_snapshots WHERE id IN (SELECT id FROM t_snap);
CREATE TABLE ad_test_backup_20261127.delivery_ad_canonical_bc_fundings AS SELECT * FROM public.delivery_ad_canonical_bc_fundings;
CREATE TABLE ad_test_backup_20261127.delivery_ad_partner_memberships AS SELECT * FROM public.delivery_ad_partner_memberships WHERE id IN (SELECT id FROM t_partner);
CREATE TABLE ad_test_backup_20261127.platform_popup_owner_requests AS SELECT * FROM public.platform_popup_owner_requests WHERE id IN (SELECT id FROM t_popreq);
CREATE TABLE ad_test_backup_20261127.platform_popup_campaigns AS SELECT * FROM public.platform_popup_campaigns WHERE id IN (SELECT id FROM t_popcamp);
CREATE TABLE ad_test_backup_20261127.platform_popup_creatives AS SELECT * FROM public.platform_popup_creatives WHERE campaign_id IN (SELECT id FROM t_popcamp);
CREATE TABLE ad_test_backup_20261127.platform_popup_user_suppressions AS SELECT * FROM public.platform_popup_user_suppressions WHERE campaign_id IN (SELECT id FROM t_popcamp);
CREATE TABLE ad_test_backup_20261127.platform_popup_campaign_surfaces AS SELECT * FROM public.platform_popup_campaign_surfaces WHERE campaign_id IN (SELECT id FROM t_popcamp);
CREATE TABLE ad_test_backup_20261127.platform_popup_campaign_events AS SELECT * FROM public.platform_popup_campaign_events WHERE campaign_id IN (SELECT id FROM t_popcamp);

-- ── 3. 삭제 (자식 → 부모 · 「확보된 캐시가 있는 캠페인 삭제 금지」 트리거 때문에 자금 기록을 먼저) ──
DELETE FROM public.point_promotion_orders WHERE id IN (SELECT id FROM t_promo);              -- 연장 기록·포인트 보류 함께(cascade)
DELETE FROM public.feed_ad_campaigns WHERE id IN (SELECT id FROM t_fcamp);                   -- 배너 소재·이벤트 함께(cascade)
DELETE FROM public.feed_ad_requests WHERE id IN (SELECT id FROM t_freq);                     -- 신청 소재·보류·연장 기록 함께(cascade)
DELETE FROM public.delivery_ad_campaign_commercial_snapshots WHERE id IN (SELECT id FROM t_snap);
DELETE FROM public.delivery_ad_canonical_bc_fundings;                                         -- 24건 전부(원장은 남김)
DELETE FROM public.store_paid_ad_campaigns WHERE id IN (SELECT id FROM t_sp);               -- 지면 연결·운영 문의 함께(cascade)
DELETE FROM public.store_banner_ad_campaigns WHERE id IN (SELECT id FROM t_bn);
DELETE FROM public.delivery_ad_partner_memberships WHERE id IN (SELECT id FROM t_partner);
DELETE FROM public.platform_popup_campaigns WHERE id IN (SELECT id FROM t_popcamp);          -- 소재·숨김·지면·이벤트 함께(cascade)
DELETE FROM public.platform_popup_owner_requests WHERE id IN (SELECT id FROM t_popreq);

-- ── 4. 확인 (남으면 전체 취소) ───────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM public.point_promotion_orders) <> 0
     OR (SELECT count(*) FROM public.feed_ad_requests) <> 0
     OR (SELECT count(*) FROM public.feed_ad_campaigns WHERE source = 'MEMBER_REQUESTED') <> 0
     OR (SELECT count(*) FROM public.store_paid_ad_campaigns WHERE coalesce(campaign_source, 'OWNER_PAID') = 'OWNER_PAID') <> 0
     OR (SELECT count(*) FROM public.store_banner_ad_campaigns WHERE coalesce(campaign_source, 'OWNER_PAID') = 'OWNER_PAID') <> 0
     OR (SELECT count(*) FROM public.delivery_ad_canonical_bc_fundings) <> 0
     OR (SELECT count(*) FROM public.delivery_ad_partner_memberships) <> 0
     OR (SELECT count(*) FROM public.platform_popup_owner_requests) <> 0
     -- 남겨야 하는 것
     OR (SELECT count(*) FROM public.feed_ad_campaigns) <> 50
     OR (SELECT count(*) FROM public.store_banner_ad_campaigns WHERE campaign_source = 'DIBAY_FIRST_PARTY') <> 40
     -- 요금 기록: 사장님 것 1(옛 원장이 가리킴) + DIBAY 자체 배너 12 는 남는다 (1차 실행 확인 오류 수정 2026-11-27)
     OR (SELECT count(*) FROM public.delivery_ad_campaign_commercial_snapshots WHERE campaign_source = 'OWNER_PAID') <> 1
     OR (SELECT count(*) FROM public.delivery_ad_campaign_commercial_snapshots WHERE campaign_source = 'DIBAY_FIRST_PARTY') <> 12
     OR (SELECT count(*) FROM public.delivery_ad_store_cash_spends) <> 1 THEN
    RAISE EXCEPTION 'ad test data delete verify failed';
  END IF;
END $$;

COMMIT;

-- ── 되돌리기 (필요할 때만 · 부모 → 자식 순서) ─────────────────────────
-- BEGIN;
-- INSERT INTO public.platform_popup_owner_requests SELECT * FROM ad_test_backup_20261127.platform_popup_owner_requests;
-- INSERT INTO public.platform_popup_campaigns SELECT * FROM ad_test_backup_20261127.platform_popup_campaigns;
-- INSERT INTO public.platform_popup_creatives SELECT * FROM ad_test_backup_20261127.platform_popup_creatives;
-- INSERT INTO public.platform_popup_campaign_surfaces SELECT * FROM ad_test_backup_20261127.platform_popup_campaign_surfaces;
-- INSERT INTO public.platform_popup_user_suppressions SELECT * FROM ad_test_backup_20261127.platform_popup_user_suppressions;
-- INSERT INTO public.platform_popup_campaign_events SELECT * FROM ad_test_backup_20261127.platform_popup_campaign_events;
-- INSERT INTO public.delivery_ad_partner_memberships SELECT * FROM ad_test_backup_20261127.delivery_ad_partner_memberships;
-- INSERT INTO public.store_paid_ad_campaigns SELECT * FROM ad_test_backup_20261127.store_paid_ad_campaigns;
-- INSERT INTO public.store_banner_ad_campaigns SELECT * FROM ad_test_backup_20261127.store_banner_ad_campaigns;
-- INSERT INTO public.delivery_store_sponsored_campaign_inventories SELECT * FROM ad_test_backup_20261127.delivery_store_sponsored_campaign_inventories;
-- INSERT INTO public.delivery_banner_campaign_inventories SELECT * FROM ad_test_backup_20261127.delivery_banner_campaign_inventories;
-- INSERT INTO public.delivery_ad_operations_cases SELECT * FROM ad_test_backup_20261127.delivery_ad_operations_cases;
-- INSERT INTO public.delivery_ad_operations_threads SELECT * FROM ad_test_backup_20261127.delivery_ad_operations_threads;
-- INSERT INTO public.delivery_ad_canonical_bc_fundings SELECT * FROM ad_test_backup_20261127.delivery_ad_canonical_bc_fundings;
-- INSERT INTO public.delivery_ad_campaign_commercial_snapshots SELECT * FROM ad_test_backup_20261127.delivery_ad_campaign_commercial_snapshots;
-- -- 신청 ↔ 캠페인이 서로를 가리키므로: 신청을 campaign_id 없이 넣고 → 캠페인 → 신청의 campaign_id 복원
-- INSERT INTO public.feed_ad_requests SELECT * FROM ad_test_backup_20261127.feed_ad_requests;  -- 실행 전 campaign_id 를 NULL 로 바꾼 복사본 사용:
-- --   CREATE TEMP TABLE r AS SELECT * FROM ad_test_backup_20261127.feed_ad_requests; UPDATE r SET campaign_id = NULL; INSERT INTO public.feed_ad_requests SELECT * FROM r;
-- INSERT INTO public.feed_ad_request_creatives SELECT * FROM ad_test_backup_20261127.feed_ad_request_creatives;
-- INSERT INTO public.feed_ad_point_holds SELECT * FROM ad_test_backup_20261127.feed_ad_point_holds;
-- INSERT INTO public.feed_ad_request_renewals SELECT * FROM ad_test_backup_20261127.feed_ad_request_renewals;
-- INSERT INTO public.feed_ad_campaigns SELECT * FROM ad_test_backup_20261127.feed_ad_campaigns;
-- UPDATE public.feed_ad_requests q SET campaign_id = b.campaign_id FROM ad_test_backup_20261127.feed_ad_requests b WHERE q.id = b.id;
-- INSERT INTO public.feed_ad_creatives SELECT * FROM ad_test_backup_20261127.feed_ad_creatives;
-- INSERT INTO public.feed_ad_events SELECT * FROM ad_test_backup_20261127.feed_ad_events;
-- INSERT INTO public.point_promotion_orders SELECT * FROM ad_test_backup_20261127.point_promotion_orders;
-- INSERT INTO public.point_promotion_order_extensions SELECT * FROM ad_test_backup_20261127.point_promotion_order_extensions;
-- INSERT INTO public.promotion_point_holds SELECT * FROM ad_test_backup_20261127.promotion_point_holds;
-- COMMIT;
