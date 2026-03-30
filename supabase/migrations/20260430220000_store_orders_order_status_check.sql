-- store_orders.order_status CHECK 를 앱과 동일하게 맞춤.
-- POST /api/me/store-orders 는 신규 행에 order_status = 'pending' 을 넣음.
-- (기존 DB에 pending·refund_* 등이 빠진 CHECK 가 있으면 삽입 시 order_status_check 위반 발생)
--
-- 기존 데이터에 허용 목록 밖의 값이 있으면 ADD CONSTRAINT 가 실패합니다.
-- 그 경우 아래 UPDATE 로 정규화한 뒤 다시 실행하세요.

ALTER TABLE public.store_orders
  DROP CONSTRAINT IF EXISTS store_orders_order_status_check;

ALTER TABLE public.store_orders
  ADD CONSTRAINT store_orders_order_status_check
  CHECK (
    order_status IN (
      'pending',
      'accepted',
      'preparing',
      'ready_for_pickup',
      'delivering',
      'arrived',
      'completed',
      'cancelled',
      'refund_requested',
      'refunded'
    )
  );
