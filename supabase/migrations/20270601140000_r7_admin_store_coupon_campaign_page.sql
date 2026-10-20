-- R7 (delivery_b) — 쿠폰 관리 `/admin/store-coupon-control` 고정 조회 상한 제거
--
-- 목적: 캠페인 목록이 `limit(200)` 으로 잘리고, 현황 KPI·최근 처리·매장 필터 옵션·캠페인별 발급/사용/재원 집계가
--       잘린 배열 위에서 메모리로 계산되던 경로를 DB 한 번의 조회로 바꾼다.
--       · 필터(상태 구간·재원·매장·캠페인 id) + 결정적 정렬(created_at DESC, id DESC) + limit/offset + 정확한 total
--       · KPI(전체 캠페인 기준 total/active/waiting/ended) · 매장 옵션(캠페인이 있는 매장 전체) · 최근 처리 8건
--       · 페이지 행마다 쿠폰 보유 상태 집계(발급·사용·보유·만료·회수)와 실현 재원(주문 스냅샷 합계)·주문 매출
-- 대상 화면: /admin/store-coupon-control (GET /api/admin/store-coupons?limit=&offset=… · ?campaignId=)
-- 상태 구간 규칙 = lib/stores/admin-coupon-control-shell.ts classifyAdminCouponDashboardBucket
--   (requested·draft → waiting / ended·revoked·rejected → ended / 그 외 → active)
-- 보유 상태 규칙 = lib/stores/load-coupon-campaign-ops-bundle.ts (redeemed / revoked / expired 또는 만료 시각 경과
--   available·restored / 그 외 available·restored = 보유 중)
-- 실현 재원 규칙 = lib/stores/admin-coupon-control-realized.ts (store_coupon_redemptions ⋈ store_orders,
--   금액마다 GREATEST(0, round(x)) 합계) · 주문 매출 = round(payment_amount) 합계
-- 조회 전용 — 쿠폰·주문·금액 쓰기 없음.
--
-- 권한: SECURITY DEFINER · search_path=public · PUBLIC/anon/authenticated EXECUTE 회수 · service_role 만 실행
--       (앱 서버가 관리자 가드 통과 후 service role 로 호출).
--
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_store_coupon_campaign_page(text, text, uuid, uuid, integer, integer);
--   DROP INDEX IF EXISTS public.store_coupon_campaigns_created_id_idx;
--   DROP INDEX IF EXISTS public.coupon_user_entitlements_campaign_idx;
--   DROP INDEX IF EXISTS public.coupon_audit_events_created_idx;

