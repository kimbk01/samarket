-- D-04 ④ (ads-reaudit3-defect-design-2026-11-07) — 결제(SECURED)가 남은 배달 광고 캠페인 행은 어떤 경로로도 지울 수 없게.
--
-- 원인(운영 SELECT 2026-11-07 · audit_logs f53a0b99…): 2026-10-29 14:31 UTC, Claude 세션이 Owner 지시
--   「기간 지난 심사 대기 유료 광고 삭제」를 SQL 직접 DELETE 로 대행 — store_paid_ad_campaigns 5행
--   (635bbf7d · a6935230 · acb83966 · e00dbdd1 · 560b09c5) 삭제. 결제(delivery_ad_canonical_bc_fundings SECURED)를 보지 않아
--   4건(각 12,000)이 캠페인 없는 SECURED 로 남았다. 앱 경로(사장님 초안 삭제·관리자 초안 삭제)는 SECURED 검사를 하지만
--   DB 에는 막는 장치가 없어 직접 SQL·service role REST 삭제는 지금도 열려 있다.
-- 처리: 두 캠페인 표에 BEFORE DELETE 트리거 — 같은 (product_kind, application_id) SECURED 결제가 있으면 예외.
--   매장 삭제(stores ON DELETE CASCADE)로 캠페인이 같이 지워지는 경우도 같은 트리거가 막는다.
--   정상 경로 영향: 사장님·관리자 초안 삭제는 SECURED 면 이미 거절 → 동작 변화 없음. R2 admin_ad_delete 의 hard 삭제도 같은 규칙.
--
-- 롤백 SQL:
--   drop trigger if exists trg_store_paid_ad_campaigns_block_delete_secured on public.store_paid_ad_campaigns;
--   drop trigger if exists trg_store_banner_ad_campaigns_block_delete_secured on public.store_banner_ad_campaigns;
--   drop function if exists public.delivery_ad_campaign_block_delete_secured();

create or replace function public.delivery_ad_campaign_block_delete_secured()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kind text := case tg_table_name when 'store_banner_ad_campaigns' then 'banner' else 'store_sponsored' end;
begin
  if exists (select 1 from public.delivery_ad_canonical_bc_fundings f
              where f.product_kind = v_kind and f.application_id = old.id and f.status = 'SECURED') then
    raise exception 'delivery_ad_delete_blocked_funding_secured'
      using errcode = 'P0001', detail = format('%s %s', v_kind, old.id);
  end if;
  return old;
end;
$function$;

revoke all on function public.delivery_ad_campaign_block_delete_secured() from public, anon, authenticated;

drop trigger if exists trg_store_paid_ad_campaigns_block_delete_secured on public.store_paid_ad_campaigns;
create trigger trg_store_paid_ad_campaigns_block_delete_secured
  before delete on public.store_paid_ad_campaigns
  for each row execute function public.delivery_ad_campaign_block_delete_secured();

drop trigger if exists trg_store_banner_ad_campaigns_block_delete_secured on public.store_banner_ad_campaigns;
create trigger trg_store_banner_ad_campaigns_block_delete_secured
  before delete on public.store_banner_ad_campaigns
  for each row execute function public.delivery_ad_campaign_block_delete_secured();
