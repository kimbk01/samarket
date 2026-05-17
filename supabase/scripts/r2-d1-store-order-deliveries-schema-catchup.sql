-- R2-D1 catch-up: store_order_deliveries + delivery_riders columns/publication
-- Source migrations (do not duplicate logic — apply existing files in order):
--   20260509110000_delivery_riders_and_order_deliveries.sql (base table — skip if exists)
--   20260517120000_delivery_riders_admin_center.sql
--   20260518120000_rider_app_delivery_flow.sql
--   20260519120000_delivery_pod_failure_proof.sql
--   20260520120000_delivery_proofs_private_bucket.sql
--   20260522120000_store_order_deliveries_realtime_exclude_proof_media.sql

-- ─── 20260517120000 (delivery_riders admin + failure_reason) ───
alter table public.delivery_riders
  add column if not exists admin_status text not null default 'ok';

alter table public.delivery_riders
  drop constraint if exists delivery_riders_admin_status_chk;
alter table public.delivery_riders
  add constraint delivery_riders_admin_status_chk
  check (admin_status in ('ok', 'flagged', 'paused'));

alter table public.delivery_riders
  add column if not exists admin_note text;

alter table public.delivery_riders
  add column if not exists suspended_at timestamptz;

alter table public.delivery_riders
  add column if not exists suspended_by uuid references public.profiles(id) on delete set null;

alter table public.store_order_deliveries
  add column if not exists failure_reason text;

-- ─── 20260518120000 (rider app delivery flow) ───
alter table public.store_order_deliveries
  add column if not exists rider_accepted_at timestamptz;

alter table public.store_order_deliveries
  add column if not exists customer_arrived_at timestamptz;

alter table public.store_order_deliveries
  add column if not exists rider_decline_reason text;

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

-- ─── 20260519120000 (POD / failure proof columns) ───
alter table public.store_order_deliveries
  add column if not exists delivered_proof_image_url text;

alter table public.store_order_deliveries
  add column if not exists delivered_proof_note text;

alter table public.store_order_deliveries
  add column if not exists delivered_receiver_name text;

alter table public.store_order_deliveries
  add column if not exists delivered_confirmed_at timestamptz;

alter table public.store_order_deliveries
  add column if not exists delivered_proof_lat double precision;

alter table public.store_order_deliveries
  add column if not exists delivered_proof_lng double precision;

alter table public.store_order_deliveries
  add column if not exists failure_proof_image_url text;

alter table public.store_order_deliveries
  add column if not exists failure_note text;

alter table public.store_order_deliveries
  add column if not exists rider_failure_reported_at timestamptz;

alter table public.store_order_deliveries
  add column if not exists rider_failure_report_reason text;

alter table public.store_order_deliveries
  add column if not exists failure_report_lat double precision;

alter table public.store_order_deliveries
  add column if not exists failure_report_lng double precision;

alter table public.store_order_deliveries
  add column if not exists failed_at timestamptz;

-- ─── 20260520120000 (private bucket paths) ───
alter table public.store_order_deliveries
  add column if not exists delivered_proof_image_path text;

alter table public.store_order_deliveries
  add column if not exists failure_proof_image_path text;

-- ─── 20260509110000 publication (idempotent) ───
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'delivery_rt_pub: supabase_realtime publication 없음 — 건너뜀';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'store_order_deliveries'
  ) then
    execute 'alter publication supabase_realtime add table public.store_order_deliveries';
    raise notice 'delivery_rt_pub: public.store_order_deliveries publication 추가';
  else
    raise notice 'delivery_rt_pub: store_order_deliveries already in publication';
  end if;
end $$;

-- ─── 20260522120000 (realtime column exclude — PG15+) ───
DO $$
DECLARE
  v_pg_ok boolean;
  v_in_pub boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'store_order_deliveries_rt_exclude_proof: supabase_realtime 없음 — 건너뜀';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'store_order_deliveries'
  ) THEN
    RAISE NOTICE 'store_order_deliveries_rt_exclude_proof: store_order_deliveries 없음 — 건너뜀';
    RETURN;
  END IF;

  SELECT current_setting('server_version_num')::int >= 150000 INTO v_pg_ok;
  IF NOT v_pg_ok THEN
    RAISE WARNING 'store_order_deliveries_rt_exclude_proof: PostgreSQL 15+ 필요. 업그레이드 후 재적용하세요.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'store_order_deliveries'
  ) INTO v_in_pub;

  ALTER TABLE public.store_order_deliveries REPLICA IDENTITY DEFAULT;

  IF v_in_pub THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.store_order_deliveries';
    RAISE NOTICE 'store_order_deliveries_rt_exclude_proof: publication 에서 기존 등록 제거';
  END IF;

  EXECUTE $pub$
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_order_deliveries (
      order_id,
      store_id,
      buyer_user_id,
      rider_id,
      delivery_status,
      assigned_at,
      picked_up_at,
      delivered_at,
      admin_note,
      failure_reason,
      rider_accepted_at,
      customer_arrived_at,
      rider_decline_reason,
      delivered_proof_note,
      delivered_receiver_name,
      delivered_confirmed_at,
      delivered_proof_lat,
      delivered_proof_lng,
      failure_note,
      rider_failure_reported_at,
      rider_failure_report_reason,
      failure_report_lat,
      failure_report_lng,
      failed_at,
      created_at,
      updated_at
    )
  $pub$;

  RAISE NOTICE 'store_order_deliveries_rt_exclude_proof: POD 미디어 4컬럼 제외 후 재등록 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'store_order_deliveries_rt_exclude_proof 실패: %', SQLERRM;
END $$;
