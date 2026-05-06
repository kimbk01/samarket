-- store_fee_policies: admin memo
alter table public.store_fee_policies
  add column if not exists memo text;

comment on column public.store_fee_policies.memo is '관리자 메모(운영/계약 메모)';

