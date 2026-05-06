-- Step 18: 라이더 앱 — 배달 메타데이터 컬럼·라이더 상태 값·RLS 읽기 (Realtime 구독용, publication 변경 없음)

-- 배달 행: 수락 시각·고객 도착(상태 전이 없이)·거절 사유 (delivery_status 전이 규칙은 TS 그대로)
alter table public.store_order_deliveries
  add column if not exists rider_accepted_at timestamptz;

alter table public.store_order_deliveries
  add column if not exists customer_arrived_at timestamptz;

alter table public.store_order_deliveries
  add column if not exists rider_decline_reason text;

comment on column public.store_order_deliveries.rider_accepted_at is '라이더 배차 수락 시각';
comment on column public.store_order_deliveries.customer_arrived_at is '라이더 고객 도착 표시(delivering 유지)';
comment on column public.store_order_deliveries.rider_decline_reason is '라이더 배차 거절 시 사유(미배차 복귀)';

-- rider_status: 플랫폼 라이더 모드 (기본 active)
update public.delivery_riders
set rider_status = 'active'
where rider_status is null
   or trim(rider_status) = '';

update public.delivery_riders
set rider_status = 'active'
where rider_status not in ('active', 'delivering', 'on_break');

alter table public.delivery_riders
  drop constraint if exists delivery_riders_rider_status_chk;

alter table public.delivery_riders
  add constraint delivery_riders_rider_status_chk
  check (rider_status in ('active', 'delivering', 'on_break'));

comment on column public.delivery_riders.rider_status is 'active | delivering | on_break (휴식)';

-- ─── RLS: 자기 배달 행 조회 (Realtime 필터 구독) ───
drop policy if exists store_order_deliveries_rider_select on public.store_order_deliveries;
create policy store_order_deliveries_rider_select
  on public.store_order_deliveries
  for select
  to authenticated
  using (
    rider_id is not null
    and exists (
      select 1
      from public.delivery_riders dr
      where dr.id = store_order_deliveries.rider_id
        and dr.user_id = auth.uid()
    )
  );

-- ─── RLS: 본인 라이더 프로필 조회 ───
drop policy if exists delivery_riders_self_select on public.delivery_riders;
create policy delivery_riders_self_select
  on public.delivery_riders
  for select
  to authenticated
  using (user_id is not null and user_id = auth.uid());
