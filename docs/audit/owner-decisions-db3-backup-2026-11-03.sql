-- Owner 결정 DB 3건(O-10·O-6②) 적용 직전 운영 함수 정의 원문 (2026-11-03 PHT, ckdosyydvgzqwpbwuhon)
-- 되돌리기: admin_ads_workspace_page 는 새 9인자 함수를 DROP 한 뒤 아래 원문 실행 + GRANT EXECUTE TO service_role.

-- admin_ads_workspace_page md5=def5b2ec964bf37734c15c49589003b3
CREATE OR REPLACE FUNCTION public.admin_ads_workspace_page(p_mode text, p_status text, p_family text, p_store_id uuid, p_popup_winner_ids uuid[], p_pending_asset text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT CASE WHEN p_mode IN ('all', 'applications', 'operations', 'history', 'boosts') THEN p_mode ELSE 'all' END AS mode,
           CASE WHEN p_status IN ('pending', 'scheduled', 'live', 'waiting', 'incomplete', 'paused', 'ended', 'rejected')
                THEN p_status END AS tab,
           CASE WHEN p_family IN ('promote', 'banner', 'popup', 'sponsored') THEN p_family END AS fam,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           LEAST(100000, GREATEST(0, coalesce(p_offset, 0))) AS off
  ),
  -- 매장 범위: 배달·팝업 캠페인은 store_id 일치, 매장 연결 없는 원천(피드·상위노출)은 제외
  scoped AS (
    SELECT r.*, lower(r.domain) AS d, lower(coalesce(r.product, '')) AS p,
           r.domain IN ('trade_promote', 'community_promote') AS is_boost
      FROM public.admin_ads_workspace_rows(p_popup_winner_ids, p_pending_asset, now()) r
     WHERE p_store_id IS NULL OR r.store_id = p_store_id
  ),
  moded AS (
    SELECT s.*, m.mode
      FROM scoped s
     CROSS JOIN (VALUES ('all'), ('applications'), ('operations'), ('history'), ('boosts')) AS m(mode)
     WHERE CASE m.mode
             WHEN 'all' THEN true
             WHEN 'boosts' THEN s.is_boost
             WHEN 'history' THEN s.status_tab IN ('ended', 'rejected', 'paused')
             WHEN 'operations' THEN NOT s.is_boost
               AND (s.source_kind = 'admin_direct' OR s.entity = 'execution' OR s.family = 'popup_campaign')
               AND s.status_tab IN ('scheduled', 'live', 'waiting', 'paused', 'incomplete', 'ended')
             WHEN 'applications' THEN NOT s.is_boost
               AND s.source_kind IS DISTINCT FROM 'admin_direct'
               AND s.d <> 'popup'
               AND s.family <> 'feed_campaign'
               AND (s.family = 'feed_request'
                    OR (s.d = 'delivery' AND (strpos(s.p, 'sponsored') > 0 OR strpos(s.p, 'store_promote') > 0
                                              OR strpos(s.p, 'banner') > 0)))
               AND s.status_tab IN ('pending', 'incomplete', 'rejected')
           END
  ),
  filtered AS (
    SELECT m.*
      FROM moded m, params pr
     WHERE m.mode = pr.mode
       AND (pr.tab IS NULL OR m.status_tab = pr.tab)
       AND (pr.fam IS NULL OR CASE pr.fam
             WHEN 'promote' THEN m.d IN ('trade_promote', 'community_promote')
               OR strpos(m.p, 'promote') > 0 OR strpos(m.p, 'boost') > 0
             WHEN 'popup' THEN m.d = 'popup' OR strpos(m.p, 'popup') > 0
             WHEN 'sponsored' THEN strpos(m.p, 'sponsored') > 0 OR strpos(m.p, 'store_promote') > 0
             ELSE (m.d = 'delivery' AND strpos(m.p, 'sponsored') = 0) OR m.d = 'feed'
               OR (strpos(m.p, 'banner') > 0 AND strpos(m.p, 'sponsored') = 0)
           END)
  ),
  paged AS (
    SELECT f.family, f.family_ord, f.source_id, f.item_id, f.at
      FROM filtered f
     ORDER BY f.at DESC NULLS LAST, f.family_ord, f.item_id COLLATE "C" DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  ),
  counts AS (
    SELECT mode, status_tab, count(*) AS n FROM moded GROUP BY mode, status_tab
  ),
  popup_groups AS (
    SELECT s.popup_surfaces AS surfaces,
           coalesce(jsonb_agg(s.source_id ORDER BY s.at DESC, s.item_id COLLATE "C" DESC)
                      FILTER (WHERE s.status_tab = 'live'), '[]'::jsonb) AS live_ids,
           coalesce(jsonb_agg(s.source_id ORDER BY s.at DESC, s.item_id COLLATE "C" DESC)
                      FILTER (WHERE s.status_tab = 'waiting'), '[]'::jsonb) AS waiting_ids,
           count(*) FILTER (WHERE s.status_tab = 'incomplete') AS incomplete_n,
           count(*) FILTER (WHERE s.status_tab = 'scheduled') AS scheduled_n
      FROM scoped s
     WHERE s.family = 'popup_campaign'
     GROUP BY s.popup_surfaces
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('family', pg.family, 'source_id', pg.source_id, 'item_id', pg.item_id)
                       ORDER BY pg.at DESC NULLS LAST, pg.family_ord, pg.item_id COLLATE "C" DESC)
        FROM paged pg
    ), '[]'::jsonb),
    -- 화면 모드별 상태 탭 개수 (요약 카드 = 대시보드 광고 지표)
    'summary_counts', (
      SELECT jsonb_object_agg(m.mode, coalesce((
               SELECT jsonb_object_agg(c.status_tab, c.n) FROM counts c WHERE c.mode = m.mode), '{}'::jsonb))
        FROM (VALUES ('all'), ('applications'), ('operations'), ('history'), ('boosts')) AS m(mode)
    ),
    -- 원천별 처리 대기 (control plane queues) — 매장 범위에서는 매장 연결 없는 원천이므로 0
    'queue_counts', jsonb_build_object(
      'feed_pending', CASE WHEN p_store_id IS NOT NULL THEN 0 ELSE (
        SELECT count(*) FROM public.feed_ad_requests r
         WHERE lower(btrim(coalesce(r.status, ''))) IN ('pending_review', 'pending', 'held')) END,
      'trade_pending', CASE WHEN p_store_id IS NOT NULL THEN 0 ELSE (
        SELECT count(*) FROM public.point_promotion_orders o
         WHERE o.domain = 'trade' AND lower(o.order_status) = 'pending_review') END,
      'community_pending', CASE WHEN p_store_id IS NOT NULL THEN 0 ELSE (
        SELECT count(*) FROM public.point_promotion_orders o
         WHERE o.domain = 'community' AND lower(o.order_status) = 'pending_review') END
    ),
    'popup_surfaces', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'surfaces', g.surfaces, 'live_ids', g.live_ids, 'waiting_ids', g.waiting_ids,
               'incomplete', g.incomplete_n, 'scheduled', g.scheduled_n) ORDER BY g.surfaces)
        FROM popup_groups g
    ), '[]'::jsonb)
  );
