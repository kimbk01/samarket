-- 관리자 종(Action Queue) 대기 건수를 1회로 — 요청 증폭 근본 수정 (관리자 종).
-- 설계: docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md 순서 1 (Owner 승인 2026-11-01)
-- 이전: `loadAdminActionQueueCounts` 가 표 20개를 각각 HEAD count + 피드 광고 신청 최대 2,000행 = 요청 21회.
--       관리자 화면이 열려 있으면 75초마다 + 알림·감시 표 변경마다 실행 (운영 10-31 24시간 HEAD 14,980회).
-- 조건값(상태 목록·기준 시각)은 호출자 TS 상수가 `p` 로 넘긴다 — 조건의 원천은 지금처럼 TS 한 곳.
-- 표마다 따로 실패 처리 (기존과 동일): 표 없음(undefined_table) → 0, 그 밖의 오류 → 그 칸만 null(확인 불가).
-- 목록 값이 null 이면 그 조건은 걸지 않는다 (기존 `statuses ? q.in(...) : q` 와 동일).

create or replace function public.admin_action_queue_counts(p jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  r jsonb := '{}'::jsonb;
  v bigint;
  v_rows jsonb;
begin
  -- store_charges
  begin
    select count(*) into v from public.store_point_charge_requests t
     where t.request_status::text = any(array(select jsonb_array_elements_text(p->'store_charge_statuses')));
    r := r || jsonb_build_object('store_charges', v);
  exception when undefined_table then r := r || jsonb_build_object('store_charges', 0);
            when others then r := r || jsonb_build_object('store_charges', null);
  end;

  -- cash_charges
  begin
    select count(*) into v from public.business_cash_charge_requests t where t.status::text = p->>'cash_charge_status';
    r := r || jsonb_build_object('cash_charges', v);
  exception when undefined_table then r := r || jsonb_build_object('cash_charges', 0);
            when others then r := r || jsonb_build_object('cash_charges', null);
  end;

  -- user_charges
  begin
    select count(*) into v from public.point_charge_requests t
     where t.request_status::text = any(array(select jsonb_array_elements_text(p->'user_charge_statuses')));
    r := r || jsonb_build_object('user_charges', v);
  exception when undefined_table then r := r || jsonb_build_object('user_charges', 0);
            when others then r := r || jsonb_build_object('user_charges', null);
  end;

  -- reports
  begin
    select count(*) into v from public.reports t
     where t.status::text = any(array(select jsonb_array_elements_text(p->'trade_report_statuses')));
    r := r || jsonb_build_object('reports', v);
  exception when undefined_table then r := r || jsonb_build_object('reports', 0);
            when others then r := r || jsonb_build_object('reports', null);
  end;

  -- store_reports
  begin
    select count(*) into v from public.store_reports t where t.status::text = p->>'store_report_status';
    r := r || jsonb_build_object('store_reports', v);
  exception when undefined_table then r := r || jsonb_build_object('store_reports', 0);
            when others then r := r || jsonb_build_object('store_reports', null);
  end;

  -- delivery_alerts
  begin
    select count(*) into v from public.delivery_operation_alert_events t
     where t.event_status::text = any(array(select jsonb_array_elements_text(p->'delivery_alert_statuses')));
    r := r || jsonb_build_object('delivery_alerts', v);
  exception when undefined_table then r := r || jsonb_build_object('delivery_alerts', 0);
            when others then r := r || jsonb_build_object('delivery_alerts', null);
  end;

  -- feed_ad_requests: 판정(시작·종료 시각 투영)은 TS 가 한다 — 행만 (기존과 같은 limit)
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'start_at', x.start_at, 'end_at', x.end_at)), '[]'::jsonb)
      into v_rows
      from (select t.id, t.status::text, t.start_at, t.end_at from public.feed_ad_requests t
             where t.status::text = p->>'feed_ad_status' limit (p->>'feed_ad_scan_limit')::int) x;
    r := r || jsonb_build_object('feed_ad_rows', v_rows);
  exception when undefined_table then r := r || jsonb_build_object('feed_ad_rows', '[]'::jsonb);
            when others then r := r || jsonb_build_object('feed_ad_rows', null);
  end;

  -- trade_promo_pending
  begin
    select count(*) into v from public.point_promotion_orders t
     where t.domain::text = p->>'trade_promo_domain' and t.order_status::text = p->>'trade_promo_status';
    r := r || jsonb_build_object('trade_promo_pending', v);
  exception when undefined_table then r := r || jsonb_build_object('trade_promo_pending', 0);
            when others then r := r || jsonb_build_object('trade_promo_pending', null);
  end;

  -- store_inquiry_open
  begin
    select count(*) into v from public.store_inquiries t where t.status::text = p->>'store_inquiry_status';
    r := r || jsonb_build_object('store_inquiry_open', v);
  exception when undefined_table then r := r || jsonb_build_object('store_inquiry_open', 0);
            when others then r := r || jsonb_build_object('store_inquiry_open', null);
  end;

  -- support_actionable (목록 null = 필터 없음)
  begin
    select count(*) into v from public.support_cases t
     where (p->'support_statuses' is null or jsonb_typeof(p->'support_statuses') = 'null'
            or t.status::text = any(array(select jsonb_array_elements_text(p->'support_statuses'))));
    r := r || jsonb_build_object('support_actionable', v);
  exception when undefined_table then r := r || jsonb_build_object('support_actionable', 0);
            when others then r := r || jsonb_build_object('support_actionable', null);
  end;

  -- community_reports
  begin
    select count(*) into v from public.community_reports t
     where t.status::text = any(array(select jsonb_array_elements_text(p->'community_report_statuses')));
    r := r || jsonb_build_object('community_reports', v);
  exception when undefined_table then r := r || jsonb_build_object('community_reports', 0);
            when others then r := r || jsonb_build_object('community_reports', null);
  end;

  -- store_applications
  begin
    select count(*) into v from public.stores t
     where t.approval_status::text = any(array(select jsonb_array_elements_text(p->'store_approval_statuses')));
    r := r || jsonb_build_object('store_applications', v);
  exception when undefined_table then r := r || jsonb_build_object('store_applications', 0);
            when others then r := r || jsonb_build_object('store_applications', null);
  end;

  -- delivery_ad_ops
  begin
    select count(*) into v from public.delivery_ad_operations_cases t where t.status::text = p->>'delivery_ad_ops_status';
    r := r || jsonb_build_object('delivery_ad_ops', v);
  exception when undefined_table then r := r || jsonb_build_object('delivery_ad_ops', 0);
            when others then r := r || jsonb_build_object('delivery_ad_ops', null);
  end;

  -- meeting_reports (목록 null = 필터 없음)
  begin
    select count(*) into v from public.meeting_reports t
     where (p->'meeting_report_statuses' is null or jsonb_typeof(p->'meeting_report_statuses') = 'null'
            or t.status::text = any(array(select jsonb_array_elements_text(p->'meeting_report_statuses'))));
    r := r || jsonb_build_object('meeting_reports', v);
  exception when undefined_table then r := r || jsonb_build_object('meeting_reports', 0);
            when others then r := r || jsonb_build_object('meeting_reports', null);
  end;

  -- orders_attention: and(needs_admin_attention.eq.true, order_status.not.in.(...)) + created_at >= 기준
  begin
    select count(*) into v from public.store_orders t
     where t.needs_admin_attention = true
       and not (t.order_status::text = any(array(select jsonb_array_elements_text(p->'order_excluded_statuses'))))
       and t.created_at >= (p->>'order_active_from')::timestamptz;
    r := r || jsonb_build_object('orders_attention', v);
  exception when undefined_table then r := r || jsonb_build_object('orders_attention', 0);
            when others then r := r || jsonb_build_object('orders_attention', null);
  end;

  -- settlements_actionable
  begin
    select count(*) into v from public.store_sale_fee_obligations t where t.adjustment_status::text = p->>'settlement_status';
    r := r || jsonb_build_object('settlements_actionable', v);
  exception when undefined_table then r := r || jsonb_build_object('settlements_actionable', 0);
            when others then r := r || jsonb_build_object('settlements_actionable', null);
  end;

  -- coin_withdrawals
  begin
    select count(*) into v from public.coin_withdrawal_requests t where t.status::text = p->>'coin_withdrawal_status';
    r := r || jsonb_build_object('coin_withdrawals', v);
  exception when undefined_table then r := r || jsonb_build_object('coin_withdrawals', 0);
            when others then r := r || jsonb_build_object('coin_withdrawals', null);
  end;

  -- platform_popup_pending
  begin
    select count(*) into v from public.platform_popup_owner_requests t
     where t.request_status::text = any(array(select jsonb_array_elements_text(p->'popup_statuses')));
    r := r || jsonb_build_object('platform_popup_pending', v);
  exception when undefined_table then r := r || jsonb_build_object('platform_popup_pending', 0);
            when others then r := r || jsonb_build_object('platform_popup_pending', null);
  end;

  -- partner_pending
  begin
    select count(*) into v from public.delivery_ad_partner_memberships t where t.status::text = p->>'partner_status';
    r := r || jsonb_build_object('partner_pending', v);
  exception when undefined_table then r := r || jsonb_build_object('partner_pending', 0);
            when others then r := r || jsonb_build_object('partner_pending', null);
  end;

  -- messenger_actionable
  begin
    select count(*) into v from public.community_messenger_reports t
     where t.status::text = any(array(select jsonb_array_elements_text(p->'messenger_report_statuses')));
    r := r || jsonb_build_object('messenger_actionable', v);
  exception when undefined_table then r := r || jsonb_build_object('messenger_actionable', 0);
            when others then r := r || jsonb_build_object('messenger_actionable', null);
  end;

  return r;
end;
$$;

revoke all on function public.admin_action_queue_counts(jsonb) from public, anon, authenticated;
grant execute on function public.admin_action_queue_counts(jsonb) to service_role;
