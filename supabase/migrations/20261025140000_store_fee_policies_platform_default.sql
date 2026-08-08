-- Delivery Financial SSOT Plan A: explicit Platform Default policy row.
-- Preserves current bridge effective rate (0 bp → fee_percent 0).
-- Idempotent: inserts only when no active/non-archived platform default exists.
-- fee_percent unit = percent (see store_fee_policies.fee_percent comment), NOT basis points.

do $$
declare
  v_exists boolean;
begin
  if to_regclass('public.store_fee_policies') is null then
    raise notice 'store_fee_policies missing; skip platform default seed';
    return;
  end if;

  select exists (
    select 1
    from public.store_fee_policies p
    where p.store_id is null
      and p.category_id is null
      and (p.topic_id is null)
      and p.is_active = true
      and coalesce(p.is_archived, false) = false
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at > now())
  ) into v_exists;

  if v_exists then
    raise notice 'active Platform Default already present; skip insert';
    return;
  end if;

  insert into public.store_fee_policies (
    policy_name,
    store_id,
    category_id,
    topic_id,
    fee_percent,
    fixed_fee,
    delivery_fee_mode,
    delivery_fee_percent,
    is_active,
    starts_at,
    ends_at,
    priority,
    memo,
    is_archived
  ) values (
    'Platform Default',
    null,
    null,
    null,
    0,           -- matches current commerce_settings store_settlement_fee_bp = 0
    0,
    'none',
    0,
    true,
    null,
    null,
    100,         -- within-default priority; store/topic/category scopes still win by resolver order
    'SSOT Platform Default — migrated from commerce_settings bridge (0 bp). Do not use commerce_settings as fee authority.',
    false
  );

  raise notice 'inserted Platform Default fee_percent=0';
end;
$$;

comment on table public.store_fee_policies is
  '배달 수수료 정책 SSOT. 우선순위: store_id > topic_id > category_id > Platform Default(전부 null). commerce_settings는 financial authority 아님.';
