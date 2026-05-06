-- Step 20: POD 비공개 버킷 + Storage path 컬럼 (레거시 *_image_url 호환)

alter table public.store_order_deliveries
  add column if not exists delivered_proof_image_path text;

alter table public.store_order_deliveries
  add column if not exists failure_proof_image_path text;

comment on column public.store_order_deliveries.delivered_proof_image_path is 'delivery-proofs 버킷 내 객체 경로 (비공개, 관리자 서명 URL만)';
comment on column public.store_order_deliveries.failure_proof_image_path is '실패 증빙 객체 경로 (비공개)';
comment on column public.store_order_deliveries.delivered_proof_image_url is '레거시: 과거 공개 URL 저장분 — 신규는 path만 사용';
comment on column public.store_order_deliveries.failure_proof_image_url is '레거시: 과거 공개 URL 저장분';

-- 버킷 비공개 전환 (신규 환경은 비공개로 생성되도록 이전 마이그레이션과 정합)
update storage.buckets
set public = false
where id = 'delivery-proofs';
