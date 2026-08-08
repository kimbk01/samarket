-- Delivery commission SSOT: secondary category (2차 업종) on store_fee_policies.
-- Precedence (app resolver): store > topic > category > default > commerce_settings bridge.
-- Additive only — does not backfill historical settlements.

alter table public.store_fee_policies
  add column if not exists topic_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_fee_policies_topic_id_fkey'
  ) then
    alter table public.store_fee_policies
      add constraint store_fee_policies_topic_id_fkey
      foreign key (topic_id) references public.store_topics (id) on delete set null;
  end if;
exception
  when undefined_table then
    -- store_topics missing in some environments; column still usable as uuid
    null;
end $$;

create index if not exists idx_store_fee_policies_topic_active
  on public.store_fee_policies (topic_id, is_active)
  where topic_id is not null;

comment on column public.store_fee_policies.topic_id is
  '2차 업종(store_topics.id). store_id null + topic_id set = secondary category policy.';

comment on table public.store_fee_policies is
  '배달 수수료 정책 SSOT. 우선순위: store_id > topic_id > category_id > 전역(default). starts_at/ends_at 기간 + is_active.';
