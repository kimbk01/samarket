-- D-20② (ads-reaudit3-defect-design-2026-11-07) — 관리자 배달 광고 「초안 삭제」를 DB 함수 1개 · 한 트랜잭션 · 감사 1행.
--
-- 결함: lib/stores/advertising/admin-delivery-ad-delete.ts(HEAD 5ed73f999) 가 이력 검사·삭제·감사를 여러 요청으로 하고
--       감사 insert 오류를 확인하지 않았다 → 감사 없이 삭제만 남을 수 있다.
-- TS 검사를 그대로 옮겼다 (HEAD 원문 기준):
--   · 대상: store_banner_ad_campaigns(banner) 또는 store_paid_ad_campaigns(store_sponsored) — p_campaign 으로 표를 찾는다.
--   · campaign_source = 'DIBAY_FIRST_PARTY' 만 (아니면 not_admin_direct) · lifecycle_status = 'DRAFT' 만 (not_draft).
--   · delivery_ad_canonical_bc_fundings SECURED → funding_secured.
--   · 이력 9표(impression·click·order_attributions·charge_ledger·refund_ledger(product_kind 없음)·business_cash_ledger·
--     campaign_fundings·store_cash_spends·canonical_bc_fundings(application_id)) 1행이라도 → has_history.
--   · delivery_ad_operations_cases(ON DELETE CASCADE) 1건이라도 → has_history.
--   · 막는 감사: delivery_ad_audit_logs 중 'draft_' 접두·생성/초안 편집 11개 이름이 아닌 것 → has_history.
--   · 삭제 후 지면 연결 정리 · 배너 소재(supersedes 사슬 20개까지) 중 다른 배너가 안 쓰는 것 삭제 · 감사 'deleted_safe_draft' 1행.
--   같은 판(updated_at) 확인은 TS 가 하고 여기서는 행 잠금(FOR UPDATE)으로 그 사이 변경을 막는다.
-- 반환: {ok:true, product_kind, creatives_deleted} | {ok:false, error: forbidden|reason_required|not_found|not_admin_direct|
--        not_draft|funding_secured|has_history}  (웹 mapRpcError 가 이미 이 코드들을 안다)
--
-- 롤백 SQL:
--   drop function if exists public.admin_delivery_ad_delete_draft(uuid, uuid, text);