CREATE INDEX IF NOT EXISTS store_coupon_campaigns_created_id_idx
  ON public.store_coupon_campaigns (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS coupon_user_entitlements_campaign_idx
  ON public.coupon_user_entitlements (campaign_id);

CREATE INDEX IF NOT EXISTS coupon_audit_events_created_idx
  ON public.coupon_audit_events (created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.admin_store_coupon_campaign_page(
  p_status text,
  p_funding text,
  p_store_id uuid,
  p_campaign_id uuid,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(nullif(btrim(coalesce(p_status, '')), ''), 'all') AS status_q,
           nullif(nullif(btrim(coalesce(p_funding, '')), ''), 'all') AS funding_q,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  classified AS (
    SELECT c.id, c.store_id, c.funding_mode, c.created_at,
           CASE
             WHEN btrim(coalesce(c.lifecycle_state, '')) IN ('requested', 'draft') THEN 'waiting'
             WHEN btrim(coalesce(c.lifecycle_state, '')) IN ('ended', 'revoked', 'rejected') THEN 'ended'
             ELSE 'active'
           END AS bucket
      FROM public.store_coupon_campaigns c
  ),
  filtered AS (
    SELECT k.*
      FROM classified k
     CROSS JOIN params pr
     WHERE (pr.status_q IS NULL OR k.bucket = pr.status_q)
       AND (pr.funding_q IS NULL OR k.funding_mode = pr.funding_q)
       AND (p_store_id IS NULL OR k.store_id = p_store_id)
       AND (p_campaign_id IS NULL OR k.id = p_campaign_id)
  ),
  page AS (
    SELECT f.id, f.created_at
      FROM filtered f
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  ),
  ent AS (
    SELECT e.campaign_id,
           count(*) AS claimed,
           count(*) FILTER (WHERE e.status = 'redeemed') AS redeemed,
           count(*) FILTER (WHERE e.status = 'revoked') AS revoked,
           count(*) FILTER (
             WHERE e.status = 'expired'
                OR (e.status IN ('available', 'restored') AND e.expires_at <= now())
           ) AS expired,
           count(*) FILTER (
             WHERE e.status IN ('available', 'restored') AND e.expires_at > now()
           ) AS active_held
      FROM public.coupon_user_entitlements e
     WHERE e.campaign_id IN (SELECT id FROM page)
     GROUP BY e.campaign_id
  ),
  red AS (
    SELECT r.campaign_id,
           count(*) AS order_count,
           sum(GREATEST(0, round(coalesce(o.discount_amount, 0)::numeric))) AS customer_discount,
           sum(GREATEST(0, round(coalesce(o.store_funded_amount, 0)::numeric))) AS store_funded,
           sum(GREATEST(0, round(coalesce(o.platform_funded_amount, 0)::numeric))) AS platform_funded,
           sum(round(coalesce(o.payment_amount, 0)::numeric)) AS order_sales_php
      FROM public.store_coupon_redemptions r
      JOIN public.store_orders o ON o.id = r.order_id
     WHERE r.campaign_id IN (SELECT id FROM page)
     GROUP BY r.campaign_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'limit', (SELECT lim FROM params),
    'offset', (SELECT off FROM params),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pg.id,
               'claimed', coalesce(en.claimed, 0),
               'redeemed', coalesce(en.redeemed, 0),
               'active_held', coalesce(en.active_held, 0),
               'expired', coalesce(en.expired, 0),
               'revoked', coalesce(en.revoked, 0),
               'order_count', coalesce(rd.order_count, 0),
               'customer_discount', coalesce(rd.customer_discount, 0),
               'store_funded', coalesce(rd.store_funded, 0),
               'platform_funded', coalesce(rd.platform_funded, 0),
               'order_sales_php', coalesce(rd.order_sales_php, 0)
             ) ORDER BY pg.created_at DESC, pg.id DESC)
        FROM page pg
        LEFT JOIN ent en ON en.campaign_id = pg.id
        LEFT JOIN red rd ON rd.campaign_id = pg.id
    ), '[]'::jsonb),
    'kpi', (
      SELECT jsonb_build_object(
               'total', count(*),
               'active', count(*) FILTER (WHERE bucket = 'active'),
               'waiting', count(*) FILTER (WHERE bucket = 'waiting'),
               'ended', count(*) FILTER (WHERE bucket = 'ended'))
        FROM classified
    ),
    'stores', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.store_name) ORDER BY s.store_name, s.id)
        FROM public.stores s
       WHERE s.id IN (SELECT DISTINCT store_id FROM classified)
    ), '[]'::jsonb),
    'recent', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'created_at', x.created_at,
               'title', x.title,
               'actor_label', x.actor_label,
               'action', x.action
             ) ORDER BY x.created_at DESC, x.id DESC)
        FROM (
          SELECT a.id, a.created_at, a.action, c.title,
                 coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.nickname), ''), nullif(btrim(p.username), '')) AS actor_label
            FROM public.coupon_audit_events a
            JOIN public.store_coupon_campaigns c ON c.id = a.campaign_id
            LEFT JOIN public.profiles p ON p.id = a.actor_user_id
           ORDER BY a.created_at DESC, a.id DESC
           LIMIT 8
        ) x
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_store_coupon_campaign_page(text, text, uuid, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_coupon_campaign_page(text, text, uuid, uuid, integer, integer)
  TO service_role;
