-- =============================================================================
-- 어드민 광고 삭제 · 삭제 표시 · 삭제 취소 (R2 · Owner 「설계안대로 진행」 2026-11-07)
-- 설계: docs/audit/ads-admin-ssot-design-2026-11-07.md §3-1 · §3-2 (AD2-10 · AD2-11) · A-2(삭제 취소 둔다)
--
-- 1) 광고 원천 표 7개에 삭제 표시 칸(deleted_at · deleted_by · delete_reason)
-- 2) public.admin_ad_delete(p_kind, p_id, p_admin, p_reason, p_fault, p_preview) → jsonb
--      {ok, preview, mode hard|soft|end_and_soft, refund_amount, refund_unit point|business_cash|none, needs_fault, error}
--    상태별(한 트랜잭션 · 사유 2자 이상 · audit_logs 「ad.delete」 1행):
--      · 운영자 초안 · 이력 0                         → 완전 삭제(hard)
--      · 검토 대기 · 반려 · 종료 · 기간 만료 · 회원/사장님 초안(결제 0) → 삭제 표시(soft)
--      · 노출 중 · 예약 · 정지                         → 기존 종료 함수(귀책·환급 규칙 그대로) + 삭제 표시(end_and_soft)
--        결제 없는 광고는 귀책 없이(fault 'none'), 결제 있는 광고는 p_fault 필수 · p_preview=true 는 쓰기 없이 환급만 계산
--      · 결제가 보류 중인 검토 대기(포인트 hold held · 배달 SECURED 선결제 · 사장님 팝업 선결제) → 거부 payment_held
--        (보류된 돈을 숨기면 환급 경로가 사라진다 — 먼저 반려해 돌려준 뒤 삭제한다)
--      · 노출 중인 사장님 유료 팝업 → 거부 popup_paid_running (팝업 종료 환급 함수가 없다 · 운영 해당 0건)
--    종료는 운영 정의 그대로 호출(pg_get_functiondef 2026-11-07 확인 · 이름 지정 인자):
--      admin_trade_promotion_end · admin_promotion_end · admin_feed_ad_end(M1 20271107200xxx 의 p_screen 인자 · 'ads_delete') ·
--      admin_delivery_ad_end_with_refund ·
--      팝업/PTR = status → ended(관리자 전이와 같음) · 인트로 = launch_intro_set_state('unpublish') ·
--      마이 배너 = status hidden(기존 「숨김 보관」) · 이벤트 배포 = enabled false · status disabled
-- 3) public.admin_ad_undelete(p_kind, p_id, p_admin, p_reason) → jsonb {ok, error}
--      삭제 표시만 되돌린다(종료·환급은 되돌리지 않는다) · audit_logs 「ad.undelete」 1행
--      마이 배너: 삭제 전 상태로(노출 중·정지였으면 정지로) · 인트로: 표시만(게시 해제는 그대로)
-- 4) public.admin_ads_deleted_rows(p_limit, p_offset) → jsonb {total, rows} — 이력 「삭제됨」 목록
--
-- 롤백:
--   drop function if exists public.admin_ads_deleted_rows(integer, integer);
--   drop function if exists public.admin_ad_undelete(text, uuid, uuid, text);
--   drop function if exists public.admin_ad_delete(text, uuid, uuid, text, text, boolean);
--   drop function if exists public.admin_ad_delete_mark_of(text, uuid);
--   alter table public.point_promotion_orders drop column if exists deleted_at, drop column if exists deleted_by, drop column if exists delete_reason;
--   (feed_ad_requests · feed_ad_campaigns · platform_popup_campaigns · store_banner_ad_campaigns ·
--    store_paid_ad_campaigns · platform_promotion_distributions 도 같은 3칸 drop)
-- =============================================================================

alter table public.point_promotion_orders
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null,
  add column if not exists delete_reason text null;
alter table public.feed_ad_requests
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null,
  add column if not exists delete_reason text null;
alter table public.feed_ad_campaigns
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null,
  add column if not exists delete_reason text null;
alter table public.platform_popup_campaigns
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null,
  add column if not exists delete_reason text null;
alter table public.store_banner_ad_campaigns
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null,
  add column if not exists delete_reason text null;
alter table public.store_paid_ad_campaigns
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null,
  add column if not exists delete_reason text null;
alter table public.platform_promotion_distributions
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null,
  add column if not exists delete_reason text null;

create index if not exists point_promotion_orders_deleted_at_idx
  on public.point_promotion_orders (deleted_at) where deleted_at is not null;
create index if not exists feed_ad_requests_deleted_at_idx
  on public.feed_ad_requests (deleted_at) where deleted_at is not null;
create index if not exists feed_ad_campaigns_deleted_at_idx
  on public.feed_ad_campaigns (deleted_at) where deleted_at is not null;
create index if not exists platform_popup_campaigns_deleted_at_idx
  on public.platform_popup_campaigns (deleted_at) where deleted_at is not null;
create index if not exists store_banner_ad_campaigns_deleted_at_idx
  on public.store_banner_ad_campaigns (deleted_at) where deleted_at is not null;
create index if not exists store_paid_ad_campaigns_deleted_at_idx
  on public.store_paid_ad_campaigns (deleted_at) where deleted_at is not null;
