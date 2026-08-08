-- Delivery financial SSOT: commission reversal on refund (additive).
-- Preserves original platform_fee_* as historical fact; reversal is separate.

do $$
begin
  if to_regclass('public.store_settlements') is null then
    raise notice 'store_settlements missing; skip commission_reversal_amount';
    return;
  end if;

  alter table public.store_settlements
    add column if not exists commission_reversal_amount integer not null default 0;

  comment on column public.store_settlements.commission_reversal_amount is
    '환불/취소 시 플랫폼 수수료 매출 환입액. platform revenue = fees + delivery_income - reversal';
end;
$$;
