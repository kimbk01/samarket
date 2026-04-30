-- price_offers: 판매자 컬럼 오염/레거시로 seller_id 가 어긋난 행도
-- 실제 글 소유자(user_id)가 조회·처리할 수 있도록 RLS를 보강한다.
-- 기존 정책을 드롭 후 재생성.

-- SELECT: buyer, seller, 또는 해당 product 의 posts.user_id
drop policy if exists price_offers_select_participants on public.price_offers;
create policy price_offers_select_participants
  on public.price_offers
  for select
  using (
    auth.uid() = public.price_offers.buyer_id
    or auth.uid() = public.price_offers.seller_id
    or exists (
      select 1 from public.posts p
      where p.id = public.price_offers.product_id
        and p.user_id = auth.uid()
    )
  );

-- UPDATE: seller 가 처리하거나(accept/reject), expired 처리용 buyer,
-- 또는 글 소유자(user_id)가 처리할 수 있도록 확장.
drop policy if exists price_offers_update_participants on public.price_offers;
create policy price_offers_update_participants
  on public.price_offers
  for update
  using (
    auth.uid() = public.price_offers.seller_id
    or (
      auth.uid() = public.price_offers.buyer_id
      and public.price_offers.status = 'expired'
    )
    or exists (
      select 1 from public.posts p
      where p.id = public.price_offers.product_id
        and p.user_id = auth.uid()
    )
  );