create index if not exists platform_promotion_distributions_deleted_at_idx
  on public.platform_promotion_distributions (deleted_at) where deleted_at is not null;

-- 삭제 칸이 없는 종류(마이 배너 · 인트로)의 삭제 표시 = 마지막 ad.delete / ad.undelete 감사 행.
create or replace function public.admin_ad_delete_mark_of(p_kind text, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when a.action = 'ad.delete'
              then jsonb_build_object('deleted_at', a.created_at, 'deleted_by', a.actor_id,
                                      'delete_reason', a.after_json->>'reason', 'before', a.before_json)
              else null end
    from public.audit_logs a
   where a.target_type = 'ad:' || p_kind
     and a.target_id = p_id::text
     and a.action in ('ad.delete', 'ad.undelete')
   order by a.created_at desc, a.id desc
   limit 1;
$function$;

create or replace function public.admin_ad_delete(
  p_kind text,
  p_id uuid,
  p_admin uuid,
  p_reason text,
  p_fault text default null,
  p_preview boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_fault_in text := lower(nullif(btrim(coalesce(p_fault, '')), ''));
  v_preview boolean := coalesce(p_preview, false);
  v_now timestamptz := now();
  v_mode text;
  v_unit text := 'none';
  v_paid numeric := 0;
  v_refund numeric := 0;
  v_needs_fault boolean := false;
  v_fault text;
  v_before jsonb := '{}'::jsonb;
  v_extra jsonb := '{}'::jsonb;
  v_end jsonb;
  v_pv jsonb;
  v_running boolean := false;
  v_hard boolean := false;
  v_ppo public.point_promotion_orders%rowtype;
  v_req public.feed_ad_requests%rowtype;
  v_cmp public.feed_ad_campaigns%rowtype;
  v_has_req boolean := false;
  v_has_cmp boolean := false;
  v_pop public.platform_popup_campaigns%rowtype;
  v_owner boolean;
  v_funded boolean;
  v_pk text;
  v_life text;
  v_source text;
  v_end_at timestamptz;
  v_creative uuid;
  v_chain uuid[] := '{}';
  v_cur uuid;
  v_i integer;
  v_dist public.platform_promotion_distributions%rowtype;
  v_ban public.my_page_banners%rowtype;
  v_live public.launch_intro_live%rowtype;
  v_mark jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_admin is null or p_id is null or not public.is_platform_admin(p_admin) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_reason is null or length(v_reason) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if v_kind not in ('trade_promotion', 'community_promotion', 'feed_request', 'feed_campaign', 'popup_campaign',
                    'ptr', 'delivery_banner', 'delivery_sponsored', 'event_distribution', 'my_banner', 'intro') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if v_fault_in is not null and v_fault_in not in ('operator', 'advertiser', 'member', 'owner', 'none') then
    return jsonb_build_object('ok', false, 'error', 'invalid_fault');
  end if;

  -- ─── 거래 · 커뮤니티 상위노출 (회원 포인트 결제 — 완전 삭제 없음) ───
  if v_kind in ('trade_promotion', 'community_promotion') then
    select * into v_ppo from public.point_promotion_orders where id = p_id for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if (v_kind = 'trade_promotion') <> (v_ppo.domain = 'trade') then
      return jsonb_build_object('ok', false, 'error', 'kind_mismatch');
    end if;
    if v_ppo.deleted_at is not null then return jsonb_build_object('ok', false, 'error', 'already_deleted'); end if;
    v_before := jsonb_build_object('order_status', v_ppo.order_status, 'end_at', v_ppo.end_at);
    v_unit := 'point';
    v_running := v_ppo.order_status in ('active', 'paused') and (v_ppo.end_at is null or v_ppo.end_at > v_now);
    if v_running then
      v_mode := 'end_and_soft';
      if v_kind = 'trade_promotion' then
        v_pv := public.admin_trade_promotion_end(p_order_id => p_id, p_actor_id => p_admin, p_reason_code => 'admin_delete',
                  p_fault => 'operator', p_reason => v_reason, p_preview => true);
      else
        v_pv := public.admin_promotion_end(p_order_id => p_id, p_actor_id => p_admin, p_reason_code => 'admin_delete',
                  p_fault => 'operator', p_reason => v_reason, p_preview => true);
      end if;
      if coalesce((v_pv->>'ok')::boolean, false) is not true then
        return jsonb_build_object('ok', false, 'error', 'end_failed', 'end_error', v_pv->>'error');
      end if;
      v_paid := coalesce((v_pv->>'paid_points')::numeric, 0);
    elsif v_ppo.order_status in ('pending_review', 'pending')
          and exists (select 1 from public.promotion_point_holds h where h.promotion_order_id = p_id and h.status = 'held') then
      return jsonb_build_object('ok', false, 'error', 'payment_held');
    else
      v_mode := 'soft';
    end if;

  -- ─── 피드 배너 (회원 신청 = 신청 + 캠페인 한 광고 · 운영자 직접) ───
  elsif v_kind in ('feed_request', 'feed_campaign') then
    if v_kind = 'feed_request' then
      select * into v_req from public.feed_ad_requests where id = p_id for update;
      if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
      v_has_req := true;
      if v_req.campaign_id is not null then
        select * into v_cmp from public.feed_ad_campaigns where id = v_req.campaign_id for update;
        v_has_cmp := found;
      end if;
    else
      select * into v_cmp from public.feed_ad_campaigns where id = p_id for update;
      if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
      v_has_cmp := true;
      if v_cmp.request_id is not null then
        select * into v_req from public.feed_ad_requests where id = v_cmp.request_id for update;
        v_has_req := found;
      end if;
    end if;
    if (v_has_req and v_req.deleted_at is not null) or (v_has_cmp and v_cmp.deleted_at is not null) then
      return jsonb_build_object('ok', false, 'error', 'already_deleted');
    end if;
    v_before := jsonb_build_object(
      'request_status', case when v_has_req then v_req.status end,
      'campaign_status', case when v_has_cmp then v_cmp.status end,
      'campaign_source', case when v_has_cmp then v_cmp.source end,
      'end_at', case when v_has_cmp then v_cmp.end_at else v_req.end_at end);
    v_extra := jsonb_build_object('request_id', case when v_has_req then v_req.id end,
                                  'campaign_id', case when v_has_cmp then v_cmp.id end);
    v_unit := case when v_has_req then 'point' else 'none' end;
    v_running := v_has_cmp and v_cmp.status in ('scheduled', 'active', 'paused')
                 and (v_cmp.end_at is null or v_cmp.end_at > v_now);
    if v_running then
      v_mode := 'end_and_soft';
      v_pv := public.admin_feed_ad_end(p_campaign_id => v_cmp.id, p_admin_id => p_admin, p_fault => 'operator',
                p_public_reason => null, p_internal_reason => null, p_preview => true,
                p_screen => 'ads_delete');
      if coalesce((v_pv->>'ok')::boolean, false) is not true then
        return jsonb_build_object('ok', false, 'error', 'end_failed', 'end_error', v_pv->>'error');
      end if;
      v_paid := coalesce((v_pv->>'paid_points')::numeric, 0);
    elsif v_has_req and v_req.status in ('pending_review', 'approved')
          and exists (select 1 from public.feed_ad_point_holds h where h.request_id = v_req.id and h.status = 'held') then
      return jsonb_build_object('ok', false, 'error', 'payment_held');
    elsif not v_has_req and v_has_cmp and v_cmp.source = 'ADMIN_DIRECT' and v_cmp.status = 'draft'
          and coalesce(v_cmp.impression_count, 0) = 0 and coalesce(v_cmp.click_count, 0) = 0
          and not exists (select 1 from public.feed_ad_events e where e.campaign_id = v_cmp.id)
          and not exists (select 1 from public.platform_promotion_distributions d
                           where d.channel_ref_type = 'feed_ad_campaign' and d.channel_ref_id = v_cmp.id) then
      v_mode := 'hard';
    else
      v_mode := 'soft';
    end if;

  -- ─── 운영자 팝업 · 사장님 팝업 · PTR 띠 ───
  elsif v_kind in ('popup_campaign', 'ptr') then
    select * into v_pop from public.platform_popup_campaigns where id = p_id for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if (v_kind = 'ptr') <> (v_pop.presentation_type = 'ptr_reveal') then
      return jsonb_build_object('ok', false, 'error', 'kind_mismatch');
    end if;
    if v_pop.deleted_at is not null then return jsonb_build_object('ok', false, 'error', 'already_deleted'); end if;
    v_before := jsonb_build_object('status', v_pop.status, 'approval_status', v_pop.approval_status, 'end_at', v_pop.end_at);
    v_owner := v_pop.owner_store_id is not null or v_pop.owner_request_id is not null;
    v_funded := v_owner and exists (
      select 1 from public.platform_popup_owner_requests rq
        join public.delivery_ad_canonical_bc_fundings f
          on f.product_kind = 'platform_popup' and f.application_id = rq.id and f.status = 'SECURED'
       where rq.id = v_pop.owner_request_id or rq.admin_campaign_id = v_pop.id);
    v_unit := case when v_owner then 'business_cash' else 'none' end;
    v_running := v_pop.status in ('approved', 'scheduled', 'active', 'paused')
                 and (v_pop.end_at is null or v_pop.end_at > v_now);
    if v_running then
      if v_funded then return jsonb_build_object('ok', false, 'error', 'popup_paid_running'); end if;
      v_mode := 'end_and_soft';
    elsif v_pop.status in ('draft', 'pending_review') and v_funded then
      return jsonb_build_object('ok', false, 'error', 'payment_held');
    elsif not v_owner and v_pop.status in ('draft', 'pending_review')
          and not exists (select 1 from public.platform_popup_campaign_events e where e.campaign_id = v_pop.id)
          and not exists (select 1 from public.platform_promotion_distributions d
                           where d.channel_ref_type = 'platform_popup_campaign' and d.channel_ref_id = v_pop.id) then
      v_mode := 'hard';
    else
      v_mode := 'soft';
    end if;

  -- ─── 배달 광고 (홈 히어로·중간·업종 상단·검색 상단 = 배너 · 매장 홍보) ───
  elsif v_kind in ('delivery_banner', 'delivery_sponsored') then
    v_pk := case when v_kind = 'delivery_banner' then 'banner' else 'store_sponsored' end;
    if v_pk = 'banner' then
      select lifecycle_status, coalesce(campaign_source, 'OWNER_PAID'), end_at, creative_id
        into v_life, v_source, v_end_at, v_creative
        from public.store_banner_ad_campaigns where id = p_id for update;
      if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
      if (select deleted_at from public.store_banner_ad_campaigns where id = p_id) is not null then
        return jsonb_build_object('ok', false, 'error', 'already_deleted');
      end if;
    else
      select lifecycle_status, coalesce(campaign_source, 'OWNER_PAID'), end_at
        into v_life, v_source, v_end_at
        from public.store_paid_ad_campaigns where id = p_id for update;
      if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
      if (select deleted_at from public.store_paid_ad_campaigns where id = p_id) is not null then
        return jsonb_build_object('ok', false, 'error', 'already_deleted');
      end if;
    end if;
    v_before := jsonb_build_object('lifecycle_status', v_life, 'campaign_source', v_source, 'end_at', v_end_at);
    v_unit := case when v_source = 'DIBAY_FIRST_PARTY' then 'none' else 'business_cash' end;
    v_funded := v_source <> 'DIBAY_FIRST_PARTY' and exists (
      select 1 from public.delivery_ad_canonical_bc_fundings f
       where f.product_kind = v_pk and f.application_id = p_id and f.status = 'SECURED');
    v_running := v_life in ('ACTIVE', 'SCHEDULED', 'PAUSED_ADMIN', 'PAUSED_OWNER') and v_end_at > v_now;
    if v_running then
      v_mode := 'end_and_soft';
      v_pv := public.admin_delivery_ad_end_with_refund(p_campaign_id => p_id, p_admin_id => p_admin,
                p_fault => 'operator', p_reason => v_reason, p_preview => true);
      if coalesce((v_pv->>'ok')::boolean, false) is not true then
        return jsonb_build_object('ok', false, 'error', 'end_failed', 'end_error', v_pv->>'error');
      end if;
      v_paid := coalesce((v_pv->>'paid_amount')::numeric, 0);
    elsif v_funded and v_life in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED') then
      return jsonb_build_object('ok', false, 'error', 'payment_held');
    elsif v_source = 'DIBAY_FIRST_PARTY' and v_life = 'DRAFT'
          and not exists (select 1 from public.delivery_ad_impression_events x where x.campaign_id = p_id and x.product_kind = v_pk)
          and not exists (select 1 from public.delivery_ad_click_events x where x.campaign_id = p_id and x.product_kind = v_pk)
          and not exists (select 1 from public.delivery_ad_order_attributions x where x.campaign_id = p_id and x.product_kind = v_pk)
          and not exists (select 1 from public.delivery_ad_charge_ledger x where x.campaign_id = p_id and x.product_kind = v_pk)
          and not exists (select 1 from public.delivery_ad_refund_ledger x where x.campaign_id = p_id)
          and not exists (select 1 from public.delivery_ad_business_cash_ledger x where x.campaign_id = p_id and x.product_kind = v_pk)
          and not exists (select 1 from public.delivery_ad_campaign_fundings x where x.campaign_id = p_id and x.product_kind = v_pk)
          and not exists (select 1 from public.delivery_ad_store_cash_spends x where x.campaign_id = p_id and x.product_kind = v_pk)
          and not exists (select 1 from public.delivery_ad_canonical_bc_fundings x where x.application_id = p_id and x.product_kind = v_pk)
          and not exists (select 1 from public.delivery_ad_operations_cases x
                           where x.product_kind = v_pk
                             and (x.banner_campaign_id = p_id or x.store_sponsored_campaign_id = p_id))
          -- 막는 감사 행 (생성·초안 편집 기록은 막지 않음 · lib/stores/advertising/admin-delivery-ad-delete.ts 와 같은 목록)
          and not exists (select 1 from public.delivery_ad_audit_logs x
                           where x.campaign_id = p_id and x.product_kind = v_pk
                             and btrim(coalesce(x.action, '')) <> ''
                             and x.action not like 'draft\_%'
                             and x.action not in ('owner_sponsored_create_draft', 'owner_sponsored_update_draft',
                                                  'owner_banner_create_draft', 'owner_banner_update_draft',
                                                  'admin_first_party_banner_create', 'updated', 'inventory_changed',
                                                  'creative_replaced', 'destination_changed', 'creative_removed')) then
      v_mode := 'hard';
    else
      v_mode := 'soft';
    end if;

  -- ─── 이벤트 배포(이벤트 히어로 배너 등) — 결제 없음 ───
  elsif v_kind = 'event_distribution' then
    select * into v_dist from public.platform_promotion_distributions where id = p_id for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if v_dist.deleted_at is not null then return jsonb_build_object('ok', false, 'error', 'already_deleted'); end if;
    v_before := jsonb_build_object('enabled', v_dist.enabled, 'status', v_dist.status, 'channel', v_dist.channel);
    v_mode := case when v_dist.enabled then 'end_and_soft' else 'soft' end;

  -- ─── 마이 배너 — 삭제 표시 = 기존 「숨김 보관」(status hidden) · 게시한 적 없는 초안만 완전 삭제 ───
  elsif v_kind = 'my_banner' then
    select * into v_ban from public.my_page_banners where id = p_id for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if public.admin_ad_delete_mark_of('my_banner', p_id) is not null then
      return jsonb_build_object('ok', false, 'error', 'already_deleted');
    end if;
    v_before := jsonb_build_object('status', v_ban.status, 'is_active', v_ban.is_active);
    v_hard := v_ban.status = 'draft'
      and coalesce(v_ban.impression_count, 0) = 0 and coalesce(v_ban.click_count, 0) = 0
      and not exists (select 1 from public.admin_banner_change_logs l where l.banner_id = p_id and l.action_type = 'activate')
      and not exists (select 1 from public.audit_logs a
                       where a.target_id = p_id::text and a.action in ('banner.create', 'banner.update')
                         and (a.after_json->>'status' = 'active' or a.before_json->>'status' = 'active'));
    v_mode := case when v_hard then 'hard'
                   when v_ban.status in ('active', 'paused') then 'end_and_soft'
                   else 'soft' end;

  -- ─── 인트로 — 게시본 1개 = 1행 · 게시본은 고칠 수 없다(보관) · 노출 중이면 게시 해제 ───
  else
    if not exists (select 1 from public.launch_intro_publications where id = p_id) then
      if exists (select 1 from public.launch_intro_drafts where id = p_id) then
        return jsonb_build_object('ok', false, 'error', 'intro_draft_use_editor');
      end if;
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if public.admin_ad_delete_mark_of('intro', p_id) is not null then
      return jsonb_build_object('ok', false, 'error', 'already_deleted');
    end if;
    select * into v_live from public.launch_intro_live where id = 'default' for update;
    v_before := jsonb_build_object('live_state', v_live.state, 'live', v_live.publication_id = p_id);
    v_mode := case when v_live.publication_id = p_id and v_live.state in ('active', 'paused')
                   then 'end_and_soft' else 'soft' end;
  end if;

  -- ─── 귀책 ───
  v_needs_fault := v_mode = 'end_and_soft' and v_paid > 0;
  if v_needs_fault then
    if v_fault_in is null then
      if not v_preview then return jsonb_build_object('ok', false, 'error', 'fault_required', 'needs_fault', true); end if;
      v_fault := 'none';
    else
      v_fault := v_fault_in;
    end if;
  else
    v_fault := 'none';
  end if;
  -- 종료 함수마다 받는 값: 포인트(상위노출·피드) = operator|member|none · 배달 = operator|owner|member|none
  if v_fault in ('advertiser', 'owner', 'member') then
    v_fault := case when v_kind in ('delivery_banner', 'delivery_sponsored') then 'owner' else 'member' end;
  end if;

  -- ─── 미리보기 (쓰기 없음) ───
  if v_preview then
    if v_needs_fault then
      if v_kind = 'trade_promotion' then
        v_pv := public.admin_trade_promotion_end(p_order_id => p_id, p_actor_id => p_admin, p_reason_code => 'admin_delete',
                  p_fault => v_fault, p_reason => v_reason, p_preview => true);
        v_refund := coalesce((v_pv->>'refund_points')::numeric, 0);
      elsif v_kind = 'community_promotion' then
        v_pv := public.admin_promotion_end(p_order_id => p_id, p_actor_id => p_admin, p_reason_code => 'admin_delete',
                  p_fault => v_fault, p_reason => v_reason, p_preview => true);
        v_refund := coalesce((v_pv->>'refund_points')::numeric, 0);
      elsif v_kind in ('feed_request', 'feed_campaign') then
        v_pv := public.admin_feed_ad_end(p_campaign_id => v_cmp.id, p_admin_id => p_admin, p_fault => v_fault,
                  p_public_reason => null, p_internal_reason => null, p_preview => true,
                p_screen => 'ads_delete');
        v_refund := coalesce((v_pv->>'refund_points')::numeric, 0);
      else
        v_pv := public.admin_delivery_ad_end_with_refund(p_campaign_id => p_id, p_admin_id => p_admin,
                  p_fault => v_fault, p_reason => v_reason, p_preview => true);
        v_refund := coalesce((v_pv->>'refund_amount')::numeric, 0);
      end if;
    end if;
    return jsonb_build_object('ok', true, 'preview', true, 'kind', v_kind, 'id', p_id, 'mode', v_mode,
      'refund_amount', v_refund, 'paid_amount', v_paid, 'refund_unit', v_unit, 'needs_fault', v_needs_fault);
  end if;

  -- ─── 실행 (한 트랜잭션 — 아래 어느 단계든 실패하면 전부 되돌아간다) ───
  if v_mode = 'end_and_soft' then
    if v_kind = 'trade_promotion' then
      v_end := public.admin_trade_promotion_end(p_order_id => p_id, p_actor_id => p_admin, p_reason_code => 'admin_delete',
                 p_fault => v_fault, p_reason => v_reason, p_preview => false);
      v_refund := coalesce((v_end->>'refund_points')::numeric, 0);
    elsif v_kind = 'community_promotion' then
      v_end := public.admin_promotion_end(p_order_id => p_id, p_actor_id => p_admin, p_reason_code => 'admin_delete',
                 p_fault => v_fault, p_reason => v_reason, p_preview => false);
      v_refund := coalesce((v_end->>'refund_points')::numeric, 0);
    elsif v_kind in ('feed_request', 'feed_campaign') then
      v_end := public.admin_feed_ad_end(p_campaign_id => v_cmp.id, p_admin_id => p_admin, p_fault => v_fault,
                 p_public_reason => left(v_reason, 120), p_internal_reason => v_reason, p_preview => false,
                 p_screen => 'ads_delete');
      v_refund := coalesce((v_end->>'refund_points')::numeric, 0);
    elsif v_kind in ('delivery_banner', 'delivery_sponsored') then
      v_end := public.admin_delivery_ad_end_with_refund(p_campaign_id => p_id, p_admin_id => p_admin,
                 p_fault => v_fault, p_reason => v_reason, p_preview => false);
      v_refund := coalesce((v_end->>'refund_amount')::numeric, 0);
    elsif v_kind in ('popup_campaign', 'ptr') then
      update public.platform_popup_campaigns set status = 'ended', updated_at = v_now where id = p_id;
      v_end := jsonb_build_object('ok', true, 'status', 'ended');
    elsif v_kind = 'event_distribution' then
      update public.platform_promotion_distributions
         set enabled = false, status = 'disabled', updated_by = p_admin, updated_at = v_now
       where id = p_id;
      v_end := jsonb_build_object('ok', true, 'status', 'disabled');
    elsif v_kind = 'intro' then
      perform public.launch_intro_set_state('unpublish', null, p_admin);
      v_end := jsonb_build_object('ok', true, 'state', 'unpublished');
    else
      v_end := jsonb_build_object('ok', true, 'status', 'hidden');
    end if;
    if coalesce((v_end->>'ok')::boolean, false) is not true then
      raise exception 'admin_ad_delete_end_failed:%', coalesce(v_end->>'error', 'unknown');
    end if;
  end if;

  if v_mode = 'hard' then
    if v_kind = 'feed_campaign' then
      delete from public.feed_ad_campaigns where id = p_id;
    elsif v_kind in ('popup_campaign', 'ptr') then
      delete from public.platform_popup_campaigns where id = p_id;
    elsif v_kind = 'delivery_banner' then
      -- 소재 이전 판(supersedes 사슬)까지 모은 뒤 다른 캠페인이 쓰지 않는 것만 정리
      v_cur := v_creative;
      v_i := 0;
      while v_cur is not null and v_i < 20 and not (v_cur = any (v_chain)) loop
        v_chain := v_chain || v_cur;
        select supersedes_creative_id into v_cur from public.delivery_ad_creatives where id = v_cur;
        v_i := v_i + 1;
      end loop;
      delete from public.store_banner_ad_campaigns where id = p_id;
      delete from public.delivery_ad_creatives c
       where c.id = any (v_chain)
         and not exists (select 1 from public.store_banner_ad_campaigns b where b.creative_id = c.id);
      v_extra := v_extra || jsonb_build_object('creative_ids', to_jsonb(v_chain));
    elsif v_kind = 'delivery_sponsored' then
      delete from public.store_paid_ad_campaigns where id = p_id;
    elsif v_kind = 'my_banner' then
      delete from public.my_page_banners where id = p_id;
    end if;
  else
    -- 삭제 표시
    if v_kind in ('trade_promotion', 'community_promotion') then
      update public.point_promotion_orders set deleted_at = v_now, deleted_by = p_admin, delete_reason = v_reason where id = p_id;
    elsif v_kind in ('feed_request', 'feed_campaign') then
      if v_has_req then
        update public.feed_ad_requests set deleted_at = v_now, deleted_by = p_admin, delete_reason = v_reason where id = v_req.id;
      end if;
      if v_has_cmp then
        update public.feed_ad_campaigns set deleted_at = v_now, deleted_by = p_admin, delete_reason = v_reason where id = v_cmp.id;
      end if;
    elsif v_kind in ('popup_campaign', 'ptr') then
      update public.platform_popup_campaigns set deleted_at = v_now, deleted_by = p_admin, delete_reason = v_reason where id = p_id;
    elsif v_kind = 'delivery_banner' then
      update public.store_banner_ad_campaigns set deleted_at = v_now, deleted_by = p_admin, delete_reason = v_reason where id = p_id;
    elsif v_kind = 'delivery_sponsored' then
      update public.store_paid_ad_campaigns set deleted_at = v_now, deleted_by = p_admin, delete_reason = v_reason where id = p_id;
    elsif v_kind = 'event_distribution' then
      update public.platform_promotion_distributions set deleted_at = v_now, deleted_by = p_admin, delete_reason = v_reason where id = p_id;
    elsif v_kind = 'my_banner' then
      update public.my_page_banners set status = 'hidden', is_active = false, updated_at = v_now where id = p_id;
    end if;
    -- intro: 게시본은 고칠 수 없다 — 삭제 표시는 아래 감사 행(ad.delete)이다
  end if;

  -- created_at = clock_timestamp(): 같은 트랜잭션 안의 삭제→취소도 순서가 갈린다(삭제 표시 = 마지막 행)
  insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json, created_at)
  values ('admin', p_admin, 'ad:' || v_kind, p_id::text, 'ad.delete', v_before,
          jsonb_build_object('mode', v_mode, 'reason', v_reason, 'fault', v_fault, 'needs_fault', v_needs_fault,
                             'refund_amount', v_refund, 'paid_amount', v_paid, 'refund_unit', v_unit,
                             'end_result', v_end) || v_extra, clock_timestamp());

  return jsonb_build_object('ok', true, 'preview', false, 'kind', v_kind, 'id', p_id, 'mode', v_mode,
    'refund_amount', v_refund, 'paid_amount', v_paid, 'refund_unit', v_unit, 'needs_fault', v_needs_fault);
end;
$function$;

create or replace function public.admin_ad_undelete(p_kind text, p_id uuid, p_admin uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_before jsonb;
  v_extra jsonb := '{}'::jsonb;
  v_req uuid;
  v_cmp uuid;
  v_mark jsonb;
  v_prev text;
  v_next text;
  v_n integer := 0;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_admin is null or p_id is null or not public.is_platform_admin(p_admin) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_reason is null or length(v_reason) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  if v_kind in ('trade_promotion', 'community_promotion') then
    select jsonb_build_object('deleted_at', deleted_at, 'deleted_by', deleted_by, 'delete_reason', delete_reason)
      into v_before from public.point_promotion_orders
     where id = p_id and domain = case when v_kind = 'trade_promotion' then 'trade' else 'community' end
       and deleted_at is not null for update;
    if v_before is null then return jsonb_build_object('ok', false, 'error', 'not_deleted'); end if;
    update public.point_promotion_orders set deleted_at = null, deleted_by = null, delete_reason = null where id = p_id;
  elsif v_kind in ('feed_request', 'feed_campaign') then
    if v_kind = 'feed_request' then
      select id, campaign_id into v_req, v_cmp from public.feed_ad_requests where id = p_id for update;
    else
      select request_id, id into v_req, v_cmp from public.feed_ad_campaigns where id = p_id for update;
    end if;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    select jsonb_build_object('deleted_at', coalesce(r.deleted_at, c.deleted_at), 'deleted_by', coalesce(r.deleted_by, c.deleted_by),
                              'delete_reason', coalesce(r.delete_reason, c.delete_reason))
      into v_before
      from (select 1) x
      left join public.feed_ad_requests r on r.id = v_req
      left join public.feed_ad_campaigns c on c.id = v_cmp
     where r.deleted_at is not null or c.deleted_at is not null;
    if v_before is null then return jsonb_build_object('ok', false, 'error', 'not_deleted'); end if;
    update public.feed_ad_requests set deleted_at = null, deleted_by = null, delete_reason = null where id = v_req;
    update public.feed_ad_campaigns set deleted_at = null, deleted_by = null, delete_reason = null where id = v_cmp;
    v_extra := jsonb_build_object('request_id', v_req, 'campaign_id', v_cmp);
  elsif v_kind in ('popup_campaign', 'ptr') then
    select jsonb_build_object('deleted_at', deleted_at, 'deleted_by', deleted_by, 'delete_reason', delete_reason)
      into v_before from public.platform_popup_campaigns
     where id = p_id and deleted_at is not null
       and (presentation_type = 'ptr_reveal') = (v_kind = 'ptr') for update;
    if v_before is null then return jsonb_build_object('ok', false, 'error', 'not_deleted'); end if;
    update public.platform_popup_campaigns set deleted_at = null, deleted_by = null, delete_reason = null where id = p_id;
  elsif v_kind = 'delivery_banner' then
    select jsonb_build_object('deleted_at', deleted_at, 'deleted_by', deleted_by, 'delete_reason', delete_reason)
      into v_before from public.store_banner_ad_campaigns where id = p_id and deleted_at is not null for update;
    if v_before is null then return jsonb_build_object('ok', false, 'error', 'not_deleted'); end if;
    update public.store_banner_ad_campaigns set deleted_at = null, deleted_by = null, delete_reason = null where id = p_id;
  elsif v_kind = 'delivery_sponsored' then
    select jsonb_build_object('deleted_at', deleted_at, 'deleted_by', deleted_by, 'delete_reason', delete_reason)
      into v_before from public.store_paid_ad_campaigns where id = p_id and deleted_at is not null for update;
    if v_before is null then return jsonb_build_object('ok', false, 'error', 'not_deleted'); end if;
    update public.store_paid_ad_campaigns set deleted_at = null, deleted_by = null, delete_reason = null where id = p_id;
  elsif v_kind = 'event_distribution' then
    select jsonb_build_object('deleted_at', deleted_at, 'deleted_by', deleted_by, 'delete_reason', delete_reason)
      into v_before from public.platform_promotion_distributions where id = p_id and deleted_at is not null for update;
    if v_before is null then return jsonb_build_object('ok', false, 'error', 'not_deleted'); end if;
    update public.platform_promotion_distributions set deleted_at = null, deleted_by = null, delete_reason = null where id = p_id;
  elsif v_kind = 'my_banner' then
    perform 1 from public.my_page_banners where id = p_id for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    v_mark := public.admin_ad_delete_mark_of('my_banner', p_id);
    if v_mark is null then return jsonb_build_object('ok', false, 'error', 'not_deleted'); end if;
    v_before := v_mark - 'before';
    v_prev := v_mark->'before'->>'status';
    -- 종료는 되돌리지 않는다: 노출 중·정지였던 배너는 「정지」로 돌아온다(운영자가 다시 재개)
    v_next := case when v_prev in ('active', 'paused') then 'paused'
                   when v_prev in ('draft', 'expired', 'hidden') then v_prev
                   else 'hidden' end;
    update public.my_page_banners set status = v_next, is_active = false, updated_at = now()
     where id = p_id and status = 'hidden';
    get diagnostics v_n = row_count;
    if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'stale_state'); end if;
    v_extra := jsonb_build_object('status', v_next);
  elsif v_kind = 'intro' then
    if not exists (select 1 from public.launch_intro_publications where id = p_id) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    v_mark := public.admin_ad_delete_mark_of('intro', p_id);
    if v_mark is null then return jsonb_build_object('ok', false, 'error', 'not_deleted'); end if;
    v_before := v_mark - 'before';
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json, created_at)
  values ('admin', p_admin, 'ad:' || v_kind, p_id::text, 'ad.undelete', v_before,
          jsonb_build_object('reason', v_reason) || v_extra, clock_timestamp());

  return jsonb_build_object('ok', true, 'kind', v_kind, 'id', p_id);
