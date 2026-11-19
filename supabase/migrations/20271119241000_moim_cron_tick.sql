-- 2026-11-19 예약 작업 2번 (Owner 「1~4까지 같이 진행」) — 모임 일정 작업: 실행 1번 = DB 함수 1번.
-- 실측(11-18): 10분마다 143회 · Supabase 1,008건(1회당 7.0) — 단계 7개를 각각 RPC 로 불렀다.
-- 이 함수는 기존 함수 7개를 **같은 순서·같은 인자**로 부르고 결과를 그대로 돌려준다(규칙을 옮기지 않음).
-- 알림 발송(후기·리마인드)은 지금처럼 앱이 돌려받은 목록으로 한다. 각 단계 실패는 서로 영향 없음(하위 블록).
-- 권한: SECURITY INVOKER — 지금과 같은 service_role 로 같은 함수를 부른다.

create or replace function public.moim_cron_tick()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_finish jsonb; v_r24 jsonb; v_r1 jsonb; v_sanctions jsonb; v_join jsonb; v_rooms jsonb; v_retention jsonb;
begin
  begin v_finish := public.moim_schedules_finish_due(200);
  exception when others then v_finish := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_r24 := public.moim_schedules_claim_reminders('24h');
  exception when others then v_r24 := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_r1 := public.moim_schedules_claim_reminders('1h');
  exception when others then v_r1 := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_sanctions := public.moim_sanctions_expire_due(200);
  exception when others then v_sanctions := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_join := public.moim_join_requests_expire_due(200);
  exception when others then v_join := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_rooms := public.moim_schedule_rooms_archive_due(200);
  exception when others then v_rooms := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_retention := public.moim_closed_retention_due(100);
  exception when others then v_retention := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;

  return jsonb_build_object(
    'ok', true, 'v', 1,
    'finish', coalesce(v_finish, '{}'::jsonb),
    'reminders_24h', coalesce(v_r24, '{}'::jsonb),
    'reminders_1h', coalesce(v_r1, '{}'::jsonb),
    'sanctions', coalesce(v_sanctions, '{}'::jsonb),
    'join_requests', coalesce(v_join, '{}'::jsonb),
    'schedule_rooms', coalesce(v_rooms, '{}'::jsonb),
    'closed_retention', coalesce(v_retention, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.moim_cron_tick() from public, anon, authenticated;
grant execute on function public.moim_cron_tick() to service_role;