$function$
;

-- admin_promotion_end md5=4b3d6e903ce194fb37d0bf825722b715
CREATE OR REPLACE FUNCTION public.admin_promotion_end(p_order_id uuid, p_actor_id uuid, p_reason_code text, p_fault text, p_reason text, p_preview boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_paid integer;
  v_total numeric;
  v_paused numeric;
  v_used numeric;
  v_remaining numeric;
  v_refund integer := 0;
  v_ledger uuid;
  v_sum integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(p_fault, '') not in ('operator', 'member', 'none') then
    return jsonb_build_object('ok', false, 'error', 'fault_required');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.order_status not in ('active', 'paused') then
    return jsonb_build_object('ok', false, 'error', 'not_running');
  end if;
  -- R2: 첫 결제 + 연장 결제 합계 (연장하면 duration_days 도 늘어 남은 비율과 맞는다)
  select nullif(coalesce(sum(abs(amount)), 0), 0)::integer into v_paid from public.point_ledger
   where related_type = 'promotion_order' and related_id = p_order_id::text
     and entry_type in ('spend', 'promotion_extend');
  v_total := greatest(1, v_row.duration_days) * 86400.0;
  v_paused := coalesce(v_row.paused_seconds_total, 0)
    + case when v_row.order_status = 'paused' and v_row.paused_at is not null
           then greatest(0, extract(epoch from (now() - v_row.paused_at))) else 0 end;
  v_used := greatest(0, extract(epoch from (now() - v_row.start_at)) - v_paused);
  v_remaining := greatest(0, least(v_total, v_total - v_used));
  if p_fault = 'operator' and coalesce(v_paid, 0) > 0 then
    v_refund := floor(v_paid * v_remaining / v_total)::integer;
  end if;
  if p_preview then
    return jsonb_build_object('ok', true, 'preview', true, 'refund_points', v_refund,
      'paid_points', coalesce(v_paid, 0), 'remaining_seconds', floor(v_remaining),
      'has_payment_record', v_paid is not null);
  end if;
  if v_refund > 0 then
    perform 1 from public.profiles where id = v_row.user_id for update;
    v_sum := public.sum_user_point_ledger(v_row.user_id);
    insert into public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
    values
      (v_row.user_id, 'refund', v_refund, v_sum + v_refund, 'promotion_order', p_order_id::text,
       '홍보 종료 환급 (운영 사유)', 'admin', p_actor_id)
    returning id into v_ledger;
    perform public.project_user_point_balance_from_ledger(v_row.user_id);
  end if;
  update public.point_promotion_orders
     set order_status = 'ended', ended_at = now(), end_at = least(end_at, now()), paused_at = null,
         paused_seconds_total = floor(v_paused)::integer, ended_by = p_actor_id,
         end_reason_code = left(coalesce(p_reason_code, 'admin_end'), 64), fault = p_fault,
         review_reason = left(trim(p_reason), 500), refund_points = v_refund, refund_ledger_id = v_ledger
   where id = p_order_id;
  return jsonb_build_object('ok', true, 'order_status', 'ended', 'refund_points', v_refund,
    'refund_ledger_id', v_ledger, 'has_payment_record', v_paid is not null);
end; $function$
;