end;
$function$;

-- 이력 「삭제됨」 목록 — 삭제 표시가 남은 광고만(완전 삭제는 행이 없다 · 감사 기록에만 남는다).
create or replace function public.admin_ads_deleted_rows(p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  with marks as (
    select case when o.domain = 'trade' then 'trade_promotion' else 'community_promotion' end kind,
           o.id, coalesce(nullif(o.target_title, ''), o.placement) title, o.deleted_at, o.deleted_by, o.delete_reason
      from public.point_promotion_orders o where o.deleted_at is not null
    union all
    select 'feed_request', r.id, coalesce(c.name, r.placement), r.deleted_at, r.deleted_by, r.delete_reason
      from public.feed_ad_requests r left join public.feed_ad_campaigns c on c.id = r.campaign_id
     where r.deleted_at is not null
    union all
    select 'feed_campaign', c.id, c.name, c.deleted_at, c.deleted_by, c.delete_reason
      from public.feed_ad_campaigns c
     where c.deleted_at is not null
       and not exists (select 1 from public.feed_ad_requests r where r.id = c.request_id and r.deleted_at is not null)
    union all
    select case when p.presentation_type = 'ptr_reveal' then 'ptr' else 'popup_campaign' end,
           p.id, coalesce(nullif(p.name, ''), p.title), p.deleted_at, p.deleted_by, p.delete_reason
      from public.platform_popup_campaigns p where p.deleted_at is not null
    union all
    select 'delivery_banner', b.id, b.title, b.deleted_at, b.deleted_by, b.delete_reason
      from public.store_banner_ad_campaigns b where b.deleted_at is not null
    union all
    select 'delivery_sponsored', s.id, s.title, s.deleted_at, s.deleted_by, s.delete_reason
      from public.store_paid_ad_campaigns s where s.deleted_at is not null
    union all
    select 'event_distribution', d.id, coalesce(e.title, d.channel), d.deleted_at, d.deleted_by, d.delete_reason
      from public.platform_promotion_distributions d left join public.platform_events e on e.id = d.content_id
     where d.deleted_at is not null
    union all
    select k.kind, k.id, k.title, (k.mark->>'deleted_at')::timestamptz, (k.mark->>'deleted_by')::uuid, k.mark->>'delete_reason'
      from (
        select 'my_banner' kind, b.id, b.title, public.admin_ad_delete_mark_of('my_banner', b.id) mark
          from public.my_page_banners b
         where exists (select 1 from public.audit_logs a where a.target_type = 'ad:my_banner' and a.target_id = b.id::text)
        union all
        select 'intro', p.id, coalesce(p.document->>'title', p.id::text), public.admin_ad_delete_mark_of('intro', p.id)
          from public.launch_intro_publications p
         where exists (select 1 from public.audit_logs a where a.target_type = 'ad:intro' and a.target_id = p.id::text)
      ) k
     where k.mark is not null
  )
  select count(*)::integer,
         coalesce(jsonb_agg(to_jsonb(m) order by m.deleted_at desc) filter (where m.rn > v_offset and m.rn <= v_offset + v_limit), '[]'::jsonb)
    into v_total, v_rows
    from (select marks.*, row_number() over (order by marks.deleted_at desc, marks.id) rn from marks) m;
  return jsonb_build_object('ok', true, 'total', v_total, 'rows', v_rows);
end;
$function$;

revoke all on function public.admin_ad_delete_mark_of(text, uuid) from public, anon, authenticated;
revoke all on function public.admin_ad_delete(text, uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_ad_undelete(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_ads_deleted_rows(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_ad_delete_mark_of(text, uuid) to service_role;
grant execute on function public.admin_ad_delete(text, uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.admin_ad_undelete(text, uuid, uuid, text) to service_role;
grant execute on function public.admin_ads_deleted_rows(integer, integer) to service_role;
