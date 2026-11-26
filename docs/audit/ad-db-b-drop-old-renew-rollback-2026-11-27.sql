-- 되돌리기: supabase/migrations/20271127130000_ad_db_b_drop_old_feed_ad_renew.sql
-- 옛 정의 = 2026-11-27 운영 pg_get_functiondef 읽기 전용 조회 원문 (주석 포함 그대로).
CREATE OR REPLACE FUNCTION public.member_feed_ad_renew(p_user uuid, p_campaign uuid, p_product text, p_key text, p_expected_cost integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_camp public.feed_ad_campaigns%rowtype;
  v_req public.feed_ad_requests%rowtype;
  v_prod public.feed_ad_products%rowtype;
  v_key text := left(btrim(coalesce(p_key, '')), 128);
  v_related text;
  v_paid integer;
  v_status text;
  v_new_end timestamptz;
  v_spend jsonb;
  v_end timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user is null or p_campaign is null or v_key = '' or coalesce(btrim(p_product), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- ① 캠페인 잠금 — 같은 캠페인 연장은 차례로만 (같은 키 동시 2요청 → 1회)
  select * into v_camp from public.feed_ad_campaigns where id = p_campaign for update;
  if not found or v_camp.source <> 'MEMBER_REQUESTED' or v_camp.request_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_req from public.feed_ad_requests where id = v_camp.request_id for update;
  if not found or v_req.user_id is distinct from p_user then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- ② 같은 키 재전송: 이미 결제된 연장이면 지금 종료일만 돌려준다 (다시 늘리지 않음)
  v_related := left('renew:' || p_campaign::text || ':' || v_key, 200);
  select abs(l.amount)::integer into v_paid
    from public.point_ledger l
   where l.user_id = p_user and l.related_type = 'feed_ad_request' and l.related_id = v_related
   order by l.created_at asc
   limit 1;
  if found then
    -- 옛 TS 경로가 환급까지 한 키(renew-refund:)는 연장이 적용되지 않은 키 — 다시 쓰지 않는다
    if exists (
      select 1 from public.point_ledger l
       where l.user_id = p_user and l.related_type = 'feed_ad_request'
         and l.related_id = left('renew-refund:' || p_campaign::text || ':' || v_key, 200)
    ) then
      return jsonb_build_object('ok', false, 'error', 'not_renewable');
    end if;
    return jsonb_build_object('ok', true, 'idempotent', true, 'campaign_id', p_campaign,
      'end_at', v_camp.end_at, 'point_cost', v_paid);
  end if;

  -- ③ 새 연장 — 관리자 정지·종료는 회원 연장으로 우회할 수 없다 (feedAdRenewalBlockedByAdmin 과 같은 판정)
  v_status := lower(coalesce(v_camp.status, ''));
  if v_status = 'paused' and lower(coalesce(v_camp.paused_by, '')) = 'admin' then
    return jsonb_build_object('ok', false, 'error', 'admin_paused');
  end if;
  if v_status = 'ended' then
    return jsonb_build_object('ok', false, 'error', 'admin_ended');
  end if;
  if v_req.status in ('pending_review', 'rejected', 'cancelled') or v_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_renewable');
  end if;

  select * into v_prod from public.feed_ad_products where id = btrim(p_product);
  if not found or v_prod.is_active is not true
     or v_prod.duration_days < 1 or v_prod.duration_days > 90 or v_prod.point_cost < 1 then
    return jsonb_build_object('ok', false, 'error', 'product_not_found');
  end if;
  if v_prod.domain is distinct from v_camp.domain then
    return jsonb_build_object('ok', false, 'error', 'domain_mismatch');
  end if;
  if p_expected_cost is null or p_expected_cost <> v_prod.point_cost then
    return jsonb_build_object('ok', false, 'error', 'price_changed',
      'point_cost', v_prod.point_cost, 'duration_days', v_prod.duration_days);
  end if;

  -- 목표 종료일 = max(지금, 현재 종료일) + 기간 (computeFeedAdRenewalEndAt 과 같음) — 이 결제에서 1번만 계산
  v_new_end := greatest(now(), coalesce(v_camp.end_at, now())) + make_interval(days => v_prod.duration_days);

  begin
    v_spend := public.spend_user_points(
      p_user, v_prod.point_cost, 'ad_purchase', 'feed_ad_request', v_related,
      format('피드 배너 연장 — %s일 (%sP)', v_prod.duration_days, v_prod.point_cost), 'user');
    if coalesce((v_spend ->> 'ok')::boolean, false) is not true then
      if v_spend ->> 'error' = 'insufficient_balance' then
        return jsonb_build_object('ok', false, 'error', 'insufficient_balance');
      end if;
      raise exception 'member_feed_ad_renew_spend_failed:%', coalesce(v_spend ->> 'error', 'unknown');
    end if;
    if coalesce((v_spend ->> 'duplicate')::boolean, false) then
      -- 캠페인 잠금 아래에서는 생기지 않는다 (②에서 이미 걸러짐) — 연장하지 않고 멈춘다
      raise exception 'member_feed_ad_renew_duplicate_spend';
    end if;

    update public.feed_ad_campaigns
       set end_at = v_new_end, status = 'active', updated_at = now()
     where id = p_campaign
     returning end_at into v_end;

    update public.feed_ad_requests
       set status = 'active', end_at = v_new_end, duration_days = v_prod.duration_days,
           point_cost = v_prod.point_cost, product_id = v_prod.id, updated_at = now()
     where id = v_req.id and user_id = p_user;
  exception when raise_exception then
    -- ④ 자리 없음 → 이 블록의 차감·갱신 전부 롤백
    if sqlerrm = 'feed_ad_pool_capacity_full' then
      return jsonb_build_object('ok', false, 'error', 'capacity_full');
    end if;
    raise;
  end;

  return jsonb_build_object('ok', true, 'idempotent', false, 'campaign_id', p_campaign,
    'end_at', v_end, 'point_cost', v_prod.point_cost, 'duration_days', v_prod.duration_days);
end;
$function$;
REVOKE ALL ON FUNCTION public.member_feed_ad_renew(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_feed_ad_renew(uuid, uuid, text, text, integer) TO service_role;
