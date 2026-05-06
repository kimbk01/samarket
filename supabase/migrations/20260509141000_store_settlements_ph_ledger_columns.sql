-- 필리핀형 정산 원장 확장 (v1) — 기존 store_settlements 확장
-- 테이블이 없는 환경에서는 notice만 남기고 스킵한다.

do $$
begin
  if to_regclass('public.store_settlements') is null then
    raise notice 'store_settlements missing; skip alter';
    return;
  end if;

  alter table public.store_settlements
    add column if not exists platform_fee_percent numeric(5, 2) not null default 0,
    add column if not exists platform_fee_amount integer not null default 0,
    add column if not exists fixed_fee_amount integer not null default 0,
    add column if not exists delivery_income_amount integer not null default 0,
    add column if not exists discount_burden_amount integer not null default 0,
    add column if not exists refund_amount integer not null default 0,
    add column if not exists net_settlement_amount integer not null default 0,
    add column if not exists applied_fee_policy_id uuid null,
    add column if not exists applied_fee_policy_snapshot jsonb null,
    add column if not exists payout_method text null,
    add column if not exists payout_reference text null,
    add column if not exists payout_confirmed_at timestamptz null,
    add column if not exists payout_note text null;

  comment on column public.store_settlements.platform_fee_percent is '적용 수수료율(%)';
  comment on column public.store_settlements.platform_fee_amount is '퍼센트 수수료 금액';
  comment on column public.store_settlements.fixed_fee_amount is '고정 수수료 금액';
  comment on column public.store_settlements.delivery_income_amount is '배달비 수익(플랫폼 몫)';
  comment on column public.store_settlements.discount_burden_amount is '프로모션 부담금(플랫폼 부담)';
  comment on column public.store_settlements.refund_amount is '환불 차감액(정산 차감)';
  comment on column public.store_settlements.net_settlement_amount is '최종 정산 예정액(표시/집계용)';
  comment on column public.store_settlements.applied_fee_policy_id is '적용된 store_fee_policies.id';
  comment on column public.store_settlements.applied_fee_policy_snapshot is '정책 스냅샷(jsonb)';
  comment on column public.store_settlements.payout_method is '지급 수단: gcash|maya|bank|cash|other';
  comment on column public.store_settlements.payout_reference is '지급 참조(거래번호 등)';
  comment on column public.store_settlements.payout_confirmed_at is '입금/지급 확인 시각';
  comment on column public.store_settlements.payout_note is '운영 메모';

  create index if not exists idx_store_settlements_status_created_at
    on public.store_settlements (settlement_status, created_at desc);

  create index if not exists idx_store_settlements_store_created_at
    on public.store_settlements (store_id, created_at desc);
end;
$$;

