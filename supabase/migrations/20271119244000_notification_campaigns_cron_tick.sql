-- 2026-11-19 예약 작업 4번 (Owner 「1~4까지 같이 진행」) — 알림 캠페인 예약 발송: 할 일 없는 실행 = DB 함수 1번.
-- 실측(11-18): 5분마다 288회 · Supabase 576건(1회당 2.0) — 발송할 회차 확보 + 반복 캠페인 다음 회차 확인.
-- 이 함수: 기존 확보 함수를 같은 인자로 1번 부른다.
--   · 확보한 회차가 있으면 그 행만 돌려준다 → 앱이 지금과 같은 전체 경로(발송 → 추가 확보 → 반복 캠페인 확인).
--   · 없으면 앱의 반복 캠페인 확인과 같은 조건(활성 반복 캠페인 20개 중 queued·sending 회차가 없는 것)의 id 목록을 돌려준다.
-- 권한: SECURITY INVOKER.

create or replace function public.notification_campaigns_cron_tick(
  p_claim_token text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_claimed jsonb;
  v_missing jsonb;
begin
  select to_jsonb(r) into v_claimed
  from public.claim_due_admin_notification_campaign_occurrence(p_claim_token, now(), p_lease_seconds) r
  limit 1;

  if v_claimed is not null then
    return jsonb_build_object('ok', true, 'v', 1, 'claimed', v_claimed);
  end if;

  with active as (
    select c.id
    from public.admin_notification_campaigns c
    where c.send_mode = 'recurring' and c.status = 'active'
    limit 20
  )
  select coalesce(jsonb_agg(a.id), '[]'::jsonb) into v_missing
  from active a
  where not exists (
    select 1 from public.admin_notification_campaign_occurrences o
    where o.campaign_id = a.id and o.status in ('queued', 'sending')
  );

  return jsonb_build_object('ok', true, 'v', 1, 'claimed', null, 'recurring_missing', v_missing);
end;
$$;

revoke all on function public.notification_campaigns_cron_tick(text, integer) from public, anon, authenticated;
grant execute on function public.notification_campaigns_cron_tick(text, integer) to service_role;
