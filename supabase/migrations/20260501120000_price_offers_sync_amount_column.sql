-- 일부 DB 에 legacy `amount` (NOT NULL) 과 `offered_price` 가 공존하는 경우:
-- INSERT 시 offered_price 만 오면 amount 가 NULL 이 되어 제약 위반이 난다.
-- amount 를 offered_price 로 맞춘다 (amount 가 없는 정식 스키마에서는 이 블록 전체가 스킵).

do $$
begin
  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'amount'
  )
  and exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'offered_price'
  ) then
    execute $createfn$
      create or replace function public.price_offers_sync_amount_before_write()
      returns trigger
      language plpgsql
      as $fnbody$
      begin
        new.amount := coalesce(new.amount, new.offered_price);
        return new;
      end;
      $fnbody$;
    $createfn$;

    drop trigger if exists price_offers_sync_amount_before_write on public.price_offers;
    create trigger price_offers_sync_amount_before_write
      before insert or update of offered_price on public.price_offers
      for each row
      execute function public.price_offers_sync_amount_before_write();
  end if;
end
$$;
