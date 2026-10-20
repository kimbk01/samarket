-- R7 잔여 (delivery_a) — 자동 조치 목록 서버 페이지네이션
-- 목적: /admin/delivery-auto-actions 목록이 `admin_delivery_auto_actions_dashboard` 의 `limit v_lim`(최대 200)
--       또는 legacy `.limit(limit)` 로 잘리던 경로를 없앤다. 필터·정렬·페이지·정확한 total 을 DB 한 번에.
--       기존 대시보드 RPC(KPI·배너·규칙 집계)는 그대로 두고 손대지 않는다 (같은 시그니처 호출자 호환).
-- 대상 화면: /admin/delivery-auto-actions (API GET /api/admin/delivery-auto-actions)
-- 권한: SECURITY DEFINER · search_path=public · EXECUTE 는 service_role 만 (PUBLIC·anon·authenticated 회수).
--       앱 서버가 관리자 가드(requireAdminApiUser) 통과 후 service role 로 호출한다.
-- 정렬: executed_at desc, id desc (결정적 — 페이지 이동 시 누락·중복 없음).
-- 「오늘만」: 호출자가 필리핀(Asia/Manila) 오늘 경계를 UTC 시각으로 넘긴다 (p_from 이상 · p_to 미만).
-- 롤백:
--   drop function if exists public.admin_delivery_auto_actions_page(text, uuid, boolean, boolean, timestamptz, timestamptz, integer, integer);
--   drop index if exists public.delivery_operation_alert_actions_executed_id_idx;

create index if not exists delivery_operation_alert_actions_executed_id_idx
  on public.delivery_operation_alert_actions (executed_at desc, id desc);

create or replace function public.admin_delivery_auto_actions_page(
  p_status text default null,
  p_rule_id uuid default null,
  p_dangerous_only boolean default false,
  p_retry_only boolean default false,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      nullif(btrim(coalesce(p_status, '')), '') as st,
      least(100, greatest(1, coalesce(p_limit, 20))) as lim,
      least(100000, greatest(0, coalesce(p_offset, 0))) as off
  ),
  filtered as (
    select a.*, e.order_id as ev_order_id, e.event_status as ev_status,
           r.id as r_id, r.rule_key as r_key, r.rule_name as r_name
      from public.delivery_operation_alert_actions a
      left join public.delivery_operation_alert_events e on e.id = a.event_id
      left join public.delivery_operation_alert_rules r on r.id = e.rule_id
      cross join params pr
     where (pr.st is null or a.action_status = pr.st)
       and (not coalesce(p_dangerous_only, false)
            or a.action_type in ('auto_hold_settlement', 'auto_reassign_rider', 'auto_mute'))
       and (not coalesce(p_retry_only, false)
            or (a.action_status = 'failed' and coalesce(a.retry_count, 0) < coalesce(a.max_retries, 3)))
       and (p_from is null or a.executed_at >= p_from)
       and (p_to is null or a.executed_at < p_to)
       and (p_rule_id is null or e.rule_id = p_rule_id)
  ),
  page as (
    select f.*
      from filtered f
     order by f.executed_at desc, f.id desc
     limit (select lim from params)
    offset (select off from params)
  )
  select jsonb_build_object(
    'total', (select count(*)::bigint from filtered),
    'limit', (select lim from params),
    'offset', (select off from params),
    'rows', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', pg.id,
                 'event_id', pg.event_id,
                 'action_type', pg.action_type,
                 'action_status', pg.action_status,
                 'executed_at', pg.executed_at,
                 'executed_by_system', pg.executed_by_system,
                 'result_message', pg.result_message,
                 'metadata', coalesce(pg.metadata, '{}'::jsonb),
                 'retry_count', coalesce(pg.retry_count, 0),
                 'max_retries', coalesce(pg.max_retries, 3),
                 'approval_actor_id', pg.approval_actor_id,
                 'approval_note', pg.approval_note,
                 'decided_at', pg.decided_at,
                 'rule_id', pg.r_id,
                 'rule_key', coalesce(pg.r_key, ''),
                 'rule_name', coalesce(pg.r_name, ''),
                 'order_id', pg.ev_order_id,
                 'order_no', coalesce(so.order_no::text, ''),
                 'event_status', coalesce(pg.ev_status, ''),
                 'dangerous_action',
                   pg.action_type in ('auto_hold_settlement', 'auto_reassign_rider', 'auto_mute'),
                 'stale_pending',
                   (pg.action_status = 'pending_approval' and pg.executed_at < now() - interval '30 minutes'),
                 'retry_eligible',
                   (pg.action_status = 'failed' and coalesce(pg.retry_count, 0) < coalesce(pg.max_retries, 3))
               )
               order by pg.executed_at desc, pg.id desc
             )
        from page pg
        left join public.store_orders so on so.id = pg.ev_order_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_delivery_auto_actions_page(
  text, uuid, boolean, boolean, timestamptz, timestamptz, integer, integer
) from public, anon, authenticated;

grant execute on function public.admin_delivery_auto_actions_page(
  text, uuid, boolean, boolean, timestamptz, timestamptz, integer, integer
) to service_role;
