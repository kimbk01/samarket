-- 설계 ads-admin-ssot-design-2026-11-07 §3-2 보완 (통합 2026-11-07)
-- 삭제 표시(deleted_at)된 광고는 다시 노출 상태(승인·예약·노출·정지)로 갈 수 없다.
-- 도메인 승인 화면·승인 함수가 deleted_at 을 보지 않아도 DB 한 곳에서 막는다.
-- 종료·만료·반려 같은 끝 상태로 가는 것은 막지 않는다(크론 만료 배치가 깨지지 않게).
-- 삭제 취소(admin_ad_undelete)는 deleted_at 을 null 로 바꾸므로 이 검사 대상이 아니다.
--
-- 롤백:
--   drop trigger if exists trg_ads_deleted_live_guard on public.point_promotion_orders;
--   drop trigger if exists trg_ads_deleted_live_guard on public.feed_ad_requests;
--   drop trigger if exists trg_ads_deleted_live_guard on public.feed_ad_campaigns;
--   drop trigger if exists trg_ads_deleted_live_guard on public.platform_popup_campaigns;
--   drop trigger if exists trg_ads_deleted_live_guard on public.store_banner_ad_campaigns;
--   drop trigger if exists trg_ads_deleted_live_guard on public.store_paid_ad_campaigns;
--   drop trigger if exists trg_ads_deleted_live_guard on public.platform_promotion_distributions;
--   drop function if exists public.ads_deleted_live_guard();

create or replace function public.ads_deleted_live_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col text := tg_argv[0];
  v_old text;
  v_new text;
  v_live text[] := tg_argv[1:];
begin
  if old.deleted_at is null or new.deleted_at is null then
    return new;
  end if;
  v_old := to_jsonb(old) ->> v_col;
  v_new := to_jsonb(new) ->> v_col;
  if v_new is distinct from v_old and v_new = any (v_live) then
    raise exception 'ad_deleted_cannot_go_live' using errcode = 'P0001',
      detail = format('%s.%s %s -> %s', tg_table_name, v_col, v_old, v_new);
  end if;
  return new;
end;
$$;

revoke all on function public.ads_deleted_live_guard() from public, anon, authenticated;

drop trigger if exists trg_ads_deleted_live_guard on public.point_promotion_orders;
create trigger trg_ads_deleted_live_guard before update on public.point_promotion_orders
  for each row execute function public.ads_deleted_live_guard('order_status', 'approved', 'scheduled', 'active', 'paused');

drop trigger if exists trg_ads_deleted_live_guard on public.feed_ad_requests;
create trigger trg_ads_deleted_live_guard before update on public.feed_ad_requests
  for each row execute function public.ads_deleted_live_guard('status', 'approved', 'active');

drop trigger if exists trg_ads_deleted_live_guard on public.feed_ad_campaigns;
create trigger trg_ads_deleted_live_guard before update on public.feed_ad_campaigns
  for each row execute function public.ads_deleted_live_guard('status', 'scheduled', 'active', 'paused');

drop trigger if exists trg_ads_deleted_live_guard on public.platform_popup_campaigns;
create trigger trg_ads_deleted_live_guard before update on public.platform_popup_campaigns
  for each row execute function public.ads_deleted_live_guard('status', 'approved', 'scheduled', 'active', 'paused');

drop trigger if exists trg_ads_deleted_live_guard on public.store_banner_ad_campaigns;
create trigger trg_ads_deleted_live_guard before update on public.store_banner_ad_campaigns
  for each row execute function public.ads_deleted_live_guard('lifecycle_status', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'PAUSED_OWNER', 'PAUSED_ADMIN');

drop trigger if exists trg_ads_deleted_live_guard on public.store_paid_ad_campaigns;
create trigger trg_ads_deleted_live_guard before update on public.store_paid_ad_campaigns
  for each row execute function public.ads_deleted_live_guard('lifecycle_status', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'PAUSED_OWNER', 'PAUSED_ADMIN');

drop trigger if exists trg_ads_deleted_live_guard on public.platform_promotion_distributions;
create trigger trg_ads_deleted_live_guard before update on public.platform_promotion_distributions
  for each row execute function public.ads_deleted_live_guard('status', 'active');
