-- 수수료 정책 보관(soft archive)

alter table public.store_fee_policies
  add column if not exists is_archived boolean not null default false;

alter table public.store_fee_policies
  add column if not exists archived_at timestamptz;

alter table public.store_fee_policies
  add column if not exists archived_by uuid;

alter table public.store_fee_policies
  add column if not exists archive_reason text;

comment on column public.store_fee_policies.is_archived is '보관(운영 삭제 대신 비표시·비적용)';
comment on column public.store_fee_policies.archived_at is '보관 시각';
comment on column public.store_fee_policies.archived_by is '보관 처리 관리자 user id';
comment on column public.store_fee_policies.archive_reason is '보관 사유';
