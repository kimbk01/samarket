-- v4 W5 · PL-04 데이터 소급 (1회 실행) — 관리자 숨김 감사 기록이 있는 숨김 매장만 O-04 잠금 소급.
-- 전제: 마이그레이션 20270708140000_stores_admin_visibility_lock_o04 적용 후 (컬럼 admin_visibility_locked·_at·_by).
--
-- 선정 규칙 (기록 없는 매장은 건드리지 않음):
--   현재 stores.is_visible = false AND admin_visibility_locked = false 이고,
--   그 매장의 audit_logs(target_type='store') 중 after_json 에 is_visible 이 있는 「마지막」 기록이
--     actor_type='admin' AND after_json->>'is_visible' = 'false' AND
--     action IN ('store.set_store_visible',   -- 관리자 노출 끄기 (단건·/api/admin/stores/bulk 일괄 → 같은 액션)
--                'store.set_store_kind')      -- 2026-10-28 B-1·O-1 legacy_test 전환 일괄 숨김(관리자, 사유·operator 기록)
--   인 매장. locked_at = 그 기록 created_at, locked_by = 그 기록 actor_id (기록에 actor 가 없으면 NULL).
--   (마지막 노출 기록이 켜기(resume_store·approve_store 등)면 그 뒤 숨김은 관리자 기록이 아니므로 제외.)
--
-- 운영 READ ONLY 확인값(2026-10-29 PHT): 숨김 매장 17곳 전부 해당 (legacy_test).
--   · 16곳: store.set_store_kind 2026-10-28 10:33:28 UTC, actor 11111111-1111-1111-1111-111111111111
--     (CCM CLOTHING LINE, CM KIM FOOD MART, CRYSTAL CLEAR, JTV, MAN-CHOO FOOD HUB, MANDOO CHOO.., MARKET MARKET,
--      MOTORTRADE CENTER, R5매장pfsjpy, R5매장pftn7p, TAP SILOG, VERGIE NI TEA, ZERO PHARMACY, 개장수, 나의 오른손딸방, 만두네집)
--   · 맛업는식당 076bffda-3048-4bfb-80ae-985a69105f4a: D-2 관리자 숨김 store.set_store_visible(false)
--     2026-10-29 08:22:30 UTC (사유 「Owner 승인 D-1/D-2」, actor_id NULL → locked_by NULL).
--     (그 전 10-28 set_store_kind 숨김 → resume_store 켜기 → 10-29 set_store_visible 끄기 순서 — 마지막 기록 기준.)
-- 실행: psql ... -v ON_ERROR_STOP=1 -f scripts/delivery-v4/pl04-admin-visibility-lock-backfill.sql
-- 롤백: UPDATE public.stores SET admin_visibility_locked=false, admin_visibility_locked_at=NULL, admin_visibility_locked_by=NULL
--         WHERE id IN (<이 스크립트 RETURNING 목록>);

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE pl04_targets ON COMMIT DROP AS
WITH last_vis AS (
  SELECT DISTINCT ON (a.target_id)
         a.target_id, a.created_at, a.actor_type, a.actor_id, a.action, a.after_json->>'is_visible' AS vis
    FROM public.audit_logs a
   WHERE a.target_type = 'store'
     AND a.after_json ? 'is_visible'
   ORDER BY a.target_id, a.created_at DESC, a.id DESC
)
SELECT s.id AS store_id, s.store_name, l.action, l.created_at AS locked_at, l.actor_id AS locked_by
  FROM public.stores s
  JOIN last_vis l ON l.target_id = s.id::text
 WHERE s.is_visible = false
   AND s.admin_visibility_locked = false
   AND l.actor_type = 'admin'
   AND l.vis = 'false'
   AND l.action IN ('store.set_store_visible', 'store.set_store_kind');

-- 대상 목록 (운영 확인값 17건)
SELECT store_id, store_name, action, locked_at, locked_by FROM pl04_targets ORDER BY store_name;

UPDATE public.stores s
   SET admin_visibility_locked = true,
       admin_visibility_locked_at = t.locked_at,
       admin_visibility_locked_by = t.locked_by
  FROM pl04_targets t
 WHERE s.id = t.store_id
   AND s.is_visible = false
   AND s.admin_visibility_locked = false
RETURNING s.id, s.store_name, s.admin_visibility_locked_at, s.admin_visibility_locked_by;

COMMIT;