create or replace function public.admin_delivery_ad_delete_draft(p_campaign uuid, p_admin uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_kind text;
  v_lifecycle text;
  v_source text;
  v_creative uuid;
  v_chain uuid[] := array[]::uuid[];
  v_cur uuid;
  v_prev uuid;
  v_i integer := 0;
  v_deleted uuid[] := array[]::uuid[];
  v_cid uuid;
  v_n integer;
  v_t record;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_admin is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if length(v_reason) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_campaign is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select 'banner', lifecycle_status, campaign_source, creative_id
    into v_kind, v_lifecycle, v_source, v_creative
    from public.store_banner_ad_campaigns where id = p_campaign for update;
  if not found then
    select 'store_sponsored', lifecycle_status, campaign_source, null::uuid
      into v_kind, v_lifecycle, v_source, v_creative
      from public.store_paid_ad_campaigns where id = p_campaign for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;

  if coalesce(v_source, 'OWNER_PAID') <> 'DIBAY_FIRST_PARTY' then
    return jsonb_build_object('ok', false, 'error', 'not_admin_direct');
  end if;
  if v_lifecycle <> 'DRAFT' then
    return jsonb_build_object('ok', false, 'error', 'not_draft');
  end if;

  if exists (select 1 from public.delivery_ad_canonical_bc_fundings
              where product_kind = v_kind and application_id = p_campaign and status = 'SECURED') then
    return jsonb_build_object('ok', false, 'error', 'funding_secured');
  end if;

  for v_t in
    select * from (values
      ('delivery_ad_impression_events', 'campaign_id', true),
      ('delivery_ad_click_events', 'campaign_id', true),
      ('delivery_ad_order_attributions', 'campaign_id', true),
      ('delivery_ad_charge_ledger', 'campaign_id', true),
      ('delivery_ad_refund_ledger', 'campaign_id', false),
      ('delivery_ad_business_cash_ledger', 'campaign_id', true),
      ('delivery_ad_campaign_fundings', 'campaign_id', true),
      ('delivery_ad_store_cash_spends', 'campaign_id', true),
      ('delivery_ad_canonical_bc_fundings', 'application_id', true)
    ) as h(tbl, col, has_kind)
  loop
    if v_t.has_kind then
      execute format('select count(*) from public.%I where %I = $1 and product_kind = $2', v_t.tbl, v_t.col)
        into v_n using p_campaign, v_kind;
    else
      execute format('select count(*) from public.%I where %I = $1', v_t.tbl, v_t.col)
        into v_n using p_campaign;
    end if;
    if v_n > 0 then
      return jsonb_build_object('ok', false, 'error', 'has_history', 'table', v_t.tbl);
    end if;
  end loop;

  if exists (select 1 from public.delivery_ad_operations_cases
              where product_kind = v_kind
                and (case when v_kind = 'banner' then banner_campaign_id else store_sponsored_campaign_id end) = p_campaign) then
    return jsonb_build_object('ok', false, 'error', 'has_history', 'table', 'delivery_ad_operations_cases');
  end if;

  if exists (
    select 1 from public.delivery_ad_audit_logs a
     where a.campaign_id = p_campaign and a.product_kind = v_kind
       and btrim(coalesce(a.action, '')) <> ''
       and btrim(a.action) not like 'draft\_%'
       and btrim(a.action) not in (
         'owner_sponsored_create_draft', 'owner_sponsored_update_draft',
         'owner_banner_create_draft', 'owner_banner_update_draft',
         'admin_first_party_banner_create',
         'updated', 'inventory_changed', 'creative_replaced', 'destination_changed', 'creative_removed')
  ) then
    return jsonb_build_object('ok', false, 'error', 'has_history', 'table', 'delivery_ad_audit_logs');
  end if;

  -- 소재 이전 판 사슬 (collectCreativeChain 과 같음 · 20개까지)
  v_cur := v_creative;
  while v_cur is not null and v_i < 20 and not (v_cur = any (v_chain)) loop
    v_chain := v_chain || v_cur;
    select supersedes_creative_id into v_prev from public.delivery_ad_creatives where id = v_cur;
    v_cur := v_prev;
    v_prev := null;
    v_i := v_i + 1;
  end loop;

  if v_kind = 'banner' then
    delete from public.store_banner_ad_campaigns where id = p_campaign;
    delete from public.delivery_banner_campaign_inventories where campaign_id = p_campaign;
    foreach v_cid in array v_chain loop
      if not exists (select 1 from public.store_banner_ad_campaigns where creative_id = v_cid) then
        delete from public.delivery_ad_creatives where id = v_cid;
        if found then v_deleted := v_deleted || v_cid; end if;
      end if;
    end loop;
  else
    delete from public.store_paid_ad_campaigns where id = p_campaign;
    delete from public.delivery_store_sponsored_campaign_inventories where campaign_id = p_campaign;
  end if;

  insert into public.delivery_ad_audit_logs (product_kind, campaign_id, actor_type, actor_user_id, action, before_json, after_json, reason)
  values (v_kind, p_campaign, 'admin', p_admin, 'deleted_safe_draft',
          jsonb_build_object('lifecycle', v_lifecycle, 'campaign_source', 'DIBAY_FIRST_PARTY', 'creative_ids', to_jsonb(v_chain)),
          jsonb_build_object('deleted', true, 'creatives_deleted', to_jsonb(v_deleted)),
          v_reason);

  return jsonb_build_object('ok', true, 'product_kind', v_kind, 'creatives_deleted', to_jsonb(v_deleted));
end;
$function$;

revoke all on function public.admin_delivery_ad_delete_draft(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delivery_ad_delete_draft(uuid, uuid, text) to service_role;
