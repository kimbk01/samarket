-- Step 19: 배달 완료 증명(POD) · 라이더 실패 보고(관리자 확정 전) · 실패 확정 시각

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

comment on column public.store_order_deliveries.delivered_proof_image_url is '배달 완료 증빙 이미지 URL (관리자 검토·분쟁)';
comment on column public.store_order_deliveries.rider_failure_reported_at is '라이더 실패 보고 시각 (delivery_status 변경 없음, 관리자 확정 대기)';
comment on column public.store_order_deliveries.failed_at is 'delivery_failed 확정 시각(관리자 전이 시 설정)';

-- Storage: 라이더 업로드는 서비스 롤 API 경유 — 버킷 공개 읽기(직접 URL 노출은 관리자·주문 API에서 구매자 제외)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proofs',
  'delivery-proofs',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
